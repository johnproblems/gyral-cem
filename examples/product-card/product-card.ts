import { css, define, html, prop, type PropGuard } from '../gyral-stub.js';

export interface Product {
  readonly sku: string;
  readonly price: number;
}

export interface CardState {
  readonly loading: boolean;
  readonly items: readonly Product[];
  readonly featured: boolean;
}

export type CardMsg =
  | { readonly _tag: 'Add'; readonly sku: string }
  | { readonly _tag: 'Remove'; readonly sku: string }
  | { readonly _tag: 'Pick'; readonly sku: string };

export interface CardProps {
  readonly sku: string;
  readonly maxQuantity: number;
  readonly featured: boolean;
  readonly tags: readonly string[] | undefined;
  readonly product: Product | undefined;
  readonly title: string | undefined;
}

/** Emitted when the shopper adds this product to the cart. */
export interface AddedToCart {
  readonly _tag: 'AddedToCart';
  readonly sku: string;
  readonly quantity: number;
}

/** Emitted when the shopper removes this product from the cart. */
export interface Removed {
  readonly _tag: 'Removed';
  readonly sku: string;
}

/** Emitted when the shopper picks this product. */
export interface Picked {
  readonly _tag: 'Picked';
  readonly sku: string;
}

export type CardOut = AddedToCart | Removed | Picked;

const isStringArray: PropGuard<readonly string[]> = (u: unknown): u is readonly string[] =>
  Array.isArray(u) && u.every((v): v is string => typeof v === 'string');

const isProduct: PropGuard<Product> = (u: unknown): u is Product =>
  typeof u === 'object' &&
  u !== null &&
  typeof (u as Product).sku === 'string' &&
  typeof (u as Product).price === 'number';

/** Deliberately dynamic: the template scan must warn, not guess. */
const extraPart = 'badge';

/**
 * A product card with every prop builder, three outputs, slots, parts,
 * custom properties, custom states, and form-adjacent styling.
 */
export const ProductCard = define<CardState, CardMsg, CardProps, CardOut>()('product-card', {
  props: {
    /** Stock-keeping unit; the card's identity. */
    sku: prop.string({ required: true }),
    /** Maximum quantity the stepper allows. Defaults to 10. */
    maxQuantity: prop.number({ default: 10 }),
    featured: prop.boolean(),
    tags: prop.json(isStringArray, { default: [] }),
    product: prop.value(isProduct),
    title: prop.string({ attribute: 'card-title' }),
  },
  shadow: { delegatesFocus: true },
  init: () => ({ loading: false, items: [], featured: false }),
  intent: {
    Add: ({ sku }: { readonly sku?: string }) => ({ _tag: 'Add', sku: sku ?? '' }) as const,
    Remove: ({ sku }: { readonly sku?: string }) => ({ _tag: 'Remove', sku: sku ?? '' }) as const,
    Pick: ({ sku }: { readonly sku?: string }) => ({ _tag: 'Pick', sku: sku ?? '' }) as const,
  },
  update: {
    Add: (s: CardState) => ({ ...s }),
    Remove: (s: CardState) => ({ ...s }),
    Pick: (s: CardState) => ({ ...s }),
  },
  view: (s: CardState) => html`
    <article part="image price" aria-busy=${s.loading}>
      <slot></slot>
      <slot name="actions"></slot>
      <span part=${extraPart}>New</span>
    </article>
  `,
  styles: [
    css`
      :host {
        display: block;
        background: var(--card-bg);
      }
    `,
    ':host { color: var(--card-fg); }',
  ],
  states: (s: CardState) => ({
    loading: s.loading,
    empty: s.items.length === 0,
    featured: s.featured,
  }),
});
