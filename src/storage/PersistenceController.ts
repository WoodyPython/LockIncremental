import type { DurableGameState } from '../game/GameSimulation'
import { SaveRepository } from './repository'
import { createSaveEnvelope, type GameSettings, type SaveEnvelope } from './schema'

export type SaveReason = 'manual' | 'autosave' | 'lifecycle' | 'settings' | 'import' | 'checkpoint'

export interface SaveResult {
  readonly reason: SaveReason
  readonly ok: boolean
  readonly message?: string
}

export interface PersistenceEnvironment {
  readonly setInterval: (callback: () => void, milliseconds: number) => number
  readonly clearInterval: (handle: number) => void
  readonly isDocumentHidden: () => boolean
  readonly addVisibilityListener: (callback: () => void) => void
  readonly removeVisibilityListener: (callback: () => void) => void
  readonly addPageHideListener: (callback: () => void) => void
  readonly removePageHideListener: (callback: () => void) => void
}

const BROWSER_ENVIRONMENT: PersistenceEnvironment = {
  setInterval: (callback, milliseconds) => window.setInterval(callback, milliseconds),
  clearInterval: (handle) => {
    window.clearInterval(handle)
  },
  isDocumentHidden: () => document.hidden,
  addVisibilityListener: (callback) => {
    document.addEventListener('visibilitychange', callback)
  },
  removeVisibilityListener: (callback) => {
    document.removeEventListener('visibilitychange', callback)
  },
  addPageHideListener: (callback) => {
    window.addEventListener('pagehide', callback)
  },
  removePageHideListener: (callback) => {
    window.removeEventListener('pagehide', callback)
  },
}

export class PersistenceController {
  private intervalHandle: number | null = null
  private connected = false
  private automaticWritesSuspended = false

  public constructor(
    private readonly captureGame: () => DurableGameState,
    private readonly getSettings: () => GameSettings,
    private readonly onResult: (result: SaveResult) => void,
    private readonly repository = new SaveRepository(),
    private readonly environment: PersistenceEnvironment = BROWSER_ENVIRONMENT,
  ) {}

  public connect(settings: GameSettings, automaticWritesSuspended = false): void {
    if (!this.connected) {
      this.environment.addVisibilityListener(this.handleVisibilityChange)
      this.environment.addPageHideListener(this.handlePageHide)
      this.connected = true
    }
    this.automaticWritesSuspended = automaticWritesSuspended
    this.configure(settings)
  }

  public destroy(): void {
    this.clearTimer()
    if (!this.connected) return
    this.environment.removeVisibilityListener(this.handleVisibilityChange)
    this.environment.removePageHideListener(this.handlePageHide)
    this.connected = false
  }

  public configure(settings: GameSettings): void {
    this.clearTimer()
    if (!settings.autosaveEnabled || this.automaticWritesSuspended) return
    this.intervalHandle = this.environment.setInterval(() => {
      this.persist('autosave')
    }, settings.autosaveIntervalSeconds * 1_000)
  }

  public saveNow(reason: Extract<SaveReason, 'manual' | 'settings'> = 'manual'): boolean {
    const saved = this.persist(reason, true)
    if (saved && this.automaticWritesSuspended) {
      this.automaticWritesSuspended = false
      this.configure(this.getSettings())
    }
    return saved
  }

  public checkpoint(): boolean {
    return this.persist('checkpoint')
  }

  public commitImport(envelope: SaveEnvelope): boolean {
    try {
      this.repository.save(envelope)
      this.automaticWritesSuspended = false
      this.onResult({ reason: 'import', ok: true })
      return true
    } catch {
      this.onResult({
        reason: 'import',
        ok: false,
        message: 'The imported save could not be stored.',
      })
      return false
    }
  }

  public removeSave(): boolean {
    try {
      this.repository.remove()
      this.automaticWritesSuspended = false
      return true
    } catch {
      this.onResult({
        reason: 'manual',
        ok: false,
        message: 'The saved data could not be removed.',
      })
      return false
    }
  }

  private persist(reason: SaveReason, explicit = false): boolean {
    if (this.automaticWritesSuspended && !explicit) return false
    try {
      this.repository.save(createSaveEnvelope(this.captureGame(), this.getSettings()))
      this.onResult({ reason, ok: true })
      return true
    } catch {
      this.onResult({ reason, ok: false, message: 'Progress could not be saved to this browser.' })
      return false
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.environment.isDocumentHidden()) this.persist('lifecycle')
  }

  private readonly handlePageHide = (): void => {
    this.persist('lifecycle')
  }

  private clearTimer(): void {
    if (this.intervalHandle === null) return
    this.environment.clearInterval(this.intervalHandle)
    this.intervalHandle = null
  }
}
