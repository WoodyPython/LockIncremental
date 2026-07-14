import Decimal from 'break_infinity.js'

export type UpgradeKind = 'multi-buy' | 'one-time'

export interface UpgradeDefinition {
  readonly id: string
  readonly kind: UpgradeKind
  readonly name: string
  readonly description: string
  readonly prerequisiteIds?: readonly string[]
  readonly hiddenCurrencyRequirement?: Decimal
  readonly cost?: Decimal
  readonly effectKey?: string
  readonly unlockState: 'coming-soon'
}

export const UPGRADE_DEFINITIONS: readonly UpgradeDefinition[] = [
  {
    id: 'repeatable-slot-1',
    kind: 'multi-buy',
    name: 'Repeatable Upgrade',
    description: 'A future upgrade with levels and scaling costs.',
    unlockState: 'coming-soon',
  },
  {
    id: 'repeatable-slot-2',
    kind: 'multi-buy',
    name: 'Repeatable Upgrade',
    description: 'Unlock requirements will be revealed through play.',
    prerequisiteIds: ['repeatable-slot-1'],
    unlockState: 'coming-soon',
  },
  {
    id: 'one-time-slot-1',
    kind: 'one-time',
    name: 'One-time Upgrade',
    description: 'A permanent future improvement purchased once.',
    unlockState: 'coming-soon',
  },
  {
    id: 'one-time-slot-2',
    kind: 'one-time',
    name: 'One-time Upgrade',
    description: 'A later upgrade unlocked by earlier progress.',
    prerequisiteIds: ['one-time-slot-1'],
    unlockState: 'coming-soon',
  },
]

export function upgradesByKind(
  definitions: readonly UpgradeDefinition[],
  kind: UpgradeKind,
): readonly UpgradeDefinition[] {
  return definitions.filter((upgrade) => upgrade.kind === kind)
}
