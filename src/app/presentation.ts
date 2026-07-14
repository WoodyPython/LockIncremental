import Decimal from 'break_infinity.js'

import type { GameActivationResult, GameTickResult } from '../game/GameSimulation'
import type { LockEffect } from '../rendering/LockRenderer'
import { formatDecimal } from '../utils/format'

export interface GainPresentation {
  readonly angle: number
  readonly amount: Decimal
  readonly critical: boolean
}

export interface GamePresentation {
  readonly announcement?: string
  readonly effect?: Exclude<LockEffect, null>
  readonly gain?: GainPresentation
  readonly shieldAngle?: number
  readonly economyChanged: boolean
}

export function presentActivation(
  result: GameActivationResult,
  now: number,
  hitAngle: number | null,
): GamePresentation {
  if (result.kind === 'started') {
    return {
      announcement: `Run started. Zero of ${result.state.requiredHits} targets hit.`,
      economyChanged: false,
    }
  }
  if (result.kind === 'hit') {
    return {
      announcement: result.critical
        ? `Critical hit. ${formatDecimal(result.reward)} Points earned.`
        : undefined,
      effect: result.critical ? 'critical' : 'hit',
      gain:
        hitAngle === null
          ? undefined
          : { angle: hitAngle, amount: result.reward, critical: result.critical },
      economyChanged: true,
    }
  }
  if (result.kind === 'completed') {
    return {
      announcement: `Run complete. ${formatDecimal(result.reward)} Points and ${formatDecimal(result.medalsAwarded)} Medal earned.`,
      effect: 'completed',
      gain:
        hitAngle === null
          ? undefined
          : { angle: hitAngle, amount: result.targetReward, critical: result.critical },
      economyChanged: true,
    }
  }
  if (result.kind === 'forgiven-miss') {
    return {
      announcement: 'Miss forgiven. The consecutive multiplier was reset.',
      effect: 'forgiven',
      shieldAngle: hitAngle ?? undefined,
      economyChanged: false,
    }
  }
  if (result.kind === 'invulnerable') {
    return {
      announcement: 'Second Chance invulnerability blocked the input.',
      economyChanged: false,
    }
  }
  if (result.kind === 'miss') {
    const seconds = Math.round((result.state.cooldownEndsAt - now) / 1_000)
    return {
      announcement: `Run failed after ${result.state.hits} successful hits. ${seconds} second cooldown started.`,
      effect: 'miss',
      economyChanged: false,
    }
  }
  return { economyChanged: false }
}

export function presentTick(
  result: GameTickResult,
  now: number,
  missedTargetAngle: number | null,
): GamePresentation {
  if (result.kind === 'passed-target') {
    const seconds = Math.round((result.state.cooldownEndsAt - now) / 1_000)
    return {
      announcement: `Target passed after ${result.state.hits} successful hits. ${seconds} second cooldown started.`,
      effect: 'miss',
      economyChanged: false,
    }
  }
  if (result.kind === 'forgiven-miss') {
    return {
      announcement: 'Miss forgiven. The consecutive multiplier was reset.',
      effect: 'forgiven',
      shieldAngle: missedTargetAngle ?? undefined,
      economyChanged: false,
    }
  }
  return {
    announcement: 'Second Chance invulnerability prevented another miss.',
    economyChanged: false,
  }
}
