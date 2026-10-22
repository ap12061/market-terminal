import { expect, test } from '@playwright/test'

// Run against the simulator: deterministic, and independent of Coinbase being reachable.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('market-terminal:feed', 'demo'))
})

test('streams prices from the simulated feed', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Market Terminal')
  await expect(page.getByRole('status')).toHaveText('Market data: Live')
  await expect(page.getByRole('radio', { name: 'Simulated' })).toBeChecked()

  const btcPrice = page
    .getByRole('row', { name: /BTC\/USD/ })
    .getByRole('cell')
    .first()
  await expect(btcPrice).toHaveText(/^[\d,.\s]+$/)
  const first = await btcPrice.textContent()
  await expect(btcPrice).not.toHaveText(first ?? '')
})

test('selecting an instrument updates the URL and the summary', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'ETH/USD' }).click()

  await expect(page).toHaveURL(/symbol=ETH-USD/)
  await expect(page.getByRole('heading', { level: 2, name: 'ETH / USD' })).toBeVisible()
  await expect(page.getByText('24h high')).toBeVisible()
})

test('a shared link restores the view', async ({ page }) => {
  await page.goto('/?symbol=SOL-USD&sort=change:desc')

  await expect(page.getByRole('heading', { level: 2, name: 'SOL / USD' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /24h/ })).toHaveAttribute(
    'aria-sort',
    'descending',
  )
})

test('switching feed keeps working and is remembered', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Live', { exact: true }).first().click()
  await expect(page.getByRole('radio', { name: 'Live' })).toBeChecked()
  await expect(page.getByText(/Coinbase Advanced Trade/)).toBeVisible()

  await page.getByText('Simulated', { exact: true }).click()
  await page.reload()
  await expect(page.getByRole('radio', { name: 'Simulated' })).toBeChecked()
  await expect(page.getByRole('status')).toHaveText('Market data: Live')
})

test('unknown routes show the 404 page', async ({ page }) => {
  await page.goto('/nope')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
