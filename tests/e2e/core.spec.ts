import { expect, test } from '@playwright/test'

test('loads the shell and switches tabs without navigation', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByText('Lock Incremental v0.1.0 by WoodyPython')).toBeVisible()
  await expect(page.getByText('Points', { exact: true })).toBeVisible()
  await expect(page.locator('header [data-readout="points"]')).toHaveCount(0)
  await expect(page.locator('main [data-readout="points"]')).toBeVisible()
  await expect(page.locator('[data-upgrades-divider]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Lock game/ })).toBeVisible()
  await expect(page.getByText('Repeatable Upgrades')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Target Value' })).toBeVisible()
  const targetValue = page.getByRole('button', { name: /Target Value/ })
  await expect(targetValue).toBeDisabled()
  await expect(targetValue).toHaveText('5 Points')
  await expect(page.locator('[data-upgrade-id="target-value"]')).toContainText('Total: 1×')
  await expect(page.locator('[data-upgrade-id="target-value"]')).not.toHaveClass(/is-purchased/)
  await expect(page.getByRole('complementary', { name: 'Game statistics' })).toHaveCount(0)
  await expect(page.getByText('One-time Upgrades')).toBeHidden()
  await expect(page.getByText(/Earn 100 lifetime Points/)).toBeVisible()
  await expect(page.locator('.status-footer')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')

  const pointsBox = await page.locator('.progression-points').boundingBox()
  const dividerBox = await page.locator('[data-upgrades-divider]').boundingBox()
  const upgradesBox = await page.getByText('Repeatable Upgrades').boundingBox()
  expect(pointsBox).not.toBeNull()
  expect(dividerBox).not.toBeNull()
  expect(upgradesBox).not.toBeNull()
  if (pointsBox === null || dividerBox === null || upgradesBox === null) {
    throw new Error('Expected the progression layout to be visible')
  }
  expect(pointsBox.y + pointsBox.height).toBeLessThanOrEqual(dividerBox.y + 1)
  expect(dividerBox.y + dividerBox.height).toBeLessThan(upgradesBox.y)

  const mainTab = page.getByRole('tab', { name: 'Main' })
  const settingsTab = page.getByRole('tab', { name: 'Settings' })
  await expect(mainTab).toHaveAttribute('aria-controls', 'panel-main')
  await expect(settingsTab).toHaveAttribute('aria-controls', 'panel-settings')
  await mainTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(settingsTab).toBeFocused()
  await expect(settingsTab).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(mainTab).toBeFocused()
  await page.keyboard.press('End')
  await expect(settingsTab).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(page.getByText('Persistence is coming next')).toBeVisible()
  await page.getByRole('button', { name: /Ember/ }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ember')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#211b1a')

  await mainTab.click()
  await expect(page.getByRole('button', { name: /Lock game/ })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('cleans up upgrade reveal animation before later tab changes', async ({ page }) => {
  await page.goto('/')
  const card = page.locator('[data-upgrade-id="target-value"]')
  await card.evaluate((element) => {
    element.classList.add('is-unlocking')
  })
  await expect
    .poll(() => card.evaluate((element) => element.classList.contains('is-unlocking')))
    .toBe(false)

  await page.getByRole('tab', { name: 'Settings' }).click()
  await page.getByRole('tab', { name: 'Main' }).click()
  await expect(card).not.toHaveClass(/is-unlocking/)
})

test('supports keyboard start, failure, and blocked cooldown input', async ({ page }) => {
  await page.goto('/')
  const lock = page.getByRole('button', { name: /Lock game/ })
  const live = page.locator('[data-live]')

  await lock.focus()
  await expect(lock).toBeFocused()
  await page.keyboard.press('Space')
  await expect(live).toContainText('Run started')

  await page.keyboard.press('Space')
  await expect(live).toContainText('Run failed')
  await expect(live).toContainText('5 second cooldown')

  await page.keyboard.press('Enter')
  await expect(live).toContainText('Run failed')
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

test('keeps the lock and upgrades fluid at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 })
  await page.goto('/')
  const lock = page.getByRole('button', { name: /Lock game/ })
  const lockBox = await lock.boundingBox()
  expect(lockBox).not.toBeNull()
  if (lockBox === null) throw new Error('Expected lock')
  expect(lockBox.x + lockBox.width).toBeLessThanOrEqual(321)
  await expect(page.getByRole('heading', { name: 'Target Value' })).toBeVisible()
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
