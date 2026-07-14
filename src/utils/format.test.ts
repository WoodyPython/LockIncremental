import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'
import { decimalProgress, formatDecimal } from './format'
import { deserializeDecimal, serializeDecimal } from './decimal'

describe('Decimal utilities', () => {
  it('formats ordinary and extremely large values', () => {
    expect(formatDecimal(new Decimal(0))).toBe('0')
    expect(formatDecimal(new Decimal(-12.5))).toBe('-12.5')
    expect(formatDecimal(new Decimal(999_999))).toBe('999,999')
    expect(formatDecimal(new Decimal('1e1000'))).toBe('1.00e+1000')
  })

  it('round-trips stable serialized values', () => {
    const value = new Decimal('1.2345e400')
    expect(deserializeDecimal(serializeDecimal(value))?.eq(value)).toBe(true)
    expect(deserializeDecimal('not-a-number')).toBeNull()
  })

  it('clamps progress to the visual range', () => {
    expect(decimalProgress(new Decimal(-5), new Decimal(100))).toBe(0)
    expect(decimalProgress(new Decimal(25), new Decimal(100))).toBe(0.25)
    expect(decimalProgress(new Decimal(150), new Decimal(100))).toBe(1)
  })
})
