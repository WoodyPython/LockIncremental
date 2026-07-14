import { describe, expect, it } from 'vitest'

import { GameSimulation } from './GameSimulation'
import { GOAL_DEFINITIONS, currentGoal } from './goals'

describe('progression goals', () => {
  it('uses ordered data definitions for initial lifetime progress', () => {
    expect(GOAL_DEFINITIONS.map((goal) => goal.id)).toEqual([
      'lifetime-points-100',
      'lifetime-points-1000',
    ])
    const goal = currentGoal(new GameSimulation({ initialPoints: 99 }).getSnapshot())
    expect(goal.label).toBe('Earn 100 lifetime Points')
    expect(goal.current.eq(99)).toBe(true)
    expect(goal.requirement.eq(100)).toBe(true)
    expect(goal.showNumbers).toBe(true)
  })

  it('advances to 1,000 lifetime Points and retains its completed terminal state', () => {
    const second = currentGoal(new GameSimulation({ initialPoints: 999 }).getSnapshot())
    expect(second.label).toBe('Earn 1,000 lifetime Points')
    expect(second.current.eq(999)).toBe(true)
    expect(second.requirement.eq(1_000)).toBe(true)

    const completed = currentGoal(new GameSimulation({ initialPoints: 1_000 }).getSnapshot())
    expect(completed.label).toBe('Earn 1,000 lifetime Points')
    expect(completed.current.eq(1_000)).toBe(true)
    expect(completed.showNumbers).toBe(true)
  })
})
