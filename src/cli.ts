#!/usr/bin/env node
// CLI: `gyral-cem analyze <dirs…>` writes `custom-elements.json` plus framework
// typings; `gyral-cem validate` checks a manifest against the CEM JSON schema.
import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { analyze } from './analyze.js';
import { buildManifest } from './manifest.js';
import { formatErrors, validateManifest } from './validate.js';
import { ALL_FRAMEWORKS, generateFiles, writeGeneratedFiles, type Framework } from './vite.js';

interface GlobalOptions {
  root: string;
}

function parseGlobal(args: string[]): { options: GlobalOptions; rest: string[] } {
  let root = process.cwd();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === '--root' && i + 1 < args.length) {
      root = resolve(args[++i] as string);
    } else if (arg.startsWith('--root=')) {
      root = resolve(arg.slice('--root='.length));
    } else {
      rest.push(arg);
    }
  }
  return { options: { root }, rest };
}

function flagValue(args: string[], name: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    if (arg === name && i + 1 < args.length) return args[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

const hasFlag = (args: string[], name: string): boolean => args.includes(name);

/** True when `value` is the value of a `--flag value` pair in `args`. */
function isFlagValue(args: string[], value: string): boolean {
  const index = args.indexOf(value);
  return (
    index > 0 &&
    (args[index - 1] as string).startsWith('--') &&
    !(args[index - 1] as string).includes('=')
  );
}

function positionals(args: string[]): string[] {
  return args.filter((a) => !a.startsWith('--') && !isFlagValue(args, a));
}

function parseFrameworks(value: string | undefined): Framework[] {
  if (value === undefined) return [...ALL_FRAMEWORKS];
  const known = new Set<string>(ALL_FRAMEWORKS);
  const out: Framework[] = [];
  for (const name of value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)) {
    if (!known.has(name)) {
      console.error(`Unknown framework "${name}". Known: ${ALL_FRAMEWORKS.join(', ')}.`);
      process.exit(2);
    }
    out.push(name as Framework);
  }
  return out;
}

function version(): string {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as { version?: unknown };
  return typeof pkg.version === 'string' ? pkg.version : 'unknown';
}

function usage(command: string | undefined, exitCode: number): never {
  const lines =
    command === 'analyze'
      ? [
          'Usage: gyral-cem analyze <dirs…> [options]',
          '',
          'Options:',
          '  --root <dir>            Project root (default: cwd).',
          '  --out <file>            Manifest output, or - for stdout (default: custom-elements.json).',
          '  --tsconfig <file>       tsconfig for analysis (default: discovered from root).',
          '  --typingsDir <dir>      Typings directory (default: dist/typings).',
          `  --frameworks <list>     Comma-separated: ${ALL_FRAMEWORKS.join(',')} (default: all).`,
          '  --watch                 Regenerate on file changes.',
          '  --check                 Analyze and validate without writing.',
          '  --quiet                 Suppress warning output.',
          '  --format <human|json>   Machine-readable summary on stdout (default: human).',
          '  --strict                Fail on warnings, and on zero components.',
        ]
      : command === 'validate'
        ? [
            'Usage: gyral-cem validate [manifest] [options]',
            '',
            'Options:',
            '  --root <dir>    Project root (default: cwd).',
            '  --schema <file> CEM JSON schema (default: bundled 2.1 schema).',
          ]
        : [
            'Usage:',
            '  gyral-cem analyze <dirs…> [options]',
            '  gyral-cem validate [manifest] [options]',
            '  gyral-cem --version',
            '',
            'Run `gyral-cem <command> --help` for command options.',
            '',
            'Warnings (dynamic part values, non-literal states) print to stderr and',
            'only fail with --strict.',
          ];
  console.error(lines.join('\n'));
  process.exit(exitCode);
}

interface AnalyzeSettings {
  readonly dirs: string[];
  readonly out: string;
  readonly tsconfig: string | undefined;
  readonly typingsDir: string;
  readonly frameworks: Framework[];
  readonly strict: boolean;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly check: boolean;
  readonly stdoutManifest: boolean;
}

function parseAnalyzeArgs(args: string[]): AnalyzeSettings {
  const dirs = positionals(args);
  if (dirs.length === 0) usage('analyze', 2);
  const format = flagValue(args, '--format') ?? 'human';
  if (format !== 'human' && format !== 'json') {
    console.error(`Unknown --format "${format}". Use human or json.`);
    process.exit(2);
  }
  const out = flagValue(args, '--out') ?? 'custom-elements.json';
  return {
    dirs,
    out,
    tsconfig: flagValue(args, '--tsconfig'),
    typingsDir: flagValue(args, '--typingsDir') ?? 'dist/typings',
    frameworks: parseFrameworks(flagValue(args, '--frameworks')),
    strict: hasFlag(args, '--strict'),
    quiet: hasFlag(args, '--quiet'),
    json: format === 'json',
    check: hasFlag(args, '--check'),
    stdoutManifest: out === '-',
  };
}

/** Runs one analysis pass; returns the process exit code (0 for success). */
function performAnalyze(root: string, settings: AnalyzeSettings): number {
  const analysis = analyze({ root, dirs: settings.dirs, tsconfig: settings.tsconfig });
  const manifest = buildManifest(analysis.components, root);
  const { valid, errors } = validateManifest(manifest);

  if (settings.json) {
    const report = {
      components: analysis.components.length,
      tags: analysis.components.map((c) => c.tag),
      valid,
      errors: valid ? [] : formatErrors(errors).split('\n'),
      warnings: analysis.warnings.map((w) => ({ file: w.file, tag: w.tag, message: w.message })),
      out: settings.check ? null : settings.out,
      check: settings.check,
    };
    console.log(JSON.stringify(report, null, 2));
  } else if (!settings.quiet) {
    for (const warning of analysis.warnings) {
      console.error(`warning: ${warning.file}: <${warning.tag}> ${warning.message}`);
    }
  }

  if (!valid) {
    console.error(`Generated manifest failed CEM schema validation:\n${formatErrors(errors)}`);
    return 1;
  }
  if (settings.strict && analysis.warnings.length > 0) {
    console.error(`${analysis.warnings.length} warning(s); failing with --strict.`);
    return 1;
  }
  if (analysis.components.length === 0) {
    if (settings.strict) {
      console.error('No components found; failing with --strict.');
      return 1;
    }
    if (!settings.quiet && !settings.json) console.error('warning: no components found.');
  }
  if (settings.check) {
    if (!settings.json) {
      console.error(
        `OK: ${analysis.components.length} component(s), manifest valid, nothing written.`,
      );
    }
    return 0;
  }

  const files = generateFiles(analysis, root, {
    dirs: settings.dirs,
    out: settings.out,
    tsconfig: settings.tsconfig,
    typingsDir: settings.typingsDir,
    frameworks: settings.frameworks,
  });
  const [manifestFile, ...typings] = files;
  if (settings.stdoutManifest) {
    // Stdout stays pure JSON; the summary goes to stderr.
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
  } else if (manifestFile !== undefined) {
    const manifestPath = resolve(root, settings.out);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, manifestFile.content);
  }
  writeGeneratedFiles(typings);
  if (!settings.json) {
    const where = settings.stdoutManifest ? 'stdout' : settings.out;
    console.error(
      `Analyzed ${analysis.components.length} component(s) → ${where} + ${typings.length} typing file(s) in ${settings.typingsDir}/.`,
    );
  }
  return 0;
}

