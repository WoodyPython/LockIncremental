import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import { EMPTY_UPGRADE_LEVELS, quoteUpgrade } from '../game/upgrades'
import { EMPTY_MEDAL_UPGRADE_LEVELS, quoteMedalUpgrade } from '../game/medalUpgrades'
import { medalUpgradeButtonState, upgradeButtonState } from './upgradesView'

describe('upgrade card state', () => {
  it('renders availability from the shared domain quote', () => {
    const affordable = quoteUpgrade(
      'target-value',
      EMPTY_UPGRADE_LEVELS,
      new Decimal(0),
      new Decimal(5),
    )
    expect(upgradeButtonState(affordable)).toEqual({ disabled: false, text: '3 Points' })

    const unaffordable = quoteUpgrade(
      'target-value',
      EMPTY_UPGRADE_LEVELS,
      new Decimal(0),
      new Decimal(2),
    )
    expect(upgradeButtonState(unaffordable)).toEqual({ disabled: true, text: '3 Points' })
  })

  it('renders Medal costs without describing purchase frequency', () => {
    const available = quoteMedalUpgrade(
      'double-point-gain',
      EMPTY_MEDAL_UPGRADE_LEVELS,
      new Decimal(1),
    )
    expect(medalUpgradeButtonState(available)).toEqual({ disabled: false, text: '1 Medal' })
  })
})
