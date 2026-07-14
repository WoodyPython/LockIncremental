import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import type { GameActivationResult, GameTickResult } from '../game/GameSimulation'
import type { ActiveRunState, CompletedRunState, FailedRunState } from '../game/RunState'
import { presentActivation, presentTick } from './presentation'

const active: ActiveRunState = {
  kind: 'active',
  markerAngle: 1,
  targetAngle: 1,
  direction: 1,
  hits: 2,
  consecutiveHits: 2,
  missesRemaining: 0,
  invulnerableUntil: 0,
  basePointsEarned: new Decimal(2),
  requiredHits: 50,
}

const failed: FailedRunState = {
  kind: 'failed',
  markerAngle: 1,
  targetAngle: 2,
  hits: 2,
  requiredHits: 50,
  cooldownEndsAt: 6_000,
}

const completed: CompletedRunState = {
  kind: 'completed',
  markerAngle: 1,
  hits: 50,
  requiredHits: 50,
  completedAt: 1_000,
  celebrationEndsAt: 2_500,
  completionBonus: new Decimal(12.5),
}

describe('game result presentation', () => {
  it('presents run start, normal hits, and critical hits', () => {
    const started: GameActivationResult = {
      kind: 'started',
      state: active,
      reward: new Decimal(0),
    }
    expect(presentActivation(started, 0, null).announcement).toContain('Zero of 50')

    const hit: GameActivationResult = {
      kind: 'hit',
      state: active,
      reward: new Decimal(2),
      critical: false,
    }
    expect(presentActivation(hit, 0, 1)).toMatchObject({
      effect: 'hit',
      economyChanged: true,
      gain: { angle: 1, critical: false },
    })

    const critical = { ...hit, reward: new Decimal(10), critical: true } as const
    expect(presentActivation(critical, 0, 1)).toMatchObject({
      announcement: 'Critical hit. 10 Points earned.',
      effect: 'critical',
      gain: { critical: true },
    })
  })

  it('separates the final target gain from the completion reward', () => {
    const result: GameActivationResult = {
      kind: 'completed',
      state: completed,
      reward: new Decimal(17.5),
      targetReward: new Decimal(5),
      completionBonus: new Decimal(12.5),
      critical: true,
    }
    const presentation = presentActivation(result, 1_000, 2)
    expect(presentation.announcement).toBe('Run complete. 17.5 Points earned.')
    expect(presentation.effect).toBe('completed')
    expect(presentation.gain?.amount.eq(5)).toBe(true)
  })

  it('presents activation failures, protection, and cooldown without changing economy', () => {
    const forgiven: GameActivationResult = {
      kind: 'forgiven-miss',
      state: active,
      reward: new Decimal(0),
    }
    const protectedInput: GameActivationResult = {
      kind: 'invulnerable',
      state: active,
      reward: new Decimal(0),
    }
    const miss: GameActivationResult = { kind: 'miss', state: failed, reward: new Decimal(0) }
    const cooldown: GameActivationResult = {
      kind: 'cooldown',
      state: failed,
      reward: new Decimal(0),
    }
    expect(presentActivation(forgiven, 1_000, 1.75)).toMatchObject({
      effect: 'forgiven',
      shieldAngle: 1.75,
    })
    expect(presentActivation(protectedInput, 1_000, null).announcement).toContain('blocked')
    expect(presentActivation(miss, 1_000, null).announcement).toContain('5 second cooldown')
    expect(presentActivation(cooldown, 1_000, null)).toEqual({ economyChanged: false })
  })

  it('presents all automatic tick outcomes', () => {
    const passed: GameTickResult = { kind: 'passed-target', state: failed }
    const forgiven: GameTickResult = { kind: 'forgiven-miss', state: active }
    const protectedResult: GameTickResult = { kind: 'invulnerable', state: active }
    expect(presentTick(passed, 1_000, 2)).toMatchObject({ effect: 'miss' })
    expect(presentTick(forgiven, 1_000, 2)).toMatchObject({
      effect: 'forgiven',
      shieldAngle: 2,
    })
    expect(presentTick(protectedResult, 1_000, 2).announcement).toContain('prevented')
  })
})
