import Decimal from 'break_infinity.js'

import {
  DEFAULT_GAME_STATISTICS,
  type DurableFailureCooldown,
  type DurableGameState,
  type GameStatistics,
} from '../game/GameSimulation'
import {
  EMPTY_UPGRADE_LEVELS,
  MAX_CRITICAL_CHANCE_LEVEL,
  UPGRADE_DEFINITIONS,
  type UpgradeId,
  type UpgradeLevels,
} from '../game/upgrades'
import {
  EMPTY_MEDAL_UPGRADE_LEVELS,
  MEDAL_UPGRADE_DEFINITIONS,
  type MedalUpgradeId,
  type MedalUpgradeLevels,
} from '../game/medalUpgrades'
import { RESULT_COOLDOWN_MS } from '../game/constants'
import {
  DEFAULT_TIER_ID,
  EMPTY_TIER_STATISTICS,
  TIER_DEFINITIONS,
  isTierId,
  tierAvailability,
  type TierId,
  type TierStatistics,
} from '../game/tiers'
import { deserializeDecimal, serializeDecimal } from '../utils/decimal'

export const CURRENT_SAVE_VERSION = 3 as const
export const SAVE_STORAGE_KEY = 'lock-incremental:save'

export const AUTOSAVE_INTERVALS = [15, 30, 60, 120] as const
export type AutosaveIntervalSeconds = (typeof AUTOSAVE_INTERVALS)[number]

export interface GameSettings {
  readonly autosaveEnabled: boolean
  readonly autosaveIntervalSeconds: AutosaveIntervalSeconds
  readonly tabNotificationsEnabled: boolean
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  autosaveEnabled: true,
  autosaveIntervalSeconds: 30,
  tabNotificationsEnabled: true,
}

export interface SerializedGameState {
  readonly points: string
  readonly lifetimePoints: string
  readonly medals: string
  readonly lifetimeMedals: string
  readonly upgrades: Readonly<Record<UpgradeId, number>>
  readonly medalUpgrades: Readonly<Record<MedalUpgradeId, number>>
  readonly statistics: GameStatistics
  readonly selectedTierId: TierId
  readonly tierStatistics: TierStatistics
  readonly failureCooldown?: DurableFailureCooldown
}

export const DEFAULT_SERIALIZED_GAME_STATE: SerializedGameState = {
  points: '0',
  lifetimePoints: '0',
  medals: '0',
  lifetimeMedals: '0',
  upgrades: EMPTY_UPGRADE_LEVELS,
  medalUpgrades: EMPTY_MEDAL_UPGRADE_LEVELS,
  statistics: DEFAULT_GAME_STATISTICS,
  selectedTierId: DEFAULT_TIER_ID,
  tierStatistics: EMPTY_TIER_STATISTICS,
}

export interface SaveEnvelope {
  readonly version: typeof CURRENT_SAVE_VERSION
  readonly savedAt: string
  readonly game: SerializedGameState
  readonly settings: GameSettings
}

export type SaveValidationResult =
  | { readonly ok: true; readonly envelope: SaveEnvelope }
  | { readonly ok: false; readonly message: string }

export function createSaveEnvelope(
  game: DurableGameState,
  settings: GameSettings,
  savedAt = new Date(),
): SaveEnvelope {
  return {
    version: CURRENT_SAVE_VERSION,
    savedAt: savedAt.toISOString(),
    game: {
      points: serializeDecimal(game.points),
      lifetimePoints: serializeDecimal(game.lifetimePoints),
      medals: serializeDecimal(game.medals),
      lifetimeMedals: serializeDecimal(game.lifetimeMedals),
      upgrades: { ...game.upgrades },
      medalUpgrades: { ...game.medalUpgrades },
      statistics: { ...game.statistics },
      selectedTierId: game.selectedTierId,
      tierStatistics: {
        'tier-1': { ...game.tierStatistics['tier-1'] },
        'tier-2': { ...game.tierStatistics['tier-2'] },
      },
      ...(game.failureCooldown === undefined
        ? {}
        : { failureCooldown: { ...game.failureCooldown } }),
    },
    settings: normalizeSettings(settings),
  }
}

