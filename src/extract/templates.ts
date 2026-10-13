// Template and CSS scans: slots and `part` names from `html`/`svg` templates,
// `--*` custom properties from `var(--…)` in styles (`css` templates, plain
// strings, or arrays of them). Dynamic values become warnings, never guesses.
import ts from 'typescript';
import type { CssPropertyIR, SlotIR } from '../ir.js';
import { specProperty } from './util.js';

export interface TemplatesResult {
  readonly slots: readonly SlotIR[];
  readonly parts: readonly string[];
  readonly cssProperties: readonly CssPropertyIR[];
  readonly warnings: readonly string[];
}

/** Marks a template substitution in reconstructed static text. */
const HOLE = '\0';

const TEMPLATE_TAGS = new Set(['html', 'svg', 'css']);

function templateTagName(tag: ts.Expression): string | undefined {
  if (ts.isIdentifier(tag)) return TEMPLATE_TAGS.has(tag.text) ? tag.text : undefined;
  if (ts.isPropertyAccessExpression(tag)) {
    return TEMPLATE_TAGS.has(tag.name.text) ? tag.name.text : undefined;
  }
  return undefined;
}

/** Rebuilds a tagged template's static text with HOLE for each substitution. */
function templateText(node: ts.TaggedTemplateExpression): string {
  const { template } = node;
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
  let out = template.head.text;
  for (const span of template.templateSpans) {
    out += HOLE + span.literal.text;
  }
  return out;
}

const SLOT_TAG = /<slot(\s[^>]*?)?>/g;
const SLOT_NAME = /name\s*=\s*(['"])(.*?)\1/;
const PART_ATTR = /part\s*=\s*(['"])(.*?)\1/g;
// A `part=${…}` binding: the hole sits where a quoted value would start.
const DYNAMIC_PART = new RegExp(`part\\s*=\\s*${HOLE}`);
const VAR_USE = /var\(\s*(--[\w-]+)/g;
const VAR_DEFINE = /(^|[;{}])\s*(--[\w-]+)\s*:\s*([^;{}]+)/g;

function scanMarkup(text: string, warnings: string[]): { slots: string[]; parts: string[] } {
  const slots: string[] = [];
  const parts: string[] = [];
  SLOT_TAG.lastIndex = 0;
  let slot: RegExpExecArray | null;
  while ((slot = SLOT_TAG.exec(text)) !== null) {
    const attrs = slot[1] ?? '';
    if (attrs.includes(HOLE)) {
      warnings.push('Skipping a <slot> with a dynamic name.');
      continue;
    }
    const name = SLOT_NAME.exec(attrs);
    const slotName = name?.[2] ?? '';
    if (!slots.includes(slotName)) slots.push(slotName);
  }
  PART_ATTR.lastIndex = 0;
  let part: RegExpExecArray | null;
  while ((part = PART_ATTR.exec(text)) !== null) {
    const value = part[2] ?? '';
    if (value.includes(HOLE)) {
      warnings.push(`Skipping a dynamic part value: part="${value.replaceAll(HOLE, '${…}')}".`);
      continue;
    }
    for (const name of value.split(/\s+/).filter((s) => s.length > 0)) {
      if (!parts.includes(name)) parts.push(name);
    }
  }
  // A `part=${…}` binding has no quotes for PART_ATTR to match; reported once
  // per template. (Quoted values containing a hole warn one by one above.)
  if (DYNAMIC_PART.test(text)) {
    warnings.push('Skipping a dynamic part binding (part=${…}).');
  }
  return { slots, parts };
}

function scanCssVars(text: string, into: Set<string>): void {
  VAR_USE.lastIndex = 0;
  let use: RegExpExecArray | null;
  while ((use = VAR_USE.exec(text)) !== null) {
    const name = use[1];
    if (name !== undefined) into.add(name);
  }
}

/** `--name: value` definitions; first definition wins. */
function scanCssDefinitions(text: string, into: Map<string, string>): void {
  VAR_DEFINE.lastIndex = 0;
  let definition: RegExpExecArray | null;
  while ((definition = VAR_DEFINE.exec(text)) !== null) {
    const name = definition[2];
    const value = definition[3]?.trim();
    if (name !== undefined && value !== undefined && value.length > 0 && !into.has(name)) {
      into.set(name, value);
    }
  }
}

/** Plain CSS text from `styles` when it is a string or an array of strings. */
function stylesStrings(styles: ts.Expression | undefined, warnings: string[]): string[] {
  if (styles === undefined) return [];
  if (ts.isStringLiteralLike(styles)) return [styles.text];
  if (ts.isArrayLiteralExpression(styles)) {
    const out: string[] = [];
    for (const el of styles.elements) {
      if (ts.isStringLiteralLike(el)) out.push(el.text);
      else if (!ts.isTaggedTemplateExpression(el) && !ts.isIdentifier(el)) {
        warnings.push('Skipping a non-literal entry in spec.styles.');
      }
    }
    return out;
  }
  return [];
}

export function extractTemplates(
  spec: ts.ObjectLiteralExpression,
  _sourceFile: ts.SourceFile,
): TemplatesResult {
  const warnings: string[] = [];
  const slots: string[] = [];
  const parts: string[] = [];
  const cssUses = new Set<string>();
  const cssDefinitions = new Map<string, string>();

  const visit = (node: ts.Node): void => {
    if (ts.isTaggedTemplateExpression(node)) {
      const tagName = templateTagName(node.tag);
      if (tagName === undefined) {
        ts.forEachChild(node, visit);
        return;
      }
      const text = templateText(node);
      const found = scanMarkup(text, warnings);
      for (const name of found.slots) if (!slots.includes(name)) slots.push(name);
      for (const name of found.parts) if (!parts.includes(name)) parts.push(name);
      scanCssVars(text, cssUses);
      if (tagName === 'css') scanCssDefinitions(text, cssDefinitions);
    }
    ts.forEachChild(node, visit);
  };
  visit(spec);

  for (const text of stylesStrings(specProperty(spec, 'styles'), warnings)) {
    const found = scanMarkup(text, warnings);
    for (const name of found.slots) if (!slots.includes(name)) slots.push(name);
    for (const name of found.parts) if (!parts.includes(name)) parts.push(name);
    scanCssVars(text, cssUses);
    scanCssDefinitions(text, cssDefinitions);
  }

  const cssProperties: CssPropertyIR[] = [...new Set([...cssUses, ...cssDefinitions.keys()])]
    .sort()
    .map((name) => ({ name, default: cssDefinitions.get(name) }));
  return { slots: slots.map((name) => ({ name })), parts, cssProperties, warnings };
}
