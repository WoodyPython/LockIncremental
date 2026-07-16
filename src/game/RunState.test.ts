import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'
import {
  HIT_TOLERANCE_RADIANS,
  REQUIRED_HITS,
  RESULT_COOLDOWN_MS,
  SHIELD_RECOVERY_MS,
  TARGET_HALF_WIDTH_RADIANS,
} from './constants'
import {
  DEFAULT_RUN_MODIFIERS,
  activateRun,
  cooldownRemainingMs,
  createIdleState,
  tickRunState,
  type ActiveRunState,
} from './RunState'

const random = (): number => 0

function hittableState(overrides: Partial<ActiveRunState> = {}): ActiveRunState {
  return {
    kind: 'active',
    tierId: 'tier-1',
    markerAngle: 1,
    targetAngle: 1,
    targetCritical: false,
    targetHalfWidth: TARGET_HALF_WIDTH_RADIANS,
    direction: 1,
    hits: 0,
    consecutiveHits: 0,
    missesRemaining: 0,
    invulnerableUntil: 0,
    basePointsEarned: new Decimal(0),
    requiredHits: REQUIRED_HITS,
    speedScalingMultiplier: 1,
    failureCooldownMs: RESULT_COOLDOWN_MS,
    directionRetentionChance: 0,
    completionMedals: 1,
    completionBonusRate: 0.25,
    preserveStreakOnShield: false,
    ...overrides,
  }
}

