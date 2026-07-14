import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'
import { GameSimulation } from './GameSimulation'
import { currentGoal } from './goals'
import {
  EMPTY_UPGRADE_LEVELS,
  UPGRADE_DEFINITIONS,
  consecutiveMultiplier,
  criticalChance,
  isUpgradeVisible,
  targetValueMultiplier,
  upgradeCost,
  visibleOneTimeUpgradeIds,
} from './upgrades'

function definition(id: (typeof UPGRADE_DEFINITIONS)[number]['id']) {
  const result = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === id)
  if (result === undefined) throw new Error(`Missing upgrade ${id}`)
  return result
}

describe('upgrade definitions and purchases', () => {
  it('calculates both repeatable 1.5x cost curves', () => {
    expect(upgradeCost(definition('target-value'), 0).eq(5)).toBe(true)
    expect(upgradeCost(definition('target-value'), 1).eq(8)).toBe(true)
    expect(upgradeCost(definition('target-value'), 2).eq(11)).toBe(true)
    expect(upgradeCost(definition('critical-chance'), 0).eq(25)).toBe(true)
    expect(upgradeCost(definition('critical-chance'), 2).eq(56)).toBe(true)
  })

  it('uses the concise critical chance upgrade copy', () => {
    expect(definition('critical-chance').description).toBe('Increase critical chance by +0.5%.')
  })

  it('reveals one-time upgrades at 10 lifetime Points and crit chance after its prerequisite', () => {
    expect(isUpgradeVisible(definition('target-value'), EMPTY_UPGRADE_LEVELS, new Decimal(0))).toBe(
      true,
    )
    expect(
      isUpgradeVisible(definition('critical-hits'), EMPTY_UPGRADE_LEVELS, new Decimal(9)),
    ).toBe(false)
    expect(
      isUpgradeVisible(definition('critical-hits'), EMPTY_UPGRADE_LEVELS, new Decimal(10)),
    ).toBe(true)
    expect(
      isUpgradeVisible(definition('critical-chance'), EMPTY_UPGRADE_LEVELS, new Decimal(100)),
    ).toBe(false)
    expect(
      isUpgradeVisible(
        definition('critical-chance'),
        { ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1 },
        new Decimal(100),
      ),
    ).toBe(true)
  })

  it('keeps purchased one-time upgrades and reveals only the next three unpurchased ones', () => {
    expect(visibleOneTimeUpgradeIds(EMPTY_UPGRADE_LEVELS, new Decimal(9))).toEqual([])
    expect(visibleOneTimeUpgradeIds(EMPTY_UPGRADE_LEVELS, new Decimal(100))).toEqual([
      'consecutive-value',
      'miss-allowance',
      'critical-hits',
    ])
    expect(
      visibleOneTimeUpgradeIds(
        { ...EMPTY_UPGRADE_LEVELS, 'consecutive-value': 1 },
        new Decimal(100),
      ),
    ).toEqual(['consecutive-value', 'miss-allowance', 'critical-hits', 'fail-cooldown'])
  })

  it('uses additive target levels, exponential streaks, and capped critical chance', () => {
    expect(targetValueMultiplier(1).eq(1.25)).toBe(true)
    expect(targetValueMultiplier(2).eq(1.5)).toBe(true)
    expect(targetValueMultiplier(3).eq(1.75)).toBe(true)
    expect(consecutiveMultiplier(2, true).eq(1.1025)).toBe(true)
    expect(criticalChance({ ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1 })).toBe(0.02)
    expect(
      criticalChance({ ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1, 'critical-chance': 500 }),
    ).toBe(1)
  })

  it('spends Points, rejects unavailable purchases, and prevents duplicate one-time purchases', () => {
    const poorGame = new GameSimulation({ initialPoints: 4 })
    expect(poorGame.purchase('target-value').kind).toBe('unaffordable')
    expect(poorGame.purchase('critical-hits').kind).toBe('hidden')

    const game = new GameSimulation({ initialPoints: 100 })
    expect(game.purchase('target-value').kind).toBe('purchased')
    expect(game.getSnapshot().points.eq(95)).toBe(true)
    expect(game.purchase('target-value').kind).toBe('purchased')
    expect(game.getSnapshot().points.eq(87)).toBe(true)
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    expect(game.purchase('critical-hits').kind).toBe('owned')
    expect(game.purchase('critical-chance').kind).toBe('purchased')
  })

  it('advances from the 10-Point goal to Critical Hits ownership', () => {
    const before = new GameSimulation({ initialPoints: 9 }).getSnapshot()
    expect(currentGoal(before).label).toBe('Earn 10 lifetime Points')
    const game = new GameSimulation({ initialPoints: 50 })
    expect(currentGoal(game.getSnapshot()).current.eq(0)).toBe(true)
    game.purchase('critical-hits')
    expect(currentGoal(game.getSnapshot()).current.eq(1)).toBe(true)
  })
})
