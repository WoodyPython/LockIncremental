import Decimal from 'break_infinity.js'

export type UpgradeId =
  | 'target-value'
  | 'consecutive-value'
  | 'miss-allowance'
  | 'critical-hits'
  | 'fail-cooldown'
  | 'speed-scaling'
  | 'critical-chance'

export type UpgradeKind = 'multi-buy' | 'one-time'

export interface UpgradeDefinition {
  readonly id: UpgradeId
  readonly kind: UpgradeKind
  readonly name: string
  readonly description: string
  readonly baseCost: Decimal
  readonly costScale?: Decimal
  readonly lifetimePointsRequirement?: Decimal
  readonly prerequisiteId?: UpgradeId
}

export type UpgradeLevels = Readonly<Record<UpgradeId, number>>

export const EMPTY_UPGRADE_LEVELS: UpgradeLevels = {
  'target-value': 0,
  'consecutive-value': 0,
  'miss-allowance': 0,
  'critical-hits': 0,
  'fail-cooldown': 0,
  'speed-scaling': 0,
  'critical-chance': 0,
}

const ONE_TIME_REVEAL = new Decimal(10)

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: 'target-value',
    kind: 'multi-buy',
    name: 'Target Value',
    description: 'Increase every target value by +25%.',
    baseCost: new Decimal(5),
    costScale: new Decimal(1.5),
  },
  {
    id: 'consecutive-value',
    kind: 'one-time',
    name: 'Consecutive Value',
    description: 'Each consecutive target increases its value by 1.05×.',
    baseCost: new Decimal(20),
    lifetimePointsRequirement: ONE_TIME_REVEAL,
  },
  {
    id: 'miss-allowance',
    kind: 'one-time',
    name: 'Second Chance',
    description: 'Miss one target per run without failing.',
    baseCost: new Decimal(25),
    lifetimePointsRequirement: ONE_TIME_REVEAL,
  },
  {
    id: 'critical-hits',
    kind: 'one-time',
    name: 'Critical Hits',
    description: 'Unlock a 2% chance for targets to award 5× Points.',
    baseCost: new Decimal(50),
    lifetimePointsRequirement: ONE_TIME_REVEAL,
  },
  {
    id: 'fail-cooldown',
    kind: 'one-time',
    name: 'Quick Recovery',
    description: 'Reduce the failure cooldown to 3 seconds.',
    baseCost: new Decimal(100),
    lifetimePointsRequirement: ONE_TIME_REVEAL,
  },
  {
    id: 'speed-scaling',
    kind: 'one-time',
    name: 'Steady Hands',
    description: 'Reduce speed scaling per target by 20%.',
    baseCost: new Decimal(150),
    lifetimePointsRequirement: ONE_TIME_REVEAL,
  },
  {
    id: 'critical-chance',
    kind: 'multi-buy',
    name: 'Critical Chance',
    description: 'Increase critical chance by +0.5%.',
    baseCost: new Decimal(25),
    costScale: new Decimal(1.5),
    prerequisiteId: 'critical-hits',
  },
]

export function upgradeCost(definition: UpgradeDefinition, level: number): Decimal {
  if (definition.kind === 'one-time') return new Decimal(definition.baseCost)
  return definition.baseCost.times((definition.costScale ?? new Decimal(1)).pow(level)).round()
}

export function isUpgradeVisible(
  definition: UpgradeDefinition,
  levels: UpgradeLevels,
  lifetimePoints: Decimal,
): boolean {
  if (
    definition.lifetimePointsRequirement !== undefined &&
    lifetimePoints.lt(definition.lifetimePointsRequirement)
  ) {
    return false
  }
  return definition.prerequisiteId === undefined || levels[definition.prerequisiteId] > 0
}

export function visibleOneTimeUpgradeIds(
  levels: UpgradeLevels,
  lifetimePoints: Decimal,
): readonly UpgradeId[] {
  const unlocked = UPGRADE_DEFINITIONS.filter(
    (definition) =>
      definition.kind === 'one-time' && isUpgradeVisible(definition, levels, lifetimePoints),
  )
  const purchased = unlocked.filter((definition) => levels[definition.id] > 0)
  const upcoming = unlocked.filter((definition) => levels[definition.id] === 0).slice(0, 3)
  return [...purchased, ...upcoming].map((definition) => definition.id)
}

export function targetValueMultiplier(level: number): Decimal {
  return new Decimal(1).plus(new Decimal(0.25).times(level))
}

export function consecutiveMultiplier(consecutiveHits: number, unlocked: boolean): Decimal {
  return unlocked ? new Decimal(1.05).pow(consecutiveHits) : new Decimal(1)
}

export function criticalChance(levels: UpgradeLevels): number {
  if (levels['critical-hits'] === 0) return 0
  return Math.min(1, 0.02 + levels['critical-chance'] * 0.005)
}

export function upgradesByKind(
  definitions: readonly UpgradeDefinition[],
  kind: UpgradeKind,
): readonly UpgradeDefinition[] {
  return definitions.filter((upgrade) => upgrade.kind === kind)
}
