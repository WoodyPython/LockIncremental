import Decimal from 'break_infinity.js'

export const FIRST_PROGRESSION_GOAL_ID = 'lifetime-points-100'
export const FINAL_PROGRESSION_GOAL_ID = 'lifetime-points-1000'

export type GoalId = typeof FIRST_PROGRESSION_GOAL_ID | typeof FINAL_PROGRESSION_GOAL_ID

export interface GoalState {
  readonly lifetimePoints: Decimal
}

export interface GoalProgress {
  readonly label: string
  readonly current: Decimal
  readonly requirement: Decimal
  readonly showNumbers: boolean
}

export interface GoalDefinition {
  readonly id: GoalId
  readonly label: string
  readonly showNumbers: boolean
  readonly progress: (state: GoalState) => {
    readonly current: Decimal
    readonly requirement: Decimal
  }
  readonly isComplete: (state: GoalState) => boolean
}

const ONE_HUNDRED_POINTS = new Decimal(100)
const ONE_THOUSAND_POINTS = new Decimal(1_000)

export const GOAL_DEFINITIONS: readonly GoalDefinition[] = [
  {
    id: FIRST_PROGRESSION_GOAL_ID,
    label: 'Earn 100 lifetime Points',
    showNumbers: true,
    progress: (snapshot) => ({
      current: snapshot.lifetimePoints,
      requirement: ONE_HUNDRED_POINTS,
    }),
    isComplete: (snapshot) => snapshot.lifetimePoints.gte(ONE_HUNDRED_POINTS),
  },
  {
    id: FINAL_PROGRESSION_GOAL_ID,
    label: 'Earn 1,000 lifetime Points',
    showNumbers: true,
    progress: (snapshot) => ({
      current: snapshot.lifetimePoints,
      requirement: ONE_THOUSAND_POINTS,
    }),
    isComplete: (snapshot) => snapshot.lifetimePoints.gte(ONE_THOUSAND_POINTS),
  },
]

export function isGoalComplete(goalId: GoalId, state: GoalState): boolean {
  const definition = GOAL_DEFINITIONS.find((candidate) => candidate.id === goalId)
  if (definition === undefined) throw new Error(`Unknown progression goal: ${goalId}`)
  return definition.isComplete(state)
}

export function currentGoal(snapshot: GoalState): GoalProgress {
  const definition =
    GOAL_DEFINITIONS.find((candidate) => !candidate.isComplete(snapshot)) ?? GOAL_DEFINITIONS.at(-1)
  if (definition === undefined) throw new Error('At least one progression goal is required.')
  return {
    ...definition.progress(snapshot),
    label: definition.label,
    showNumbers: definition.showNumbers,
  }
}
