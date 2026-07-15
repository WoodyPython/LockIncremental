import { describe, expect, it } from 'vitest'
import { HIT_TOLERANCE_RADIANS, REQUIRED_HITS, TARGET_HALF_WIDTH_RADIANS } from './constants'
import { GameSimulation } from './GameSimulation'
import { angularDistance, isWithinTarget } from './math'
import { medalUpgradeDefinitionsByCost } from './medalUpgrades'

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
    expect(snapshot.medals.eq(1)).toBe(true)
    expect(snapshot.lifetimeMedals.eq(1)).toBe(true)
    expect(snapshot.statistics).toEqual({
      runsStarted: 1,
      targetsHit: REQUIRED_HITS,
      bestRunHits: REQUIRED_HITS,
      completedRuns: 1,
    })
    expect(game.activate(300_000).reward.eq(0)).toBe(true)
    expect(game.getSnapshot().points.eq(snapshot.points)).toBe(true)
    expect(game.getSnapshot().medals.eq(1)).toBe(true)
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
    expect(first.reward.eq(12.5)).toBe(true)
    const second = hitCurrentTarget(game, 10_000)
    expect(second.reward.eq(13.125)).toBe(true)
  })

  it('doubles target, critical, and completion Point gains', () => {
    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => 0,
      initialPoints: 600,
    })
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    expect(game.purchase('double-points').kind).toBe('purchased')
    expect(game.getSnapshot().points.eq(0)).toBe(true)
    expect(game.activate(0).kind).toBe('started')
    for (let target = 0; target < REQUIRED_HITS; target += 1) {
      hitCurrentTarget(game, target * 10_000)
    }
    expect(game.getSnapshot().points.eq(REQUIRED_HITS * 20.5)).toBe(true)
  })

  it('spends one Medal once and doubles target, critical, and completion gains', () => {
    const poorGame = new GameSimulation({ initialLifetimeMedals: 1 })
    expect(poorGame.purchaseMedalUpgrade('double-point-gain').kind).toBe('unaffordable')

    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => 0,
      initialPoints: 100,
      initialMedals: 1,
    })
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    expect(game.purchaseMedalUpgrade('double-point-gain').kind).toBe('purchased')
    expect(game.getSnapshot().medals.eq(0)).toBe(true)
    expect(game.getSnapshot().lifetimeMedals.eq(1)).toBe(true)
    expect(game.purchaseMedalUpgrade('double-point-gain').kind).toBe('owned')

    expect(game.activate(0).kind).toBe('started')
    for (let target = 0; target < REQUIRED_HITS; target += 1) {
      hitCurrentTarget(game, target * 10_000)
    }
    expect(game.getSnapshot().points.eq(REQUIRED_HITS * 20.5)).toBe(true)
    expect(game.getSnapshot().medals.eq(1)).toBe(true)
    expect(game.getSnapshot().lifetimeMedals.eq(2)).toBe(true)
  })

  it('stacks the Point and Medal upgrades for four-times Point gains', () => {
    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => 1,
      initialPoints: 500,
      initialMedals: 1,
    })
    expect(game.purchase('double-points').kind).toBe('purchased')
    expect(game.purchaseMedalUpgrade('double-point-gain').kind).toBe('purchased')
    expect(game.activate(0).kind).toBe('started')
    for (let target = 0; target < REQUIRED_HITS; target += 1) {
      hitCurrentTarget(game, target * 10_000)
    }
    expect(game.getSnapshot().points.eq(REQUIRED_HITS * 5)).toBe(true)
  })

  it('spends the exact cost and rejects duplicate purchases for every Medal upgrade', () => {
    for (const definition of medalUpgradeDefinitionsByCost()) {
      const poorGame = new GameSimulation({ initialMedals: definition.cost.minus(1) })
      expect(poorGame.purchaseMedalUpgrade(definition.id).kind).toBe('unaffordable')

      const game = new GameSimulation({ initialMedals: definition.cost })
      const purchase = game.purchaseMedalUpgrade(definition.id)
      expect(purchase.kind).toBe('purchased')
      expect(game.getSnapshot().medals.eq(0)).toBe(true)
      expect(game.getSnapshot().medalUpgrades[definition.id]).toBe(1)
      expect(game.purchaseMedalUpgrade(definition.id).kind).toBe('owned')
    }
  })

  it('purchases Medal-gated Point upgrades only after Shorter Jackpot', () => {
    const game = new GameSimulation({ initialPoints: 100_000, initialMedals: 2 })
    expect(game.purchase('rapid-recovery').kind).toBe('hidden')
    expect(game.purchase('efficient-scaling').kind).toBe('hidden')
    expect(game.purchaseMedalUpgrade('shorter-jackpot').kind).toBe('purchased')
    expect(game.purchase('rapid-recovery').kind).toBe('purchased')
    expect(game.purchase('efficient-scaling').kind).toBe('purchased')
  })

  it('applies run-shaping Medal purchases on the next run', () => {
    const game = new GameSimulation({ targetRandom: () => 0, initialMedals: 11 })
    expect(game.activate(0).kind).toBe('started')
    const original = game.getRunState()
    expect(original.kind).toBe('active')
    if (original.kind !== 'active') throw new Error('Expected active run')

    game.purchaseMedalUpgrade('larger-targets')
    game.purchaseMedalUpgrade('shorter-jackpot')
    game.purchaseMedalUpgrade('golden-safety-net')
    game.purchaseMedalUpgrade('jackpot-mastery')
    const unchanged = game.getRunState()
    expect(unchanged.kind).toBe('active')
    if (unchanged.kind !== 'active') throw new Error('Expected active run')
    expect(unchanged.requiredHits).toBe(REQUIRED_HITS)
    expect(unchanged.targetHalfWidth).toBe(TARGET_HALF_WIDTH_RADIANS)
    expect(unchanged.missesRemaining).toBe(0)

    expect(game.activate(1).kind).toBe('miss')
    expect(game.activate(6_000).kind).toBe('started')
    const upgraded = game.getRunState()
    expect(upgraded.kind).toBe('active')
    if (upgraded.kind !== 'active') throw new Error('Expected active run')
    expect(upgraded.requiredHits).toBe(40)
    expect(upgraded.targetHalfWidth).toBeCloseTo(TARGET_HALF_WIDTH_RADIANS * 2)
    expect(upgraded.missesRemaining).toBe(1)
  })

  it('predetermines critical status when each target spawns', () => {
    let criticalRolls = 0
    const game = new GameSimulation({
      targetRandom: () => 0,
      criticalRandom: () => {
        criticalRolls += 1
        return 0
      },
      initialPoints: 100,
    })
    game.purchase('critical-hits')
    game.activate(0)
    expect(criticalRolls).toBe(1)

    const spawnedTarget = game.getRunState()
    expect(spawnedTarget.kind).toBe('active')
    if (spawnedTarget.kind !== 'active') throw new Error('Expected active run')
    expect(spawnedTarget.targetCritical).toBe(true)

    const hit = hitCurrentTarget(game, 0)
    expect(hit.kind).toBe('hit')
    if (hit.kind !== 'hit') throw new Error('Expected hit')
    expect(hit.critical).toBe(true)
    expect(criticalRolls).toBe(2)
  })

  it('reports automatic target failure', () => {
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
