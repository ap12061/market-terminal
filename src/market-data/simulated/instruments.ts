import {
  parseDecimal,
  parseProductId,
  splitProductId,
  type DecimalString,
  type Instrument,
} from '@/domain'

export interface SimulatedInstrument {
  instrument: Instrument
  initialPrice: DecimalString
  /** Standard deviation of the relative price change per √second. */
  volatility: number
  tradesPerSecond: number
  /** Typical order size, in size increments. */
  typicalSizeUnits: number
  /** Maximum gap between adjacent book levels, in price increments. */
  levelSpacingTicks: number
}

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
 * Fictional market parameters. Tick and size increments vary widely on
 * purpose, to exercise formatting and grouping across price scales.
 */
export const DEFAULT_SIMULATED_INSTRUMENTS: readonly SimulatedInstrument[] = [
  {
    instrument: instrument('BTC-USD', '0.01', '0.00000001'),
    initialPrice: parseDecimal('84000.00'),
    volatility: 0.0002,
    tradesPerSecond: 4,
    typicalSizeUnits: 5_000_000,
    levelSpacingTicks: 50,
  },
  {
    instrument: instrument('ETH-USD', '0.01', '0.00000001'),
    initialPrice: parseDecimal('3200.00'),
    volatility: 0.0003,
    tradesPerSecond: 3,
    typicalSizeUnits: 50_000_000,
    levelSpacingTicks: 10,
  },
  {
    instrument: instrument('SOL-USD', '0.01', '0.001'),
    initialPrice: parseDecimal('180.00'),
    volatility: 0.0005,
    tradesPerSecond: 2,
    typicalSizeUnits: 5_000,
    levelSpacingTicks: 2,
  },
  {
    instrument: instrument('XRP-USD', '0.0001', '0.000001'),
    initialPrice: parseDecimal('2.5000'),
    volatility: 0.0006,
    tradesPerSecond: 2,
    typicalSizeUnits: 500_000_000,
    levelSpacingTicks: 2,
  },
  {
    instrument: instrument('DOGE-USD', '0.00001', '0.1'),
    initialPrice: parseDecimal('0.18000'),
    volatility: 0.0008,
    tradesPerSecond: 1.5,
    typicalSizeUnits: 20_000,
    levelSpacingTicks: 2,
  },
]
