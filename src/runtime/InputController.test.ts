import { describe, expect, it } from 'vitest'
import { isActivationKey } from './InputController'

describe('keyboard input filtering', () => {
  it('accepts Space and Enter once', () => {
    expect(isActivationKey({ repeat: false, code: 'Space', key: ' ' })).toBe(true)
    expect(isActivationKey({ repeat: false, code: 'Enter', key: 'Enter' })).toBe(true)
  })

  it('rejects repeats and unrelated keys', () => {
    expect(isActivationKey({ repeat: true, code: 'Space', key: ' ' })).toBe(false)
    expect(isActivationKey({ repeat: false, code: 'KeyA', key: 'a' })).toBe(false)
  })
})
