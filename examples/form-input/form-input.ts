import { define, html, prop, type PropGuard } from '../gyral-stub.js';

export interface FieldSchema {
  readonly minLength: number;
}

export interface FieldState {
  readonly value: string;
}

export type FieldMsg = { readonly _tag: 'Input'; readonly value: string };

export interface FieldProps {
  readonly value: string;
  readonly schema: FieldSchema | undefined;
}

export type FieldOut = { readonly _tag: 'Changed'; readonly value: string };

const isSchema: PropGuard<FieldSchema> = (u: unknown): u is FieldSchema =>
  typeof u === 'object' && u !== null && typeof (u as FieldSchema).minLength === 'number';

/** A form-associated text field with a property-only schema prop. */
export const FormInput = define<FieldState, FieldMsg, FieldProps, FieldOut>()('form-input', {
  props: {
    value: prop.string({ default: '' }),
    /** @deprecated Pass validation rules through the form instead. */
    schema: prop.value(isSchema),
  },
  formAssociated: {
    value: (s: FieldState) => s.value,
    state: (s: FieldState) => s.value,
    validity: (s: FieldState) => (s.value.length === 0 ? { valueMissing: true } : undefined),
  },
  init: () => ({ value: '' }),
  intent: {
    Input: ({ value }: { readonly value?: string }) =>
      ({ _tag: 'Input', value: value ?? '' }) as const,
  },
  update: {
    Input: (_s: FieldState, m: { readonly value: string }) => ({ value: m.value }),
  },
  view: (s: FieldState) => html`<input value=${s.value} part="field" />`,
});
