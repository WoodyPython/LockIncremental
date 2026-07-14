import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import { FIRST_PROGRESSION_GOAL_ID } from './goals'
import { isUnlockRequirementMet, type UnlockRequirement } from './unlocks'

describe('goal-based unlock requirements', () => {
  const firstGoalRequirement: UnlockRequirement = {
    kind: 'goal',
    goalId: FIRST_PROGRESSION_GOAL_ID,
  }

  it('unlocks features from goal completion without duplicating the goal threshold', () => {
    expect(isUnlockRequirementMet(firstGoalRequirement, { lifetimePoints: new Decimal(99) })).toBe(
      false,
    )
    expect(isUnlockRequirementMet(firstGoalRequirement, { lifetimePoints: new Decimal(100) })).toBe(
      true,
    )
  })

  it('keeps features without a requirement available', () => {
    expect(isUnlockRequirementMet(undefined, { lifetimePoints: new Decimal(0) })).toBe(true)
  })
})
