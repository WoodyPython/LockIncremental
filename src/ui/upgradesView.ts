import type { GameSnapshot } from '../game/GameSimulation'
import {
  medalUpgradeDefinitionsByCost,
  quoteMedalUpgrade,
  type MedalUpgradeDefinition,
  type MedalUpgradeId,
  type MedalUpgradeQuote,
} from '../game/medalUpgrades'
import {
  UPGRADE_DEFINITIONS,
  criticalChance,
  isUpgradeVisible,
  quoteUpgrade,
  targetValueMultiplier,
  upgradeDefinitionsByInitialCost,
  visibleOneTimeUpgradeIds,
  type UpgradeDefinition,
  type UpgradeId,
  type UpgradeKind,
  type UpgradeQuote,
} from '../game/upgrades'
import { formatDecimal } from '../utils/format'

interface UpgradeElements {
  readonly card: HTMLElement
  readonly level: HTMLElement
  readonly button: HTMLButtonElement
}

const UNLOCK_ANIMATION_CLEANUP_MS = 500

export function upgradeButtonState(quote: UpgradeQuote): {
  readonly disabled: boolean
  readonly text: string
} {
  return {
    disabled: quote.status !== 'available',
    text:
      quote.status === 'owned'
        ? 'Purchased'
        : quote.status === 'maxed'
          ? 'Maximum reached'
          : `${formatDecimal(quote.cost)} Points`,
  }
}

export function medalUpgradeButtonState(quote: MedalUpgradeQuote): {
  readonly disabled: boolean
  readonly text: string
} {
  return {
    disabled: quote.status !== 'available',
    text:
      quote.status === 'owned'
        ? 'Purchased'
        : `${formatDecimal(quote.definition.cost)} ${quote.definition.cost.eq(1) ? 'Medal' : 'Medals'}`,
  }
}

export class UpgradesView {
  public readonly element: HTMLElement
  private readonly cards = new Map<UpgradeId, UpgradeElements>()
  private readonly medalCards = new Map<MedalUpgradeId, UpgradeElements>()
  private readonly sections = new Map<UpgradeKind, HTMLElement>()
  private readonly medalSection: HTMLElement
  private readonly revealed = new Set<UpgradeId>(['target-value'])
  private initialized = false
  private readonly unlockCleanupTimers = new Map<UpgradeId, number>()
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  public constructor(
    private readonly onPurchase: (upgradeId: UpgradeId) => void,
    private readonly onMedalPurchase: (upgradeId: MedalUpgradeId) => void,
  ) {
    this.element = document.createElement('div')
    this.element.className = 'upgrades-layout'
    const pointUpgrades = document.createElement('div')
    pointUpgrades.className = 'upgrades'
    pointUpgrades.append(
      this.createSection('Point Upgrades', 'multi-buy'),
      this.createSection(null, 'one-time'),
    )
    this.medalSection = this.createMedalSection()
    this.element.append(pointUpgrades, this.medalSection)
  }

  public update(snapshot: GameSnapshot): void {
    const initialUpdate = !this.initialized
    const medalShopUnlocked = snapshot.lifetimeMedals.gte(1)
    this.element.classList.toggle('is-medal-unlocked', medalShopUnlocked)
    this.medalSection.setAttribute('aria-hidden', String(!medalShopUnlocked))

    const visibleOneTimeIds = new Set(
      visibleOneTimeUpgradeIds(snapshot.upgrades, snapshot.lifetimePoints, snapshot.medalUpgrades),
    )

    for (const definition of UPGRADE_DEFINITIONS) {
      const elements = this.cards.get(definition.id)
      if (elements === undefined) continue
      const unlocked = isUpgradeVisible(
        definition,
        snapshot.upgrades,
        snapshot.lifetimePoints,
        snapshot.medalUpgrades,
      )
      const visible =
        unlocked && (definition.kind === 'multi-buy' || visibleOneTimeIds.has(definition.id))
      elements.card.hidden = !visible
      if (initialUpdate && visible) {
        this.revealed.add(definition.id)
      } else if (visible && !this.revealed.has(definition.id)) {
        this.revealCard(definition.id, elements.card)
      }

      const level = snapshot.upgrades[definition.id]
      const quote = quoteUpgrade(
        definition.id,
        snapshot.upgrades,
        snapshot.lifetimePoints,
        snapshot.points,
        snapshot.medalUpgrades,
      )
      elements.card.classList.toggle('is-purchased', quote.status === 'owned')
      elements.level.hidden = definition.kind === 'one-time'
      if (definition.id === 'target-value') {
        elements.level.textContent = `Total: ${formatDecimal(targetValueMultiplier(level), 2)}×`
      } else if (definition.id === 'critical-chance') {
        elements.level.textContent = `Total: ${(criticalChance(snapshot.upgrades) * 100).toFixed(1)}%`
      }
      const buttonState = upgradeButtonState(quote)
      elements.button.disabled = buttonState.disabled
      elements.button.textContent = buttonState.text
      elements.button.setAttribute(
        'aria-label',
        `${definition.name}: ${elements.button.textContent}`,
      )
    }

    this.initialized = true

    for (const section of this.sections.values()) {
      section.hidden = !Array.from(section.querySelectorAll<HTMLElement>('.upgrade-card')).some(
        (card) => !card.hidden,
      )
    }

    for (const definition of medalUpgradeDefinitionsByCost()) {
      const elements = this.medalCards.get(definition.id)
      if (elements === undefined) continue
      const quote = quoteMedalUpgrade(definition.id, snapshot.medalUpgrades, snapshot.medals)
      const buttonState = medalUpgradeButtonState(quote)
      elements.card.classList.toggle('is-purchased', quote.status === 'owned')
      elements.level.hidden = true
      elements.button.disabled = !medalShopUnlocked || buttonState.disabled
      elements.button.textContent = buttonState.text
      elements.button.setAttribute(
        'aria-label',
        `${definition.name}: ${elements.button.textContent}`,
      )
    }
  }

