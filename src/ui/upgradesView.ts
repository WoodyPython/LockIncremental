import {
  UPGRADE_DEFINITIONS,
  upgradesByKind,
  type UpgradeDefinition,
  type UpgradeKind,
} from '../game/upgrades'

function createUpgradeCard(upgrade: UpgradeDefinition): HTMLElement {
  const card = document.createElement('article')
  card.className = 'upgrade-card'

  const heading = document.createElement('h3')
  heading.textContent = upgrade.name
  const description = document.createElement('p')
  description.textContent = upgrade.description
  const button = document.createElement('button')
  button.type = 'button'
  button.disabled = true
  button.textContent = 'Coming soon'
  button.setAttribute('aria-label', `${upgrade.name}: coming soon`)

  card.append(heading, description, button)
  return card
}

function createSection(title: string, kind: UpgradeKind): HTMLElement {
  const section = document.createElement('section')
  section.className = 'upgrade-section'
  const heading = document.createElement('h2')
  heading.textContent = title
  const grid = document.createElement('div')
  grid.className = 'upgrade-grid'
  for (const upgrade of upgradesByKind(UPGRADE_DEFINITIONS, kind)) {
    grid.append(createUpgradeCard(upgrade))
  }
  section.append(heading, grid)
  return section
}

export function createUpgradesView(): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'upgrades'
  wrapper.append(
    createSection('Repeatable Upgrades', 'multi-buy'),
    createSection('One-time Upgrades', 'one-time'),
  )
  return wrapper
}
