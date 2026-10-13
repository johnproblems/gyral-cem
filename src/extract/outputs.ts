// Output event extraction: the output union `O` is the 4th generic of
// `define<S, M, P, O>()`. Each union member's `_tag` literal becomes one typed
// `gyral-output` entry. This is the one extractor that needs the full checker.
import ts from 'typescript';
import type { OutputIR } from '../ir.js';
import { typeTextOf } from './util.js';

export interface OutputsResult {
  readonly outputs: readonly OutputIR[];
  readonly warnings: readonly string[];
}

const literalTag = (type: ts.Type): string | undefined => {
  if (type.isStringLiteral()) return type.value;
  return undefined;
};

export function extractOutputs(
  typeArgs: readonly ts.TypeNode[],
  checker: ts.TypeChecker,
): OutputsResult {
  // `define()` has two overloads; with no type arguments there is no output union.
  if (typeArgs.length < 4) return { outputs: [], warnings: [] };
  const outputNode = typeArgs[3] as ts.TypeNode;
  const outputType = checker.getTypeFromTypeNode(outputNode);
  if (outputType.flags & ts.TypeFlags.Never) return { outputs: [], warnings: [] };
  const members = outputType.isUnion() ? outputType.types : [outputType];
  const outputs: OutputIR[] = [];
  const warnings: string[] = [];
  for (const member of members) {
    if (member.flags & ts.TypeFlags.Never) continue;
    const tagProp = member.getProperty('_tag');
    const tag =
      tagProp === undefined
        ? undefined
        : literalTag(checker.getTypeOfSymbol(tagProp));
    if (tag === undefined) {
      warnings.push(
        `Skipping an output member without a string-literal _tag: ${checker.typeToString(member)}.`,
      );
      continue;
    }
    outputs.push({ tag, payloadText: typeTextOf(checker, member), description: symbolDoc(checker, member) });
  }
  return { outputs, warnings };
}

/** JSDoc on the member's type alias or interface, if any. */
function symbolDoc(checker: ts.TypeChecker, member: ts.Type): string | undefined {
  const symbol = member.aliasSymbol ?? member.getSymbol();
  if (symbol === undefined) return undefined;
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  return text.length > 0 ? text : undefined;
}
