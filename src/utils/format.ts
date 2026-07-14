import Decimal from 'break_infinity.js'

const SCIENTIFIC_THRESHOLD = new Decimal(1_000_000)

export function formatDecimal(value: Decimal, maximumFractionDigits = 2): string {
  if (!Number.isFinite(value.m) || !Number.isFinite(value.e)) {
    return value.sign() < 0 ? '-∞' : '∞'
  }
  if (value.abs().gte(SCIENTIFIC_THRESHOLD)) return value.toExponential(maximumFractionDigits)

  return value.toNumber().toLocaleString('en-US', {
    maximumFractionDigits,
  })
}

export function decimalProgress(current: Decimal, requirement: Decimal): number {
  if (requirement.lte(0)) return 1
  return Math.min(1, Math.max(0, current.div(requirement).toNumber()))
}
