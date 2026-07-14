import Decimal from 'break_infinity.js'
import {
  COMPLETION_BONUS_RATE,
  COMPLETION_CELEBRATION_MS,
  HIT_TOLERANCE_RADIANS,
  IDLE_SPEED_RADIANS_PER_SECOND,
  REQUIRED_HITS,
  RESULT_COOLDOWN_MS,
  SHIELD_INVULNERABILITY_MS,
  activeSpeedForHits,
} from './constants'
import { advanceAngle, didPassTarget, isWithinTarget, placeTarget, type Direction } from './math'

export interface RunModifiers {
  readonly missesPerRun: number
  readonly failureCooldownMs: number
  readonly speedScalingMultiplier: number
}

export const DEFAULT_RUN_MODIFIERS: RunModifiers = {
  missesPerRun: 0,
  failureCooldownMs: RESULT_COOLDOWN_MS,
  speedScalingMultiplier: 1,
}

export interface IdleRunState {
  readonly kind: 'idle'
  readonly markerAngle: number
}

export interface ActiveRunState {
  readonly kind: 'active'
  readonly markerAngle: number
  readonly targetAngle: number
  readonly direction: Direction
  readonly hits: number
  readonly consecutiveHits: number
  readonly missesRemaining: number
  readonly invulnerableUntil: number
  readonly basePointsEarned: Decimal
  readonly requiredHits: number
}

export interface FailedRunState {
  readonly kind: 'failed'
  readonly markerAngle: number
  readonly targetAngle: number
  readonly hits: number
  readonly requiredHits: number
  readonly cooldownEndsAt: number
}

export interface CompletedRunState {
  readonly kind: 'completed'
  readonly markerAngle: number
  readonly hits: number
  readonly requiredHits: number
  readonly completedAt: number
  readonly celebrationEndsAt: number
  readonly completionBonus: Decimal
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

export function createIdleState(markerAngle = -Math.PI / 2): IdleRunState {
  return { kind: 'idle', markerAngle }
}

export function startRun(
  markerAngle: number,
  random: () => number,
  modifiers: RunModifiers = DEFAULT_RUN_MODIFIERS,
  direction: Direction = 1,
): ActiveRunState {
  return {
    kind: 'active',
    markerAngle,
    targetAngle: placeTarget(markerAngle, direction, random, 0),
    direction,
    hits: 0,
    consecutiveHits: 0,
    missesRemaining: modifiers.missesPerRun,
    invulnerableUntil: 0,
    basePointsEarned: new Decimal(0),
    requiredHits: REQUIRED_HITS,
  }
}

function relocateTarget(state: ActiveRunState, random: () => number): ActiveRunState {
  const nextDirection: Direction = state.direction === 1 ? -1 : 1
  return {
    ...state,
    direction: nextDirection,
    consecutiveHits: 0,
    targetAngle: placeTarget(state.markerAngle, nextDirection, random, state.hits),
  }
}

function forgiveMiss(state: ActiveRunState, random: () => number, now: number): ActiveRunState {
  return {
    ...relocateTarget(state, random),
    missesRemaining: state.missesRemaining - 1,
    invulnerableUntil: now + SHIELD_INVULNERABILITY_MS,
  }
}

export function tickRunState(
  state: RunState,
  deltaSeconds: number,
  now = 0,
  random: () => number = Math.random,
  modifiers: RunModifiers = DEFAULT_RUN_MODIFIERS,
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
    const nextMarkerAngle = advanceAngle(
      state.markerAngle,
      state.direction,
      activeSpeedForHits(state.hits, modifiers.speedScalingMultiplier),
      deltaSeconds,
    )
    const movedState = { ...state, markerAngle: nextMarkerAngle }
    if (
      !didPassTarget(
        state.markerAngle,
        nextMarkerAngle,
        state.targetAngle,
        state.direction,
        HIT_TOLERANCE_RADIANS,
      )
    ) {
      return { kind: 'none', state: movedState }
    }
    if (state.missesRemaining > 0) {
      return { kind: 'forgiven-miss', state: forgiveMiss(movedState, random, now) }
    }
    if (now < state.invulnerableUntil) {
      return { kind: 'invulnerable', state: relocateTarget(movedState, random) }
    }
    return {
      kind: 'passed-target',
      state: {
        kind: 'failed',
        markerAngle: nextMarkerAngle,
        targetAngle: state.targetAngle,
        hits: state.hits,
        requiredHits: state.requiredHits,
        cooldownEndsAt: now + modifiers.failureCooldownMs,
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
): ActivationTransition {
  if (state.kind === 'idle') {
    return { kind: 'started', state: startRun(state.markerAngle, random, modifiers) }
  }
  if (state.kind === 'failed') {
    if (now < state.cooldownEndsAt) return { kind: 'cooldown', state }
    return { kind: 'started', state: startRun(state.markerAngle, random, modifiers) }
  }
  if (state.kind === 'completed') {
    return { kind: 'started', state: startRun(state.markerAngle, random, modifiers) }
  }

  if (now < state.invulnerableUntil) {
    return { kind: 'invulnerable', state }
  }

  if (!isWithinTarget(state.markerAngle, state.targetAngle, HIT_TOLERANCE_RADIANS)) {
    if (state.missesRemaining > 0) {
      return { kind: 'forgiven-miss', state: forgiveMiss(state, random, now) }
    }
    return {
      kind: 'miss',
      state: {
        kind: 'failed',
        markerAngle: state.markerAngle,
        targetAngle: state.targetAngle,
        hits: state.hits,
        requiredHits: state.requiredHits,
        cooldownEndsAt: now + modifiers.failureCooldownMs,
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
        markerAngle: state.markerAngle,
        hits: nextHits,
        requiredHits: state.requiredHits,
        completedAt: now,
        celebrationEndsAt: now + COMPLETION_CELEBRATION_MS,
        completionBonus: nextBasePoints.times(COMPLETION_BONUS_RATE),
      },
    }
  }

  const nextDirection: Direction = state.direction === 1 ? -1 : 1
  return {
    kind: 'hit',
    state: {
      ...state,
      direction: nextDirection,
      hits: nextHits,
      consecutiveHits: state.consecutiveHits + 1,
      basePointsEarned: nextBasePoints,
      targetAngle: placeTarget(state.markerAngle, nextDirection, random, nextHits),
    },
  }
}

export function cooldownRemainingMs(state: RunState, now: number): number {
  return state.kind === 'failed' ? Math.max(0, state.cooldownEndsAt - now) : 0
}
