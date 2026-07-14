import { describe, expect, it } from 'vitest'
import { UPGRADE_DEFINITIONS, upgradesByKind } from './upgrades'

describe('upgrade definitions', () => {
  it('supports and orders repeatable upgrades before one-time upgrades', () => {
    const repeatable = upgradesByKind(UPGRADE_DEFINITIONS, 'multi-buy')
    const oneTime = upgradesByKind(UPGRADE_DEFINITIONS, 'one-time')
    expect(repeatable).toHaveLength(2)
    expect(oneTime).toHaveLength(2)
    const firstRepeatable = repeatable[0]
    const firstOneTime = oneTime[0]
    if (firstRepeatable === undefined || firstOneTime === undefined) {
      throw new Error('Expected both upgrade categories')
    }
    expect(UPGRADE_DEFINITIONS.indexOf(firstRepeatable)).toBeLessThan(
      UPGRADE_DEFINITIONS.indexOf(firstOneTime),
    )
  })
})