export function hydrateGameState(envelope: SaveEnvelope, loadedAt = new Date()): DurableGameState {
  const { game } = envelope
  const elapsedMs = Math.max(0, loadedAt.getTime() - Date.parse(envelope.savedAt))
  const cooldownRemainingMs = Math.max(0, (game.failureCooldown?.remainingMs ?? 0) - elapsedMs)
  return {
    points: requireDecimal(game.points),
    lifetimePoints: requireDecimal(game.lifetimePoints),
    medals: requireDecimal(game.medals),
    lifetimeMedals: requireDecimal(game.lifetimeMedals),
    upgrades: { ...game.upgrades },
    medalUpgrades: { ...game.medalUpgrades },
    statistics: { ...game.statistics },
    selectedTierId: game.selectedTierId,
    tierStatistics: {
      'tier-1': { ...game.tierStatistics['tier-1'] },
      'tier-2': { ...game.tierStatistics['tier-2'] },
    },
    ...(game.failureCooldown === undefined || cooldownRemainingMs <= 0
      ? {}
      : {
          failureCooldown: {
            ...game.failureCooldown,
            remainingMs: cooldownRemainingMs,
          },
        }),
  }
}

export function normalizeSettings(settings: GameSettings): GameSettings {
  return {
    autosaveEnabled: settings.autosaveEnabled,
    autosaveIntervalSeconds: AUTOSAVE_INTERVALS.includes(settings.autosaveIntervalSeconds)
      ? settings.autosaveIntervalSeconds
      : DEFAULT_GAME_SETTINGS.autosaveIntervalSeconds,
    tabNotificationsEnabled: settings.tabNotificationsEnabled,
  }
}

export function validateSaveEnvelope(value: unknown): SaveValidationResult {
  if (!isRecord(value)) return invalid('The save must be an object.')
  if (value.version !== CURRENT_SAVE_VERSION) return invalid('The save version is not supported.')
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) {
    return invalid('The save timestamp is invalid.')
  }
  if (!isRecord(value.game)) return invalid('The game section is missing.')
  if (!isRecord(value.settings)) return invalid('The settings section is missing.')

  const pointsValue = valueOrDefault(value.game, 'points', DEFAULT_SERIALIZED_GAME_STATE.points)
  if (!isNonNegativeDecimalString(pointsValue)) return invalid('The points value is invalid.')
  const lifetimePointsValue = valueOrDefault(value.game, 'lifetimePoints', pointsValue)
  if (!isNonNegativeDecimalString(lifetimePointsValue)) {
    return invalid('The lifetimePoints value is invalid.')
  }
  const medalsValue = valueOrDefault(value.game, 'medals', DEFAULT_SERIALIZED_GAME_STATE.medals)
  if (!isNonNegativeDecimalString(medalsValue)) return invalid('The medals value is invalid.')
  const lifetimeMedalsValue = valueOrDefault(value.game, 'lifetimeMedals', medalsValue)
  if (!isNonNegativeDecimalString(lifetimeMedalsValue)) {
    return invalid('The lifetimeMedals value is invalid.')
  }

  const points = requireDecimal(pointsValue)
  const lifetimePoints = requireDecimal(lifetimePointsValue)
  const medals = requireDecimal(medalsValue)
  const lifetimeMedals = requireDecimal(lifetimeMedalsValue)
  if (lifetimePoints.lt(points)) return invalid('Lifetime Points cannot be below current Points.')
  if (lifetimeMedals.lt(medals)) return invalid('Lifetime Medals cannot be below current Medals.')

  const upgrades = validateUpgradeLevels(
    valueOrDefault(value.game, 'upgrades', DEFAULT_SERIALIZED_GAME_STATE.upgrades),
  )
  if (typeof upgrades === 'string') return invalid(upgrades)
  const medalUpgrades = validateMedalUpgradeLevels(
    valueOrDefault(value.game, 'medalUpgrades', DEFAULT_SERIALIZED_GAME_STATE.medalUpgrades),
  )
  if (typeof medalUpgrades === 'string') return invalid(medalUpgrades)
  const statistics = validateStatistics(
    valueOrDefault(value.game, 'statistics', DEFAULT_SERIALIZED_GAME_STATE.statistics),
  )
  if (typeof statistics === 'string') return invalid(statistics)
  const selectedTierIdValue = valueOrDefault(
    value.game,
    'selectedTierId',
    DEFAULT_SERIALIZED_GAME_STATE.selectedTierId,
  )
  if (!isTierId(selectedTierIdValue)) return invalid('The selected lock tier is invalid.')
  const tierStatistics = validateTierStatistics(value.game.tierStatistics, statistics)
  if (typeof tierStatistics === 'string') return invalid(tierStatistics)
  const selectedAvailability = tierAvailability(selectedTierIdValue, {
    lifetimePoints,
    tierStatistics,
  })
  if (!selectedAvailability.visible) return invalid('The selected lock tier has not been revealed.')
  const failureCooldown = validateFailureCooldown(value.game.failureCooldown)
  if (typeof failureCooldown === 'string') return invalid(failureCooldown)
  if (failureCooldown !== undefined) {
    if (failureCooldown.tierId !== selectedTierIdValue) {
      return invalid('Failure cooldown tier does not match the selected tier.')
    }
    const failureAvailability = tierAvailability(failureCooldown.tierId, {
      lifetimePoints,
      tierStatistics,
    })
    if (!failureAvailability.playable) {
      return invalid('Failure cooldown belongs to an unavailable tier.')
    }
  }
  const settings = validateSettings(value.settings)
  if (typeof settings === 'string') return invalid(settings)

  return {
    ok: true,
    envelope: {
      version: CURRENT_SAVE_VERSION,
      savedAt: value.savedAt,
      game: {
        points: pointsValue,
        lifetimePoints: lifetimePointsValue,
        medals: medalsValue,
        lifetimeMedals: lifetimeMedalsValue,
        upgrades,
        medalUpgrades,
        statistics,
        selectedTierId: selectedTierIdValue,
        tierStatistics,
        ...(failureCooldown === undefined ? {} : { failureCooldown }),
      },
      settings,
    },
  }
}

