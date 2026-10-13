// Component discovery: finds two-call `define<…>()('tag', spec)` calls via the
// TypeScript AST. Mirrors the discovery in Gyral's own tag-map scanner, but keeps the
// AST nodes so the extractors can read props, templates, and generics from them.
import ts from 'typescript';
import { localImportNames } from './extract/util.js';

export interface DiscoveredComponent {
  readonly tag: string;
  /** `X` in `export const X = define…`; undefined when not exported that way. */
  readonly exportName: string | undefined;
  readonly file: string;
  /** Type arguments of the first `define<…>` call: [S, M, P, O]. */
  readonly typeArgs: readonly ts.TypeNode[];
  readonly spec: ts.ObjectLiteralExpression;
  /** The outer `define<…>()('tag', spec)` call (for leading JSDoc). */
  readonly node: ts.CallExpression;
  readonly sourceFile: ts.SourceFile;
}

const SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const SKIPPED = /\.(?:test|spec|d)\.[cm]?[jt]sx?$/;

const isDefineIdentifier = (node: ts.Expression, localDefines: ReadonlySet<string>): boolean => {
  if (ts.isIdentifier(node)) return localDefines.has(node.text);
  // Namespace calls (`gyral.define(…)`), but never the DOM's own registry.
  if (ts.isPropertyAccessExpression(node) && node.name.text === 'define') {
    return !(ts.isIdentifier(node.expression) && node.expression.text === 'customElements');
  }
  return false;
};

/**
 * If `node` is the outer call of `define<…>()('tag', spec)`, returns the tag literal,
 * the spec object, and the first call's type arguments.
 */
export function matchDefineCall(
  node: ts.Node,
  localDefines: ReadonlySet<string> = new Set(['define']),
): {
  tag: string;
  spec: ts.ObjectLiteralExpression;
  typeArgs: readonly ts.TypeNode[];
} | undefined {
  if (!ts.isCallExpression(node)) return undefined;
  if (node.arguments.length < 2) return undefined;
  const [tagArg, specArg] = node.arguments;
  if (tagArg === undefined || specArg === undefined) return undefined;
  if (!ts.isStringLiteralLike(tagArg) || !tagArg.text.includes('-')) return undefined;
  if (!ts.isObjectLiteralExpression(specArg)) return undefined;
  // The callee must be the inner `define<…>()` call with no value arguments.
  const callee = node.expression;
  if (!ts.isCallExpression(callee) || callee.arguments.length !== 0) return undefined;
  // The type arguments live on the inner call itself: `define<S, M, P, O>()`.
  const inner = callee.expression;
  if (!isDefineIdentifier(inner, localDefines)) return undefined;
  return { tag: tagArg.text, spec: specArg, typeArgs: callee.typeArguments ?? [] };
}

/** Local binding → exported name for `export { X }` / `export { X as Y }`. */
function exportListOf(sourceFile: ts.SourceFile): Map<string, string> {
  const map = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier !== undefined) continue;
    const bindings = statement.exportClause;
    if (bindings === undefined || !ts.isNamedExports(bindings)) continue;
    for (const element of bindings.elements) {
      map.set(element.propertyName?.text ?? element.name.text, element.name.text);
    }
  }
  return map;
}

const exportNameOf = (
  node: ts.CallExpression,
  exportList: ReadonlyMap<string, string>,
): string | undefined => {
  const parent = node.parent;
  if (parent !== undefined && ts.isExportAssignment(parent) && !parent.isExportEquals) {
    return 'default';
  }
  if (parent !== undefined && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    const list = parent.parent;
    if (list !== undefined && ts.isVariableDeclarationList(list)) {
      const statement = list.parent;
      if (
        statement !== undefined &&
        ts.isVariableStatement(statement) &&
        statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true
      ) {
        return parent.name.text;
      }
    }
    return exportList.get(parent.name.text);
  }
  return undefined;
};

export function componentsInSource(sourceFile: ts.SourceFile, file: string): DiscoveredComponent[] {
  const out: DiscoveredComponent[] = [];
  const localDefines = localImportNames(sourceFile, 'define');
  const exportList = exportListOf(sourceFile);
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const match = matchDefineCall(node, localDefines);
      if (match !== undefined) {
        out.push({
          tag: match.tag,
          exportName: exportNameOf(node, exportList),
          file,
          typeArgs: match.typeArgs,
          spec: match.spec,
          node,
          sourceFile,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return out;
}

export const isScannableFile = (name: string): boolean =>
  SOURCE_FILE.test(name) && !SKIPPED.test(name);
