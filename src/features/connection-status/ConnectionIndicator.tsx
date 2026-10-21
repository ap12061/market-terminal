import { useConnectionState, type ConnectionState } from '@/market-data'
import { cx } from '@/shared/cx'
import { useNow } from '@/shared/useNow'
import './ConnectionIndicator.css'

type Tone = 'ok' | 'warning' | 'error' | 'neutral'

function presentationOf(state: ConnectionState): { label: string; tone: Tone } {
  switch (state.status) {
    case 'idle':
      return { label: 'Offline', tone: 'neutral' }
    case 'connecting':
      return { label: state.attempt === 0 ? 'Connecting…' : 'Reconnecting…', tone: 'warning' }
    case 'open':
      return { label: 'Live', tone: 'ok' }
    case 'stale':
      return { label: 'Delayed', tone: 'warning' }
    case 'reconnecting':
      return { label: 'Disconnected', tone: 'error' }
  }
}

function SecondsUntil({ time }: { time: number }) {
  const seconds = Math.max(0, Math.ceil((time - useNow()) / 1_000))
  return <>retrying in {seconds}s</>
}

function SecondsSince({ time }: { time: number }) {
  const seconds = Math.max(0, Math.floor((useNow() - time) / 1_000))
  return <>no data for {seconds}s</>
}

/**
 * The feed's health at a glance. Only the status word is in the live region,
 * so screen readers hear "Disconnected" once, not a countdown every second.
 */
export function ConnectionIndicator() {
  const state = useConnectionState()
  const { label, tone } = presentationOf(state)

  return (
    <div className={cx('connection', `connection--${tone}`)}>
      <span className="connection__dot" aria-hidden="true" />
      {/* <output> is a live region (role="status") by default. */}
      <output className="connection__label">
        <span className="visually-hidden">Market data: </span>
        {label}
      </output>
      {state.status === 'reconnecting' && (
        <span className="connection__detail" title={state.reason}>
          {/* Remounts per retry, so the countdown starts fresh. */}
          <SecondsUntil key={state.retryAt} time={state.retryAt} />
        </span>
      )}
      {state.status === 'stale' && (
        <span className="connection__detail">
          <SecondsSince key={state.lastMessageAt} time={state.lastMessageAt} />
        </span>
      )}
    </div>
  )
}
