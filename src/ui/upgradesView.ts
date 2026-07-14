import type { GameSnapshot } from '../game/GameSimulation'
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

export class UpgradesView {
  public readonly element: HTMLElement
  private readonly cards = new Map<UpgradeId, UpgradeElements>()
  private readonly sections = new Map<UpgradeKind, HTMLElement>()
  private readonly revealed = new Set<UpgradeId>(['target-value'])
  private readonly unlockCleanupTimers = new Map<UpgradeId, number>()
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

  public constructor(private readonly onPurchase: (upgradeId: UpgradeId) => void) {
    this.element = document.createElement('div')
    this.element.className = 'upgrades'
    this.element.append(
      this.createSection('Repeatable Upgrades', 'multi-buy'),
      this.createSection('One-time Upgrades', 'one-time'),
    )
  }

  public update(snapshot: GameSnapshot): void {
    const visibleOneTimeIds = new Set(
      visibleOneTimeUpgradeIds(snapshot.upgrades, snapshot.lifetimePoints),
    )

    for (const definition of UPGRADE_DEFINITIONS) {
      const elements = this.cards.get(definition.id)
      if (elements === undefined) continue
      const unlocked = isUpgradeVisible(definition, snapshot.upgrades, snapshot.lifetimePoints)
      const visible =
        unlocked && (definition.kind === 'multi-buy' || visibleOneTimeIds.has(definition.id))
      elements.card.hidden = !visible
      if (visible && !this.revealed.has(definition.id)) {
        this.revealCard(definition.id, elements.card)
      }

      const level = snapshot.upgrades[definition.id]
      const quote = quoteUpgrade(
        definition.id,
        snapshot.upgrades,
        snapshot.lifetimePoints,
        snapshot.points,
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

    for (const section of this.sections.values()) {
      section.hidden = !Array.from(section.querySelectorAll<HTMLElement>('.upgrade-card')).some(
        (card) => !card.hidden,
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

  private createSection(title: string, kind: UpgradeKind): HTMLElement {
    const section = document.createElement('section')
    section.className = 'upgrade-section'
    section.dataset.upgradeKind = kind
    section.hidden = kind === 'one-time'
    const heading = document.createElement('h2')
    heading.textContent = title
    const grid = document.createElement('div')
    grid.className = 'upgrade-grid'
    const upgrades = upgradeDefinitionsByInitialCost(kind)
    for (const upgrade of upgrades) {
      grid.append(this.createCard(upgrade))
    }
    section.append(heading, grid)
    this.sections.set(kind, section)
    return section
  }
}