function runAnalyze(root: string, args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) usage('analyze', 0);
  const settings = parseAnalyzeArgs(args);
  if (!hasFlag(args, '--watch')) {
    process.exit(performAnalyze(root, settings));
  }
  let code = performAnalyze(root, settings);
  if (code !== 0 && settings.strict) process.exit(code);
  console.error(`Watching ${settings.dirs.join(', ')} for changes…`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      console.error('[gyral-cem] change detected, regenerating…');
      code = performAnalyze(root, settings);
      if (code !== 0) console.error(`[gyral-cem] pass failed with exit ${code}.`);
    }, 120);
  };
  for (const dir of settings.dirs) {
    try {
      watch(resolve(root, dir), { recursive: true }, changed);
    } catch (error) {
      console.error(`Cannot watch ${dir}: ${(error as Error).message}`);
      process.exit(1);
    }
  }
}

function runValidate(root: string, args: string[]): void {
  if (args.includes('--help') || args.includes('-h')) usage('validate', 0);
  const positional = positionals(args);
  const schemaPath = flagValue(args, '--schema');
  const manifestPath = resolve(root, positional[0] ?? 'custom-elements.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
  } catch (error) {
    console.error(`Cannot read ${manifestPath}: ${(error as Error).message}`);
    process.exit(1);
  }
  let schema: unknown;
  if (schemaPath !== undefined) {
    try {
      schema = JSON.parse(readFileSync(resolve(root, schemaPath), 'utf8')) as unknown;
    } catch (error) {
      console.error(`Cannot read schema ${schemaPath}: ${(error as Error).message}`);
      process.exit(1);
    }
  }
  const { valid, errors } = validateManifest(parsed, schema);
  if (!valid) {
    console.error(`${manifestPath} is not a valid Custom Elements Manifest:\n${formatErrors(errors)}`);
    process.exit(1);
  }
  console.log(`${manifestPath} is a valid Custom Elements Manifest.`);
}

function main(): void {
  const { options, rest } = parseGlobal(process.argv.slice(2));
  const [command, ...args] = rest;
  if (command === 'analyze') runAnalyze(options.root, args);
  else if (command === 'validate') runValidate(options.root, args);
  else if (command === '--version' || command === '-V') console.log(version());
  else if (command === '--help' || command === '-h' || command === undefined) usage(undefined, 0);
  else {
    console.error(`Unknown command "${command}".`);
    usage(undefined, 2);
  }
}

main();
