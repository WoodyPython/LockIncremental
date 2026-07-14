import Decimal from 'break_infinity.js'
import type { GameSnapshot } from './GameSimulation'

export interface GoalProgress {
  readonly label: string
  readonly current: Decimal
  readonly requirement: Decimal
  readonly showNumbers: boolean
}

export function currentGoal(snapshot: GameSnapshot): GoalProgress {
  if (snapshot.lifetimePoints.lt(10)) {
    return {
      label: 'Earn 10 lifetime Points',
      current: snapshot.lifetimePoints,
      requirement: new Decimal(10),
      showNumbers: true,
    }
  }
  return {
    label: 'Unlock Critical Hits',
    current: new Decimal(snapshot.upgrades['critical-hits'] > 0 ? 1 : 0),
    requirement: new Decimal(1),
    showNumbers: false,
  }
}
