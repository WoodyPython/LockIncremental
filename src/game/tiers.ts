import Decimal from 'break_infinity.js'

import { SECOND_PROGRESSION_GOAL_ID, isGoalComplete } from './goals'

export type TierId = 'tier-1' | 'tier-2'

export interface TierDefinition {
  readonly id: TierId
  readonly numeral: string
  readonly name: string
  readonly baseRequiredHits: number
  readonly speedScalingMultiplier: number
  readonly targetSizeMultiplier: number
  readonly pointGainMultiplier: number
  readonly completionMedals: number
  readonly completionBonusRate: number
  readonly directionRetentionChance: number
  readonly gimmick: string
}

export interface TierRecord {
  readonly runsStarted: number
  readonly targetsHit: number
  readonly bestRunHits: number
  readonly completedRuns: number
}

export type TierStatistics = Readonly<Record<TierId, TierRecord>>

export interface TierProgressState {
  readonly lifetimePoints: Decimal
  readonly tierStatistics: TierStatistics
}

export interface TierAvailability {
  readonly visible: boolean
  readonly playable: boolean
  readonly requirement: string | null
}

export interface EffectiveTierStats {
  readonly baseRequiredHits: number
  readonly requiredHits: number
  readonly jackpotReduction: number
  readonly baseSpeedGrowthPerHit: number
  readonly speedGrowthPerHit: number
  readonly baseTargetHalfWidthRadians: number
  readonly targetHalfWidthRadians: number
  readonly basePointGainMultiplier: number
  readonly pointGainMultiplier: number
  readonly completionMedals: number
  readonly completionBonusRate: number
  readonly gimmick: string
}

export const DEFAULT_TIER_ID: TierId = 'tier-1'

export const EMPTY_TIER_RECORD: TierRecord = {
  runsStarted: 0,
  targetsHit: 0,
  bestRunHits: 0,
  completedRuns: 0,
}

export const EMPTY_TIER_STATISTICS: TierStatistics = {
  'tier-1': EMPTY_TIER_RECORD,
  'tier-2': EMPTY_TIER_RECORD,
}

export const TIER_DEFINITIONS: readonly TierDefinition[] = [
  {
    id: 'tier-1',
    numeral: 'I',
    name: 'Classic Lock',
    baseRequiredHits: 50,
    speedScalingMultiplier: 1,
    targetSizeMultiplier: 1,
    pointGainMultiplier: 1,
    completionMedals: 1,
    completionBonusRate: 0.25,
    directionRetentionChance: 0,
    gimmick: 'Every successful hit reverses direction.',
  },
  {
    id: 'tier-2',
    numeral: 'II',
    name: 'Unstable Lock',
    baseRequiredHits: 75,
    speedScalingMultiplier: 1.5,
    targetSizeMultiplier: 0.5,
    pointGainMultiplier: 2.5,
    completionMedals: 5,
    completionBonusRate: 0.5,
    directionRetentionChance: 0.5,
    gimmick: '50% chance to keep moving in the same direction after a hit.',
  },
]

export function isTierId(value: unknown): value is TierId {
  return value === 'tier-1' || value === 'tier-2'
}

export function tierDefinition(tierId: TierId): TierDefinition {
  const definition = TIER_DEFINITIONS.find((candidate) => candidate.id === tierId)
  if (definition === undefined) throw new Error(`Unknown lock tier: ${tierId}`)
  return definition
}

export function tierAvailability(tierId: TierId, state: TierProgressState): TierAvailability {
  if (tierId === 'tier-1') return { visible: true, playable: true, requirement: null }

  const visible = isGoalComplete(SECOND_PROGRESSION_GOAL_ID, state)
  const playable = visible && state.tierStatistics['tier-1'].completedRuns > 0
  return {
    visible,
    playable,
    requirement: playable ? null : 'Complete a Tier I Jackpot',
  }
}

export function visibleTierIds(state: TierProgressState): readonly TierId[] {
  return TIER_DEFINITIONS.filter(
    (definition) => tierAvailability(definition.id, state).visible,
  ).map((definition) => definition.id)
}
