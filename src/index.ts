// Public API: analysis, manifest, validation, generators, and the Vite plugin.
export { analyze, createProgram, type AnalyzeOptions } from './analyze.js';
export { buildManifest, toClassName, SCHEMA_VERSION, OUTPUT_EVENT } from './manifest.js';
export type {
  CemPackage,
  CemModule,
  CemDeclaration,
  CemExport,
  CemAttribute,
  CemMember,
  CemEvent,
  CemSlot,
  CemCssPart,
  CemCssProperty,
  CemCssState,
} from './manifest.js';
export type {
  ComponentIR,
  PropIR,
  PropBuilder,
  OutputIR,
  SlotIR,
  FormIR,
  CssPropertyIR,
  ShadowMode,
  Analysis,
  AnalysisWarning,
} from './ir.js';
export { validateManifest, formatErrors, type ValidationResult } from './validate.js';
export { generateReactTypings } from './generators/react.js';
export { generateVueTypings } from './generators/vue.js';
export { generateSvelteTypings } from './generators/svelte.js';
export { generateAstroTypings } from './generators/astro.js';
export { generateElementsTypings } from './generators/elements.js';
export {
  generateCustomData,
  buildCustomData,
  type CustomDataDocument,
  type CustomDataTag,
  type CustomDataAttribute,
} from './generators/custom-data.js';
export {
  generateReactWrapper,
  generateWrapperIndex,
  wrapperFileName,
  componentName,
} from './generators/wrapper.js';
export {
  diffRecordedSpecs,
  summarizeMismatches,
  type RecordedSpec,
  type RecordedProp,
  type RuntimeMismatch,
  type DiffOptions,
} from './runtime-check.js';
