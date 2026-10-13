# PRD: gyral-cem — use Gyral components from any framework

## Summary and verification

`gyral-cem` reads Gyral components and writes a standard `custom-elements.json` plus typings for React, Vue, Svelte, and Astro, so a Gyral component is typed and autocompleted anywhere it is used.

**Verified gap.**

- Gyral emits no Custom Elements Manifest, no JSX `IntrinsicElements` typings, and no editor custom data. The only typing it generates is `.gyral/elements.d.ts` (an `HTMLElementTagNameMap` entry per exported component), found with a regex.
- No tracker issue mentions a manifest.
- Gyral's core beliefs say every component "works anywhere", and a [platform spike](https://github.com/gyraljs/gyral/blob/main/docs/references/platform-spikes-2026-10-11.md) proved React 19, Vue 3.5, and Svelte 5 can host one. But the spike falls back to raw DOM listeners where JSX event typing is inconvenient, and Vue needs manual `isCustomElement` setup.
- gyral-shop **hand-maintains** a registry of its CSS parts and checks it with a regex test, which is exactly what a manifest would generate.

## Goals, non-goals, success criteria

**Goals**

- `npx gyral-cem analyze src` writes `custom-elements.json` (schema 2.x): tag, props (attribute name, type, default, required), the `gyral-output` event with its typed `detail` union, slots, CSS parts, CSS custom properties, custom states, and form association.
- Generated framework typings: `react.d.ts` (JSX elements with per-output callbacks), `vue.d.ts` (`GlobalComponents`), `svelte.d.ts`.
- A tiny React wrapper per component that maps `onPicked` style props to `gyral-output` messages by `_tag`.
- A Vite plugin mode that regenerates on save, beside Gyral's own preset.

**Non-goals (v0.1)**

- Server rendering Gyral components inside React or Astro; the spike warns the two ownership models must not mix without a separate design.
- A Storybook addon; the manifest makes the existing web-components addon work.

**Success criteria**

| Criterion | Target |
| --- | --- |
| gyral-shop's hand-written parts registry | reproduced exactly from source |
| Spike host apps (React, Vue, Svelte) | typecheck with generated typings, no `any` or raw listeners |
| Manifest validates against the CEM JSON schema | yes |
| Storybook web-components autodocs show props and events | yes |

## How it works

Each manifest field comes from the cheapest reliable source; only output types need the full TypeScript checker.

| Manifest field | Source in Gyral | Method |
| --- | --- | --- |
| Tag name, class | `define<...>()('tag', spec)` | TypeScript AST |
| Props: name, attribute, type, default, required | `prop.string/number/boolean/json/value(...)` in `spec.props`; attribute defaults to kebab-case of the name | AST plus checker for `prop.value` schema types |
| Property-only props | `prop.value` (never reflected to an attribute) | AST |
| Events | the single `gyral-output` event; `detail` is the output union `O` from `define`'s 4th generic | **TypeScript checker**, one entry per `_tag` |
| Slots | `<slot>` / `<slot name>` in `html` templates | template scan |
| CSS parts | `part="..."` in templates | template scan |
| CSS custom properties | `var(--...)` in `styles` | CSS scan |
| Custom states | keys returned by `states: (s) => ({...})` | AST |
| Form association | `spec.formAssociated` | AST |

A runtime cross-check is available for free: importing components in Node makes `define` record each spec (`server-specs.ts`), which confirms the static result for tags and props.

**React typing shape.** React 19 sets properties on defined custom elements and accepts `ongyral-output`. The generated wrapper adds typed callbacks per output tag:

```tsx
<ProductCard sku="A12" onAddedToCart={(msg) => track(msg.sku)} />
// renders <product-card sku="A12"> and listens to gyral-output where _tag === 'AddedToCart'
```

Note that `gyral-output` is `composed: false`, so listeners must sit on the element itself, which the wrapper does.

## Build plan, testing, risks

A manifest with tags and props lands by hour 6; events, framework typings, and the wrapper fill the rest.

| Hours | Milestone |
| --- | --- |
| 0–3 | CLI; component discovery via TypeScript AST; props and form association |
| 3–6 | Template and CSS scans: slots, parts, custom properties, states; schema validation |
| 6–10 | Output event types via the checker |
| 10–14 | React, Vue, Svelte typings; React wrapper |
| 14–18 | Vite plugin mode; run on gyral-shop and the spike hosts; Storybook check |

**Testing.** Snapshot manifests for each `examples/` app; gyral-shop's parts registry as an exact-match oracle; typecheck the platform-spike host apps against generated typings; validate output against the CEM schema.

**Risks**

| Risk | Mitigation |
| --- | --- |
| Discovery misses components written unusually | Fall back to the runtime spec recording and report mismatches |
| Template scans miss dynamic `part` values | Report dynamic values as warnings rather than guessing |
| Gyral later ships its own manifest | Propose this upstream as a `gyralVitePreset({ manifest })` option |
| Framework typing conventions shift (React event naming) | Keep each framework's output in its own small generator |
