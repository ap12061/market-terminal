import { expect, test } from '@playwright/test'

// Talks to the real Coinbase feed, so it's opt-in (LIVE_E2E=1): CI must not
// fail because a third party is slow or unreachable.
test.skip(!process.env['LIVE_E2E'], 'Set LIVE_E2E=1 to run against the live Coinbase feed')

test('streams real prices from Coinbase', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('market-terminal:feed', 'live'))
  await page.goto('/')

  await expect(page.getByRole('status')).toHaveText('Market data: Live', { timeout: 15_000 })
  const btcPrice = page
    .getByRole('row', { name: /BTC\/USD/ })
    .getByRole('cell')
    .first()
  await expect(btcPrice).toHaveText(/^[\d,.\s]+$/, { timeout: 15_000 })
})
