// Intermediate representation: everything the manifest and generators need per component.
export type PropBuilder = 'string' | 'number' | 'boolean' | 'json' | 'value';

export interface PropIR {
  /** Property name as declared in `spec.props`. */
  readonly name: string;
  /** Which `prop.*` builder declared it. */
  readonly builder: PropBuilder;
  /** Attribute name, or undefined for property-only props (`prop.value`, `attribute: false`). */
  readonly attribute: string | undefined;
  /** TypeScript type text of the prop value (without `| undefined`). */
  readonly typeText: string;
  /** Source text of the default expression, when one is declared or implied. */
  readonly defaultText: string | undefined;
  /** True when `required: true` is declared. */
  readonly required: boolean;
  /** True when the prop reflects to an attribute. */
  readonly reflects: boolean;
  /** JSDoc summary line above the prop, if any. */
  readonly summary: string | undefined;
  /** JSDoc body below the summary line, if any. */
  readonly description: string | undefined;
  /** `@deprecated` message, or true for a bare tag. */
  readonly deprecated: boolean | string | undefined;
}

export interface OutputIR {
  /** The `_tag` discriminant of this output member. */
  readonly tag: string;
  /** TypeScript type text of the full output payload. */
  readonly payloadText: string;
  /** JSDoc on the member's type alias or interface, if any. */
  readonly description: string | undefined;
}

export interface CssPropertyIR {
  /** The `--*` custom property name. */
  readonly name: string;
  /** Declared value when the component defines it (`--x: value`), else undefined. */
  readonly default: string | undefined;
}

/** Shadow rendering mode from `spec.shadow` (default: shadow DOM). */
export type ShadowMode = 'shadow' | 'light' | 'delegates-focus' | 'unknown';

export interface SlotIR {
  /** Slot name; '' is the default slot. */
  readonly name: string;
}

export interface FormIR {
  readonly associated: boolean;
  readonly hasValue: boolean;
  readonly hasState: boolean;
  readonly hasValidity: boolean;
}

export interface ComponentIR {
  /** The custom element tag, e.g. 'product-card'. */
  readonly tag: string;
  /** Exported binding name (`X` in `export const X = define…`), if any. */
  readonly exportName: string | undefined;
  /** JSDoc summary line above the component, if any. */
  readonly summary: string | undefined;
  /** JSDoc body below the summary line, if any. */
  readonly description: string | undefined;
  /** `@deprecated` message, or true for a bare tag. */
  readonly deprecated: boolean | string | undefined;
  /** Shadow rendering mode from `spec.shadow`. */
  readonly shadow: ShadowMode;
  /** Source file, absolute path. */
  readonly file: string;
  readonly props: readonly PropIR[];
  /** One entry per `_tag` of the output union (4th `define` generic). */
  readonly outputs: readonly OutputIR[];
  readonly slots: readonly SlotIR[];
  /** Static `part="…"` names from templates. */
  readonly parts: readonly string[];
  /** `--*` names consumed via `var(--…)` or defined in styles. */
  readonly cssProperties: readonly CssPropertyIR[];
  /** Keys returned by `states: (s) => ({…})`. */
  readonly cssStates: readonly string[];
  readonly form: FormIR;
}

export interface AnalysisWarning {
  readonly file: string;
  readonly tag: string;
  readonly message: string;
}

export interface Analysis {
  readonly components: readonly ComponentIR[];
  readonly warnings: readonly AnalysisWarning[];
}