describe('run state transitions', () => {
  it('uses the first activation only to start a run', () => {
    const result = activateRun(
      createIdleState(0),
      100,
      random,
      DEFAULT_RUN_MODIFIERS,
      new Decimal(1),
      () => true,
    )
    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('Expected a started run')
    expect(result.state.hits).toBe(0)
    expect(result.state.targetCritical).toBe(true)
  })

  it('reverses direction, relocates the target, and tracks base value after a hit', () => {
    const result = activateRun(
      hittableState(),
      100,
      random,
      DEFAULT_RUN_MODIFIERS,
      new Decimal(2),
      () => true,
    )
    expect(result.kind).toBe('hit')
    if (result.kind !== 'hit') throw new Error('Expected a successful hit')
    expect(result.state.direction).toBe(-1)
    expect(result.state.targetAngle).not.toBe(result.state.markerAngle)
    expect(result.state.consecutiveHits).toBe(1)
    expect(result.state.basePointsEarned.eq(2)).toBe(true)
    expect(result.state.targetCritical).toBe(true)
  })

  it('uses the tier direction roll at the exact 50% boundary', () => {
    const state = hittableState({ directionRetentionChance: 0.5 })
    const retained = activateRun(
      state,
      0,
      random,
      DEFAULT_RUN_MODIFIERS,
      new Decimal(1),
      () => false,
      () => 0.49,
    )
    expect(retained.kind).toBe('hit')
    if (retained.kind !== 'hit') throw new Error('Expected a successful hit')
    expect(retained.state.direction).toBe(1)

    const reversed = activateRun(
      state,
      0,
      random,
      DEFAULT_RUN_MODIFIERS,
      new Decimal(1),
      () => false,
      () => 0.5,
    )
    expect(reversed.kind).toBe('hit')
    if (reversed.kind !== 'hit') throw new Error('Expected a successful hit')
    expect(reversed.state.direction).toBe(-1)
  })

  it('accepts an input when only the visible outlines touch', () => {
    const result = activateRun(
      hittableState({ markerAngle: 0, targetAngle: HIT_TOLERANCE_RADIANS - 0.001 }),
      100,
      random,
    )
    expect(result.kind).toBe('hit')
  })

  it('uses the snapshotted target width for hits and passed-target detection', () => {
    const justOutsideBase = HIT_TOLERANCE_RADIANS + 0.01
    const base = activateRun(
      hittableState({ markerAngle: 0, targetAngle: justOutsideBase }),
      100,
      random,
    )
    expect(base.kind).toBe('miss')

    const largerHalfWidth = TARGET_HALF_WIDTH_RADIANS * 1.25
    const larger = activateRun(
      hittableState({
        markerAngle: 0,
        targetAngle: justOutsideBase,
        targetHalfWidth: largerHalfWidth,
      }),
      100,
      random,
    )
    expect(larger.kind).toBe('hit')

    const passingState = hittableState({ markerAngle: 0, targetAngle: 0.04 })
    expect(tickRunState(passingState, 0.16, 100, random).kind).toBe('passed-target')
    expect(
      tickRunState({ ...passingState, targetHalfWidth: largerHalfWidth }, 0.16, 100, random).kind,
    ).toBe('none')
  })

  it('snapshots required hits and target width when a run starts', () => {
    const result = activateRun(createIdleState(0), 100, random, {
      ...DEFAULT_RUN_MODIFIERS,
      requiredHits: 40,
      targetHalfWidth: TARGET_HALF_WIDTH_RADIANS * 1.5,
      missesPerRun: 2,
    })
    expect(result.kind).toBe('started')
    if (result.kind !== 'started') throw new Error('Expected started run')
    expect(result.state.requiredHits).toBe(40)
    expect(result.state.targetHalfWidth).toBeCloseTo(TARGET_HALF_WIDTH_RADIANS * 1.5)
    expect(result.state.missesRemaining).toBe(2)

    const completion = activateRun(
      { ...result.state, markerAngle: 1, targetAngle: 1, hits: 39 },
      200,
      random,
    )
    expect(completion.kind).toBe('completed')
    if (completion.kind !== 'completed') throw new Error('Expected completed run')
    expect(completion.state.requiredHits).toBe(40)
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
    expect(result.state.invulnerableUntil).toBe(1_000 + SHIELD_RECOVERY_MS)

    expect(activateRun(result.state, 1_999, random).kind).toBe('invulnerable')
    expect(activateRun(result.state, 2_000, random).kind).toBe('miss')
  })

  it('preserves the snapshotted streak when a Shielded Momentum miss is forgiven', () => {
    const result = activateRun(
      hittableState({
        targetAngle: 3,
        hits: 7,
        consecutiveHits: 4,
        missesRemaining: 1,
        preserveStreakOnShield: true,
      }),
      1_000,
      random,
    )
    expect(result.kind).toBe('forgiven-miss')
    if (result.kind !== 'forgiven-miss') throw new Error('Expected a forgiven miss')
    expect(result.state.hits).toBe(7)
    expect(result.state.consecutiveHits).toBe(4)
  })

  it('fails immediately without an allowance and uses the configured cooldown', () => {
    const result = activateRun(
      hittableState({
        targetAngle: 3,
        targetCritical: true,
        hits: 7,
        failureCooldownMs: 3_000,
      }),
      1_000,
      random,
    )
    expect(result.kind).toBe('miss')
    if (result.kind !== 'miss') throw new Error('Expected a failed run')
    expect(result.state.hits).toBe(7)
    expect(result.state.cooldownEndsAt).toBe(4_000)
    expect(result.state.targetCritical).toBe(true)
  })

  it('forgives a passed target once, then fails the next passed target', () => {
    const state = hittableState({ markerAngle: 0, targetAngle: 0.1, missesRemaining: 1 })
    const forgiven = tickRunState(state, 0.19, 1_000, random)
    expect(forgiven.kind).toBe('forgiven-miss')
    if (forgiven.kind !== 'forgiven-miss') throw new Error('Expected forgiveness')
    const protectedPass = tickRunState(forgiven.state, 0.19, 1_999, random)
    expect(protectedPass.kind).toBe('none')
    expect(protectedPass.state.markerAngle).toBe(forgiven.state.markerAngle)
    if (protectedPass.state.kind !== 'active') throw new Error('Expected an active run')
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
    expect(completion.state.medalsAwarded.eq(1)).toBe(true)
    expect(completion.state.celebrationEndsAt).toBe(4_000)
    expect(tickRunState(completion.state, 0.1, 3_999).state.kind).toBe('completed')
    expect(tickRunState(completion.state, 0.1, 4_000).state.kind).toBe('idle')
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
    const normal = tickRunState(state, 0.05, 0, random).state
    const reduced = tickRunState({ ...state, speedScalingMultiplier: 0.8 }, 0.05, 0, random).state
    expect(normal.markerAngle).toBeGreaterThan(reduced.markerAngle)
  })
})
