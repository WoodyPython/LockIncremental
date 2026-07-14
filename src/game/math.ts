import { targetTravelBoundsForHits } from './constants'

export const FULL_CIRCLE = Math.PI * 2

export type Direction = 1 | -1

export function normalizeAngle(angle: number): number {
  const normalized = angle % FULL_CIRCLE
  return normalized < 0 ? normalized + FULL_CIRCLE : normalized
}

export function angularDistance(left: number, right: number): number {
  const difference = Math.abs(normalizeAngle(left) - normalizeAngle(right))
  return Math.min(difference, FULL_CIRCLE - difference)
}

export function isWithinTarget(
  markerAngle: number,
  targetAngle: number,
  tolerance: number,
): boolean {
  return angularDistance(markerAngle, targetAngle) <= tolerance
}

export function advanceAngle(
  angle: number,
  direction: Direction,
  speed: number,
  deltaSeconds: number,
): number {
  return normalizeAngle(angle + direction * speed * deltaSeconds)
}

export function placeTarget(
  markerAngle: number,
  direction: Direction,
  random: () => number,
  hits: number,
): number {
  const randomValue = Math.min(1, Math.max(0, random()))
  const bounds = targetTravelBoundsForHits(hits)
  const travel = bounds.minimum + randomValue * (bounds.maximum - bounds.minimum)
  return normalizeAngle(markerAngle + direction * travel)
}

export function directedAngularDistance(from: number, to: number, direction: Direction): number {
  return normalizeAngle((to - from) * direction)
}

export function didPassTarget(
  previousAngle: number,
  nextAngle: number,
  targetAngle: number,
  direction: Direction,
  tolerance: number,
): boolean {
  const traveled = directedAngularDistance(previousAngle, nextAngle, direction)
  const trailingEdge = normalizeAngle(targetAngle + direction * tolerance)
  const distanceToTrailingEdge = directedAngularDistance(previousAngle, trailingEdge, direction)
  return distanceToTrailingEdge <= traveled + Number.EPSILON
}
