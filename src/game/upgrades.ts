import Decimal from 'break_infinity.js'

import { RESULT_COOLDOWN_MS } from './constants'
import { FIRST_PROGRESSION_GOAL_ID } from './goals'
import {
  EMPTY_MEDAL_UPGRADE_LEVELS,
  medalMissesPerRun,
  medalRequiredHits,
  medalTargetHalfWidth,
  type MedalUpgradeId,
  type MedalUpgradeLevels,
} from './medalUpgrades'
import { isUnlockRequirementMet, type UnlockRequirement } from './unlocks'

export type UpgradeId =
  | 'target-value'
  | 'consecutive-value'
  | 'miss-allowance'
  | 'critical-hits'
  | 'fail-cooldown'
  | 'speed-scaling'
  | 'double-points'
  | 'critical-chance'
  | 'rapid-recovery'
  | 'efficient-scaling'

export type UpgradeKind = 'multi-buy' | 'one-time'

export interface UpgradeDefinition {
  readonly id: UpgradeId
  readonly kind: UpgradeKind
  readonly name: string
  readonly description: string
  readonly baseCost: Decimal
  readonly costScale?: Decimal
  readonly unlockRequirement?: UnlockRequirement
  readonly prerequisiteId?: UpgradeId
  readonly medalPrerequisiteId?: MedalUpgradeId
}

export type UpgradeLevels = Readonly<Record<UpgradeId, number>>

export type UpgradeAvailability = 'available' | 'hidden' | 'owned' | 'maxed' | 'unaffordable'

export interface UpgradeQuote {
  readonly definition: UpgradeDefinition
  readonly level: number
  readonly cost: Decimal
  readonly status: UpgradeAvailability
}

export const EMPTY_UPGRADE_LEVELS: UpgradeLevels = {
  'target-value': 0,
  'consecutive-value': 0,
  'miss-allowance': 0,
  'critical-hits': 0,
  'fail-cooldown': 0,
  'speed-scaling': 0,
  'double-points': 0,
  'critical-chance': 0,
  'rapid-recovery': 0,
  'efficient-scaling': 0,
}

const ONE_TIME_UNLOCK: UnlockRequirement = {
  kind: 'goal',
  goalId: FIRST_PROGRESSION_GOAL_ID,
}

export const CRITICAL_REWARD_MULTIPLIER = new Decimal(5)
export const CRITICAL_BASE_CHANCE = 0.02
export const CRITICAL_CHANCE_PER_LEVEL = 0.005
export const CRITICAL_MAX_CHANCE = 1
export const MAX_CRITICAL_CHANCE_LEVEL = Math.round(
  (CRITICAL_MAX_CHANCE - CRITICAL_BASE_CHANCE) / CRITICAL_CHANCE_PER_LEVEL,
)
export const MISSES_PER_RUN_UPGRADED = 1
export const FAILURE_COOLDOWN_UPGRADED_MS = 3_000
export const SPEED_SCALING_UPGRADED_MULTIPLIER = 0.8
export const REPEATABLE_GROWTH_REDUCTION = 0.75

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: 'target-value',
    kind: 'multi-buy',
    name: 'Target Value',
    description: 'Increase every target value by +25%.',
    baseCost: new Decimal(3),
    costScale: new Decimal(1.4),
  },
  {
    id: 'consecutive-value',
    kind: 'one-time',
    name: 'Consecutive Value',
    description: 'Each consecutive target increases its value by 1.05×.',
    baseCost: new Decimal(100),
    unlockRequirement: ONE_TIME_UNLOCK,
  },
  {
    id: 'miss-allowance',
    kind: 'one-time',
    name: 'Second Chance',
    description: 'Miss one target per run without failing.',
    baseCost: new Decimal(2500),
    unlockRequirement: ONE_TIME_UNLOCK,
  },
  {
    id: 'critical-hits',
    kind: 'one-time',
    name: 'Critical Hits',
    description: 'Unlock a 2% chance for targets to award 5× Points.',
    baseCost: new Decimal(100),
    unlockRequirement: ONE_TIME_UNLOCK,
  },
  {
    id: 'fail-cooldown',
    kind: 'one-time',
    name: 'Quick Recovery',
    description: 'Reduce the failure cooldown to 3 seconds.',
    baseCost: new Decimal(250),
    unlockRequirement: ONE_TIME_UNLOCK,
  },
  {
    id: 'speed-scaling',
    kind: 'one-time',
    name: 'Steady Hands',
    description: 'Reduce speed scaling per target by 20%.',
    baseCost: new Decimal(1000),
    unlockRequirement: ONE_TIME_UNLOCK,
  },
  {
    id: 'double-points',
    kind: 'one-time',
    name: 'Double Points',
    description: 'Multiply all Point gains by 2×.',
    baseCost: new Decimal(500),
    unlockRequirement: ONE_TIME_UNLOCK,
  },
  {
    id: 'critical-chance',
    kind: 'multi-buy',
    name: 'Critical Chance',
    description: 'Increase critical chance by +0.5%.',
    baseCost: new Decimal(20),
    costScale: new Decimal(1.5),
    prerequisiteId: 'critical-hits',
  },
  {
    id: 'rapid-recovery',
    kind: 'one-time',
    name: 'Rapid Recovery',
    description: 'Halve the effective failure cooldown.',
    baseCost: new Decimal(10_000),
    medalPrerequisiteId: 'shorter-jackpot',
  },
  {
    id: 'efficient-scaling',
    kind: 'one-time',
    name: 'Efficient Scaling',
    description: 'Reduce repeatable upgrade cost scaling by 25%.',
    baseCost: new Decimal(25_000),
    medalPrerequisiteId: 'shorter-jackpot',
  },
]

