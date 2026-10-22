import { parseDecimal, parseProductId, splitProductId, type Instrument } from '@/domain'

function instrument(id: string, priceIncrement: string, sizeIncrement: string): Instrument {
  const productId = parseProductId(id)
  return {
    id: productId,
    ...splitProductId(productId),
    priceIncrement: parseDecimal(priceIncrement),
    sizeIncrement: parseDecimal(sizeIncrement),
  }
}

/**
 * A curated product list, with increments taken from Coinbase's products API
 * (2026-10-22). The browser can't call that API directly (no CORS headers);
 * once the server-side proxy exists (M7), this can be fetched instead.
 */
export const COINBASE_INSTRUMENTS: readonly Instrument[] = [
  instrument('BTC-USD', '0.01', '0.00000001'),
  instrument('ETH-USD', '0.01', '0.00000001'),
  instrument('SOL-USD', '0.01', '0.00000001'),
  instrument('XRP-USD', '0.0001', '0.000001'),
  instrument('DOGE-USD', '0.00001', '0.1'),
  instrument('LINK-USD', '0.001', '0.01'),
  instrument('ADA-USD', '0.00001', '0.00000001'),
]
