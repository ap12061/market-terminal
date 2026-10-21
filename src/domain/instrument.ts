import { InvalidValueError, type Brand } from './brand'

/** An exchange product identifier in BASE-QUOTE form, e.g. "BTC-USD". */
export type ProductId = Brand<string, 'ProductId'>

const PRODUCT_ID_PATTERN = /^([A-Z0-9]{2,10})-([A-Z0-9]{2,10})$/

export function parseProductId(value: string): ProductId {
  if (!PRODUCT_ID_PATTERN.test(value)) throw new InvalidValueError('product id', value)
  return value as ProductId
}

export function splitProductId(id: ProductId): { base: string; quote: string } {
  const [, base = '', quote = ''] = PRODUCT_ID_PATTERN.exec(id) ?? []
  return { base, quote }
}
