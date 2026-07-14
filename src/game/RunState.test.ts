import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'
import {
  HIT_TOLERANCE_RADIANS,
  REQUIRED_HITS,
  RESULT_COOLDOWN_MS,
  SHIELD_INVULNERABILITY_MS,
} from './constants'
import {
  DEFAULT_RUN_MODIFIERS,
  activateRun,
  cooldownRemainingMs,
  createIdleState,
  tickRunState,
  type ActiveRunState,
  type RunModifiers,
} from './RunState'

const random = (): number => 0

function hittableState(overrides: Partial<ActiveRunState> = {}): ActiveRunState {
  return {
    kind: 'active',
    markerAngle: 1,
    targetAngle: 1,
    direction: 1,
    hits: 0,
    consecutiveHits: 0,
    missesRemaining: 0,
    invulnerableUntil: 0,
    basePointsEarned: new Decimal(0),
    requiredHits: REQUIRED_HITS,
    ...overrides,
  }
}

describe('run state transitions', () => {
  it('uses the first activation only to start a run', () => {
    const result = activateRun(createIdleState(0), 100, random)
    expect(result.kind).toBe('started')
    expect(result.state.hits).toBe(0)
  })

  it('reverses direction, relocates the target, and tracks base value after a hit', () => {
    const result = activateRun(hittableState(), 100, random, DEFAULT_RUN_MODIFIERS, new Decimal(2))
    expect(result.kind).toBe('hit')
    if (result.kind !== 'hit') throw new Error('Expected a successful hit')
    expect(result.state.direction).toBe(-1)
    expect(result.state.targetAngle).not.toBe(result.state.markerAngle)
    expect(result.state.consecutiveHits).toBe(1)
    expect(result.state.basePointsEarned.eq(2)).toBe(true)
  })

  it('accepts an input when only the visible outlines touch', () => {
    const result = activateRun(
      hittableState({ markerAngle: 0, targetAngle: HIT_TOLERANCE_RADIANS - 0.001 }),
      100,
      random,
    )
    expect(result.kind).toBe('hit')
  })

  it('forgives one input miss, resets the streak, and preserves hit progress', () => {
    const result = activateRun(
      hittableState({ targetAngle: 3, hits: 7, consecutiveHits: 4, missesRemaining: 1 }),
      1_000,
      random,
    )
    expect(result.kind).toBe('forgiven-miss')
    if (result.kind !== 'forgiven-miss') throw new Error('Expected a forgiven miss')
    expect(result.state.hits).toBe(7)
    expect(result.state.consecutiveHits).toBe(0)
    expect(result.state.missesRemaining).toBe(0)
    expect(result.state.direction).toBe(-1)
    expect(result.state.invulnerableUntil).toBe(1_000 + SHIELD_INVULNERABILITY_MS)

    expect(activateRun(result.state, 1_100, random).kind).toBe('invulnerable')
    expect(activateRun(result.state, 1_200, random).kind).toBe('miss')
  })

  it('fails immediately without an allowance and uses the configured cooldown', () => {
    const modifiers: RunModifiers = { ...DEFAULT_RUN_MODIFIERS, failureCooldownMs: 3_000 }
    const result = activateRun(hittableState({ targetAngle: 3, hits: 7 }), 1_000, random, modifiers)
    expect(result.kind).toBe('miss')
    if (result.kind !== 'miss') throw new Error('Expected a failed run')
    expect(result.state.hits).toBe(7)
    expect(result.state.cooldownEndsAt).toBe(4_000)
  })

  it('forgives a passed target once, then fails the next passed target', () => {
    const state = hittableState({ markerAngle: 0, targetAngle: 0.1, missesRemaining: 1 })
    const forgiven = tickRunState(state, 0.19, 1_000, random)
    expect(forgiven.kind).toBe('forgiven-miss')
    if (forgiven.kind !== 'forgiven-miss') throw new Error('Expected forgiveness')
    const passingAgain = { ...forgiven.state, targetAngle: forgiven.state.markerAngle + 0.1 }
    const protectedPass = tickRunState(passingAgain, 0.19, 1_100, random)
    expect(protectedPass.kind).toBe('invulnerable')
    if (protectedPass.kind !== 'invulnerable') throw new Error('Expected invulnerability')
    const afterProtection = {
      ...protectedPass.state,
      targetAngle: protectedPass.state.markerAngle + protectedPass.state.direction * 0.1,
    }
    const failed = tickRunState(afterProtection, 0.19, 2_000, random)
    expect(failed.kind).toBe('passed-target')
    if (failed.kind !== 'passed-target') throw new Error('Expected failure')
    expect(failed.state.cooldownEndsAt).toBe(2_000 + RESULT_COOLDOWN_MS)
  })

  it('calculates completion bonus from accumulated pre-critical target value', () => {
    const completion = activateRun(
      hittableState({ hits: REQUIRED_HITS - 1, basePointsEarned: new Decimal(24) }),
      1_000,
      random,
      DEFAULT_RUN_MODIFIERS,
      new Decimal(2),
    )
    expect(completion.kind).toBe('completed')
    if (completion.kind !== 'completed') throw new Error('Expected completion')
    expect(completion.state.completionBonus.eq(6.5)).toBe(true)
    expect(activateRun(completion.state, 1_001, random).kind).toBe('started')
  })

  it('blocks restart until cooldown passes and returns terminal states to idle', () => {
    const miss = activateRun(hittableState({ targetAngle: 3 }), 2_000, random)
    expect(activateRun(miss.state, 6_999, random).kind).toBe('cooldown')
    expect(cooldownRemainingMs(miss.state, 6_999)).toBe(1)
    expect(activateRun(miss.state, 7_000, random).kind).toBe('started')
    expect(tickRunState(miss.state, 0.1, 7_000).state.kind).toBe('idle')
  })

  it('applies the speed-scaling modifier without changing base speed', () => {
    const state = hittableState({ markerAngle: 0, targetAngle: 3, hits: 10 })
    const normal = tickRunState(state, 0.05, 0, random, DEFAULT_RUN_MODIFIERS).state
    const reduced = tickRunState(state, 0.05, 0, random, {
      ...DEFAULT_RUN_MODIFIERS,
      speedScalingMultiplier: 0.8,
    }).state
    expect(normal.markerAngle).toBeGreaterThan(reduced.markerAngle)
  })
})
