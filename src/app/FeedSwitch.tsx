import { use } from 'react'
import { cx } from '@/shared/cx'
import { FeedContext } from './feedContext'
import type { Feed } from './marketData'

const OPTIONS: ReadonlyArray<{ value: Feed; label: string; description: string }> = [
  { value: 'live', label: 'Live', description: 'Coinbase public market data' },
  { value: 'demo', label: 'Simulated', description: 'Seeded, offline market simulator' },
]

/** Switches between the live Coinbase feed and the simulator. */
export function FeedSwitch() {
  const control = use(FeedContext)
  if (!control) return null

  return (
    <fieldset className="feed-switch">
      <legend className="visually-hidden">Market data source</legend>
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          title={option.description}
          className={cx(
            'feed-switch__option',
            control.feed === option.value && 'feed-switch__option--active',
          )}
        >
          <input
            type="radio"
            name="feed"
            value={option.value}
            checked={control.feed === option.value}
            onChange={() => control.setFeed(option.value)}
            className="visually-hidden"
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  )
}
