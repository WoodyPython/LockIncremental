import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'
import { GameSimulation } from './GameSimulation'
import { EMPTY_MEDAL_UPGRADE_LEVELS } from './medalUpgrades'
import {
  EMPTY_UPGRADE_LEVELS,
  MAX_CRITICAL_CHANCE_LEVEL,
  UPGRADE_DEFINITIONS,
  consecutiveMultiplier,
  criticalChance,
  effectiveCostScale,
  isUpgradeVisible,
  pointGainMultiplier,
  quoteUpgrade,
  runModifiersForUpgrades,
  targetValueMultiplier,
  upgradeCost,
  upgradeDefinitionsByInitialCost,
  visibleOneTimeUpgradeIds,
} from './upgrades'

function definition(id: (typeof UPGRADE_DEFINITIONS)[number]['id']) {
  const result = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === id)
  if (result === undefined) throw new Error(`Missing upgrade ${id}`)
  return result
}

describe('upgrade definitions and purchases', () => {
  it('calculates both repeatable cost curves', () => {
    expect(upgradeCost(definition('target-value'), 0).eq(3)).toBe(true)
    expect(upgradeCost(definition('target-value'), 1).eq(4)).toBe(true)
    expect(upgradeCost(definition('target-value'), 2).eq(6)).toBe(true)
    expect(upgradeCost(definition('critical-chance'), 0).eq(20)).toBe(true)
    expect(upgradeCost(definition('critical-chance'), 2).eq(45)).toBe(true)
  })

  it('uses the concise critical chance upgrade copy', () => {
    expect(definition('critical-chance').description).toBe('Increase critical chance by +0.5%.')
  })

  it('reveals one-time upgrades after the first goal and crit chance after its prerequisite', () => {
    expect(isUpgradeVisible(definition('target-value'), EMPTY_UPGRADE_LEVELS, new Decimal(0))).toBe(
      true,
    )
    expect(
      isUpgradeVisible(definition('critical-hits'), EMPTY_UPGRADE_LEVELS, new Decimal(99)),
    ).toBe(false)
    expect(
      isUpgradeVisible(definition('critical-hits'), EMPTY_UPGRADE_LEVELS, new Decimal(100)),
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

  it('reveals the late Point upgrades only after Shorter Jackpot is owned', () => {
    const plenty = new Decimal('1e100')
    expect(quoteUpgrade('rapid-recovery', EMPTY_UPGRADE_LEVELS, plenty, plenty).status).toBe(
      'hidden',
    )
    const medalLevels = { ...EMPTY_MEDAL_UPGRADE_LEVELS, 'shorter-jackpot': 1 }
    expect(
      quoteUpgrade('rapid-recovery', EMPTY_UPGRADE_LEVELS, plenty, plenty, medalLevels).status,
    ).toBe('available')
    expect(
      quoteUpgrade('efficient-scaling', EMPTY_UPGRADE_LEVELS, plenty, plenty, medalLevels).status,
    ).toBe('available')
  })

  it('reveals every one-time upgrade together when the first goal completes', () => {
    expect(visibleOneTimeUpgradeIds(EMPTY_UPGRADE_LEVELS, new Decimal(99))).toEqual([])
    expect(visibleOneTimeUpgradeIds(EMPTY_UPGRADE_LEVELS, new Decimal(100))).toEqual([
      'consecutive-value',
      'miss-allowance',
      'critical-hits',
      'fail-cooldown',
      'speed-scaling',
      'double-points',
    ])
    expect(
      visibleOneTimeUpgradeIds(
        { ...EMPTY_UPGRADE_LEVELS, 'consecutive-value': 1 },
        new Decimal(100),
      ),
    ).toEqual([
      'consecutive-value',
      'miss-allowance',
      'critical-hits',
      'fail-cooldown',
      'speed-scaling',
      'double-points',
    ])
  })

  it('uses additive target levels, exponential streaks, and capped critical chance', () => {
    expect(targetValueMultiplier(1).eq(1.25)).toBe(true)
    expect(targetValueMultiplier(2).eq(1.5)).toBe(true)
    expect(targetValueMultiplier(3).eq(1.75)).toBe(true)
    expect(consecutiveMultiplier(2, true).eq(1.1025)).toBe(true)
    expect(pointGainMultiplier({ ...EMPTY_UPGRADE_LEVELS, 'double-points': 1 }).eq(2)).toBe(true)
    expect(criticalChance({ ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1 })).toBe(0.02)
    expect(
      criticalChance({ ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1, 'critical-chance': 500 }),
    ).toBe(1)
  })

  it('reduces only the growth portion of repeatable cost bases', () => {
    const efficient = { ...EMPTY_UPGRADE_LEVELS, 'efficient-scaling': 1 }
    expect(effectiveCostScale(definition('target-value'), efficient).eq(1.3)).toBe(true)
    expect(effectiveCostScale(definition('critical-chance'), efficient).eq(1.375)).toBe(true)
    expect(upgradeCost(definition('target-value'), 2, efficient).eq(5)).toBe(true)
    expect(upgradeCost(definition('critical-chance'), 2, efficient).eq(38)).toBe(true)
  })

  it('combines cooldown and miss modifiers across Point and Medal upgrades', () => {
    expect(runModifiersForUpgrades(EMPTY_UPGRADE_LEVELS).failureCooldownMs).toBe(5_000)
    expect(
      runModifiersForUpgrades({ ...EMPTY_UPGRADE_LEVELS, 'fail-cooldown': 1 }).failureCooldownMs,
    ).toBe(3_000)
    expect(
      runModifiersForUpgrades({ ...EMPTY_UPGRADE_LEVELS, 'rapid-recovery': 1 }).failureCooldownMs,
    ).toBe(2_500)
    expect(
      runModifiersForUpgrades({
        ...EMPTY_UPGRADE_LEVELS,
        'fail-cooldown': 1,
        'rapid-recovery': 1,
      }).failureCooldownMs,
    ).toBe(1_500)

    const bothMisses = runModifiersForUpgrades(
      { ...EMPTY_UPGRADE_LEVELS, 'miss-allowance': 1 },
      { ...EMPTY_MEDAL_UPGRADE_LEVELS, 'golden-safety-net': 1 },
    )
    expect(bothMisses.missesPerRun).toBe(2)
  })

  it('spends Points, rejects unavailable purchases, and prevents duplicate one-time purchases', () => {
    const poorGame = new GameSimulation({ initialPoints: 2 })
    expect(poorGame.purchase('target-value').kind).toBe('unaffordable')
    expect(poorGame.purchase('critical-hits').kind).toBe('hidden')

    const game = new GameSimulation({ initialPoints: 1_000 })
    expect(game.purchase('target-value').kind).toBe('purchased')
    expect(game.getSnapshot().points.eq(997)).toBe(true)
    expect(game.purchase('target-value').kind).toBe('purchased')
    expect(game.getSnapshot().points.eq(993)).toBe(true)
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    expect(game.purchase('critical-hits').kind).toBe('owned')
    expect(game.purchase('critical-chance').kind).toBe('purchased')
  })

  it('quotes every purchase status from the shared domain rules', () => {
    const zero = new Decimal(0)
    const plenty = new Decimal('1e100')
    expect(quoteUpgrade('target-value', EMPTY_UPGRADE_LEVELS, zero, plenty).status).toBe(
      'available',
    )
    expect(quoteUpgrade('target-value', EMPTY_UPGRADE_LEVELS, zero, zero).status).toBe(
      'unaffordable',
    )
    expect(quoteUpgrade('critical-hits', EMPTY_UPGRADE_LEVELS, zero, plenty).status).toBe('hidden')
    expect(quoteUpgrade('critical-chance', EMPTY_UPGRADE_LEVELS, plenty, plenty).status).toBe(
      'hidden',
    )
    expect(
      quoteUpgrade('critical-hits', { ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1 }, plenty, plenty)
        .status,
    ).toBe('owned')

    const unlocked = { ...EMPTY_UPGRADE_LEVELS, 'critical-hits': 1 }
    expect(
      quoteUpgrade(
        'critical-chance',
        { ...unlocked, 'critical-chance': MAX_CRITICAL_CHANCE_LEVEL - 1 },
        plenty,
        plenty,
      ).status,
    ).toBe('available')
    expect(
      quoteUpgrade(
        'critical-chance',
        { ...unlocked, 'critical-chance': MAX_CRITICAL_CHANCE_LEVEL },
        plenty,
        plenty,
      ).status,
    ).toBe('maxed')
  })

  it('allows the final critical-chance level and rejects purchases after the derived cap', () => {
    const game = new GameSimulation({ initialPoints: '1e100' })
    expect(game.purchase('critical-hits').kind).toBe('purchased')
    for (let level = 0; level < MAX_CRITICAL_CHANCE_LEVEL - 1; level += 1) {
      expect(game.purchase('critical-chance').kind).toBe('purchased')
    }
    expect(game.getSnapshot().upgrades['critical-chance']).toBe(MAX_CRITICAL_CHANCE_LEVEL - 1)
    expect(game.purchase('critical-chance').kind).toBe('purchased')
    expect(game.getSnapshot().upgrades['critical-chance']).toBe(MAX_CRITICAL_CHANCE_LEVEL)
    expect(game.purchase('critical-chance').kind).toBe('maxed')
  })

  it('sets a fixed initial card order from base costs', () => {
    expect(upgradeDefinitionsByInitialCost('multi-buy').map((upgrade) => upgrade.id)).toEqual([
      'target-value',
      'critical-chance',
    ])
    expect(upgradeDefinitionsByInitialCost('one-time').map((upgrade) => upgrade.id)).toEqual([
      'consecutive-value',
      'critical-hits',
      'fail-cooldown',
      'double-points',
      'speed-scaling',
      'miss-allowance',
      'rapid-recovery',
      'efficient-scaling',
    ])
  })
})
