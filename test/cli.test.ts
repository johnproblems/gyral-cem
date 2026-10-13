import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'dist', 'cli.js');

function runCli(args: string[], cwd: string): { stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`gyral-cem ${args.join(' ')} exited ${result.status}: ${result.stderr}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

describe('cli', () => {
  beforeAll(() => {
    // Always rebuild: the CLI tests must exercise current sources, not a stale dist.
    execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });
    expect(existsSync(CLI)).toBe(true);
  });

  it('analyzes examples and validates the manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    const { stdout, stderr } = runCli(
      [
        'analyze',
        'examples',
        '--root',
        root,
        '--out',
        join(dir, 'custom-elements.json'),
        '--typingsDir',
        join(dir, 'typings'),
      ],
      root,
    );
    // Stdout stays data-pure; the human summary goes to stderr.
    expect(stdout).toBe('');
    expect(stderr).toMatch(/Analyzed 3 component\(s\)/);
    const manifest = JSON.parse(readFileSync(join(dir, 'custom-elements.json'), 'utf8')) as {
      schemaVersion: string;
      modules: unknown[];
    };
    expect(manifest.schemaVersion).toBe('2.1.0');
    expect(manifest.modules).toHaveLength(3);
    expect(existsSync(join(dir, 'typings', 'react.d.ts'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'vue.d.ts'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'svelte.d.ts'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'astro.d.ts'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'elements.d.ts'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'html-custom-data.json'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'ProductCard.tsx'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'index.ts'))).toBe(true);

    const validated = runCli(['validate', join(dir, 'custom-elements.json')], root);
    expect(validated.stdout).toMatch(/valid Custom Elements Manifest/);
  });

  it('fails validation for an invalid manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, JSON.stringify({ schemaVersion: '2.1.0', modules: [{ kind: 'nope' }] }));
    let failed = false;
    try {
      runCli(['validate', bad], root);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it('emits only the requested frameworks', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    runCli(
      [
        'analyze',
        'examples',
        '--root',
        root,
        '--out',
        join(dir, 'custom-elements.json'),
        '--typingsDir',
        join(dir, 'typings'),
        '--frameworks',
        'react',
      ],
      root,
    );
    expect(existsSync(join(dir, 'typings', 'react.d.ts'))).toBe(true);
    expect(existsSync(join(dir, 'typings', 'vue.d.ts'))).toBe(false);
  });

  it('reports its version', () => {
    const { stdout } = runCli(['--version'], root);
    expect(stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('checks without writing and reports JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    const out = join(dir, 'custom-elements.json');
    const { stdout } = runCli(
      ['analyze', 'examples', '--root', root, '--out', out, '--check', '--format', 'json'],
      root,
    );
    const report = JSON.parse(stdout) as {
      components: number;
      tags: string[];
      valid: boolean;
      warnings: unknown[];
      out: null;
      check: boolean;
    };
    expect(report.components).toBe(3);
    expect(report.tags).toEqual(['form-input', 'product-card', 'x-counter']);
    expect(report.valid).toBe(true);
    expect(report.warnings).toHaveLength(1);
    expect(report.out).toBe(null);
    expect(report.check).toBe(true);
    expect(existsSync(out)).toBe(false);
  });

  it('writes the manifest to stdout with --out -', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    const stdout = execFileSync(
      process.execPath,
      [CLI, 'analyze', 'examples', '--root', root, '--out', '-', '--typingsDir', join(dir, 'typings')],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const manifest = JSON.parse(stdout) as { schemaVersion: string; modules: unknown[] };
    expect(manifest.schemaVersion).toBe('2.1.0');
    expect(manifest.modules).toHaveLength(3);
  });

  it('fails strict runs on warnings and on zero components', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    let failed = false;
    try {
      runCli(
        ['analyze', 'examples', '--root', root, '--out', join(dir, 'x.json'), '--strict', '--quiet'],
        root,
      );
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);

    const empty = mkdtempSync(join(tmpdir(), 'gyral-cem-empty-'));
    let failedEmpty = false;
    try {
      runCli(['analyze', '.', '--root', empty, '--strict', '--quiet'], root);
    } catch {
      failedEmpty = true;
    }
    expect(failedEmpty).toBe(true);
  });

  it('accepts an explicit schema for validate', () => {
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-cli-'));
    const out = join(dir, 'custom-elements.json');
    runCli(['analyze', 'examples', '--root', root, '--out', out, '--typingsDir', join(dir, 't')], root);
    const schema = join(root, 'node_modules', 'custom-elements-manifest', 'schema.json');
    const { stdout } = runCli(['validate', out, '--schema', schema], root);
    expect(stdout).toMatch(/valid Custom Elements Manifest/);
  });

  it('regenerates in watch mode', async () => {
    const { spawn } = await import('node:child_process');
    const { copyFileSync, mkdirSync, rmSync } = await import('node:fs');
    const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-watch-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    copyFileSync(join(root, 'examples', 'gyral-stub.ts'), join(dir, 'src', 'stub.ts'));
    copyFileSync(join(root, 'examples', 'counter', 'counter.ts'), join(dir, 'src', 'counter.ts'));
    // The fixture imports ../gyral-stub.js; point it at the local copy.
    const { readFileSync, writeFileSync } = await import('node:fs');
    writeFileSync(
      join(dir, 'src', 'counter.ts'),
      readFileSync(join(dir, 'src', 'counter.ts'), 'utf8').replace('../gyral-stub.js', './stub.js'),
    );
    const out = join(dir, 'custom-elements.json');
    const child = spawn(
      process.execPath,
      [CLI, 'analyze', 'src', '--root', dir, '--out', out, '--frameworks', 'elements', '--watch'],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    try {
      await vi.waitFor(() => expect(stderr).toMatch(/Watching/), { timeout: 15000 });
      expect(existsSync(out)).toBe(true);
      writeFileSync(join(dir, 'src', 'counter.ts'), readFileSync(join(dir, 'src', 'counter.ts'), 'utf8') + '\n');
      await vi.waitFor(() => expect(stderr).toMatch(/regenerating/), { timeout: 15000 });
    } finally {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30000);
});
