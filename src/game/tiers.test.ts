import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import { EMPTY_TIER_STATISTICS, tierAvailability, tierDefinition, visibleTierIds } from './tiers'

describe('lock tier definitions and availability', () => {
  it('reveals Tier II at 10,000 lifetime Points but gates play on a Tier I Jackpot', () => {
    const hiddenState = {
      lifetimePoints: new Decimal(9_999),
      tierStatistics: EMPTY_TIER_STATISTICS,
    }
    expect(tierAvailability('tier-2', hiddenState)).toMatchObject({
      visible: false,
      playable: false,
    })
    expect(visibleTierIds(hiddenState)).toEqual(['tier-1'])

    const previewState = { ...hiddenState, lifetimePoints: new Decimal(10_000) }
    expect(tierAvailability('tier-2', previewState)).toMatchObject({
      visible: true,
      playable: false,
    })

    const playableState = {
      ...previewState,
      tierStatistics: {
        ...EMPTY_TIER_STATISTICS,
        'tier-1': { ...EMPTY_TIER_STATISTICS['tier-1'], completedRuns: 1 },
      },
    }
    expect(tierAvailability('tier-2', playableState)).toEqual({
      visible: true,
      playable: true,
      requirement: null,
    })
  })

  it('defines the requested Tier II balance', () => {
    expect(tierDefinition('tier-2')).toMatchObject({
      baseRequiredHits: 75,
      speedScalingMultiplier: 1.5,
      targetSizeMultiplier: 0.5,
      pointGainMultiplier: 2.5,
      completionMedals: 5,
      completionBonusRate: 0.5,
      directionRetentionChance: 0.5,
    })
  })
})
