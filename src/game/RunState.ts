import Decimal from 'break_infinity.js'
import {
  COMPLETION_BONUS_RATE,
  COMPLETION_CELEBRATION_MS,
  IDLE_SPEED_RADIANS_PER_SECOND,
  JACKPOT_MEDAL_REWARD,
  REQUIRED_HITS,
  RESULT_COOLDOWN_MS,
  SHIELD_RECOVERY_MS,
  TARGET_HALF_WIDTH_RADIANS,
  activeSpeedForHits,
  hitToleranceForTargetHalfWidth,
} from './constants'
import { advanceAngle, didPassTarget, isWithinTarget, placeTarget, type Direction } from './math'
import type { TierId } from './tiers'

export interface RunModifiers {
  readonly tierId: TierId
  readonly missesPerRun: number
  readonly failureCooldownMs: number
  readonly speedScalingMultiplier: number
  readonly requiredHits: number
  readonly targetHalfWidth: number
  readonly directionRetentionChance: number
  readonly completionMedals: number
  readonly completionBonusRate: number
}

export const DEFAULT_RUN_MODIFIERS: RunModifiers = {
  tierId: 'tier-1',
  missesPerRun: 0,
  failureCooldownMs: RESULT_COOLDOWN_MS,
  speedScalingMultiplier: 1,
  requiredHits: REQUIRED_HITS,
  targetHalfWidth: TARGET_HALF_WIDTH_RADIANS,
  directionRetentionChance: 0,
  completionMedals: JACKPOT_MEDAL_REWARD,
  completionBonusRate: COMPLETION_BONUS_RATE,
}

export interface IdleRunState {
  readonly kind: 'idle'
  readonly markerAngle: number
}

export interface ActiveRunState {
  readonly kind: 'active'
  readonly tierId: TierId
  readonly markerAngle: number
  readonly targetAngle: number
  readonly targetCritical: boolean
  readonly targetHalfWidth: number
  readonly direction: Direction
  readonly hits: number
  readonly consecutiveHits: number
  readonly missesRemaining: number
  readonly invulnerableUntil: number
  readonly basePointsEarned: Decimal
  readonly requiredHits: number
  readonly speedScalingMultiplier: number
  readonly failureCooldownMs: number
  readonly directionRetentionChance: number
  readonly completionMedals: number
  readonly completionBonusRate: number
}

export interface FailedRunState {
  readonly kind: 'failed'
  readonly tierId: TierId
  readonly markerAngle: number
  readonly targetAngle: number
  readonly targetCritical: boolean
  readonly targetHalfWidth: number
  readonly hits: number
  readonly requiredHits: number
  readonly cooldownEndsAt: number
}

export interface CompletedRunState {
  readonly kind: 'completed'
  readonly tierId: TierId
  readonly markerAngle: number
  readonly hits: number
  readonly requiredHits: number
  readonly completedAt: number
  readonly celebrationEndsAt: number
  readonly completionBonus: Decimal
  readonly medalsAwarded: Decimal
}

export type RunState = IdleRunState | ActiveRunState | FailedRunState | CompletedRunState

export type ActivationTransition =
  | { readonly kind: 'started'; readonly state: ActiveRunState }
  | { readonly kind: 'hit'; readonly state: ActiveRunState }
  | { readonly kind: 'forgiven-miss'; readonly state: ActiveRunState }
  | { readonly kind: 'invulnerable'; readonly state: ActiveRunState }
  | { readonly kind: 'miss'; readonly state: FailedRunState }
  | { readonly kind: 'completed'; readonly state: CompletedRunState }
  | { readonly kind: 'cooldown'; readonly state: FailedRunState }

export type TickTransition =
  | { readonly kind: 'none'; readonly state: RunState }
  | { readonly kind: 'forgiven-miss'; readonly state: ActiveRunState }
  | { readonly kind: 'invulnerable'; readonly state: ActiveRunState }
  | { readonly kind: 'passed-target'; readonly state: FailedRunState }

