// Manifest validation: checks emitted `custom-elements.json` against the
// published CEM 2.x JSON schema with Ajv.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv, type ErrorObject } from 'ajv';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ErrorObject[];
}

let cachedSchema: unknown;
function loadSchema(): unknown {
  if (cachedSchema === undefined) {
    const require = createRequire(import.meta.url);
    const schemaPath = require.resolve('custom-elements-manifest/schema.json');
    cachedSchema = JSON.parse(readFileSync(schemaPath, 'utf8')) as unknown;
  }
  return cachedSchema;
}

export function validateManifest(manifest: unknown, schema?: unknown): ValidationResult {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile((schema ?? loadSchema()) as Record<string, unknown>);
  const valid = validate(manifest) as boolean;
  return { valid, errors: validate.errors ?? [] };
}

export function formatErrors(errors: readonly ErrorObject[], limit = 10): string {
  const shown = errors.slice(0, limit).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
  if (errors.length > limit) shown.push(`…and ${errors.length - limit} more error(s).`);
  return shown.join('\n');
}
