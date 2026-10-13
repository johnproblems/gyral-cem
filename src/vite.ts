// Vite plugin mode: regenerates the manifest and typings on save, beside
// Gyral's own `gyralVitePreset`. Shares the `analyze()` core with the CLI.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import type { Plugin } from 'vite';
import { analyze } from './analyze.js';
import type { Analysis } from './ir.js';
import { generateAstroTypings } from './generators/astro.js';
import { generateCustomData } from './generators/custom-data.js';
import { generateElementsTypings } from './generators/elements.js';
import { generateReactTypings } from './generators/react.js';
import { generateSvelteTypings } from './generators/svelte.js';
import { generateVueTypings } from './generators/vue.js';
import {
  generateReactWrapper,
  generateWrapperIndex,
  wrapperFileName,
} from './generators/wrapper.js';
import { buildManifest } from './manifest.js';
import { formatErrors, validateManifest } from './validate.js';

export type Framework = 'react' | 'vue' | 'svelte' | 'astro' | 'wrapper' | 'elements' | 'vscode';

export const ALL_FRAMEWORKS: readonly Framework[] = [
  'react',
  'vue',
  'svelte',
  'astro',
  'wrapper',
  'elements',
  'vscode',
];

export interface GyralCemPluginOptions {
  /** Source directories to scan, relative to the Vite root. Default `['src']`. */
  readonly dirs?: readonly string[];
  /** Manifest output, relative to the Vite root. Default `custom-elements.json`. */
  readonly out?: string;
  /** Typings directory, relative to the Vite root. Default `dist/typings`. */
  readonly typingsDir?: string;
  /** Frameworks to emit. Default: all. */
  readonly frameworks?: readonly Framework[];
  /** tsconfig for the analysis program. Default: looked up from the root. */
  readonly tsconfig?: string | undefined;
}

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

/** Manifest + typings file contents for an existing analysis. */
export function generateFiles(
  analysis: Analysis,
  root: string,
  options: GyralCemPluginOptions,
): GeneratedFile[] {
  const frameworks = options.frameworks ?? ALL_FRAMEWORKS;
  const at = (p: string): string => (isAbsolute(p) ? p : join(root, p));
  const files: GeneratedFile[] = [
    {
      path: at(options.out ?? 'custom-elements.json'),
      content: `${JSON.stringify(buildManifest(analysis.components, root), null, 2)}\n`,
    },
  ];
  const typingsDir = at(options.typingsDir ?? 'dist/typings');
  if (frameworks.includes('react')) {
    files.push({
      path: join(typingsDir, 'react.d.ts'),
      content: generateReactTypings(analysis.components),
    });
  }
  if (frameworks.includes('vue')) {
    files.push({
      path: join(typingsDir, 'vue.d.ts'),
      content: generateVueTypings(analysis.components),
    });
  }
  if (frameworks.includes('svelte')) {
    files.push({
      path: join(typingsDir, 'svelte.d.ts'),
      content: generateSvelteTypings(analysis.components),
    });
  }
  if (frameworks.includes('astro')) {
    files.push({
      path: join(typingsDir, 'astro.d.ts'),
      content: generateAstroTypings(analysis.components),
    });
  }
  if (frameworks.includes('wrapper')) {
    for (const component of analysis.components) {
      files.push({
        path: join(typingsDir, wrapperFileName(component)),
        content: generateReactWrapper(component),
      });
    }
    if (analysis.components.length > 0) {
      files.push({
        path: join(typingsDir, 'index.ts'),
        content: generateWrapperIndex(analysis.components),
      });
    }
  }
  if (frameworks.includes('elements')) {
    const elementsFile = join(typingsDir, 'elements.d.ts');
    files.push({
      path: elementsFile,
      content: generateElementsTypings(analysis.components, elementsFile),
    });
  }
  if (frameworks.includes('vscode')) {
    files.push({
      path: join(typingsDir, 'html-custom-data.json'),
      content: generateCustomData(analysis.components),
    });
  }
  return files;
}

/** Analyzes `root` and returns manifest + typings file contents. */
export function typingsFor(root: string, options: GyralCemPluginOptions): GeneratedFile[] {
  const analysis = analyze({
    root,
    dirs: options.dirs ?? ['src'],
    tsconfig: options.tsconfig,
  });
  for (const warning of analysis.warnings) {
    console.warn(`[gyral-cem] ${warning.file}: <${warning.tag}> ${warning.message}`);
  }
  return generateFiles(analysis, root, options);
}

/** Writes files whose content changed, creating directories as needed. */
export function writeGeneratedFiles(files: readonly GeneratedFile[]): void {
  for (const file of files) {
    if (existsSync(file.path)) {
      try {
        if (readFileSync(file.path, 'utf8') === file.content) continue;
      } catch {
        // Fall through to writing.
      }
    }
    mkdirSync(dirname(file.path), { recursive: true });
    writeFileSync(file.path, file.content);
  }
}

/** Trailing-edge debounce that coalesces bursts (rapid saves) into one call. */
function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, ms);
  };
}

/** Regenerates the manifest and typings beside `gyralVitePreset`. */
export function gyralCemPlugin(options: GyralCemPluginOptions = {}): Plugin {
  let root = process.cwd();
  const regenerate = (warn: (message: string) => void): void => {
    const analysis = analyze({
      root,
      dirs: options.dirs ?? ['src'],
      tsconfig: options.tsconfig,
    });
    for (const warning of analysis.warnings) {
      warn(`${warning.file}: <${warning.tag}> ${warning.message}`);
    }
    // Like the CLI, the plugin never writes an invalid manifest.
    const manifest = buildManifest(analysis.components, root);
    const { valid, errors } = validateManifest(manifest);
    const files = generateFiles(analysis, root, options);
    if (!valid) {
      warn(`Skipping custom-elements.json: invalid manifest:\n${formatErrors(errors)}`);
      writeGeneratedFiles(files.slice(1));
      return;
    }
    writeGeneratedFiles(files);
  };
  const watchedDirs = options.dirs ?? ['src'];
  const isSource = (file: string): boolean =>
    /\.[cm]?[jt]sx?$/.test(file) &&
    !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(file) &&
    watchedDirs.some((dir) => file.startsWith(join(root, dir)));
  return {
    name: 'gyral:cem',
    configResolved(config) {
      root = config.root;
    },
    buildStart(this: { warn: (message: string) => void }) {
      regenerate((message) => this.warn(message));
    },
    watchChange(id) {
      if (isSource(id)) regenerate((message) => console.warn(`[gyral-cem] ${message}`));
    },
    configureServer(server) {
      const changed = debounce((file: string): void => {
        if (isSource(file)) {
          regenerate((message) => server.config.logger.warn(`[gyral-cem] ${message}`));
        }
      }, 50);
      server.watcher.on('add', changed).on('change', changed).on('unlink', changed);
    },
  };
}
