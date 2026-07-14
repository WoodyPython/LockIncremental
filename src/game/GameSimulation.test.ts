import { describe, expect, it } from 'vitest'
import { HIT_TOLERANCE_RADIANS } from './constants'
import { GameSimulation } from './GameSimulation'
import { angularDistance, isWithinTarget } from './math'

describe('GameSimulation rewards', () => {
  it('earns one per target and a quarter-run completion bonus', () => {
    const game = new GameSimulation(() => 0)
    expect(game.activate(0).kind).toBe('started')
    let now = 0

    for (let target = 0; target < 20; target += 1) {
      let frame = 0
      while (frame < 1_000) {
        const run = game.getSnapshot().run
        if (run.kind !== 'active') throw new Error('Expected an active run')
        if (isWithinTarget(run.markerAngle, run.targetAngle, HIT_TOLERANCE_RADIANS)) break
        now += 10
        expect(game.tick(0.01, now)).toBeNull()
        frame += 1
      }
      expect(frame).toBeLessThan(1_000)
      const result = game.activate(now)
      expect(result.kind).toBe(target === 19 ? 'completed' : 'hit')
    }

    const snapshot = game.getSnapshot()
    expect(snapshot.currency.eq(25)).toBe(true)
    expect(snapshot.lifetimeCurrency.eq(25)).toBe(true)
    expect(game.activate(now + 1).reward).toBe(0)
    expect(game.getSnapshot().currency.eq(25)).toBe(true)
  })

  it('fails an active run automatically after the bar passes its target', () => {
    const game = new GameSimulation(() => 0)
    game.activate(0)
    let now = 0
    let passed = null
    for (let frame = 0; frame < 200 && passed === null; frame += 1) {
      now += 50
      passed = game.tick(0.05, now)
    }
    expect(passed?.kind).toBe('passed-target')
    expect(game.getSnapshot().run.kind).toBe('failed')
  })

  it('clamps unusually large frame deltas', () => {
    const game = new GameSimulation(() => 0)
    const initialAngle = game.getSnapshot().run.markerAngle
    game.tick(100)
    const movedAngle = game.getSnapshot().run.markerAngle
    expect(angularDistance(movedAngle, initialAngle)).toBeLessThan(0.2)
  })
})