function validateFailureCooldown(value: unknown): DurableFailureCooldown | string | undefined {
  if (value === undefined) return undefined
  if (!isRecord(value)) return 'Failure cooldown data is invalid.'
  const tierId = valueOrDefault(value, 'tierId', DEFAULT_TIER_ID)
  if (!isTierId(tierId)) return 'Failure cooldown tier is invalid.'
  const finiteFields = ['remainingMs', 'markerAngle', 'targetAngle', 'targetHalfWidth'] as const
  for (const field of finiteFields) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      return `Failure cooldown ${field} is invalid.`
    }
  }
  if (
    (value.remainingMs as number) < 0 ||
    (value.remainingMs as number) > RESULT_COOLDOWN_MS ||
    (value.targetHalfWidth as number) <= 0 ||
    (value.targetHalfWidth as number) > Math.PI
  ) {
    return 'Failure cooldown timing or target size is invalid.'
  }
  if (typeof value.targetCritical !== 'boolean') {
    return 'Failure cooldown critical-target state is invalid.'
  }
  if (!isNonNegativeSafeInteger(value.hits) || !isNonNegativeSafeInteger(value.requiredHits)) {
    return 'Failure cooldown progress is invalid.'
  }
  if (value.requiredHits === 0 || value.hits > value.requiredHits) {
    return 'Failure cooldown progress is inconsistent.'
  }
  return {
    tierId,
    remainingMs: value.remainingMs as number,
    markerAngle: value.markerAngle as number,
    targetAngle: value.targetAngle as number,
    targetCritical: value.targetCritical,
    targetHalfWidth: value.targetHalfWidth as number,
    hits: value.hits,
    requiredHits: value.requiredHits,
  }
}

function validateTierStatistics(
  value: unknown,
  legacyStatistics: GameStatistics,
): TierStatistics | string {
  if (value === undefined) {
    return {
      'tier-1': { ...legacyStatistics },
      'tier-2': { ...EMPTY_TIER_STATISTICS['tier-2'] },
    }
  }
  if (!isRecord(value)) return 'Tier statistics are invalid.'
  const normalized = {} as Record<TierId, GameStatistics>
  for (const tier of TIER_DEFINITIONS) {
    const record = validateStatistics(value[tier.id])
    if (typeof record === 'string') return `Tier ${tier.numeral} statistics are invalid.`
    normalized[tier.id] = record
  }
  return normalized
}

