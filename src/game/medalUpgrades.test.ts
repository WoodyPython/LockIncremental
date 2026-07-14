import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import {
  EMPTY_MEDAL_UPGRADE_LEVELS,
  medalMissesPerRun,
  medalPointGainMultiplier,
  medalRequiredHits,
  medalTargetHalfWidth,
  medalUpgradeDefinitionsByCost,
  quoteMedalUpgrade,
} from './medalUpgrades'
import { REQUIRED_HITS, TARGET_HALF_WIDTH_RADIANS } from './constants'

describe('Medal upgrades', () => {
  it('quotes affordability and ownership from the Medal balance', () => {
    expect(
      quoteMedalUpgrade('double-point-gain', EMPTY_MEDAL_UPGRADE_LEVELS, new Decimal(0)).status,
    ).toBe('unaffordable')
    expect(
      quoteMedalUpgrade('double-point-gain', EMPTY_MEDAL_UPGRADE_LEVELS, new Decimal(1)).status,
    ).toBe('available')
    expect(
      quoteMedalUpgrade(
        'double-point-gain',
        { ...EMPTY_MEDAL_UPGRADE_LEVELS, 'double-point-gain': 1 },
        new Decimal(0),
      ).status,
    ).toBe('owned')
  })

  it('doubles Point gains only after purchase', () => {
    expect(medalPointGainMultiplier(EMPTY_MEDAL_UPGRADE_LEVELS).eq(1)).toBe(true)
    expect(
      medalPointGainMultiplier({ ...EMPTY_MEDAL_UPGRADE_LEVELS, 'double-point-gain': 1 }).eq(2),
    ).toBe(true)
  })

  it('keeps a stable increasing-cost card order', () => {
    expect(medalUpgradeDefinitionsByCost().map(({ id, cost }) => [id, cost.toNumber()])).toEqual([
      ['double-point-gain', 1],
      ['larger-targets', 1],
      ['shorter-jackpot', 2],
      ['golden-safety-net', 3],
      ['jackpot-mastery', 5],
      ['research', 10],
    ])
  })

  it('combines target size and Jackpot reductions additively', () => {
    expect(medalTargetHalfWidth(EMPTY_MEDAL_UPGRADE_LEVELS)).toBe(TARGET_HALF_WIDTH_RADIANS)
    expect(
      medalTargetHalfWidth({ ...EMPTY_MEDAL_UPGRADE_LEVELS, 'larger-targets': 1 }),
    ).toBeCloseTo(TARGET_HALF_WIDTH_RADIANS * 1.25)
    expect(
      medalTargetHalfWidth({
        ...EMPTY_MEDAL_UPGRADE_LEVELS,
        'larger-targets': 1,
        'jackpot-mastery': 1,
      }),
    ).toBeCloseTo(TARGET_HALF_WIDTH_RADIANS * 1.5)

    expect(medalRequiredHits(EMPTY_MEDAL_UPGRADE_LEVELS)).toBe(REQUIRED_HITS)
    expect(medalRequiredHits({ ...EMPTY_MEDAL_UPGRADE_LEVELS, 'shorter-jackpot': 1 })).toBe(45)
    expect(medalRequiredHits({ ...EMPTY_MEDAL_UPGRADE_LEVELS, 'jackpot-mastery': 1 })).toBe(45)
    expect(
      medalRequiredHits({
        ...EMPTY_MEDAL_UPGRADE_LEVELS,
        'shorter-jackpot': 1,
        'jackpot-mastery': 1,
      }),
    ).toBe(40)
  })

  it('adds one independent miss allowance', () => {
    expect(medalMissesPerRun(EMPTY_MEDAL_UPGRADE_LEVELS)).toBe(0)
    expect(medalMissesPerRun({ ...EMPTY_MEDAL_UPGRADE_LEVELS, 'golden-safety-net': 1 })).toBe(1)
  })
})
