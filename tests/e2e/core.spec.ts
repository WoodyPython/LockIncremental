import { expect, test } from '@playwright/test'

test('loads the shell and switches tabs without navigation', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Lock Incremental v0.1.0 by WoodyPython')).toBeVisible()
  await expect(page.getByRole('button', { name: /Lock game/ })).toBeVisible()
  await expect(page.getByText('Repeatable Upgrades')).toBeHidden()
  await expect(page.getByText('One-time Upgrades')).toBeHidden()

  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Persistence is coming next')).toBeVisible()
  await page.getByRole('button', { name: /Ember/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ember')

  await page.getByRole('button', { name: 'Main' }).click()
  await expect(page.getByRole('button', { name: /Lock game/ })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('supports keyboard start, failure, cooldown, and deliberate restart', async ({ page }) => {
  await page.goto('/')
  const lock = page.getByRole('button', { name: /Lock game/ })
  const live = page.locator('[data-live]')

  await lock.focus()
  await expect(lock).toBeFocused()
  await page.keyboard.press('Space')
  await expect(live).toContainText('Run started')

  await page.keyboard.press('Space')
  await expect(live).toContainText('Run failed')
  await expect(live).toContainText('Five second cooldown')

  await page.keyboard.press('Enter')
  await expect(live).toContainText('Run failed')
  await page.waitForTimeout(5_100)
  await page.keyboard.press('Enter')
  await expect(live).toContainText('Run started')
})

test('supports primary pointer input and fits the viewport', async ({ page }) => {
  await page.goto('/')
  const lock = page.getByRole('button', { name: /Lock game/ })
  const live = page.locator('[data-live]')
  const box = await lock.boundingBox()

  expect(box).not.toBeNull()
  if (box === null) throw new Error('Expected a visible lock canvas')
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual((await page.evaluate(() => innerWidth)) + 1)

  await lock.dispatchEvent('pointerdown', {
    pointerId: 1,
    isPrimary: true,
    button: 0,
    pointerType: 'mouse',
  })
  await expect(live).toContainText('Run started')
  await expect(lock).not.toBeFocused()
})

test('fails automatically when the bar passes an untouched target', async ({ page }) => {
  await page.goto('/')
  const lock = page.getByRole('button', { name: /Lock game/ })
  const live = page.locator('[data-live]')

  await lock.focus()
  await page.keyboard.press('Space')
  await expect(live).toContainText('Run started')
  await expect(live).toContainText('Target passed', { timeout: 4_000 })
})
