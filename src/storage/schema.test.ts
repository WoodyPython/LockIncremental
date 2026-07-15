import Decimal from 'break_infinity.js'
import { describe, expect, it } from 'vitest'

import { GameSimulation } from '../game/GameSimulation'
import {
  decodePortableSave,
  decodeStoredSave,
  encodePortableSave,
  encodeStoredSave,
  MAX_DECOMPRESSED_SAVE_BYTES,
  MAX_PORTABLE_SAVE_LENGTH,
} from './codec'
import { migrateSave, type BreakingMigration } from './migrations'
import {
  createSaveEnvelope,
  DEFAULT_GAME_SETTINGS,
  hydrateGameState,
  validateSaveEnvelope,
} from './schema'

describe('save schema', () => {
  it('round-trips every durable game section and restores an idle run', () => {
    const source = new GameSimulation({ initialPoints: '1e400', initialMedals: 3 })
    const envelope = createSaveEnvelope(source.getDurableState(), DEFAULT_GAME_SETTINGS)
    const decoded = decodeStoredSave(encodeStoredSave(envelope))

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    const restored = new GameSimulation({ initialState: hydrateGameState(decoded.envelope) })
    const snapshot = restored.getSnapshot()
    expect(snapshot.points.eq('1e400')).toBe(true)
    expect(snapshot.medals.eq(3)).toBe(true)
    expect(snapshot.run.kind).toBe('idle')
    expect(snapshot.statistics).toEqual(envelope.game.statistics)
  })

  it('rejects invalid currencies, state relationships, settings, and versions', () => {
    const valid = createSaveEnvelope(new GameSimulation().getDurableState(), DEFAULT_GAME_SETTINGS)
    expect(validateSaveEnvelope({ ...valid, game: { ...valid.game, points: 'NaN' } }).ok).toBe(
      false,
    )
    expect(
      validateSaveEnvelope({
        ...valid,
        game: { ...valid.game, points: '2', lifetimePoints: '1' },
      }).ok,
    ).toBe(false)
    expect(
      validateSaveEnvelope({
        ...valid,
        settings: { ...valid.settings, autosaveIntervalSeconds: 17 },
      }).ok,
    ).toBe(false)
    expect(migrateSave({ ...valid, version: 4 })).toEqual({
      ok: false,
      message: 'Save version 4 is newer than this game supports.',
    })
  })

  it('fills missing additive fields with typed and derived defaults', () => {
    const current = createSaveEnvelope(
      new GameSimulation({ initialPoints: 12, initialMedals: 2 }).getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    const upgrades = { ...current.game.upgrades } as Record<string, number>
    const medalUpgrades = { ...current.game.medalUpgrades } as Record<string, number>
    const statistics = { ...current.game.statistics } as Record<string, number>
    delete upgrades['target-value']
    delete medalUpgrades['double-point-gain']
    delete statistics.completedRuns
    const game = {
      points: current.game.points,
      medals: current.game.medals,
      upgrades,
      medalUpgrades,
      statistics,
    }

    const decoded = decodeStoredSave(
      JSON.stringify({
        ...current,
        game,
        settings: {},
      }),
    )

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.envelope.game).toMatchObject({
      points: '12',
      lifetimePoints: '12',
      medals: '2',
      lifetimeMedals: '2',
    })
    expect(decoded.envelope.game.upgrades['target-value']).toBe(0)
    expect(decoded.envelope.game.medalUpgrades['double-point-gain']).toBe(0)
    expect(decoded.envelope.game.statistics.completedRuns).toBe(0)
    expect(decoded.envelope.game.selectedTierId).toBe('tier-1')
    expect(decoded.envelope.game.tierStatistics['tier-1']).toEqual(decoded.envelope.game.statistics)
    expect(decoded.envelope.game.tierStatistics['tier-2'].completedRuns).toBe(0)
    expect(decoded.envelope.settings).toEqual(DEFAULT_GAME_SETTINGS)
  })

  it('round-trips a revealed tier and rejects inconsistent tier state', () => {
    const base = new GameSimulation({ initialPoints: 10_000 }).getDurableState()
    const tierTwoState = {
      ...base,
      selectedTierId: 'tier-2' as const,
      tierStatistics: {
        ...base.tierStatistics,
        'tier-1': { ...base.tierStatistics['tier-1'], completedRuns: 1 },
      },
    }
    const envelope = createSaveEnvelope(tierTwoState, DEFAULT_GAME_SETTINGS)
    const validated = validateSaveEnvelope(envelope)
    expect(validated.ok).toBe(true)
    if (!validated.ok) return
    expect(hydrateGameState(validated.envelope).selectedTierId).toBe('tier-2')

    expect(
      validateSaveEnvelope({
        ...envelope,
        game: { ...envelope.game, points: '9999', lifetimePoints: '9999' },
      }).ok,
    ).toBe(false)
    expect(
      validateSaveEnvelope({
        ...envelope,
        game: {
          ...envelope.game,
          failureCooldown: {
            tierId: 'tier-1',
            remainingMs: 1_000,
            markerAngle: 0,
            targetAngle: 1,
            targetCritical: false,
            targetHalfWidth: 0.1,
            hits: 1,
            requiredHits: 50,
          },
        },
      }).ok,
    ).toBe(false)
  })

  it('defaults entirely new currencies to zero', () => {
    const current = createSaveEnvelope(
      new GameSimulation().getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    const { medals: _medals, lifetimeMedals: _lifetimeMedals, ...legacyGame } = current.game
    void _medals
    void _lifetimeMedals

    const decoded = decodeStoredSave(JSON.stringify({ ...current, game: legacyGame }))

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.envelope.game.medals).toBe('0')
    expect(decoded.envelope.game.lifetimeMedals).toBe('0')
  })

  it('drops unknown legacy fields while preserving known data', () => {
    const current = createSaveEnvelope(
      new GameSimulation().getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    const decoded = decodeStoredSave(
      JSON.stringify({
        ...current,
        removedRootField: true,
        game: { ...current.game, removedGameField: 42 },
        settings: { ...current.settings, autosaveNotificationsEnabled: false },
      }),
    )

    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.envelope).not.toHaveProperty('removedRootField')
    expect(decoded.envelope.game).not.toHaveProperty('removedGameField')
    expect(decoded.envelope.settings).not.toHaveProperty('autosaveNotificationsEnabled')
  })

  it('rejects present malformed values instead of replacing them with defaults', () => {
    const current = createSaveEnvelope(
      new GameSimulation().getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    expect(
      validateSaveEnvelope({
        ...current,
        game: { ...current.game, statistics: { ...current.game.statistics, targetsHit: 'many' } },
      }),
    ).toEqual({ ok: false, message: 'Statistic targetsHit is invalid.' })
    expect(
      validateSaveEnvelope({
        ...current,
        settings: { ...current.settings, tabNotificationsEnabled: 'yes' },
      }),
    ).toEqual({ ok: false, message: 'Tab notification setting is invalid.' })
  })

  it('normalizes version 1, 2, and 3 saves after removing autosave notifications', () => {
    const current = createSaveEnvelope(
      new GameSimulation().getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    const legacy = {
      ...current,
      version: 1,
      settings: {
        autosaveEnabled: current.settings.autosaveEnabled,
        autosaveIntervalSeconds: current.settings.autosaveIntervalSeconds,
        tabNotificationsEnabled: current.settings.tabNotificationsEnabled,
      },
    }

    const decodedV1 = decodeStoredSave(JSON.stringify(legacy))
    expect(decodedV1.ok).toBe(true)
    if (!decodedV1.ok) return
    expect(decodedV1.envelope.version).toBe(3)
    expect(decodedV1.envelope.settings).not.toHaveProperty('autosaveNotificationsEnabled')

    const decodedV2 = decodeStoredSave(
      JSON.stringify({
        ...current,
        version: 2,
        settings: { ...current.settings, autosaveNotificationsEnabled: false },
      }),
    )
    expect(decodedV2.ok).toBe(true)
    if (!decodedV2.ok) return
    expect(decodedV2.envelope.version).toBe(3)
    expect(decodedV2.envelope.settings).not.toHaveProperty('autosaveNotificationsEnabled')

    const decodedV3 = decodeStoredSave(JSON.stringify(current))
    expect(decodedV3).toEqual({ ok: true, envelope: current })
  })

  it('applies breaking migrations before additive normalization', () => {
    const current = createSaveEnvelope(
      new GameSimulation().getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    const renamePoints: BreakingMigration = (value) => {
      if (typeof value.game !== 'object' || value.game === null || Array.isArray(value.game)) {
        return value
      }
      const game = value.game as Record<string, unknown>
      return { ...value, game: { ...game, points: game.legacyPoints } }
    }
    const migrated = migrateSave(
      {
        version: 1,
        savedAt: current.savedAt,
        game: { legacyPoints: '7' },
        settings: {},
      },
      new Map([[1, renamePoints]]),
    )

    expect(migrated.ok).toBe(true)
    if (!migrated.ok) return
    const normalized = validateSaveEnvelope(migrated.value)
    expect(normalized.ok).toBe(true)
    if (!normalized.ok) return
    expect(normalized.envelope.game.points).toBe('7')
    expect(normalized.envelope.game.lifetimePoints).toBe('7')
    expect(normalized.envelope.settings).toEqual(DEFAULT_GAME_SETTINGS)
  })

  it('hydrates independent Decimal instances', () => {
    const envelope = createSaveEnvelope(
      {
        ...new GameSimulation().getDurableState(),
        points: new Decimal(42),
        lifetimePoints: new Decimal(100),
      },
      DEFAULT_GAME_SETTINGS,
    )
    const hydrated = hydrateGameState(envelope)
    expect(hydrated.points.eq(42)).toBe(true)
    expect(hydrated.lifetimePoints.eq(100)).toBe(true)
  })

  it('restores only the unelapsed portion of a failure cooldown', () => {
    const game = new GameSimulation({ targetRandom: () => 0 })
    expect(game.activate(0).kind).toBe('started')
    expect(game.activate(100).kind).toBe('miss')
    const savedAt = new Date('2026-01-01T00:00:00.000Z')
    const envelope = createSaveEnvelope(game.getDurableState(1_100), DEFAULT_GAME_SETTINGS, savedAt)
    expect(envelope.game.failureCooldown?.remainingMs).toBe(4_000)

    const restoredState = hydrateGameState(envelope, new Date('2026-01-01T00:00:01.500Z'))
    expect(restoredState.failureCooldown?.remainingMs).toBe(2_500)
    const restored = new GameSimulation({ initialState: restoredState, initialNow: 200 })
    expect(restored.getRunState()).toMatchObject({ kind: 'failed', cooldownEndsAt: 2_700 })
    expect(restored.activate(2_699).kind).toBe('cooldown')
    expect(restored.activate(2_700).kind).toBe('started')

    const expired = hydrateGameState(envelope, new Date('2026-01-01T00:00:05.000Z'))
    expect(expired.failureCooldown).toBeUndefined()
    expect(new GameSimulation({ initialState: expired }).getRunState().kind).toBe('idle')
  })

  it('turns an interrupted active run into a full failure cooldown', () => {
    const game = new GameSimulation({ targetRandom: () => 0 })
    expect(game.activate(100).kind).toBe('started')

    const savedAt = new Date('2026-01-01T00:00:00.000Z')
    const envelope = createSaveEnvelope(game.getDurableState(200), DEFAULT_GAME_SETTINGS, savedAt)
    expect(envelope.game.failureCooldown?.remainingMs).toBe(5_000)

    const restoredState = hydrateGameState(envelope, new Date('2026-01-01T00:00:01.000Z'))
    expect(restoredState.failureCooldown?.remainingMs).toBe(4_000)
    const restored = new GameSimulation({ initialState: restoredState, initialNow: 50 })
    expect(restored.getRunState()).toMatchObject({ kind: 'failed', cooldownEndsAt: 4_050 })
    expect(restored.activate(4_049).kind).toBe('cooldown')
    expect(restored.activate(4_050).kind).toBe('started')
  })
})

describe('portable compressed saves', () => {
  it('round-trips a gzip Base64URL string with the LI1 prefix', async () => {
    const envelope = createSaveEnvelope(
      new GameSimulation({ initialPoints: '1e250' }).getDurableState(),
      DEFAULT_GAME_SETTINGS,
    )
    const encoded = await encodePortableSave(envelope)
    expect(encoded).toMatch(/^LI1:[A-Za-z0-9_-]+$/u)
    expect(encoded).not.toContain('=')
    const decoded = await decodePortableSave(`  ${encoded}\n`)
    expect(decoded.ok).toBe(true)
    if (decoded.ok) expect(new Decimal(decoded.envelope.game.points).eq('1e250')).toBe(true)
  })

  it('rejects unsupported prefixes and corrupt compressed data', async () => {
    await expect(decodePortableSave('JSON:{}')).resolves.toEqual({
      ok: false,
      message: 'Portable saves must begin with LI1:',
    })
    await expect(decodePortableSave('LI1:not-gzip')).resolves.toEqual({
      ok: false,
      message: 'The portable save could not be decompressed.',
    })
    await expect(decodePortableSave('LI1:bad+base64')).resolves.toEqual({
      ok: false,
      message: 'The portable save contains invalid Base64URL data.',
    })
  })

  it('rejects oversized raw input before trimming', async () => {
    await expect(decodePortableSave(' '.repeat(MAX_PORTABLE_SAVE_LENGTH + 1))).resolves.toEqual({
      ok: false,
      message: 'The portable save is too large.',
    })
  })

  it('stops decompression when gzip output exceeds the size limit', async () => {
    const oversized = new TextEncoder().encode('x'.repeat(MAX_DECOMPRESSED_SAVE_BYTES + 1))
    const compressed = new Uint8Array(
      await new Response(
        new ReadableStream<BufferSource>({
          start(controller) {
            controller.enqueue(oversized)
            controller.close()
          },
        }).pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    )
    let binary = ''
    for (const byte of compressed) binary += String.fromCharCode(byte)
    const payload = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')

    await expect(decodePortableSave(`LI1:${payload}`)).resolves.toEqual({
      ok: false,
      message: 'The decompressed save is too large.',
    })
  })
})
