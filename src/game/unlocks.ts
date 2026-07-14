import { isGoalComplete, type GoalId, type GoalState } from './goals'

export interface UnlockRequirement {
  readonly kind: 'goal'
  readonly goalId: GoalId
}

export function isUnlockRequirementMet(
  requirement: UnlockRequirement | undefined,
  state: GoalState,
): boolean {
  if (requirement === undefined) return true
  return isGoalComplete(requirement.goalId, state)
}
