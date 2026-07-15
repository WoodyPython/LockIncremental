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
  EMPTY_MEDAL_UPGRADE_LEVELS,
  medalPointGainMultiplier,
  quoteMedalUpgrade,
  type MedalUpgradeId,
  type MedalUpgradeLevels,
} from './medalUpgrades'
import {
  EMPTY_UPGRADE_LEVELS,
  CRITICAL_REWARD_MULTIPLIER,
  consecutiveMultiplier,
  criticalChance,
  pointGainMultiplier,
  quoteUpgrade,
  runModifiersForUpgrades,
  targetValueMultiplier,
  type UpgradeId,
  type UpgradeLevels,
} from './upgrades'

export interface GameSnapshot {
  readonly run: RunState
  readonly points: Decimal
  readonly lifetimePoints: Decimal
  readonly medals: Decimal
  readonly lifetimeMedals: Decimal
  readonly upgrades: UpgradeLevels
  readonly medalUpgrades: MedalUpgradeLevels
  readonly statistics: GameStatistics
}

export interface GameStatistics {
  readonly runsStarted: number
  readonly targetsHit: number
  readonly bestRunHits: number
  readonly completedRuns: number
}

export interface DurableFailureCooldown {
  readonly remainingMs: number
  readonly markerAngle: number
  readonly targetAngle: number
  readonly targetCritical: boolean
  readonly targetHalfWidth: number
  readonly hits: number
  readonly requiredHits: number
}

export interface DurableGameState {
  readonly points: Decimal
  readonly lifetimePoints: Decimal
  readonly medals: Decimal
  readonly lifetimeMedals: Decimal
  readonly upgrades: UpgradeLevels
  readonly medalUpgrades: MedalUpgradeLevels
  readonly statistics: GameStatistics
  readonly failureCooldown?: DurableFailureCooldown
}

