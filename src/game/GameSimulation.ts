import Decimal from 'break_infinity.js'
import { MAX_FRAME_DELTA_SECONDS } from './constants'
import {
  activateRun,
  createIdleState,
  tickRunState,
  type ActivationResult,
  type FailedRunState,
  type RunState,
} from './RunState'

export interface GameSnapshot {
  readonly run: RunState
  readonly currency: Decimal
  readonly lifetimeCurrency: Decimal
}

export interface PassedTargetResult {
  readonly kind: 'passed-target'
  readonly state: FailedRunState
}

export class GameSimulation {
  private runState: RunState = createIdleState()
  private currentCurrency = new Decimal(0)
  private totalCurrency = new Decimal(0)

  public constructor(private readonly random: () => number = Math.random) {}

  public tick(deltaSeconds: number, now = 0): PassedTargetResult | null {
    const clampedDelta = Math.min(MAX_FRAME_DELTA_SECONDS, Math.max(0, deltaSeconds))
    const wasActive = this.runState.kind === 'active'
    this.runState = tickRunState(this.runState, clampedDelta, now)
    if (wasActive && this.runState.kind === 'failed') {
      return { kind: 'passed-target', state: this.runState }
    }
    return null
  }

  public activate(now: number): ActivationResult {
    const result = activateRun(this.runState, now, this.random)
    this.runState = result.state
    if (result.reward > 0) {
      this.currentCurrency = this.currentCurrency.plus(result.reward)
      this.totalCurrency = this.totalCurrency.plus(result.reward)
    }
    return result
  }

  public getSnapshot(): GameSnapshot {
    return {
      run: this.runState,
      currency: new Decimal(this.currentCurrency),
      lifetimeCurrency: new Decimal(this.totalCurrency),
    }
  }
}
