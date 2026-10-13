// Custom states extraction: the keys returned by `states: (s) => ({…})`,
// exposed to CSS as `:host(:state(name))`.
import ts from 'typescript';
import { memberName, specProperty } from './util.js';

export interface StatesResult {
  readonly states: readonly string[];
  readonly warnings: readonly string[];
}

export function extractStates(
  spec: ts.ObjectLiteralExpression,
  _sourceFile: ts.SourceFile,
): StatesResult {
  const states = specProperty(spec, 'states');
  if (states === undefined) return { states: [], warnings: [] };
  const returned = returnedObject(states);
  if (returned === undefined) {
    return {
      states: [],
      warnings: ['spec.states does not return an object literal; no custom states recorded.'],
    };
  }
  const names: string[] = [];
  for (const member of returned.properties) {
    const name = memberName(member);
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  return { states: names, warnings: [] };
}

/** The object literal a `states` function returns, if statically visible. */
function returnedObject(fn: ts.Expression): ts.ObjectLiteralExpression | undefined {
  if (ts.isArrowFunction(fn)) {
    if (ts.isObjectLiteralExpression(fn.body)) return fn.body;
    if (ts.isParenthesizedExpression(fn.body) && ts.isObjectLiteralExpression(fn.body.expression)) {
      return fn.body.expression;
    }
    if (ts.isBlock(fn.body)) return returnedFromBlock(fn.body);
    return undefined;
  }
  if (ts.isFunctionExpression(fn)) return returnedFromBlock(fn.body);
  return undefined;
}

function returnedFromBlock(body: ts.Block): ts.ObjectLiteralExpression | undefined {
  for (const statement of body.statements) {
    if (
      ts.isReturnStatement(statement) &&
      statement.expression !== undefined &&
      ts.isObjectLiteralExpression(statement.expression)
    ) {
      return statement.expression;
    }
  }
  return undefined;
}
