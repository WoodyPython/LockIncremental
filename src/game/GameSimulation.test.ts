import { describe, expect, it } from 'vitest'
import { HIT_TOLERANCE_RADIANS, REQUIRED_HITS } from './constants'
import { GameSimulation } from './GameSimulation'
import { angularDistance, isWithinTarget } from './math'

function hitCurrentTarget(
  game: GameSimulation,
  now: number,
): ReturnType<GameSimulation['activate']> {
  let frame = 0
  while (frame < 1_000) {
    const run = game.getSnapshot().run
    if (run.kind !== 'active') throw new Error('Expected an active run')
    if (isWithinTarget(run.markerAngle, run.targetAngle, HIT_TOLERANCE_RADIANS)) break
    now += 10
    game.tick(0.01, now)
    frame += 1
  }
  expect(frame).toBeLessThan(1_000)
  return game.activate(now)
}

describe('GameSimulation progression', () => {
  it('earns one per target and a quarter-run completion bonus', () => {
    const game = new GameSimulation({ targetRandom: () => 0, criticalRandom: () => 1 })
    expect(game.activate(0).kind).toBe('started')
    for (let target = 0; target < REQUIRED_HITS; target += 1) {
      expect(hitCurrentTarget(game, target * 10_000).kind).toBe(
        target === REQUIRED_HITS - 1 ? 'completed' : 'hit',
      )
    }
    const snapshot = game.getSnapshot()
    expect(snapshot.points.eq(REQUIRED_HITS * 1.25)).toBe(true)
    expect(snapshot.lifetimePoints.eq(REQUIRED_HITS * 1.25)).toBe(true)
    expect(game.activate(300_000).reward.eq(0)).toBe(true)
    expect(game.getSnapshot().points.eq(snapshot.points)).toBe(true)
  })

  it('applies target value, streak rewards, and a non-bonus critical multiplier', () => {
    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => 0,
      initialPoints: 1_000,
    })
    expect(game.purchase('target-value').kind).toBe('purchased')
    expect(game.purchase('consecutive-value').kind).toBe('purchased')
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    expect(game.activate(0).kind).toBe('started')
    const first = hitCurrentTarget(game, 0)
    expect(first.kind).toBe('hit')
    if (first.kind !== 'hit') throw new Error('Expected hit')
    expect(first.critical).toBe(true)
    expect(first.reward.eq(6.25)).toBe(true)
    const second = hitCurrentTarget(game, 10_000)
    expect(second.reward.eq(6.5625)).toBe(true)
  })

  it('doubles target, critical, and completion Point gains', () => {
    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => 0,
      initialPoints: 350,
    })
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    expect(game.purchase('double-points').kind).toBe('purchased')
    expect(game.getSnapshot().points.eq(0)).toBe(true)
    expect(game.activate(0).kind).toBe('started')
    for (let target = 0; target < REQUIRED_HITS; target += 1) {
      hitCurrentTarget(game, target * 10_000)
    }
    expect(game.getSnapshot().points.eq(REQUIRED_HITS * 10.5)).toBe(true)
  })

  it('uses an independent critical roll and reports automatic target failure', () => {
    let criticalRolls = 0
    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => {
        criticalRolls += 1
        return 1
      },
      initialPoints: 100,
    })
    game.purchase('critical-hits')
    game.activate(0)
    hitCurrentTarget(game, 0)
    expect(criticalRolls).toBe(1)

    const failingGame = new GameSimulation({ targetRandom: () => 0 })
    failingGame.activate(0)
    let passed = null
    for (let frame = 0; frame < 200 && passed === null; frame += 1) {
      passed = failingGame.tick(0.05, frame * 50)
    }
    expect(passed?.kind).toBe('passed-target')
  })

  it('clamps unusually large frame deltas', () => {
    const game = new GameSimulation({ targetRandom: () => 0 })
    const initialAngle = game.getSnapshot().run.markerAngle
    game.tick(100)
    expect(angularDistance(game.getSnapshot().run.markerAngle, initialAngle)).toBeLessThan(0.2)
  })
})