export const DEFAULT_GAME_STATISTICS: GameStatistics = {
  runsStarted: 0,
  targetsHit: 0,
  bestRunHits: 0,
  completedRuns: 0,
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
      readonly medalsAwarded: Decimal
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

export type MedalPurchaseResult =
  | { readonly kind: 'purchased'; readonly upgradeId: MedalUpgradeId; readonly cost: Decimal }
  | { readonly kind: 'unaffordable' | 'owned'; readonly upgradeId: MedalUpgradeId }

export interface GameSimulationOptions {
  readonly targetRandom?: () => number
  readonly criticalRandom?: () => number
  readonly initialPoints?: Decimal | number | string
  readonly initialLifetimePoints?: Decimal | number | string
  readonly initialMedals?: Decimal | number | string
  readonly initialLifetimeMedals?: Decimal | number | string
  readonly initialState?: DurableGameState
  readonly initialNow?: number
}

export class GameSimulation {
  private runState: RunState = createIdleState()
  private currentPoints: Decimal
  private totalPoints: Decimal
  private currentMedals: Decimal
  private totalMedals: Decimal
  private readonly upgradeLevels: Record<UpgradeId, number> = { ...EMPTY_UPGRADE_LEVELS }
  private readonly medalUpgradeLevels: Record<MedalUpgradeId, number> = {
    ...EMPTY_MEDAL_UPGRADE_LEVELS,
  }
  private statistics: GameStatistics = { ...DEFAULT_GAME_STATISTICS }
  private readonly targetRandom: () => number
  private readonly criticalRandom: () => number

  public constructor(options: GameSimulationOptions = {}) {
    this.targetRandom = options.targetRandom ?? Math.random
    this.criticalRandom = options.criticalRandom ?? Math.random
    if (options.initialState !== undefined) {
      const state = options.initialState
      this.currentPoints = new Decimal(state.points)
      this.totalPoints = new Decimal(state.lifetimePoints)
      this.currentMedals = new Decimal(state.medals)
      this.totalMedals = new Decimal(state.lifetimeMedals)
      Object.assign(this.upgradeLevels, state.upgrades)
      Object.assign(this.medalUpgradeLevels, state.medalUpgrades)
      this.statistics = { ...state.statistics }
      if (state.failureCooldown !== undefined && state.failureCooldown.remainingMs > 0) {
        this.runState = {
          kind: 'failed',
          markerAngle: state.failureCooldown.markerAngle,
          targetAngle: state.failureCooldown.targetAngle,
          targetCritical: state.failureCooldown.targetCritical,
          targetHalfWidth: state.failureCooldown.targetHalfWidth,
          hits: state.failureCooldown.hits,
          requiredHits: state.failureCooldown.requiredHits,
          cooldownEndsAt: (options.initialNow ?? 0) + state.failureCooldown.remainingMs,
        }
      }
      return
    }
    this.currentPoints = new Decimal(options.initialPoints ?? 0)
    this.totalPoints = new Decimal(options.initialLifetimePoints ?? options.initialPoints ?? 0)
    this.currentMedals = new Decimal(options.initialMedals ?? 0)
    this.totalMedals = new Decimal(options.initialLifetimeMedals ?? options.initialMedals ?? 0)
  }

  public tick(deltaSeconds: number, now = 0): GameTickResult | null {
    const clampedDelta = Math.min(MAX_FRAME_DELTA_SECONDS, Math.max(0, deltaSeconds))
    const transition = tickRunState(
      this.runState,
      clampedDelta,
      now,
      this.targetRandom,
      this.runModifiers(),
      this.rollCriticalTarget,
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
    const targetCritical = this.runState.kind === 'active' && this.runState.targetCritical
    const transition = activateRun(
      this.runState,
      now,
      this.targetRandom,
      this.runModifiers(),
      targetBasePoints,
      this.rollCriticalTarget,
    )
    this.runState = transition.state
    this.recordTransition(transition)
    return this.resolveActivation(transition, targetBasePoints, targetCritical)
  }

  public purchase(upgradeId: UpgradeId): PurchaseResult {
    const snapshotLevels = this.snapshotLevels()
    const quote = quoteUpgrade(
      upgradeId,
      snapshotLevels,
      this.totalPoints,
      this.currentPoints,
      this.medalUpgradeLevels,
    )
    if (quote.status !== 'available') return { kind: quote.status, upgradeId }
    this.currentPoints = this.currentPoints.minus(quote.cost)
    this.upgradeLevels[upgradeId] = quote.level + 1
    if (upgradeId === 'miss-allowance' && this.runState.kind === 'active') {
      this.runState = { ...this.runState, missesRemaining: this.runState.missesRemaining + 1 }
    }
    return { kind: 'purchased', upgradeId, cost: quote.cost }
  }

  public purchaseMedalUpgrade(upgradeId: MedalUpgradeId): MedalPurchaseResult {
    const quote = quoteMedalUpgrade(upgradeId, this.medalUpgradeLevels, this.currentMedals)
    if (quote.status !== 'available') return { kind: quote.status, upgradeId }
    this.currentMedals = this.currentMedals.minus(quote.definition.cost)
    this.medalUpgradeLevels[upgradeId] = quote.level + 1
    return { kind: 'purchased', upgradeId, cost: new Decimal(quote.definition.cost) }
  }

  public getRunState(): RunState {
    return this.runState
  }

  public getSnapshot(): GameSnapshot {
    const levels = this.snapshotLevels()
    return {
      run: this.runState,
      points: new Decimal(this.currentPoints),
      lifetimePoints: new Decimal(this.totalPoints),
      medals: new Decimal(this.currentMedals),
      lifetimeMedals: new Decimal(this.totalMedals),
      upgrades: levels,
      medalUpgrades: { ...this.medalUpgradeLevels },
      statistics: { ...this.statistics },
    }
  }

  public getDurableState(now = 0): DurableGameState {
    let failureCooldown: DurableFailureCooldown | undefined
    if (this.runState.kind === 'failed') {
      const remainingMs = Math.max(0, this.runState.cooldownEndsAt - now)
      if (remainingMs > 0) {
        failureCooldown = {
          remainingMs,
          markerAngle: this.runState.markerAngle,
          targetAngle: this.runState.targetAngle,
          targetCritical: this.runState.targetCritical,
          targetHalfWidth: this.runState.targetHalfWidth,
          hits: this.runState.hits,
          requiredHits: this.runState.requiredHits,
        }
      }
    } else if (this.runState.kind === 'active') {
      failureCooldown = {
        remainingMs: this.runModifiers().failureCooldownMs,
        markerAngle: this.runState.markerAngle,
        targetAngle: this.runState.targetAngle,
        targetCritical: this.runState.targetCritical,
        targetHalfWidth: this.runState.targetHalfWidth,
        hits: this.runState.hits,
        requiredHits: this.runState.requiredHits,
      }
    }
    return {
      points: new Decimal(this.currentPoints),
      lifetimePoints: new Decimal(this.totalPoints),
      medals: new Decimal(this.currentMedals),
      lifetimeMedals: new Decimal(this.totalMedals),
      upgrades: this.snapshotLevels(),
      medalUpgrades: { ...this.medalUpgradeLevels },
      statistics: { ...this.statistics },
      ...(failureCooldown === undefined ? {} : { failureCooldown }),
    }
  }

  private resolveActivation(
    transition: ActivationTransition,
    targetBasePoints: Decimal,
    critical: boolean,
  ): GameActivationResult {
    if (transition.kind !== 'hit' && transition.kind !== 'completed') {
      return { ...transition, reward: new Decimal(0) }
    }
    const targetReward = critical
      ? targetBasePoints.times(CRITICAL_REWARD_MULTIPLIER)
      : targetBasePoints
    const completionBonus =
      transition.kind === 'completed' ? transition.state.completionBonus : new Decimal(0)
    const reward = targetReward.plus(completionBonus)
    this.currentPoints = this.currentPoints.plus(reward)
    this.totalPoints = this.totalPoints.plus(reward)
    if (transition.kind === 'completed') {
      const medalsAwarded = new Decimal(transition.state.medalsAwarded)
      this.currentMedals = this.currentMedals.plus(medalsAwarded)
      this.totalMedals = this.totalMedals.plus(medalsAwarded)
      return { ...transition, reward, targetReward, completionBonus, medalsAwarded, critical }
    }
    return { ...transition, reward, critical }
  }

  private nextTargetBasePoints(): Decimal {
    const levels = this.snapshotLevels()
    const consecutiveHits = this.runState.kind === 'active' ? this.runState.consecutiveHits : 0
    return targetValueMultiplier(levels['target-value'])
      .times(consecutiveMultiplier(consecutiveHits, levels['consecutive-value'] > 0))
      .times(pointGainMultiplier(levels))
      .times(medalPointGainMultiplier(this.medalUpgradeLevels))
  }

  private readonly rollCriticalTarget = (): boolean => {
    const chance = criticalChance(this.upgradeLevels)
    return chance > 0 && this.criticalRandom() < chance
  }

  private recordTransition(transition: ActivationTransition): void {
    if (transition.kind === 'started') {
      this.statistics = {
        ...this.statistics,
        runsStarted: this.statistics.runsStarted + 1,
      }
      return
    }
    if (transition.kind !== 'hit' && transition.kind !== 'completed') return
    this.statistics = {
      ...this.statistics,
      targetsHit: this.statistics.targetsHit + 1,
      bestRunHits: Math.max(this.statistics.bestRunHits, transition.state.hits),
      completedRuns: this.statistics.completedRuns + (transition.kind === 'completed' ? 1 : 0),
    }
  }

  private runModifiers(): RunModifiers {
    return runModifiersForUpgrades(this.upgradeLevels, this.medalUpgradeLevels)
  }

  private snapshotLevels(): UpgradeLevels {
    return { ...this.upgradeLevels }
  }
}
