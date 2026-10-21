import { expect, test } from '@playwright/test'

test('home page loads', async ({ page }) => {
  await page.goto('/')

  await expect(page).toHaveTitle('Portfolio Dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible()
})

test('unknown routes show the 404 page', async ({ page }) => {
  await page.goto('/nope')

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})
