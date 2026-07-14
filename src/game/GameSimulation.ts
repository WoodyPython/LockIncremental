import Decimal from 'break_infinity.js'
import { MAX_FRAME_DELTA_SECONDS } from './constants'
import {
  activateRun,
  createIdleState,
  tickRunState,
  type ActivationTransition,
  type FailedRunState,
  type RunModifiers,
  type RunState,
} from './RunState'
import {
  EMPTY_UPGRADE_LEVELS,
  UPGRADE_DEFINITIONS,
  consecutiveMultiplier,
  criticalChance,
  isUpgradeVisible,
  targetValueMultiplier,
  upgradeCost,
  type UpgradeId,
  type UpgradeLevels,
} from './upgrades'

const CRITICAL_MULTIPLIER = new Decimal(5)
const MAX_CRITICAL_CHANCE_LEVEL = 196

export interface GameSnapshot {
  readonly run: RunState
  readonly points: Decimal
  readonly lifetimePoints: Decimal
  readonly upgrades: UpgradeLevels
}

export type GameTickResult =
  | { readonly kind: 'passed-target'; readonly state: FailedRunState }
  | { readonly kind: 'forgiven-miss'; readonly state: Extract<RunState, { kind: 'active' }> }
  | { readonly kind: 'invulnerable'; readonly state: Extract<RunState, { kind: 'active' }> }

export type GameActivationResult =
  | {
      readonly kind: 'started'
      readonly state: Extract<RunState, { kind: 'active' }>
      readonly reward: Decimal
    }
  | {
      readonly kind: 'hit'
      readonly state: Extract<RunState, { kind: 'active' }>
      readonly reward: Decimal
      readonly critical: boolean
    }
  | {
      readonly kind: 'completed'
      readonly state: Extract<RunState, { kind: 'completed' }>
      readonly reward: Decimal
      readonly targetReward: Decimal
      readonly completionBonus: Decimal
      readonly critical: boolean
    }
  | {
      readonly kind: 'forgiven-miss'
      readonly state: Extract<RunState, { kind: 'active' }>
      readonly reward: Decimal
    }
  | {
      readonly kind: 'invulnerable'
      readonly state: Extract<RunState, { kind: 'active' }>
      readonly reward: Decimal
    }
  | { readonly kind: 'miss'; readonly state: FailedRunState; readonly reward: Decimal }
  | { readonly kind: 'cooldown'; readonly state: FailedRunState; readonly reward: Decimal }

export type PurchaseResult =
  | { readonly kind: 'purchased'; readonly upgradeId: UpgradeId; readonly cost: Decimal }
  | { readonly kind: 'hidden' | 'unaffordable' | 'owned' | 'maxed'; readonly upgradeId: UpgradeId }

export interface GameSimulationOptions {
  readonly targetRandom?: () => number
  readonly criticalRandom?: () => number
  readonly initialPoints?: Decimal | number | string
}

export class GameSimulation {
  private runState: RunState = createIdleState()
  private currentPoints: Decimal
  private totalPoints: Decimal
  private readonly upgradeLevels: Record<UpgradeId, number> = { ...EMPTY_UPGRADE_LEVELS }
  private readonly targetRandom: () => number
  private readonly criticalRandom: () => number

  public constructor(options: GameSimulationOptions = {}) {
    this.targetRandom = options.targetRandom ?? Math.random
    this.criticalRandom = options.criticalRandom ?? Math.random
    this.currentPoints = new Decimal(options.initialPoints ?? 0)
    this.totalPoints = new Decimal(options.initialPoints ?? 0)
  }

  public tick(deltaSeconds: number, now = 0): GameTickResult | null {
    const clampedDelta = Math.min(MAX_FRAME_DELTA_SECONDS, Math.max(0, deltaSeconds))
    const transition = tickRunState(
      this.runState,
      clampedDelta,
      now,
      this.targetRandom,
      this.runModifiers(),
    )
    this.runState = transition.state
    if (
      transition.kind === 'passed-target' ||
      transition.kind === 'forgiven-miss' ||
      transition.kind === 'invulnerable'
    ) {
      return transition
    }
    return null
  }

