import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import { EMPTY_UPGRADE_LEVELS, quoteUpgrade } from '../game/upgrades'
import { upgradeButtonState } from './upgradesView'

describe('upgrade card state', () => {
  it('renders availability from the shared domain quote', () => {
    const affordable = quoteUpgrade(
      'target-value',
      EMPTY_UPGRADE_LEVELS,
      new Decimal(0),
      new Decimal(5),
    )
    expect(upgradeButtonState(affordable)).toEqual({ disabled: false, text: '5 Points' })

    const unaffordable = quoteUpgrade(
      'target-value',
      EMPTY_UPGRADE_LEVELS,
      new Decimal(0),
      new Decimal(4),
    )
    expect(upgradeButtonState(unaffordable)).toEqual({ disabled: true, text: '5 Points' })
  })
})
