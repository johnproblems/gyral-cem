// Shared AST helpers for the spec extractors.
import ts from 'typescript';

export const kebabCase = (name: string): string =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** The value of `key` in a spec object literal, if present. */
export function specProperty(
  spec: ts.ObjectLiteralExpression,
  key: string,
): ts.Expression | undefined {
  for (const prop of spec.properties) {
    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && prop.name.text === key) {
      return prop.initializer;
    }
    if (ts.isShorthandPropertyAssignment(prop) && prop.name.text === key) return undefined;
    if (ts.isMethodDeclaration(prop) && ts.isIdentifier(prop.name) && prop.name.text === key) {
      return prop.body === undefined ? undefined : (prop as unknown as ts.Expression);
    }
  }
  return undefined;
}

/** Property name text for assignment/shorthand/method members. */
export function memberName(member: ts.ObjectLiteralElementLike): string | undefined {
  if (
    (ts.isPropertyAssignment(member) || ts.isShorthandPropertyAssignment(member)) &&
    (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
  ) {
    return member.name.text;
  }
  return undefined;
}

/** Source text of a node, for defaults and inline types. */
export function nodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile).trim();
}

export interface DocComment {
  /** First JSDoc line, if any. */
  readonly summary: string | undefined;
  /** Remaining JSDoc lines, if any. */
  readonly description: string | undefined;
  /** `@deprecated` message, or true for a bare tag. */
  readonly deprecated: boolean | string | undefined;
}

const NO_DOC: DocComment = { summary: undefined, description: undefined, deprecated: undefined };

/** The closest leading JSDoc block above `node`, parsed. */
export function docComment(node: ts.Node, sourceFile: ts.SourceFile): DocComment {
  const text = sourceFile.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i] as ts.CommentRange;
    if (range.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const raw = text.slice(range.pos, range.end);
    if (!raw.startsWith('/**')) continue;
    return parseDocBlock(raw);
  }
  return NO_DOC;
}

function parseDocBlock(raw: string): DocComment {
  const lines = raw
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, '').trim())
    .filter((line) => line.length > 0);
  const content = lines.filter((line) => !line.startsWith('@'));
  const deprecatedLine = lines.find((line) => line.startsWith('@deprecated'));
  let deprecated: boolean | string | undefined;
  if (deprecatedLine !== undefined) {
    const message = deprecatedLine.slice('@deprecated'.length).trim();
    deprecated = message.length > 0 ? message : true;
  }
  const [summary, ...rest] = content;
  const description = rest.join('\n').trim();
  return {
    summary,
    description: description.length > 0 ? description : undefined,
    deprecated,
  };
}

/**
 * Local names for an imported helper (`define`, `prop`), including aliases
 * (`import { define as d }`). Always contains the plain name as a fallback.
 */
export function localImportNames(sourceFile: ts.SourceFile, imported: string): Set<string> {
  const names = new Set<string>([imported]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const source = element.propertyName?.text ?? element.name.text;
      if (source === imported) names.add(element.name.text);
    }
  }
  return names;
}

/**
 * Structural type text: interfaces and object literals are expanded member by
 * member, so manifests and generated `.d.ts` files are self-contained (no
 * imports of the component's local types). Primitives, literals, functions,
 * classes, and enums keep TypeScript's own spelling.
 */
export function typeTextOf(checker: ts.TypeChecker, type: ts.Type, depth = 0): string {
  if (depth > 8) return checker.typeToString(type);
  const next = (t: ts.Type): string => typeTextOf(checker, t, depth + 1);

  if (type.isUnion()) {
    if (isBooleanUnion(type)) return 'boolean';
    return type.types.map(next).join(' | ');
  }
  if (type.isIntersection()) {
    return type.types.map(next).join(' & ');
  }
  const arrayElement = arrayElementType(type, checker);
  if (arrayElement !== undefined) {
    const readonlyPrefix = checker.typeToString(type).startsWith('readonly ') ? 'readonly ' : '';
    return `${readonlyPrefix}${next(arrayElement.element)}[]`;
  }
  if (isExpandableObject(type)) {
    const members = type.getProperties().map((symbol) => {
      const memberType = checker.getTypeOfSymbol(symbol);
      const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0 ? '?' : '';
      const readonlyPrefix = isReadonlySymbol(symbol) ? 'readonly ' : '';
      return `${readonlyPrefix}${propertyKey(symbol.name)}${optional}: ${next(memberType)};`;
    });
    return `{ ${members.join(' ')} }`;
  }
  return checker.typeToString(type);
}

function isBooleanUnion(type: ts.Type): boolean {
  if (!type.isUnion() || type.types.length !== 2) return false;
  const [a, b] = type.types as [ts.Type, ts.Type];
  return (
    a?.flags === ts.TypeFlags.BooleanLiteral &&
    b?.flags === ts.TypeFlags.BooleanLiteral &&
    checkerIntrinsicName(a) !== checkerIntrinsicName(b)
  );
}

// The intrinsic names of the `false`/`true` literal types differ (`'false'` vs
// `'true'`); comparing them distinguishes the pair without internal APIs.
function checkerIntrinsicName(type: ts.Type): string {
  return (type as { readonly intrinsicName?: string }).intrinsicName ?? '';
}

/**
 * Anonymous object types, interfaces, and type aliases expand; classes and
 * enums keep their names (their members are behavior, not data).
 */
function isExpandableObject(type: ts.Type): boolean {
  if ((type.flags & ts.TypeFlags.Object) === 0) return false;
  const declarations = type.getSymbol()?.getDeclarations() ?? [];
  return declarations.every((d) => !ts.isClassDeclaration(d) && !ts.isEnumDeclaration(d));
}

function isReadonlySymbol(symbol: ts.Symbol): boolean {
  return (symbol.getDeclarations() ?? []).some(
    (d) =>
      ts.isPropertySignature(d) &&
      d.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword) === true,
  );
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function arrayElementType(
  type: ts.Type,
  checker: ts.TypeChecker,
): { readonly element: ts.Type } | undefined {
  if ((type.flags & ts.TypeFlags.Object) === 0) return undefined;
  const reference = type as ts.TypeReference;
  const target = reference.target;
  if (target === undefined) return undefined;
  const name = target.getSymbol()?.name;
  if (name !== 'Array' && name !== 'ReadonlyArray') return undefined;
  const args = checker.getTypeArguments(type as ts.TypeReference);
  if (args.length !== 1 || args[0] === undefined) return undefined;
  return { element: args[0] };
}
