// Powered by OnSpace.AI
import { en } from './en';
import { ar } from './ar';

export const translations = { en, ar };

// Builds a union of every dot-joined leaf path in the `en` dictionary, so
// `t('order.statuses.pending')` is type-checked at compile time.
type Join<K, P> = K extends string ? (P extends string ? (P extends '' ? K : `${K}.${P}`) : never) : never;

type Leaves<T> = T extends string
  ? ''
  : {
      [K in keyof T]: Join<K & string, Leaves<T[K]>>;
    }[keyof T];

export type TranslationKey = Leaves<typeof en>;
