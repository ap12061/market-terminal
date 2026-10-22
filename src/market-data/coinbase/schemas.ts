import { z } from 'zod'
import { isDecimalString, type DecimalString } from '@/domain'

// Schemas for the Coinbase Advanced Trade WebSocket feed, covering only the
// fields we use. Unknown fields are stripped, so additions upstream don't
// break parsing; missing or malformed fields we rely on do.

const decimal = z
  .string()
  .refine(isDecimalString, 'Expected a plain decimal string')
  .transform((value) => value as DecimalString)

const snapshotOrUpdate = z.enum(['snapshot', 'update'])

const envelope = {
  timestamp: z.string(),
  sequence_num: z.number().int().nonnegative(),
}

export const tickerMessage = z.object({
  ...envelope,
  channel: z.literal('ticker'),
  events: z.array(
    z.object({
      type: snapshotOrUpdate,
      tickers: z.array(
        z.object({
          product_id: z.string(),
          price: decimal,
          volume_24_h: decimal,
          low_24_h: decimal,
          high_24_h: decimal,
          price_percent_chg_24_h: decimal,
        }),
      ),
    }),
  ),
})

export const marketTradesMessage = z.object({
  ...envelope,
  channel: z.literal('market_trades'),
  events: z.array(
    z.object({
      type: snapshotOrUpdate,
      trades: z.array(
        z.object({
          trade_id: z.string(),
          product_id: z.string(),
          price: decimal,
          size: decimal,
          time: z.string(),
          /** The maker's side (the resting order), not the aggressor's. */
          side: z.enum(['BUY', 'SELL']),
        }),
      ),
    }),
  ),
})

export const level2Message = z.object({
  ...envelope,
  channel: z.literal('l2_data'),
  events: z.array(
    z.object({
      type: snapshotOrUpdate,
      product_id: z.string(),
      updates: z.array(
        z.object({
          side: z.enum(['bid', 'offer']),
          price_level: decimal,
          new_quantity: decimal,
        }),
      ),
    }),
  ),
})

export const heartbeatsMessage = z.object({
  ...envelope,
  channel: z.literal('heartbeats'),
})

export const subscriptionsMessage = z.object({
  ...envelope,
  channel: z.literal('subscriptions'),
  events: z.array(
    z.object({
      /** Everything this connection is now subscribed to, by channel. */
      subscriptions: z.record(z.string(), z.array(z.string())),
    }),
  ),
})

export const errorMessage = z.object({
  type: z.literal('error'),
  message: z.string(),
})

export const SCHEMAS_BY_CHANNEL = {
  ticker: tickerMessage,
  market_trades: marketTradesMessage,
  l2_data: level2Message,
  heartbeats: heartbeatsMessage,
  subscriptions: subscriptionsMessage,
} as const

export type CoinbaseMessage =
  | z.infer<typeof tickerMessage>
  | z.infer<typeof marketTradesMessage>
  | z.infer<typeof level2Message>
  | z.infer<typeof heartbeatsMessage>
  | z.infer<typeof subscriptionsMessage>

export type CoinbaseErrorMessage = z.infer<typeof errorMessage>

/** Coinbase timestamps have nanosecond precision, which Date.parse doesn't accept everywhere. */
export function parseTimestamp(value: string): number {
  const time = Date.parse(value.replace(/(\.\d{3})\d+/, '$1'))
  if (Number.isNaN(time)) throw new Error(`Invalid timestamp: ${value}`)
  return time
}
