// Test helpers: write inline fixtures to a temp dir (with the Gyral stub)
// and analyze them.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from '../src/analyze.js';
import type { Analysis } from '../src/ir.js';

const here = dirname(fileURLToPath(import.meta.url));
const STUB = readFileSync(join(here, '..', 'examples', 'gyral-stub.ts'), 'utf8');

/** Writes `files` (name → source) plus the stub to a temp dir; returns the dir. */
export function fixtureDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'gyral-cem-'));
  writeFileSync(join(dir, 'stub.ts'), STUB);
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(dir, name), source);
  }
  return dir;
}

const PRELUDE = `import { define, html, css, prop } from './stub.js';\n`;

/** Analyzes one inline component source (stub imports pre-included). */
export function analyzeInline(source: string): Analysis {
  const dir = fixtureDir({ 'widget.ts': `${PRELUDE}${source}` });
  return analyze({ root: dir, files: [join(dir, 'widget.ts'), join(dir, 'stub.ts')] });
}

/** Analyzes the repo's `examples/` fixtures. */
export function analyzeExamples(): Analysis {
  const root = join(here, '..');
  return analyze({ root, dirs: ['examples'] });
}
