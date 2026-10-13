// Props extraction: `spec.props` entries declared with `prop.*` builders.
// Attribute defaults to kebab-case of the name; `prop.value` (and `attribute: false`)
// is property-only. Only the prop value type needs the checker.
import ts from 'typescript';
import type { PropBuilder, PropIR } from '../ir.js';
import {
  docComment,
  kebabCase,
  localImportNames,
  memberName,
  nodeText,
  specProperty,
  typeTextOf,
} from './util.js';

const BUILDERS: readonly PropBuilder[] = ['string', 'number', 'boolean', 'json', 'value'];

interface BuilderCall {
  readonly builder: PropBuilder;
  readonly options: ts.ObjectLiteralExpression | undefined;
  readonly schemaArg: ts.Expression | undefined;
  readonly call: ts.CallExpression;
}

function matchBuilder(
  initializer: ts.Expression,
  localProps: ReadonlySet<string>,
): BuilderCall | undefined {
  if (!ts.isCallExpression(initializer)) return undefined;
  const { expression } = initializer;
  if (!ts.isPropertyAccessExpression(expression)) return undefined;
  if (!ts.isIdentifier(expression.expression) || !localProps.has(expression.expression.text)) {
    return undefined;
  }
  const name = expression.name.text;
  if (!(BUILDERS as readonly string[]).includes(name)) return undefined;
  const builder = name as PropBuilder;
  const args = initializer.arguments;
  if (builder === 'json' || builder === 'value') {
    const [schemaArg, opts] = args;
    return {
      builder,
      options: opts !== undefined && ts.isObjectLiteralExpression(opts) ? opts : undefined,
      schemaArg,
      call: initializer,
    };
  }
  const [opts] = args;
  return {
    builder,
    options: opts !== undefined && ts.isObjectLiteralExpression(opts) ? opts : undefined,
    schemaArg: undefined,
    call: initializer,
  };
}

function optionValue(
  options: ts.ObjectLiteralExpression | undefined,
  key: string,
): ts.Expression | undefined {
  if (options === undefined) return undefined;
  for (const prop of options.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === key) {
      return prop.initializer;
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === key) {
      // `required` shorthand means `required: true` only when the identifier is in
      // scope and truthy — unreadable statically; treat as required.
      return prop.name;
    }
  }
  return undefined;
}

const isTrue = (node: ts.Expression | undefined): boolean =>
  node !== undefined && node.kind === ts.SyntaxKind.TrueKeyword;

function attributeOf(
  builder: PropBuilder,
  options: ts.ObjectLiteralExpression | undefined,
  propName: string,
  warnings: string[],
): string | undefined {
  const attr = optionValue(options, 'attribute');
  if (attr !== undefined) {
    if (attr.kind === ts.SyntaxKind.FalseKeyword) return undefined;
    if (ts.isStringLiteralLike(attr)) return attr.text;
    if (ts.isNoSubstitutionTemplateLiteral(attr)) return attr.text;
    // Dynamic attribute expression: fall back to the kebab-case default.
    warnings.push(
      `Prop "${propName}" has a dynamic attribute expression; assuming "${kebabCase(propName)}".`,
    );
    return kebabCase(propName);
  }
  // Gyral's own default: `prop.value` is property-only, the rest kebab-case.
  if (builder === 'value') return undefined;
  return kebabCase(propName);
}

/**
 * The prop's value type: the `T` in `Prop<T>`, read through the builder's
 * type-only `[OUTPUT]: () => T` marker. Falls back to the builder's base type
 * (scalars) or the schema argument's type text (json/value).
 */
function valueTypeText(
  call: ts.CallExpression,
  builder: PropBuilder,
  schemaArg: ts.Expression | undefined,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): string {
  const propType = checker.getTypeAtLocation(call);
  // The marker is the only computed (unique-symbol) property on `Prop<T>`.
  const outputMarker = propType.getProperties().find((s) =>
    (s.getDeclarations() ?? []).some(
      (d) => ts.isPropertySignature(d) && ts.isComputedPropertyName(d.name),
    ),
  );
  if (outputMarker !== undefined) {
    const markerType = checker.getTypeOfSymbol(outputMarker);
    // The marker is optional (`(() => T) | undefined`); a union with
    // `undefined` exposes no call signatures until it is stripped.
    const callable = (markerType.isUnion() ? markerType.types : [markerType]).find(
      (t) => t.getCallSignatures().length > 0,
    );
    const signatures = callable?.getCallSignatures() ?? [];
    if (signatures.length > 0) {
      const returned = checker.getReturnTypeOfSignature(signatures[0] as ts.Signature);
      // Optional props (`Prop<O | undefined>`) still report the value type `O`;
      // optionality is carried by `required`/`default`, not the type text.
      // Member text is rebuilt only when something was stripped, so unions
      // like `boolean` keep TypeScript's own formatting.
      if (!returned.isUnion()) return typeTextOf(checker, returned);
      const kept = returned.types.filter(
        (t) => !(t.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)),
      );
      if (kept.length === returned.types.length) return typeTextOf(checker, returned);
      if (kept.length === 0) return typeTextOf(checker, returned);
      return kept.map((t) => typeTextOf(checker, t)).join(' | ');
    }
  }
  // Textual fallback: explicit type argument, then builder base type.
  const [explicit] = call.typeArguments ?? [];
  if (explicit !== undefined) return nodeText(explicit, sourceFile);
  switch (builder) {
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return schemaArg === undefined
        ? 'unknown'
        : typeTextOf(checker, checker.getTypeAtLocation(schemaArg));
  }
}

