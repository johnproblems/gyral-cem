import { css, define, html, prop } from '../gyral-stub.js';

export interface CounterState {
  readonly count: number;
}

export type CounterMsg = { readonly _tag: 'Increment' };

export interface CounterProps {
  readonly label: string;
}

export type CounterOut = { readonly _tag: 'CountChanged'; readonly count: number };

/** A minimal counter with one prop and one output. */
export const Counter = define<CounterState, CounterMsg, CounterProps, CounterOut>()('x-counter', {
  props: {
    /** Label shown next to the count. */
    label: prop.string({ default: 'Count' }),
  },
  init: () => ({ count: 0 }),
  intent: {
    Increment: () => ({ _tag: 'Increment' }) as const,
  },
  update: {
    Increment: (s: CounterState) => ({ ...s, count: s.count + 1 }),
  },
  view: (s: CounterState) => html`<output>Count: ${s.count}</output>`,
  styles: css`
    :host {
      --counter-color: currentColor;
    }
    output {
      color: var(--counter-color);
    }
  `,
});
