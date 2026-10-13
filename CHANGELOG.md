# Changelog

## 0.1.0

Initial release.

- `gyral-cem analyze`: Custom Elements Manifest 2.1 from Gyral sources — tags, props
  (attribute, type, default, required), the `gyral-output` event with its typed detail
  union, slots, CSS parts, CSS custom properties (usages and definitions), custom
  states, shadow mode, and form association.
- Framework typings: React (JSX + per-output callbacks + wrappers), Vue
  (`GlobalComponents`), Svelte, Astro, `HTMLElementTagNameMap`, and VS Code custom data.
- `gyral-cem validate`: manifest checks against the published CEM JSON schema.
- Vite plugin mode regenerating on save; runtime cross-check of static results.
- CLI extras: `--watch`, `--check`, `--format json`, `--out -`, `--quiet`, `--strict`.