  public destroy(): void {
    for (const timer of this.unlockCleanupTimers.values()) window.clearTimeout(timer)
    this.unlockCleanupTimers.clear()
  }

  private revealCard(upgradeId: UpgradeId, card: HTMLElement): void {
    this.revealed.add(upgradeId)
    if (this.reduceMotion.matches) return
    card.classList.add('is-unlocking')
    const timer = window.setTimeout(() => {
      this.finishUnlockAnimation(upgradeId, card)
    }, UNLOCK_ANIMATION_CLEANUP_MS)
    this.unlockCleanupTimers.set(upgradeId, timer)
  }

  private finishUnlockAnimation(upgradeId: UpgradeId, card: HTMLElement): void {
    card.classList.remove('is-unlocking')
    const timer = this.unlockCleanupTimers.get(upgradeId)
    if (timer !== undefined) window.clearTimeout(timer)
    this.unlockCleanupTimers.delete(upgradeId)
  }

  private createCard(definition: UpgradeDefinition): HTMLElement {
    const card = document.createElement('article')
    card.className = 'upgrade-card'
    card.dataset.upgradeId = definition.id
    card.hidden = definition.id !== 'target-value'
    card.addEventListener('animationend', (event) => {
      if (event.animationName === 'upgrade-unlock') {
        this.finishUnlockAnimation(definition.id, card)
      }
    })

    const heading = document.createElement('h3')
    heading.textContent = definition.name
    const description = document.createElement('p')
    description.textContent = definition.description
    const level = document.createElement('div')
    level.className = 'upgrade-level'
    const button = document.createElement('button')
    button.type = 'button'
    button.addEventListener('click', () => {
      this.onPurchase(definition.id)
    })

    card.append(heading, description, level, button)
    this.cards.set(definition.id, { card, level, button })
    return card
  }

  private createSection(title: string | null, kind: UpgradeKind): HTMLElement {
    const section = document.createElement('section')
    section.className = 'upgrade-section'
    section.dataset.upgradeKind = kind
    section.hidden = kind === 'one-time'
    if (title === null) section.setAttribute('aria-label', 'Additional Point Upgrades')
    const grid = document.createElement('div')
    grid.className = 'upgrade-grid'
    const upgrades = upgradeDefinitionsByInitialCost(kind)
    for (const upgrade of upgrades) {
      grid.append(this.createCard(upgrade))
    }
    if (title !== null) {
      const heading = document.createElement('h2')
      heading.textContent = title
      section.append(heading)
    }
    section.append(grid)
    this.sections.set(kind, section)
    return section
  }

  private createMedalSection(): HTMLElement {
    const section = document.createElement('section')
    section.className = 'medal-upgrades'
    section.dataset.medalUpgrades = ''
    section.setAttribute('aria-hidden', 'true')
    const heading = document.createElement('h2')
    heading.textContent = 'Medal Upgrades'
    const grid = document.createElement('div')
    grid.className = 'upgrade-grid'
    for (const definition of medalUpgradeDefinitionsByCost()) {
      grid.append(this.createMedalCard(definition))
    }
    section.append(heading, grid)
    return section
  }

  private createMedalCard(definition: MedalUpgradeDefinition): HTMLElement {
    const card = document.createElement('article')
    card.className = 'upgrade-card medal-upgrade-card'
    card.dataset.medalUpgradeId = definition.id

    const heading = document.createElement('h3')
    heading.textContent = definition.name
    const description = document.createElement('p')
    description.textContent = definition.description
    const level = document.createElement('div')
    level.className = 'upgrade-level'
    level.hidden = true
    const button = document.createElement('button')
    button.type = 'button'
    button.disabled = true
    button.addEventListener('click', () => {
      this.onMedalPurchase(definition.id)
    })

    card.append(heading, description, level, button)
    this.medalCards.set(definition.id, { card, level, button })
    return card
  }
}
