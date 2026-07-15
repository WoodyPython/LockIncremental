import { expect, test } from '@playwright/test'

test('loads the shell and switches tabs without navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 })
  await page.goto('/')

  await expect(page.getByText('Lock Incremental v0.1.0 by WoodyPython')).toBeVisible()
  await expect(page.getByText('Points', { exact: true })).toBeVisible()
  await expect(page.locator('.progression-points')).toContainText(/0\s*Points/)
  await expect(page.getByText('Medal Upgrades')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Rapid Recovery' })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Efficient Scaling' })).toBeHidden()
  await expect(page.getByRole('tab', { name: /Research/ })).toHaveCount(0)
  await expect(page.locator('[data-medal-readout]')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('header [data-readout="points"]')).toHaveCount(0)
  await expect(page.locator('main [data-readout="points"]')).toBeVisible()
  await expect(page.locator('[data-upgrades-divider]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Lock game/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Point Upgrades' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Target Value' })).toBeVisible()
  const targetValue = page.getByRole('button', { name: /Target Value/ })
  await expect(targetValue).toBeDisabled()
  await expect(targetValue).toHaveText('3 Points')
  await expect(page.locator('[data-upgrade-id="target-value"]')).toContainText('Total: 1×')
  await expect(page.locator('[data-upgrade-id="target-value"]')).not.toHaveClass(/is-purchased/)
  await expect(page.getByRole('complementary', { name: 'Game statistics' })).toHaveCount(0)
  await expect(page.getByText('One-time Upgrades')).toHaveCount(0)
  await expect(page.getByText(/Earn 100 lifetime Points/)).toBeVisible()
  await expect(page.locator('.status-footer')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(page.locator('[data-medal-upgrades]')).toHaveCSS('height', '0px')
  const visibleContentBottom = await page
    .locator('[data-upgrade-id="target-value"]')
    .evaluate((element) => element.getBoundingClientRect().bottom + window.scrollY)
  const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight)
  const viewportHeight = page.viewportSize()?.height
  if (viewportHeight === undefined) throw new Error('Expected a configured viewport')
  expect(documentHeight - visibleContentBottom).toBeLessThanOrEqual(viewportHeight)

  const pointsBox = await page.locator('.progression-points').boundingBox()
  const dividerBox = await page.locator('[data-upgrades-divider]').boundingBox()
  const upgradesBox = await page.getByRole('heading', { name: 'Point Upgrades' }).boundingBox()
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
  const mainContent = page.locator('main')
  const lockCanvas = page.locator('.lock-canvas')
  const canvasWidth = await lockCanvas.getAttribute('width')
  await expect(mainContent).toHaveCSS('transition-duration', '0s')
  const mainWidth = (await mainContent.boundingBox())?.width
  expect(mainWidth).toBe(800)
  await expect(mainTab).toHaveAttribute('aria-controls', 'panel-main')
  await expect(settingsTab).toHaveAttribute('aria-controls', 'panel-settings')
  await mainTab.focus()
  await page.keyboard.press('ArrowRight')
  await expect(settingsTab).toBeFocused()
  await expect(settingsTab).toHaveAttribute('aria-selected', 'true')
  await page.waitForTimeout(50)
  await expect(lockCanvas).toHaveAttribute('width', canvasWidth ?? '')
  expect((await mainContent.boundingBox())?.width).toBe(1180)
  await page.keyboard.press('Home')
  await expect(mainTab).toBeFocused()
  await page.keyboard.press('End')
  await expect(settingsTab).toBeFocused()
  await expect(page.getByRole('heading', { name: 'Main Options' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save Now' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export to Clipboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Import from Text' })).toBeVisible()
  await expect(page.getByText('Offline Progress')).toHaveCount(0)
  await expect(page.getByText('Theme', { exact: true })).toHaveCount(0)
  await expect(page.getByText(/community|Discord|support/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enabled' }).first()).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('html')).not.toHaveAttribute('data-theme')
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0d7774')

  await mainTab.click()
  expect((await mainContent.boundingBox())?.width).toBe(800)
  await expect(lockCanvas).toHaveAttribute('width', canvasWidth ?? '')
  await expect(page.getByRole('button', { name: /Lock game/ })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)

  await page.setViewportSize({ width: 375, height: 700 })
  const mobileMainWidth = (await mainContent.boundingBox())?.width
  await settingsTab.click()
  await expect(mainContent).toHaveCSS('transition-duration', '0s')
  expect((await mainContent.boundingBox())?.width).toBe(mobileMainWidth)
})

test('persists settings and supports compressed export, import, file download, and wipe', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/')
  await page.getByRole('tab', { name: 'Settings' }).click()

  const autosaveGroup = page.getByRole('group', { name: 'Autosave' })
  await autosaveGroup.getByRole('button', { name: 'Disabled' }).click()
  await expect(autosaveGroup.getByRole('button', { name: 'Disabled' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  const intervalButtons = page.getByRole('group', { name: 'Autosave Interval' }).getByRole('button')
  await expect(intervalButtons).toHaveCount(4)
  expect(
    await intervalButtons.evaluateAll((buttons) =>
      buttons.every((button) => button.hasAttribute('disabled')),
    ),
  ).toBe(true)
  await expect(page.locator('[data-save-toast]')).toBeHidden()

  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(
    page.getByRole('group', { name: 'Autosave' }).getByRole('button', { name: 'Disabled' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-save-toast]')).toBeHidden()

  await page.getByRole('button', { name: 'Export to Clipboard' }).click()
  await expect(page.locator('[data-save-toast]')).toHaveText(
    'Compressed save copied to the clipboard.',
  )
  const portable = await page.evaluate(() => navigator.clipboard.readText())
  expect(portable).toMatch(/^LI1:[A-Za-z0-9_-]+$/u)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export as File' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^lock-incremental-save-.*\.txt$/u)

  await page.getByRole('button', { name: 'Import from Text' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import from Text' })
  await importDialog.getByRole('textbox', { name: 'Compressed save text' }).fill(portable)
  await importDialog.getByRole('button', { name: 'Import Save' }).click()
  await expect(importDialog).toBeHidden()
  await expect(page.locator('[data-save-toast]')).toContainText('imported successfully')

  await page.getByRole('button', { name: 'Save Now' }).click()
  await expect(page.locator('[data-save-toast]')).toHaveText('Progress saved.')
  await page.locator('[data-import-file]').setInputFiles({
    name: 'lock-save.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(portable),
  })
  await expect(page.locator('[data-save-toast]')).toContainText('imported successfully')

  await page.getByRole('button', { name: 'Wipe Save' }).click()
  const wipeDialog = page.getByRole('dialog', { name: 'Wipe all progress?' })
  await expect(wipeDialog).toBeVisible()
  await wipeDialog.getByRole('button', { name: 'Confirm Wipe' }).click()
  await expect(wipeDialog).toBeHidden()
  await expect(page.locator('[data-save-toast]')).toContainText('wiped')

  await page.reload()
  await page.getByRole('tab', { name: 'Settings' }).click()
  await expect(
    page.getByRole('group', { name: 'Autosave' }).getByRole('button', { name: 'Enabled' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('keeps autosaves and successful setting changes silent', async ({ page }) => {
  await page.addInitScript(() => {
    const nativeSetInterval = window.setInterval.bind(window)
    window.setInterval = ((handler: TimerHandler, timeout?: number) =>
      nativeSetInterval(handler, timeout === 15_000 ? 250 : timeout)) as typeof window.setInterval
  })
  await page.goto('/')
  await page.getByRole('tab', { name: 'Settings' }).click()

  await page
    .getByRole('group', { name: 'Autosave Interval' })
    .getByRole('button', { name: '15s' })
    .click()
  await page.waitForTimeout(400)
  await expect(page.locator('[data-save-toast]')).toBeHidden()
  await expect(page.getByRole('switch', { name: 'Autosave notifications' })).toHaveCount(0)
})

test('replaces toast timers and reports import errors globally and in the dialog', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'Settings' }).click()
  const toast = page.locator('[data-save-toast]')
  const saveNow = page.getByRole('button', { name: 'Save Now' })

  await saveNow.click()
  await expect(toast).toHaveText('Progress saved.')
  await expect(toast).toHaveCSS('animation-name', 'save-toast-drop')
  await toast.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(toast).toHaveClass(/is-exiting/)
  await expect(toast).toHaveCSS('animation-name', 'save-toast-rise')
  await expect(toast).toBeHidden()

  await saveNow.click()
  await page.waitForTimeout(1_000)
  await saveNow.click()
  await page.waitForTimeout(2_200)
  await expect(toast).toBeVisible()
  await expect(toast).toHaveAttribute('role', 'status')
  await expect(toast).toHaveAttribute('aria-live', 'polite')
  await page.waitForTimeout(650)
  await expect(toast).toHaveClass(/is-exiting/, { timeout: 500 })
  await expect(toast).toHaveCSS('animation-name', 'save-toast-rise')
  await expect(toast).toBeHidden({ timeout: 500 })

  await page.getByRole('button', { name: 'Import from Text' }).click()
  const importDialog = page.getByRole('dialog', { name: 'Import from Text' })
  await importDialog.getByRole('textbox', { name: 'Compressed save text' }).fill('not-a-save')
  await importDialog.getByRole('button', { name: 'Import Save' }).click()
  await expect(importDialog).toContainText('Import failed')
  await expect(toast).toContainText('Import failed')
  await expect(toast).toHaveClass(/is-error/)
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

test('defines a smooth Medal shop reveal with a mobile divider fallback', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 })
  await page.goto('/')
  const layout = page.locator('.upgrades-layout')
  const resources = page.locator('.progression-resources')
  const medalShop = page.locator('[data-medal-upgrades]')
  await expect(layout).not.toHaveClass(/is-medal-unlocked/)
  await expect(medalShop).toHaveCSS('visibility', 'hidden')
  await layout.evaluate((element) => {
    element.classList.add('is-medal-unlocked')
  })
  await resources.evaluate((element) => {
    element.classList.add('has-medals')
  })
  await page.locator('[data-upgrade-kind="one-time"]').evaluate((section) => {
    section.removeAttribute('hidden')
    for (const card of section.querySelectorAll<HTMLElement>('.upgrade-card')) {
      card.removeAttribute('hidden')
    }
  })
  await expect(medalShop).toHaveCSS('visibility', 'visible')
  await expect(medalShop).toHaveCSS('border-left-style', 'solid')
  await page.waitForTimeout(550)

  const medalOrder = await page.locator('[data-medal-upgrade-id]').evaluateAll((cards) =>
    cards.map((card) => ({
      id: card.getAttribute('data-medal-upgrade-id'),
      top: card.getBoundingClientRect().top,
      left: card.getBoundingClientRect().left,
    })),
  )
  expect(medalOrder.map(({ id }) => id)).toEqual([
    'double-point-gain',
    'larger-targets',
    'shorter-jackpot',
    'golden-safety-net',
    'jackpot-mastery',
    'research',
  ])
  const firstMedal = medalOrder[0]
  expect(firstMedal).toBeDefined()
  if (firstMedal === undefined) throw new Error('Expected Medal upgrades')
  expect(medalOrder.every(({ left }) => Math.abs(left - firstMedal.left) < 1)).toBe(true)
  expect(
    medalOrder.every(({ top }, index) => {
      const previous = medalOrder[index - 1]
      return previous === undefined || top > previous.top
    }),
  ).toBe(true)

  const pointSectionGap = await page.evaluate(() => {
    const sections = document.querySelectorAll<HTMLElement>('.upgrades > .upgrade-section')
    const first = sections[0]?.getBoundingClientRect()
    const second = sections[1]?.getBoundingClientRect()
    if (first === undefined || second === undefined) throw new Error('Missing Point sections')
    return second.top - first.bottom
  })
  expect(pointSectionGap).toBeCloseTo(24, 0)

  const alignment = await page.evaluate(() => {
    const box = (selector: string): DOMRect => {
      const element = document.querySelector(selector)
      if (element === null) throw new Error(`Missing ${selector}`)
      return element.getBoundingClientRect()
    }
    const center = (rectangle: DOMRect): number => rectangle.left + rectangle.width / 2
    const pointHeading = document.querySelector('.upgrade-section h2')
    const medalHeading = document.querySelector('.medal-upgrades h2')
    const pointCard = document.querySelector('[data-upgrade-id="target-value"]')
    const medalCard = document.querySelector('.medal-upgrade-card')
    if (
      pointHeading === null ||
      medalHeading === null ||
      pointCard === null ||
      medalCard === null
    ) {
      throw new Error('Missing upgrade elements')
    }
    pointCard.classList.add('is-purchased')
    medalCard.classList.add('is-purchased')
    const pointStyle = getComputedStyle(pointHeading)
    const medalStyle = getComputedStyle(medalHeading)
    const cardBox = medalCard.getBoundingClientRect()
    const shopBox = box('.medal-upgrades')
    const resolvedColor = (value: string): string => {
      const probe = document.createElement('span')
      probe.style.color = value
      document.body.append(probe)
      const color = getComputedStyle(probe).color
      probe.remove()
      return color
    }
    return {
      pointOffset: Math.abs(center(box('.progression-points')) - center(box('.upgrades'))),
      medalOffset: Math.abs(center(box('.progression-medals')) - center(shopBox)),
      headingFontMatches: pointStyle.fontSize === medalStyle.fontSize,
      pointHeadingColor: pointStyle.color,
      pointAccentColor: resolvedColor('var(--color-accent)'),
      pointOutlineColor: getComputedStyle(pointCard).borderColor,
      medalOutlineColor: getComputedStyle(medalCard).borderColor,
      goldColor: resolvedColor('var(--color-gold)'),
      rightEdgeSpace: shopBox.right - cardBox.right,
    }
  })
  expect(alignment.pointOffset).toBeLessThan(1)
  expect(alignment.medalOffset).toBeLessThan(2)
  expect(alignment.headingFontMatches).toBe(true)
  expect(alignment.pointHeadingColor).toBe(alignment.pointAccentColor)
  expect(alignment.pointOutlineColor).toBe(alignment.pointAccentColor)
  expect(alignment.medalOutlineColor).toBe(alignment.goldColor)
  expect(alignment.rightEdgeSpace).toBeGreaterThanOrEqual(3)

  await page.setViewportSize({ width: 320, height: 720 })
  await expect(medalShop).toHaveCSS('border-left-width', '0px')
  await expect(medalShop).toHaveCSS('border-top-style', 'solid')
  await expect
    .poll(async () =>
      medalShop.evaluate((shop) => {
        const lastCard = shop.querySelector('[data-medal-upgrade-id="research"]')
        if (lastCard === null) return false
        return lastCard.getBoundingClientRect().bottom <= shop.getBoundingClientRect().bottom
      }),
    )
    .toBe(true)
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

test('keeps a failure cooldown active across reloads', async ({ page }) => {
  await page.goto('/')
  let lock = page.getByRole('button', { name: /Lock game/ })
  await lock.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  await expect(page.locator('[data-live]')).toContainText('Run failed')
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('lock-incremental:save')
        if (raw === null) return 0
        const parsed = JSON.parse(raw) as {
          game?: { failureCooldown?: { remainingMs?: number } }
        }
        return parsed.game?.failureCooldown?.remainingMs ?? 0
      }),
    )
    .toBeGreaterThan(0)

  await page.reload()
  lock = page.getByRole('button', { name: /Lock game/ })
  await lock.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-live]')).toHaveText('')

  await page.evaluate(() => {
    const key = 'lock-incremental:save'
    const raw = localStorage.getItem(key)
    if (raw === null) throw new Error('Expected a cooldown save')
    const parsed = JSON.parse(raw) as { savedAt: string }
    parsed.savedAt = new Date(Date.now() - 10_000).toISOString()
    localStorage.setItem(key, JSON.stringify(parsed))
    Object.defineProperty(Storage.prototype, 'setItem', {
      configurable: true,
      value: () => {
        throw new Error('Preserve the test fixture during pagehide')
      },
    })
  })
  await page.reload()
  lock = page.getByRole('button', { name: /Lock game/ })
  await lock.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-live]')).toContainText('Run started')
})

test('turns an active run into a cooldown when the page reloads', async ({ page }) => {
  await page.goto('/')
  let lock = page.getByRole('button', { name: /Lock game/ })
  await lock.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-live]')).toContainText('Run started')

  await page.reload()
  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem('lock-incremental:save')
        if (raw === null) return 0
        const parsed = JSON.parse(raw) as {
          game?: { failureCooldown?: { remainingMs?: number } }
        }
        return parsed.game?.failureCooldown?.remainingMs ?? 0
      }),
    )
    .toBeGreaterThan(0)

  lock = page.getByRole('button', { name: /Lock game/ })
  await lock.focus()
  await page.keyboard.press('Space')
  await expect(page.locator('[data-live]')).toHaveText('')
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
  await expect(lock).toBeFocused()

  await page.keyboard.press('Space')
  await expect(live).toContainText('Run failed')
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
