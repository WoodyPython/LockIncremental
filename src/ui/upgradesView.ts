import type { GameSnapshot, PurchaseResult } from '../game/GameSimulation'
import {
  UPGRADE_DEFINITIONS,
  criticalChance,
  isUpgradeVisible,
  targetValueMultiplier,
  upgradeCost,
  visibleOneTimeUpgradeIds,
  type UpgradeDefinition,
  type UpgradeId,
  type UpgradeKind,
} from '../game/upgrades'
import { formatDecimal } from '../utils/format'

interface UpgradeElements {
  readonly card: HTMLElement
  readonly level: HTMLElement
  readonly button: HTMLButtonElement
}

export class UpgradesView {
  public readonly element: HTMLElement
  private readonly cards = new Map<UpgradeId, UpgradeElements>()
  private readonly sections = new Map<UpgradeKind, HTMLElement>()
  private readonly revealed = new Set<UpgradeId>(['target-value'])

  public constructor(private readonly onPurchase: (upgradeId: UpgradeId) => PurchaseResult) {
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
        elements.card.classList.add('is-unlocking')
        this.revealed.add(definition.id)
      }

      const level = snapshot.upgrades[definition.id]
      const owned = definition.kind === 'one-time' && level > 0
      elements.card.classList.toggle('is-purchased', owned)
      const maxed = definition.id === 'critical-chance' && criticalChance(snapshot.upgrades) >= 1
      const cost = upgradeCost(definition, level)
      elements.level.hidden = definition.kind === 'one-time'
      if (definition.id === 'target-value') {
        elements.level.textContent = `Total: ${formatDecimal(targetValueMultiplier(level), 2)}×`
      } else if (definition.id === 'critical-chance') {
        elements.level.textContent = `Total: ${(criticalChance(snapshot.upgrades) * 100).toFixed(1)}%`
      }
      elements.button.disabled = !visible || owned || maxed || snapshot.points.lt(cost)
      elements.button.textContent = owned
        ? 'Purchased'
        : maxed
          ? 'Maximum reached'
          : `${formatDecimal(cost)} Points`
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

  private createCard(definition: UpgradeDefinition): HTMLElement {
    const card = document.createElement('article')
    card.className = 'upgrade-card'
    card.dataset.upgradeId = definition.id
    card.hidden = definition.id !== 'target-value'

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
    for (const upgrade of UPGRADE_DEFINITIONS.filter((item) => item.kind === kind)) {
      grid.append(this.createCard(upgrade))
    }
    section.append(heading, grid)
    this.sections.set(kind, section)
    return section
  }
}
