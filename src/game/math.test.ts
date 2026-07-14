import { describe, expect, it } from 'vitest'
import {
  FINAL_MAX_TARGET_TRAVEL_RADIANS,
  FINAL_MIN_TARGET_TRAVEL_RADIANS,
  HIT_TOLERANCE_RADIANS,
  INITIAL_MAX_TARGET_TRAVEL_RADIANS,
  INITIAL_MIN_TARGET_TRAVEL_RADIANS,
  REQUIRED_HITS,
  activeSpeedForHits,
  targetTravelBoundsForHits,
} from './constants'
import {
  FULL_CIRCLE,
  angularDistance,
  didPassTarget,
  isWithinTarget,
  normalizeAngle,
  placeTarget,
} from './math'

describe('angular math', () => {
  it('normalizes positive and negative angles', () => {
    expect(normalizeAngle(FULL_CIRCLE + 0.5)).toBeCloseTo(0.5)
    expect(normalizeAngle(-0.5)).toBeCloseTo(FULL_CIRCLE - 0.5)
  })

  it('finds the short distance across zero', () => {
    expect(angularDistance(0.05, FULL_CIRCLE - 0.05)).toBeCloseTo(0.1)
    expect(isWithinTarget(0.05, FULL_CIRCLE - 0.05, 0.11)).toBe(true)
    expect(isWithinTarget(0.05, FULL_CIRCLE - 0.05, 0.09)).toBe(false)
  })

  it('counts visible outline contact at the edge of the hit window', () => {
    expect(isWithinTarget(0, HIT_TOLERANCE_RADIANS - 0.001, HIT_TOLERANCE_RADIANS)).toBe(true)
    expect(isWithinTarget(0, HIT_TOLERANCE_RADIANS + 0.001, HIT_TOLERANCE_RADIANS)).toBe(false)
  })

  it('places early targets farther away and later targets closer', () => {
    expect(placeTarget(0, 1, () => 0, 0)).toBeCloseTo(INITIAL_MIN_TARGET_TRAVEL_RADIANS)
    expect(placeTarget(0, 1, () => 1, 0)).toBeCloseTo(INITIAL_MAX_TARGET_TRAVEL_RADIANS)
    expect(placeTarget(0, 1, () => 0, REQUIRED_HITS - 1)).toBeCloseTo(
      FINAL_MIN_TARGET_TRAVEL_RADIANS,
    )
    expect(placeTarget(0, 1, () => 1, REQUIRED_HITS - 1)).toBeCloseTo(
      FINAL_MAX_TARGET_TRAVEL_RADIANS,
    )
  })

  it('increases speed while shrinking target travel as score rises', () => {
    expect(activeSpeedForHits(19)).toBeGreaterThan(activeSpeedForHits(0))
    const initial = targetTravelBoundsForHits(0)
    const final = targetTravelBoundsForHits(19)
    expect(final.minimum).toBeLessThan(initial.minimum)
    expect(final.maximum).toBeLessThan(initial.maximum)
  })

  it('places counter-clockwise targets ahead across zero', () => {
    expect(placeTarget(0, -1, () => 0, REQUIRED_HITS - 1)).toBeCloseTo(
      FULL_CIRCLE - FINAL_MIN_TARGET_TRAVEL_RADIANS,
    )
  })

  it('detects passing the trailing edge in either direction and across zero', () => {
    expect(didPassTarget(0.8, 1.2, 1, 1, 0.1)).toBe(true)
    expect(didPassTarget(0.8, 1.05, 1, 1, 0.1)).toBe(false)
    expect(didPassTarget(0.2, FULL_CIRCLE - 0.2, 0, -1, 0.1)).toBe(true)
  })
})