function defaultTextOf(
  builder: PropBuilder,
  options: ts.ObjectLiteralExpression | undefined,
  sourceFile: ts.SourceFile,
): string | undefined {
  const def = optionValue(options, 'default');
  if (def !== undefined) return nodeText(def, sourceFile);
  // Gyral's `make()`: boolean props default to `false` even when undeclared.
  if (builder === 'boolean') return 'false';
  return undefined;
}

export interface PropsResult {
  readonly props: readonly PropIR[];
  readonly warnings: readonly string[];
}

/** Follows an identifier to the object literal it declares (same file or imported). */
function resolveTable(
  id: ts.Identifier,
  checker: ts.TypeChecker,
  seen: Set<ts.Symbol>,
): ts.ObjectLiteralExpression | undefined {
  let symbol = checker.getSymbolAtLocation(id);
  if (symbol === undefined) return undefined;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    try {
      symbol = checker.getAliasedSymbol(symbol);
    } catch {
      return undefined;
    }
  }
  if (seen.has(symbol)) return undefined;
  seen.add(symbol);
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (!ts.isVariableDeclaration(declaration) || declaration.initializer === undefined) continue;
    const { initializer } = declaration;
    if (ts.isObjectLiteralExpression(initializer)) return initializer;
    if (ts.isIdentifier(initializer)) {
      const nested = resolveTable(initializer, checker, seen);
      if (nested !== undefined) return nested;
    }
  }
  return undefined;
}

/** The prop entries of a props table, with spreads inlined (later entries win). */
function tableEntries(
  table: ts.Expression,
  checker: ts.TypeChecker,
  warnings: string[],
): ts.PropertyAssignment[] {
  const root =
    ts.isObjectLiteralExpression(table) ? table : ts.isIdentifier(table) ? resolveTable(table, checker, new Set()) : undefined;
  if (root === undefined) {
    if (!ts.isObjectLiteralExpression(table)) {
      warnings.push('spec.props is not a statically visible object; no props recorded.');
    }
    return [];
  }
  const entries: ts.PropertyAssignment[] = [];
  const indexByName = new Map<string, number>();
  const push = (entry: ts.PropertyAssignment): void => {
    const name = memberName(entry);
    if (name === undefined) {
      warnings.push('Skipping a non-literal entry in spec.props.');
      return;
    }
    const existing = indexByName.get(name);
    if (existing === undefined) {
      indexByName.set(name, entries.length);
      entries.push(entry);
    } else {
      entries[existing] = entry;
    }
  };
  for (const member of root.properties) {
    if (ts.isSpreadAssignment(member)) {
      const spread =
        ts.isIdentifier(member.expression) && member.expression.text.length > 0
          ? resolveTable(member.expression, checker, new Set())
          : undefined;
      if (spread === undefined) {
        warnings.push('Skipping an unresolvable spread in spec.props.');
        continue;
      }
      for (const nested of spread.properties) {
        if (ts.isPropertyAssignment(nested)) push(nested);
        else warnings.push('Skipping a non-literal entry in spec.props.');
      }
      continue;
    }
    if (!ts.isPropertyAssignment(member)) {
      warnings.push('Skipping a non-literal entry in spec.props.');
      continue;
    }
    push(member);
  }
  return entries;
}

export function extractProps(
  spec: ts.ObjectLiteralExpression,
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
): PropsResult {
  const table = specProperty(spec, 'props');
  if (table === undefined) {
    return { props: [], warnings: [] };
  }
  const props: PropIR[] = [];
  const warnings: string[] = [];
  const localProps = localImportNames(sourceFile, 'prop');
  for (const entry of tableEntries(table, checker, warnings)) {
    const name = memberName(entry);
    if (name === undefined) {
      warnings.push('Skipping a non-literal entry in spec.props.');
      continue;
    }
    const call = matchBuilder(entry.initializer, localProps);
    if (call === undefined) {
      warnings.push(`Prop "${name}" is not declared with a prop.* builder; skipped.`);
      continue;
    }
    const attribute = attributeOf(call.builder, call.options, name, warnings);
    // Spread entries may live in another file; read text from their own.
    const entryFile = entry.getSourceFile();
    const doc = docComment(entry, entryFile);
    props.push({
      name,
      builder: call.builder,
      attribute,
      typeText: valueTypeText(call.call, call.builder, call.schemaArg, checker, sourceFile),
      defaultText: defaultTextOf(call.builder, call.options, entryFile),
      required: isTrue(optionValue(call.options, 'required')),
      reflects: attribute !== undefined,
      summary: doc.summary,
      description: doc.description,
      deprecated: doc.deprecated,
    });
  }
  return { props, warnings };
}
