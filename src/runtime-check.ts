// Runtime cross-check: importing components in Node makes `define` record each
// spec (Gyral's `server-specs.ts`). Comparing the recorded specs against the
// static result confirms tags and props, and reports mismatches for components
// written unusually enough to fool the AST discovery.
import type { ComponentIR } from './ir.js';

export interface RecordedProp {
  readonly kind: string;
  /** Attribute name, `false` for property-only, `undefined` for kebab default. */
  readonly attribute: string | false | undefined;
  readonly required: boolean;
}

export interface RecordedSpec {
  readonly props?: Readonly<Record<string, RecordedProp>>;
  readonly formAssociated?: unknown;
}

export interface RuntimeMismatch {
  readonly tag: string;
  readonly message: string;
}

const kebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** Effective attribute of a recorded prop, applying Gyral's own defaults. */
function recordedAttribute(name: string, prop: RecordedProp): string | undefined {
  if (prop.attribute === false) return undefined;
  if (typeof prop.attribute === 'string') return prop.attribute;
  if (prop.kind === 'value') return undefined;
  return kebabCase(name);
}

export interface DiffOptions {
  /** Tags to skip entirely (known-dynamic entries). */
  readonly ignoreTags?: readonly string[];
  /** Props to skip per tag. */
  readonly ignoreProps?: Readonly<Record<string, readonly string[]>>;
}

/** One human-readable line per mismatch: `<tag>: <message>`. */
export function summarizeMismatches(mismatches: readonly RuntimeMismatch[]): string[] {
  return mismatches.map((mismatch) => `${mismatch.tag}: ${mismatch.message}`);
}

export function diffRecordedSpecs(
  recorded: ReadonlyMap<string, RecordedSpec>,
  components: readonly ComponentIR[],
  options: DiffOptions = {},
): RuntimeMismatch[] {
  const mismatches: RuntimeMismatch[] = [];
  const ignoredTags = new Set(options.ignoreTags ?? []);
  const ignoredProps = options.ignoreProps ?? {};
  const byTag = new Map(components.map((c) => [c.tag, c]));
  for (const [tag, spec] of recorded) {
    if (ignoredTags.has(tag)) continue;
    const component = byTag.get(tag);
    if (component === undefined) {
      mismatches.push({
        tag,
        message: 'Recorded at runtime but missed by static discovery.',
      });
      continue;
    }
    const recordedProps = spec.props ?? {};
    const skipped = new Set(ignoredProps[tag] ?? []);
    const staticProps = new Map(component.props.map((p) => [p.name, p]));
    for (const [name, prop] of Object.entries(recordedProps)) {
      if (skipped.has(name)) continue;
      const found = staticProps.get(name);
      if (found === undefined) {
        mismatches.push({ tag, message: `Prop "${name}" recorded at runtime but missed statically.` });
        continue;
      }
      if (found.builder !== prop.kind) {
        mismatches.push({
          tag,
          message: `Prop "${name}": static builder "${found.builder}" != runtime "${prop.kind}".`,
        });
      }
      if (found.attribute !== recordedAttribute(name, prop)) {
        mismatches.push({
          tag,
          message: `Prop "${name}": static attribute ${JSON.stringify(found.attribute)} != runtime ${JSON.stringify(recordedAttribute(name, prop))}.`,
        });
      }
      if (found.required !== prop.required) {
        mismatches.push({
          tag,
          message: `Prop "${name}": static required=${String(found.required)} != runtime required=${String(prop.required)}.`,
        });
      }
    }
    for (const prop of component.props) {
      if (!skipped.has(prop.name) && !(prop.name in recordedProps)) {
        mismatches.push({ tag, message: `Prop "${prop.name}" found statically but not recorded at runtime.` });
      }
    }
    const runtimeForm = spec.formAssociated !== undefined;
    if (component.form.associated !== runtimeForm) {
      mismatches.push({
        tag,
        message: `formAssociated: static=${String(component.form.associated)} != runtime=${String(runtimeForm)}.`,
      });
    }
  }
  for (const component of components) {
    if (!ignoredTags.has(component.tag) && !recorded.has(component.tag)) {
      mismatches.push({ tag: component.tag, message: 'Found statically but never recorded at runtime.' });
    }
  }
  return mismatches;
}
