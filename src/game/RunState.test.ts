import { describe, expect, it } from 'vitest'
import { HIT_TOLERANCE_RADIANS, RESULT_COOLDOWN_MS } from './constants'
import {
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
    markerAngle: 1,
    targetAngle: 1,
    direction: 1,
    hits: 0,
    requiredHits: 20,
    ...overrides,
  }
}

describe('run state transitions', () => {
  it('uses the first activation only to start a run', () => {
    const result = activateRun(createIdleState(0), 100, random)
    expect(result.kind).toBe('started')
    expect(result.state.hits).toBe(0)
    expect(result.reward).toBe(0)
  })

  it('reverses direction and relocates the target after a hit', () => {
    const result = activateRun(hittableState(), 100, random)
    expect(result.kind).toBe('hit')
    if (result.kind !== 'hit') throw new Error('Expected a successful hit')
    expect(result.state.direction).toBe(-1)
    expect(result.state.targetAngle).not.toBe(result.state.markerAngle)
    expect(result.reward).toBe(1)
  })

  it('accepts an input when only the visible outlines touch', () => {
    const result = activateRun(
      hittableState({ markerAngle: 0, targetAngle: HIT_TOLERANCE_RADIANS - 0.001 }),
      100,
      random,
    )
    expect(result.kind).toBe('hit')
  })

  it('fails immediately on a miss and keeps achieved progress', () => {
    const result = activateRun(hittableState({ targetAngle: 3, hits: 7 }), 1_000, random)
    expect(result.kind).toBe('miss')
    if (result.kind !== 'miss') throw new Error('Expected a failed run')
    expect(result.state.hits).toBe(7)
    expect(result.state.targetAngle).toBe(3)
    expect(result.state.cooldownEndsAt).toBe(1_000 + RESULT_COOLDOWN_MS)
  })

  it('fails when movement carries the entire bar beyond the target', () => {
    const state = hittableState({ markerAngle: 0, targetAngle: 0.1 })
    expect(tickRunState(state, 0.18, 1_000).kind).toBe('active')
    const result = tickRunState(state, 0.19, 1_000)
    expect(result.kind).toBe('failed')
    if (result.kind !== 'failed') throw new Error('Expected the target to be passed')
    expect(result.targetAngle).toBe(0.1)
    expect(result.cooldownEndsAt).toBe(1_000 + RESULT_COOLDOWN_MS)
  })

  it('awards the final hit and five-point bonus once without a win cooldown', () => {
    const completion = activateRun(hittableState({ hits: 19 }), 1_000, random)
    expect(completion.kind).toBe('completed')
    expect(completion.reward).toBe(6)

    const repeated = activateRun(completion.state, 1_001, random)
    expect(repeated.kind).toBe('started')
    expect(repeated.reward).toBe(0)
  })

  it('blocks restart until five seconds pass, then requires activation', () => {
    const miss = activateRun(hittableState({ targetAngle: 3 }), 2_000, random)
    expect(activateRun(miss.state, 6_999, random).kind).toBe('cooldown')
    expect(cooldownRemainingMs(miss.state, 6_999)).toBe(1)
    expect(activateRun(miss.state, 7_000, random).kind).toBe('started')
  })

  it('returns failed and completed results to a normal idle state automatically', () => {
    const miss = activateRun(hittableState({ targetAngle: 3 }), 2_000, random)
    expect(tickRunState(miss.state, 0.1, 6_999).kind).toBe('failed')
    expect(tickRunState(miss.state, 0.1, 7_000).kind).toBe('idle')

    const completion = activateRun(hittableState({ hits: 19 }), 3_000, random)
    expect(tickRunState(completion.state, 0.1, 4_499).kind).toBe('completed')
    expect(tickRunState(completion.state, 0.1, 4_500).kind).toBe('idle')
  })

  it('advances only idle and active markers', () => {
    const idle = createIdleState(0)
    expect(tickRunState(idle, 1).markerAngle).not.toBe(0)
    const miss = activateRun(hittableState({ targetAngle: 3 }), 0, random)
    expect(tickRunState(miss.state, 1)).toEqual(miss.state)
  })
})
