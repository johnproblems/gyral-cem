// Minimal faithful stand-in for the `@gyral/core` component API (`define`,
// `prop`, `html`, `css`), for fixtures and tests. Shapes mirror the real
// `prop.ts`/`define.ts`/`server-specs.ts`: builders return `Prop<T>` objects,
// `define` records specs in Node, and `html`/`css` are template tags.
export interface Tagged {
  readonly _tag: string;
}

export type PropKind = 'string' | 'number' | 'boolean' | 'json' | 'value';

declare const OUTPUT: unique symbol;

/** One declared prop: what a builder returns. */
export interface Prop<T> {
  readonly kind: PropKind;
  /** The attribute name, `false` for property only, `undefined` for kebab default. */
  readonly attribute: string | false | undefined;
  readonly schema: unknown;
  readonly required: boolean;
  readonly default?: unknown;
  readonly equals: (a: unknown, b: unknown) => boolean;
  /** Type-only: the value components see. Never set. */
  readonly [OUTPUT]?: () => T;
}

export type PropGuard<T> = (value: unknown) => value is T;

/** What `prop.json`/`prop.value` accept: a Standard Schema or a type guard. */
type Check = { readonly '~standard'?: unknown } | ((value: unknown) => boolean);
type Out<S> = S extends (value: unknown) => value is infer T ? T : never;

interface Common {
  readonly attribute?: string | false | undefined;
}
interface Required {
  readonly required: true;
  readonly default?: undefined;
}
interface Defaulted<T> {
  readonly required?: false | undefined;
  readonly default: T;
}
interface Optional {
  readonly required?: false | undefined;
  readonly default?: undefined;
}
type Refined = Common;
interface Scalar {
  <O extends string = string>(opts: Refined & (Required | Defaulted<O>)): Prop<O>;
  <O extends string = string>(opts?: Refined & Optional): Prop<O | undefined>;
}

interface Options {
  readonly attribute?: string | false | undefined;
  readonly required?: boolean | undefined;
  readonly default?: unknown;
}

function make(kind: PropKind, opts: Options = {}, schema: unknown = undefined): Prop<never> {
  const value =
    opts.default !== undefined ? opts.default : kind === 'boolean' ? false : undefined;
  const base = {
    kind,
    attribute: kind === 'value' ? (false as const) : opts.attribute,
    schema,
    required: opts.required === true,
    equals: Object.is,
  };
  return (value === undefined ? base : { ...base, default: value }) as Prop<never>;
}

/** The prop builders. */
export const prop: {
  readonly string: Scalar;
  readonly number: (
    opts?: Refined & (Required | Defaulted<number> | Optional),
  ) => Prop<number | undefined>;
  readonly boolean: <O extends boolean = boolean>(
    opts?: Refined & { readonly default?: O | undefined },
  ) => Prop<O>;
  readonly json: <S extends Check>(
    schema: S,
    opts?: Common & (Required | Defaulted<Out<S>> | Optional),
  ) => Prop<Out<S> | undefined>;
  readonly value: <S extends Check>(
    schema: S,
    opts?: Common & (Required | Defaulted<Out<S>> | Optional),
  ) => Prop<Out<S> | undefined>;
} = {
  string: ((opts?: Options) => make('string', opts)) as Scalar,
  number: ((opts?: Options) => make('number', opts)) as (
    opts?: Refined & (Required | Defaulted<number> | Optional),
  ) => Prop<number | undefined>,
  boolean: ((opts?: Options) => make('boolean', opts)) as <O extends boolean>() => Prop<O>,
  json: ((schema: unknown, opts?: Options) => make('json', opts, schema)) as <S extends Check>(
    schema: S,
    opts?: Common & (Required | Defaulted<Out<S>> | Optional),
  ) => Prop<Out<S> | undefined>,
  value: ((schema: unknown, opts?: Options) => make('value', opts, schema)) as <S extends Check>(
    schema: S,
    opts?: Common & (Required | Defaulted<Out<S>> | Optional),
  ) => Prop<Out<S> | undefined>,
};

/** Loose component spec: known fields typed, the rest open (intent/update/init). */
export interface ComponentSpec {
  readonly props?: Readonly<Record<string, Prop<unknown>>> | undefined;
  readonly formAssociated?:
    | {
        readonly value: (...args: never[]) => unknown;
        readonly state?: (...args: never[]) => unknown | undefined;
        readonly validity?: (...args: never[]) => unknown | undefined;
      }
    | undefined;
  readonly states?: ((...args: never[]) => Readonly<Record<string, boolean>>) | undefined;
  readonly styles?: unknown;
  readonly shadow?: boolean | { readonly delegatesFocus?: boolean } | undefined;
  readonly view: (...args: never[]) => unknown;
  readonly [key: string]: unknown;
}

export interface GyralElementClass {
  new (): HTMLElement;
  readonly spec: ComponentSpec;
  readonly tagName: string;
}

const specs = new Map<string, ComponentSpec>();

/** Every spec recorded by `define` in Node, by tag. */
export const recordedSpecs = (): ReadonlyMap<string, ComponentSpec> => specs;

/**
 * Two-call component definition: `define<State, Msg, Props, Out>()('tag', spec)`.
 * In Node (no DOM) the spec is recorded and a placeholder class returned.
 */
export function define<
  S = unknown,
  M extends Tagged = never,
  P extends object = object,
  O extends Tagged = never,
>(): <N extends string = never>(tag: string, spec: ComponentSpec) => GyralElementClass {
  void (null as unknown as S);
  void (null as unknown as M);
  void (null as unknown as P);
  void (null as unknown as O);
  return <N extends string = never>(tag: string, spec: ComponentSpec): GyralElementClass => {
    void (null as unknown as N);
    if (!specs.has(tag)) specs.set(tag, spec);
    const placeholder = function (): never {
      throw new Error(`<${tag}> cannot be constructed in Node.`);
    };
    return Object.assign(placeholder, { spec, tagName: tag }) as unknown as GyralElementClass;
  };
}

/** HTML template tag: returns its static text with values interpolated. */
export function html(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ''), '');
}

/** CSS template tag. */
export function css(strings: TemplateStringsArray, ...values: unknown[]): string {
  return strings.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ''), '');
}
