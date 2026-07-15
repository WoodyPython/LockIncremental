export const REQUIRED_HITS = 50
export const IDLE_SPEED_RADIANS_PER_SECOND = 0.8
export const ACTIVE_BASE_SPEED_RADIANS_PER_SECOND = 2
export const ACTIVE_SPEED_INCREASE_PER_HIT = 0.075
export const TARGET_HALF_WIDTH_RADIANS = 0.14
// Rounded stroke caps and black outlines are visible parts of both shapes and
// therefore count as contact. These values cover the responsive renderer's
// maximum cap width at the minimum supported canvas size.
export const TARGET_OUTLINE_CAP_RADIANS = 0.07
export const BAR_OUTLINE_HALF_WIDTH_RADIANS = 0.065
export const HIT_TOLERANCE_RADIANS =
  TARGET_HALF_WIDTH_RADIANS + TARGET_OUTLINE_CAP_RADIANS + BAR_OUTLINE_HALF_WIDTH_RADIANS
export const INITIAL_MIN_TARGET_TRAVEL_RADIANS = Math.PI / 2
export const FINAL_MIN_TARGET_TRAVEL_RADIANS = Math.PI / 3
export const INITIAL_MAX_TARGET_TRAVEL_RADIANS = (3 * Math.PI) / 2
export const FINAL_MAX_TARGET_TRAVEL_RADIANS = Math.PI
export const MAX_FRAME_DELTA_SECONDS = 0.1
export const RESULT_COOLDOWN_MS = 5_000
export const SHIELD_RECOVERY_MS = 1_000
export const COMPLETION_CELEBRATION_MS = 3_000
export const COMPLETION_BONUS_RATE = 0.25
export const JACKPOT_MEDAL_REWARD = 1

export function hitToleranceForTargetHalfWidth(targetHalfWidth: number): number {
  return targetHalfWidth + TARGET_OUTLINE_CAP_RADIANS + BAR_OUTLINE_HALF_WIDTH_RADIANS
}

export function activeSpeedForHits(hits: number, scalingMultiplier = 1): number {
  return (
    ACTIVE_BASE_SPEED_RADIANS_PER_SECOND + hits * ACTIVE_SPEED_INCREASE_PER_HIT * scalingMultiplier
  )
}

export function targetTravelBoundsForHits(hits: number): {
  readonly minimum: number
  readonly maximum: number
} {
  const progress = Math.min(1, Math.max(0, hits / (REQUIRED_HITS - 1)))
  return {
    minimum:
      INITIAL_MIN_TARGET_TRAVEL_RADIANS +
      (FINAL_MIN_TARGET_TRAVEL_RADIANS - INITIAL_MIN_TARGET_TRAVEL_RADIANS) * progress,
    maximum:
      INITIAL_MAX_TARGET_TRAVEL_RADIANS +
      (FINAL_MAX_TARGET_TRAVEL_RADIANS - INITIAL_MAX_TARGET_TRAVEL_RADIANS) * progress,
  }
}