export function effectiveCostScale(definition: UpgradeDefinition, levels: UpgradeLevels): Decimal {
  const base = definition.costScale ?? new Decimal(1)
  if (levels['efficient-scaling'] === 0) return new Decimal(base)
  return new Decimal(1).plus(base.minus(1).times(REPEATABLE_GROWTH_REDUCTION))
}

export function upgradeCost(
  definition: UpgradeDefinition,
  level: number,
  levels: UpgradeLevels = EMPTY_UPGRADE_LEVELS,
): Decimal {
  if (definition.kind === 'one-time') return new Decimal(definition.baseCost)
  return definition.baseCost.times(effectiveCostScale(definition, levels).pow(level)).round()
}

export function isUpgradeVisible(
  definition: UpgradeDefinition,
  levels: UpgradeLevels,
  lifetimePoints: Decimal,
  medalLevels: MedalUpgradeLevels = EMPTY_MEDAL_UPGRADE_LEVELS,
): boolean {
  if (!isUnlockRequirementMet(definition.unlockRequirement, { lifetimePoints })) return false
  if (definition.prerequisiteId !== undefined && levels[definition.prerequisiteId] === 0)
    return false
  return (
    definition.medalPrerequisiteId === undefined || medalLevels[definition.medalPrerequisiteId] > 0
  )
}

export function isUpgradeMaxed(definition: UpgradeDefinition, level: number): boolean {
  return definition.kind === 'one-time'
    ? level > 0
    : definition.id === 'critical-chance' && level >= MAX_CRITICAL_CHANCE_LEVEL
}

export function quoteUpgrade(
  upgradeId: UpgradeId,
  levels: UpgradeLevels,
  lifetimePoints: Decimal,
  currentPoints: Decimal,
  medalLevels: MedalUpgradeLevels = EMPTY_MEDAL_UPGRADE_LEVELS,
): UpgradeQuote {
  const definition = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === upgradeId)
  if (definition === undefined) throw new Error(`Unknown upgrade: ${upgradeId}`)

  const level = levels[upgradeId]
  const cost = upgradeCost(definition, level, levels)
  let status: UpgradeAvailability
  if (!isUpgradeVisible(definition, levels, lifetimePoints, medalLevels)) status = 'hidden'
  else if (definition.kind === 'one-time' && level > 0) status = 'owned'
  else if (isUpgradeMaxed(definition, level)) status = 'maxed'
  else if (currentPoints.lt(cost)) status = 'unaffordable'
  else status = 'available'

  return { definition, level, cost, status }
}

export function upgradeDefinitionsByInitialCost(kind: UpgradeKind): readonly UpgradeDefinition[] {
  return UPGRADE_DEFINITIONS.filter((definition) => definition.kind === kind).sort((left, right) =>
    left.baseCost.cmp(right.baseCost),
  )
}

export function visibleOneTimeUpgradeIds(
  levels: UpgradeLevels,
  lifetimePoints: Decimal,
  medalLevels: MedalUpgradeLevels = EMPTY_MEDAL_UPGRADE_LEVELS,
): readonly UpgradeId[] {
  const unlocked = UPGRADE_DEFINITIONS.filter(
    (definition) =>
      definition.kind === 'one-time' &&
      isUpgradeVisible(definition, levels, lifetimePoints, medalLevels),
  )
  return unlocked.map((definition) => definition.id)
}

export function targetValueMultiplier(level: number): Decimal {
  return new Decimal(1).plus(new Decimal(0.25).times(level))
}

export function consecutiveMultiplier(consecutiveHits: number, unlocked: boolean): Decimal {
  return unlocked ? new Decimal(1.05).pow(consecutiveHits) : new Decimal(1)
}

export function pointGainMultiplier(levels: UpgradeLevels): Decimal {
  return new Decimal(levels['double-points'] > 0 ? 2 : 1)
}

export function criticalChance(levels: UpgradeLevels): number {
  if (levels['critical-hits'] === 0) return 0
  return Math.min(
    CRITICAL_MAX_CHANCE,
    CRITICAL_BASE_CHANCE + levels['critical-chance'] * CRITICAL_CHANCE_PER_LEVEL,
  )
}

export function runModifiersForUpgrades(
  levels: UpgradeLevels,
  medalLevels: MedalUpgradeLevels = EMPTY_MEDAL_UPGRADE_LEVELS,
): {
  readonly missesPerRun: number
  readonly failureCooldownMs: number
  readonly speedScalingMultiplier: number
  readonly requiredHits: number
  readonly targetHalfWidth: number
} {
  const baseFailureCooldown =
    levels['fail-cooldown'] > 0 ? FAILURE_COOLDOWN_UPGRADED_MS : RESULT_COOLDOWN_MS
  return {
    missesPerRun:
      (levels['miss-allowance'] > 0 ? MISSES_PER_RUN_UPGRADED : 0) + medalMissesPerRun(medalLevels),
    failureCooldownMs:
      levels['rapid-recovery'] > 0 ? baseFailureCooldown * 0.5 : baseFailureCooldown,
    speedScalingMultiplier: levels['speed-scaling'] > 0 ? SPEED_SCALING_UPGRADED_MULTIPLIER : 1,
    requiredHits: medalRequiredHits(medalLevels),
    targetHalfWidth: medalTargetHalfWidth(medalLevels),
  }
}