  public activate(now: number): GameActivationResult {
    const targetBasePoints = this.nextTargetBasePoints()
    const transition = activateRun(
      this.runState,
      now,
      this.targetRandom,
      this.runModifiers(),
      targetBasePoints,
    )
    this.runState = transition.state
    return this.resolveActivation(transition, targetBasePoints)
  }

  public purchase(upgradeId: UpgradeId): PurchaseResult {
    const definition = UPGRADE_DEFINITIONS.find((candidate) => candidate.id === upgradeId)
    if (definition === undefined) return { kind: 'hidden', upgradeId }
    const snapshotLevels = this.snapshotLevels()
    if (!isUpgradeVisible(definition, snapshotLevels, this.totalPoints)) {
      return { kind: 'hidden', upgradeId }
    }
    const level = this.upgradeLevels[upgradeId]
    if (definition.kind === 'one-time' && level > 0) return { kind: 'owned', upgradeId }
    if (upgradeId === 'critical-chance' && level >= MAX_CRITICAL_CHANCE_LEVEL) {
      return { kind: 'maxed', upgradeId }
    }
    const cost = upgradeCost(definition, level)
    if (this.currentPoints.lt(cost)) return { kind: 'unaffordable', upgradeId }
    this.currentPoints = this.currentPoints.minus(cost)
    this.upgradeLevels[upgradeId] = level + 1
    if (upgradeId === 'miss-allowance' && this.runState.kind === 'active') {
      this.runState = { ...this.runState, missesRemaining: 1 }
    }
    return { kind: 'purchased', upgradeId, cost }
  }

  public getSnapshot(): GameSnapshot {
    const levels = this.snapshotLevels()
    return {
      run: this.runState,
      points: new Decimal(this.currentPoints),
      lifetimePoints: new Decimal(this.totalPoints),
      upgrades: levels,
    }
  }

  private resolveActivation(
    transition: ActivationTransition,
    targetBasePoints: Decimal,
  ): GameActivationResult {
    if (transition.kind !== 'hit' && transition.kind !== 'completed') {
      return { ...transition, reward: new Decimal(0) }
    }
    const chance = criticalChance(this.snapshotLevels())
    const critical = chance > 0 && this.criticalRandom() < chance
    const targetReward = critical ? targetBasePoints.times(CRITICAL_MULTIPLIER) : targetBasePoints
    const completionBonus =
      transition.kind === 'completed' ? transition.state.completionBonus : new Decimal(0)
    const reward = targetReward.plus(completionBonus)
    this.currentPoints = this.currentPoints.plus(reward)
    this.totalPoints = this.totalPoints.plus(reward)
    if (transition.kind === 'completed') {
      return { ...transition, reward, targetReward, completionBonus, critical }
    }
    return { ...transition, reward, critical }
  }

  private nextTargetBasePoints(): Decimal {
    const levels = this.snapshotLevels()
    const consecutiveHits = this.runState.kind === 'active' ? this.runState.consecutiveHits : 0
    return targetValueMultiplier(levels['target-value']).times(
      consecutiveMultiplier(consecutiveHits, levels['consecutive-value'] > 0),
    )
  }

  private runModifiers(): RunModifiers {
    return {
      missesPerRun: this.upgradeLevels['miss-allowance'] > 0 ? 1 : 0,
      failureCooldownMs: this.upgradeLevels['fail-cooldown'] > 0 ? 3_000 : 5_000,
      speedScalingMultiplier: this.upgradeLevels['speed-scaling'] > 0 ? 0.8 : 1,
    }
  }

  private snapshotLevels(): UpgradeLevels {
    return { ...this.upgradeLevels }
  }
}
