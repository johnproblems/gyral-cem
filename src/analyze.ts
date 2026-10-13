// Analysis orchestration: builds a TypeScript program over the source dirs,
// discovers components, and runs every extractor.
import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { componentsInSource, isScannableFile, type DiscoveredComponent } from './discover.js';
import { extractForm } from './extract/form.js';
import { extractOutputs } from './extract/outputs.js';
import { extractProps } from './extract/props.js';
import { extractShadow } from './extract/shadow.js';
import { extractStates } from './extract/states.js';
import { extractTemplates } from './extract/templates.js';
import { docComment } from './extract/util.js';
import type { Analysis, AnalysisWarning, ComponentIR } from './ir.js';

export interface AnalyzeOptions {
  /** Project root; `dirs` are relative to it. */
  readonly root: string;
  /** Source directories to scan, recursively. Default `['src']`. */
  readonly dirs?: readonly string[];
  /** Explicit files to analyze (absolute paths), instead of scanning `dirs`. */
  readonly files?: readonly string[];
  /** tsconfig used for compiler options. Default: looked up from `root`. */
  readonly tsconfig?: string | undefined;
}

function collectFiles(root: string, dirs: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) walk(path);
        continue;
      }
      if (isScannableFile(entry.name)) out.push(path);
    }
  };
  for (const dir of dirs) walk(resolve(root, dir));
  return out.sort();
}

export function createProgram(
  files: string[],
  tsconfig: string | undefined,
  root: string,
): ts.Program {
  let options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    types: [],
  };
  let configFiles: string[] | undefined;
  const configPath =
    tsconfig !== undefined ? resolve(tsconfig) : ts.findConfigFile(root, ts.sys.fileExists);
  if (configPath !== undefined) {
    const parsed = ts.readConfigFile(configPath, ts.sys.readFile);
    if (parsed.error === undefined) {
      const converted = ts.parseJsonConfigFileContent(
        parsed.config,
        ts.sys,
        resolve(configPath, '..'),
      );
      options = { ...converted.options, noEmit: true, types: [] };
      configFiles = converted.fileNames;
    }
  }
  return ts.createProgram([...(configFiles ?? []), ...files], options);
}

/** The statement carrying the component's leading JSDoc, if any. */
function docNodeOf(found: DiscoveredComponent): ts.Node {
  let node: ts.Node = found.node;
  while (node.parent !== undefined && !ts.isSourceFile(node.parent)) {
    node = node.parent;
  }
  return node;
}

function toIR(
  found: DiscoveredComponent,
  checker: ts.TypeChecker,
  warnings: AnalysisWarning[],
): ComponentIR {
  const warn = (message: string): void => {
    warnings.push({ file: found.file, tag: found.tag, message });
  };
  const props = extractProps(found.spec, checker, found.sourceFile);
  const outputs = extractOutputs(found.typeArgs, checker);
  const templates = extractTemplates(found.spec, found.sourceFile);
  const states = extractStates(found.spec, found.sourceFile);
  for (const message of [...props.warnings, ...outputs.warnings, ...templates.warnings, ...states.warnings]) {
    warn(message);
  }
  const doc = docComment(docNodeOf(found), found.sourceFile);
  return {
    tag: found.tag,
    exportName: found.exportName,
    file: found.file,
    summary: doc.summary,
    description: doc.description,
    deprecated: doc.deprecated,
    shadow: extractShadow(found.spec),
    props: props.props,
    outputs: outputs.outputs,
    slots: templates.slots,
    parts: templates.parts,
    cssProperties: templates.cssProperties,
    cssStates: states.states,
    form: extractForm(found.spec),
  };
}

export function analyze(options: AnalyzeOptions): Analysis {
  const root = resolve(options.root);
  const files =
    options.files !== undefined
      ? [...options.files]
      : collectFiles(root, options.dirs ?? ['src']);
  if (files.length === 0) return { components: [], warnings: [] };
  const program = createProgram(
    files,
    options.tsconfig !== undefined ? resolve(root, options.tsconfig) : undefined,
    root,
  );
  const checker = program.getTypeChecker();
  const warnings: AnalysisWarning[] = [];
  const components: ComponentIR[] = [];
  for (const file of files) {
    const sourceFile = program.getSourceFile(file);
    if (sourceFile === undefined) continue;
    for (const found of componentsInSource(sourceFile, file)) {
      components.push(toIR(found, checker, warnings));
    }
  }
  components.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const seenByTag = new Map<string, string>();
  for (const component of components) {
    const first = seenByTag.get(component.tag);
    if (first === undefined) {
      seenByTag.set(component.tag, component.file);
    } else if (first !== component.file) {
      warnings.push({
        file: component.file,
        tag: component.tag,
        message: `Duplicate tag "${component.tag}" (also defined in ${first}).`,
      });
    }
  }
  warnings.sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : a.message < b.message ? -1 : a.message > b.message ? 1 : 0,
  );
  return { components, warnings };
}