const NEVER_CRITICAL = (): boolean => false

export function createIdleState(markerAngle = -Math.PI / 2): IdleRunState {
  return { kind: 'idle', markerAngle }
}

export function startRun(
  markerAngle: number,
  random: () => number,
  modifiers: RunModifiers = DEFAULT_RUN_MODIFIERS,
  direction: Direction = 1,
  rollCriticalTarget: () => boolean = NEVER_CRITICAL,
): ActiveRunState {
  return {
    kind: 'active',
    tierId: modifiers.tierId,
    markerAngle,
    targetAngle: placeTarget(markerAngle, direction, random, 0),
    targetCritical: rollCriticalTarget(),
    targetHalfWidth: modifiers.targetHalfWidth,
    direction,
    hits: 0,
    consecutiveHits: 0,
    missesRemaining: modifiers.missesPerRun,
    invulnerableUntil: 0,
    basePointsEarned: new Decimal(0),
    requiredHits: modifiers.requiredHits,
    speedScalingMultiplier: modifiers.speedScalingMultiplier,
    failureCooldownMs: modifiers.failureCooldownMs,
    directionRetentionChance: modifiers.directionRetentionChance,
    completionMedals: modifiers.completionMedals,
    completionBonusRate: modifiers.completionBonusRate,
  }
}

function relocateTarget(
  state: ActiveRunState,
  random: () => number,
  rollCriticalTarget: () => boolean,
): ActiveRunState {
  const nextDirection: Direction = state.direction === 1 ? -1 : 1
  return {
    ...state,
    direction: nextDirection,
    consecutiveHits: 0,
    targetAngle: placeTarget(state.markerAngle, nextDirection, random, state.hits),
    targetCritical: rollCriticalTarget(),
  }
}

function forgiveMiss(
  state: ActiveRunState,
  random: () => number,
  now: number,
  rollCriticalTarget: () => boolean,
): ActiveRunState {
  return {
    ...relocateTarget(state, random, rollCriticalTarget),
    missesRemaining: state.missesRemaining - 1,
    invulnerableUntil: now + SHIELD_RECOVERY_MS,
  }
}

export function tickRunState(
  state: RunState,
  deltaSeconds: number,
  now = 0,
  random: () => number = Math.random,
  rollCriticalTarget: () => boolean = NEVER_CRITICAL,
): TickTransition {
  if (state.kind === 'idle') {
    return {
      kind: 'none',
      state: {
        ...state,
        markerAngle: advanceAngle(
          state.markerAngle,
          1,
          IDLE_SPEED_RADIANS_PER_SECOND,
          deltaSeconds,
        ),
      },
    }
  }

  if (state.kind === 'active') {
    if (now < state.invulnerableUntil) {
      return { kind: 'none', state }
    }
    const nextMarkerAngle = advanceAngle(
      state.markerAngle,
      state.direction,
      activeSpeedForHits(state.hits, state.speedScalingMultiplier),
      deltaSeconds,
    )
    const movedState = { ...state, markerAngle: nextMarkerAngle }
    if (
      !didPassTarget(
        state.markerAngle,
        nextMarkerAngle,
        state.targetAngle,
        state.direction,
        hitToleranceForTargetHalfWidth(state.targetHalfWidth),
      )
    ) {
      return { kind: 'none', state: movedState }
    }
    if (state.missesRemaining > 0) {
      return {
        kind: 'forgiven-miss',
        state: forgiveMiss(movedState, random, now, rollCriticalTarget),
      }
    }
    if (now < state.invulnerableUntil) {
      return {
        kind: 'invulnerable',
        state: relocateTarget(movedState, random, rollCriticalTarget),
      }
    }
    return {
      kind: 'passed-target',
      state: {
        kind: 'failed',
        tierId: state.tierId,
        markerAngle: nextMarkerAngle,
        targetAngle: state.targetAngle,
        targetCritical: state.targetCritical,
        targetHalfWidth: state.targetHalfWidth,
        hits: state.hits,
        requiredHits: state.requiredHits,
        cooldownEndsAt: now + state.failureCooldownMs,
      },
    }
  }

  if (state.kind === 'failed' && now >= state.cooldownEndsAt) {
    return { kind: 'none', state: createIdleState(state.markerAngle) }
  }
  if (state.kind === 'completed' && now >= state.celebrationEndsAt) {
    return { kind: 'none', state: createIdleState(state.markerAngle) }
  }
  return { kind: 'none', state }
}

