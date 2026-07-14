import Decimal from 'break_infinity.js'

export function serializeDecimal(value: Decimal): string {
  return value.toString()
}

export function deserializeDecimal(value: string): Decimal | null {
  const parsed = new Decimal(value)
  return Number.isNaN(parsed.mantissa) ? null : parsed
}
