import Decimal from 'break_infinity.js'

import { REQUIRED_HITS, TARGET_HALF_WIDTH_RADIANS } from './constants'

export type MedalUpgradeId =
  | 'double-point-gain'
  | 'larger-targets'
  | 'point-expansion'
  | 'shorter-jackpot'
  | 'golden-safety-net'
  | 'golden-control'
  | 'jackpot-mastery'
  | 'research'

export interface MedalUpgradeDefinition {
  readonly id: MedalUpgradeId
  readonly name: string
  readonly description: string
  readonly cost: Decimal
}

export type MedalUpgradeLevels = Readonly<Record<MedalUpgradeId, number>>

export type MedalUpgradeAvailability = 'available' | 'unaffordable' | 'owned'

export interface MedalUpgradeQuote {
  readonly definition: MedalUpgradeDefinition
  readonly level: number
  readonly status: MedalUpgradeAvailability
}

export const EMPTY_MEDAL_UPGRADE_LEVELS: MedalUpgradeLevels = {
  'double-point-gain': 0,
  'larger-targets': 0,
  'point-expansion': 0,
  'shorter-jackpot': 0,
  'golden-safety-net': 0,
  'golden-control': 0,
  'jackpot-mastery': 0,
  research: 0,
}

export const MEDAL_UPGRADE_DEFINITIONS: readonly MedalUpgradeDefinition[] = [
  {
    id: 'double-point-gain',
    name: 'Golden Gains',
    description: 'Multiply all Point gains by 2×.',
    cost: new Decimal(1),
  },
  {
    id: 'larger-targets',
    name: 'Larger Targets',
    description: 'Increase target size by 50%.',
    cost: new Decimal(1),
  },
  {
    id: 'point-expansion',
    name: 'Point Expansion',
    description: 'Unlock three new expensive Point upgrades.',
    cost: new Decimal(1),
  },
  {
    id: 'shorter-jackpot',
    name: 'Faster Jackpot',
    description: 'Reduce the Jackpot requirement by 5 targets.',
    cost: new Decimal(2),
  },
  {
    id: 'golden-safety-net',
    name: 'Golden Safety Net',
    description: 'Miss one extra target per run without failing.',
    cost: new Decimal(2),
  },
  {
    id: 'golden-control',
    name: 'Golden Control',
    description: 'Reduce speed scaling per target by 25%.',
    cost: new Decimal(3),
  },
  {
    id: 'jackpot-mastery',
    name: 'Jackpot Mastery',
    description: 'Increase target size by 50% and reduce the Jackpot requirement by 5 targets.',
    cost: new Decimal(5),
  },
  {
    id: 'research',
    name: 'Research (WIP)',
    description: 'Unlock Research.',
    cost: new Decimal(10),
  },
]

const MEDAL_UPGRADES_BY_COST: readonly MedalUpgradeDefinition[] = MEDAL_UPGRADE_DEFINITIONS.map(
  (definition, index) => ({ definition, index }),
)
  .sort(
    (left, right) => left.definition.cost.cmp(right.definition.cost) || left.index - right.index,
  )
  .map(({ definition }) => definition)

export function quoteMedalUpgrade(
  upgradeId: MedalUpgradeId,
  levels: MedalUpgradeLevels,
  medals: Decimal,
): MedalUpgradeQuote {
  const definition = MEDAL_UPGRADE_DEFINITIONS.find((candidate) => candidate.id === upgradeId)
  if (definition === undefined) throw new Error(`Unknown Medal upgrade: ${upgradeId}`)

  const level = levels[upgradeId]
  const status = level > 0 ? 'owned' : medals.lt(definition.cost) ? 'unaffordable' : 'available'
  return { definition, level, status }
}

export function medalPointGainMultiplier(levels: MedalUpgradeLevels): Decimal {
  return new Decimal(levels['double-point-gain'] > 0 ? 2 : 1)
}

export function medalSpeedScalingMultiplier(levels: MedalUpgradeLevels): number {
  return levels['golden-control'] > 0 ? 0.75 : 1
}

export function medalUpgradeDefinitionsByCost(): readonly MedalUpgradeDefinition[] {
  return MEDAL_UPGRADES_BY_COST
}

export function medalTargetHalfWidth(levels: MedalUpgradeLevels): number {
  const largerTargetsMultiplier = levels['larger-targets'] > 0 ? 1.5 : 1
  const jackpotMasteryMultiplier = levels['jackpot-mastery'] > 0 ? 1.5 : 1
  return TARGET_HALF_WIDTH_RADIANS * largerTargetsMultiplier * jackpotMasteryMultiplier
}

export function medalRequiredHits(levels: MedalUpgradeLevels): number {
  const reductions =
    (levels['shorter-jackpot'] > 0 ? 1 : 0) + (levels['jackpot-mastery'] > 0 ? 1 : 0)
  return REQUIRED_HITS - reductions * 5
}

export function medalMissesPerRun(levels: MedalUpgradeLevels): number {
  return levels['golden-safety-net'] > 0 ? 1 : 0
}