export function activateRun(
  state: RunState,
  now: number,
  random: () => number,
  modifiers: RunModifiers = DEFAULT_RUN_MODIFIERS,
  targetBasePoints = new Decimal(1),
  rollCriticalTarget: () => boolean = NEVER_CRITICAL,
  directionRandom: () => number = Math.random,
): ActivationTransition {
  if (state.kind === 'idle') {
    return {
      kind: 'started',
      state: startRun(state.markerAngle, random, modifiers, 1, rollCriticalTarget),
    }
  }
  if (state.kind === 'failed') {
    if (now < state.cooldownEndsAt) return { kind: 'cooldown', state }
    return {
      kind: 'started',
      state: startRun(state.markerAngle, random, modifiers, 1, rollCriticalTarget),
    }
  }
  if (state.kind === 'completed') {
    return {
      kind: 'started',
      state: startRun(state.markerAngle, random, modifiers, 1, rollCriticalTarget),
    }
  }

  if (now < state.invulnerableUntil) {
    return { kind: 'invulnerable', state }
  }

  if (
    !isWithinTarget(
      state.markerAngle,
      state.targetAngle,
      hitToleranceForTargetHalfWidth(state.targetHalfWidth),
    )
  ) {
    if (state.missesRemaining > 0) {
      return {
        kind: 'forgiven-miss',
        state: forgiveMiss(state, random, now, rollCriticalTarget),
      }
    }
    return {
      kind: 'miss',
      state: {
        kind: 'failed',
        tierId: state.tierId,
        markerAngle: state.markerAngle,
        targetAngle: state.targetAngle,
        targetCritical: state.targetCritical,
        targetHalfWidth: state.targetHalfWidth,
        hits: state.hits,
        requiredHits: state.requiredHits,
        cooldownEndsAt: now + state.failureCooldownMs,
      },
    }
  }

  const nextHits = state.hits + 1
  const nextBasePoints = state.basePointsEarned.plus(targetBasePoints)
  if (nextHits >= state.requiredHits) {
    return {
      kind: 'completed',
      state: {
        kind: 'completed',
        tierId: state.tierId,
        markerAngle: state.markerAngle,
        hits: nextHits,
        requiredHits: state.requiredHits,
        completedAt: now,
        celebrationEndsAt: now + COMPLETION_CELEBRATION_MS,
        completionBonus: nextBasePoints.times(state.completionBonusRate),
        medalsAwarded: new Decimal(state.completionMedals),
      },
    }
  }

  const retainsDirection =
    state.directionRetentionChance > 0 && directionRandom() < state.directionRetentionChance
  const nextDirection: Direction = retainsDirection
    ? state.direction
    : state.direction === 1
      ? -1
      : 1
  return {
    kind: 'hit',
    state: {
      ...state,
      direction: nextDirection,
      hits: nextHits,
      consecutiveHits: state.consecutiveHits + 1,
      basePointsEarned: nextBasePoints,
      targetAngle: placeTarget(state.markerAngle, nextDirection, random, nextHits),
      targetCritical: rollCriticalTarget(),
    },
  }
}

export function cooldownRemainingMs(state: RunState, now: number): number {
  return state.kind === 'failed' ? Math.max(0, state.cooldownEndsAt - now) : 0
}
