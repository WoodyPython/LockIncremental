import {
  COMPLETION_BONUS_RATE,
  COMPLETION_CELEBRATION_MS,
  HIT_TOLERANCE_RADIANS,
  IDLE_SPEED_RADIANS_PER_SECOND,
  REQUIRED_HITS,
  RESULT_COOLDOWN_MS,
  TARGET_REWARD,
  activeSpeedForHits,
} from './constants'
import { advanceAngle, didPassTarget, isWithinTarget, placeTarget, type Direction } from './math'

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
}

export type RunState = IdleRunState | ActiveRunState | FailedRunState | CompletedRunState

export type ActivationResult =
  | { readonly kind: 'started'; readonly state: ActiveRunState; readonly reward: 0 }
  | { readonly kind: 'hit'; readonly state: ActiveRunState; readonly reward: number }
  | { readonly kind: 'miss'; readonly state: FailedRunState; readonly reward: 0 }
  | { readonly kind: 'completed'; readonly state: CompletedRunState; readonly reward: number }
  | {
      readonly kind: 'cooldown'
      readonly state: FailedRunState
      readonly reward: 0
    }

export function createIdleState(markerAngle = -Math.PI / 2): IdleRunState {
  return { kind: 'idle', markerAngle }
}

export function startRun(
  markerAngle: number,
  random: () => number,
  direction: Direction = 1,
): ActiveRunState {
  return {
    kind: 'active',
    markerAngle,
    targetAngle: placeTarget(markerAngle, direction, random, 0),
    direction,
    hits: 0,
    requiredHits: REQUIRED_HITS,
  }
}

export function tickRunState(state: RunState, deltaSeconds: number, now = 0): RunState {
  if (state.kind === 'idle') {
    return {
      ...state,
      markerAngle: advanceAngle(state.markerAngle, 1, IDLE_SPEED_RADIANS_PER_SECOND, deltaSeconds),
    }
  }

  if (state.kind === 'active') {
    const nextMarkerAngle = advanceAngle(
      state.markerAngle,
      state.direction,
      activeSpeedForHits(state.hits),
      deltaSeconds,
    )
    if (
      didPassTarget(
        state.markerAngle,
        nextMarkerAngle,
        state.targetAngle,
        state.direction,
        HIT_TOLERANCE_RADIANS,
      )
    ) {
      return {
        kind: 'failed',
        markerAngle: nextMarkerAngle,
        targetAngle: state.targetAngle,
        hits: state.hits,
        requiredHits: state.requiredHits,
        cooldownEndsAt: now + RESULT_COOLDOWN_MS,
      }
    }
    return {
      ...state,
      markerAngle: nextMarkerAngle,
    }
  }

  if (state.kind === 'failed' && now >= state.cooldownEndsAt) {
    return createIdleState(state.markerAngle)
  }

  if (state.kind === 'completed' && now >= state.celebrationEndsAt) {
    return createIdleState(state.markerAngle)
  }

  return state
}

export function activateRun(state: RunState, now: number, random: () => number): ActivationResult {
  if (state.kind === 'idle') {
    return { kind: 'started', state: startRun(state.markerAngle, random), reward: 0 }
  }

  if (state.kind === 'failed') {
    if (now < state.cooldownEndsAt) {
      return { kind: 'cooldown', state, reward: 0 }
    }
    return { kind: 'started', state: startRun(state.markerAngle, random), reward: 0 }
  }
  if (state.kind === 'completed') {
    return { kind: 'started', state: startRun(state.markerAngle, random), reward: 0 }
  }

  if (!isWithinTarget(state.markerAngle, state.targetAngle, HIT_TOLERANCE_RADIANS)) {
    return {
      kind: 'miss',
      state: {
        kind: 'failed',
        markerAngle: state.markerAngle,
        targetAngle: state.targetAngle,
        hits: state.hits,
        requiredHits: state.requiredHits,
        cooldownEndsAt: now + RESULT_COOLDOWN_MS,
      },
      reward: 0,
    }
  }

  const nextHits = state.hits + 1
  if (nextHits >= state.requiredHits) {
    const completionBonus = state.requiredHits * TARGET_REWARD * COMPLETION_BONUS_RATE
    return {
      kind: 'completed',
      state: {
        kind: 'completed',
        markerAngle: state.markerAngle,
        hits: nextHits,
        requiredHits: state.requiredHits,
        completedAt: now,
        celebrationEndsAt: now + COMPLETION_CELEBRATION_MS,
      },
      reward: TARGET_REWARD + completionBonus,
    }
  }

  const nextDirection: Direction = state.direction === 1 ? -1 : 1
  return {
    kind: 'hit',
    state: {
      ...state,
      direction: nextDirection,
      hits: nextHits,
      targetAngle: placeTarget(state.markerAngle, nextDirection, random, nextHits),
    },
    reward: TARGET_REWARD,
  }
}

export function cooldownRemainingMs(state: RunState, now: number): number {
  if (state.kind !== 'failed') return 0
  return Math.max(0, state.cooldownEndsAt - now)
}