function validateUpgradeLevels(value: unknown): UpgradeLevels | string {
  if (!isRecord(value)) return 'Upgrade levels are missing.'
  const levels = {} as Record<UpgradeId, number>
  for (const definition of UPGRADE_DEFINITIONS) {
    const level = valueOrDefault(value, definition.id, EMPTY_UPGRADE_LEVELS[definition.id])
    if (!isNonNegativeSafeInteger(level)) return `Upgrade ${definition.id} has an invalid level.`
    if (definition.kind === 'one-time' && level > 1) {
      return `Upgrade ${definition.id} exceeds its maximum level.`
    }
    if (definition.id === 'critical-chance' && level > MAX_CRITICAL_CHANCE_LEVEL) {
      return `Upgrade ${definition.id} exceeds its maximum level.`
    }
    levels[definition.id] = level
  }
  return levels
}

function validateMedalUpgradeLevels(value: unknown): MedalUpgradeLevels | string {
  if (!isRecord(value)) return 'Medal upgrade levels are missing.'
  const levels = {} as Record<MedalUpgradeId, number>
  for (const definition of MEDAL_UPGRADE_DEFINITIONS) {
    const level = valueOrDefault(value, definition.id, EMPTY_MEDAL_UPGRADE_LEVELS[definition.id])
    if (!isNonNegativeSafeInteger(level) || level > 1) {
      return `Medal upgrade ${definition.id} has an invalid level.`
    }
    levels[definition.id] = level
  }
  return levels
}

function validateStatistics(value: unknown): GameStatistics | string {
  if (!isRecord(value)) return 'Game statistics are missing.'
  const keys = ['runsStarted', 'targetsHit', 'bestRunHits', 'completedRuns'] as const
  const normalized = {} as Record<(typeof keys)[number], number>
  for (const key of keys) {
    const statistic = valueOrDefault(value, key, DEFAULT_GAME_STATISTICS[key])
    if (!isNonNegativeSafeInteger(statistic)) return `Statistic ${key} is invalid.`
    normalized[key] = statistic
  }
  return normalized
}

function validateSettings(value: Record<string, unknown>): GameSettings | string {
  const autosaveEnabled = valueOrDefault(
    value,
    'autosaveEnabled',
    DEFAULT_GAME_SETTINGS.autosaveEnabled,
  )
  if (typeof autosaveEnabled !== 'boolean') return 'Autosave setting is invalid.'
  const autosaveIntervalSeconds = valueOrDefault(
    value,
    'autosaveIntervalSeconds',
    DEFAULT_GAME_SETTINGS.autosaveIntervalSeconds,
  )
  if (!AUTOSAVE_INTERVALS.some((interval) => interval === autosaveIntervalSeconds)) {
    return 'Autosave interval is invalid.'
  }
  const tabNotificationsEnabled = valueOrDefault(
    value,
    'tabNotificationsEnabled',
    DEFAULT_GAME_SETTINGS.tabNotificationsEnabled,
  )
  if (typeof tabNotificationsEnabled !== 'boolean') {
    return 'Tab notification setting is invalid.'
  }
  return {
    autosaveEnabled,
    autosaveIntervalSeconds: autosaveIntervalSeconds as AutosaveIntervalSeconds,
    tabNotificationsEnabled,
  }
}

function isNonNegativeDecimalString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parsed = deserializeDecimal(value)
  return (
    parsed !== null &&
    Number.isFinite(parsed.mantissa) &&
    Number.isFinite(parsed.exponent) &&
    parsed.gte(0)
  )
}

function requireDecimal(value: string): Decimal {
  const parsed = deserializeDecimal(value)
  if (parsed === null) throw new Error('Validated Decimal could not be restored.')
  return parsed
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueOrDefault(
  value: Record<string, unknown>,
  key: string,
  defaultValue: unknown,
): unknown {
  return Object.hasOwn(value, key) ? value[key] : defaultValue
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function invalid(message: string): SaveValidationResult {
  return { ok: false, message }
}
