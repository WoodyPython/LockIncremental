import { CURRENT_SAVE_VERSION } from './schema'

export type MigrationResult =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly message: string }

export type BreakingMigration = (value: Record<string, unknown>) => Record<string, unknown>

// Versions 1 and 2 only added or removed settings. The normalizer handles those
// shapes, so no migration is needed. Add entries here only when persisted data
// is renamed, restructured, or changes meaning.
const ADDITIVE_COMPATIBLE_TRANSITIONS = new Set([1, 2])
const BREAKING_MIGRATIONS = new Map<number, BreakingMigration>()

export function migrateSave(
  value: unknown,
  migrations: ReadonlyMap<number, BreakingMigration> = BREAKING_MIGRATIONS,
): MigrationResult {
  if (!isRecord(value) || !Number.isSafeInteger(value.version)) {
    return { ok: false, message: 'The save does not contain a valid schema version.' }
  }
  let version = value.version as number
  if (version > CURRENT_SAVE_VERSION) {
    return { ok: false, message: `Save version ${version} is newer than this game supports.` }
  }
  if (version < 1) return { ok: false, message: `Save version ${version} is not supported.` }

  let migrated = value
  while (version < CURRENT_SAVE_VERSION) {
    const migration = migrations.get(version)
    if (migration !== undefined) {
      migrated = migration(migrated)
    } else if (!ADDITIVE_COMPATIBLE_TRANSITIONS.has(version)) {
      return { ok: false, message: `No migration is available for save version ${version}.` }
    }
    version += 1
    migrated.version = version
  }
  return { ok: true, value: migrated }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
