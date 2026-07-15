import { describe, expect, it, vi } from 'vitest'

import { GameSimulation } from '../game/GameSimulation'
import { PersistenceController, type PersistenceEnvironment } from './PersistenceController'
import { SaveRepository, type StorageLike } from './repository'
import { DEFAULT_GAME_SETTINGS, SAVE_STORAGE_KEY, type GameSettings } from './schema'

class MemoryStorage implements StorageLike {
  public readonly values = new Map<string, string>()

  public getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  public setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  public removeItem(key: string): void {
    this.values.delete(key)
  }
}

function createEnvironment() {
  let interval: (() => void) | null = null
  let visibility: (() => void) | null = null
  let pageHide: (() => void) | null = null
  let hidden = false
  const environment: PersistenceEnvironment = {
    setInterval: vi.fn((callback: () => void, _milliseconds: number): number => {
      void _milliseconds
      interval = callback
      return 1
    }),
    clearInterval: vi.fn((_handle: number): void => {
      void _handle
    }),
    isDocumentHidden: () => hidden,
    addVisibilityListener: vi.fn((callback: () => void): void => {
      visibility = callback
    }),
    removeVisibilityListener: vi.fn((_callback: () => void): void => {
      void _callback
    }),
    addPageHideListener: vi.fn((callback: () => void): void => {
      pageHide = callback
    }),
    removePageHideListener: vi.fn((_callback: () => void): void => {
      void _callback
    }),
  }
  return {
    environment,
    runInterval: () => interval?.(),
    hide: () => {
      hidden = true
      visibility?.()
    },
    pageHide: () => pageHide?.(),
  }
}

describe('PersistenceController', () => {
  it('reschedules intervals and keeps lifecycle safety saves when autosave is disabled', () => {
    const storage = new MemoryStorage()
    const harness = createEnvironment()
    let settings: GameSettings = DEFAULT_GAME_SETTINGS
    const controller = new PersistenceController(
      () => new GameSimulation({ initialPoints: 5 }).getDurableState(),
      () => settings,
      vi.fn(),
      new SaveRepository(storage),
      harness.environment,
    )

    controller.connect(settings)
    expect(harness.environment.setInterval).toHaveBeenCalledWith(expect.any(Function), 30_000)
    harness.runInterval()
    expect(storage.values.has(SAVE_STORAGE_KEY)).toBe(true)

    storage.values.clear()
    settings = { ...settings, autosaveEnabled: false }
    controller.configure(settings)
    expect(harness.environment.clearInterval).toHaveBeenCalledWith(1)
    harness.hide()
    expect(storage.values.has(SAVE_STORAGE_KEY)).toBe(true)
    controller.destroy()
    expect(harness.environment.removeVisibilityListener).toHaveBeenCalledOnce()
    expect(harness.environment.removePageHideListener).toHaveBeenCalledOnce()
  })

  it('protects invalid startup data until an explicit save resumes automatic writes', () => {
    const storage = new MemoryStorage()
    storage.values.set(SAVE_STORAGE_KEY, 'corrupt')
    const harness = createEnvironment()
    const controller = new PersistenceController(
      () => new GameSimulation({ initialPoints: 9 }).getDurableState(),
      () => DEFAULT_GAME_SETTINGS,
      vi.fn(),
      new SaveRepository(storage),
      harness.environment,
    )

    controller.connect(DEFAULT_GAME_SETTINGS, true)
    harness.pageHide()
    expect(storage.values.get(SAVE_STORAGE_KEY)).toBe('corrupt')
    expect(controller.saveNow()).toBe(true)
    expect(storage.values.get(SAVE_STORAGE_KEY)).not.toBe('corrupt')
    expect(harness.environment.setInterval).toHaveBeenCalledOnce()
  })

  it('reports storage write failures without throwing', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: (_key) => {
        void _key
      },
    }
    const harness = createEnvironment()
    const onResult = vi.fn()
    const controller = new PersistenceController(
      () => new GameSimulation().getDurableState(),
      () => DEFAULT_GAME_SETTINGS,
      onResult,
      new SaveRepository(storage),
      harness.environment,
    )

    expect(controller.saveNow()).toBe(false)
    expect(onResult).toHaveBeenCalledWith({
      reason: 'manual',
      ok: false,
      message: 'Progress could not be saved to this browser.',
    })
  })
})

describe('SaveRepository', () => {
  it('acquires browser storage lazily and reports access failures', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('blocked')
      },
    })

    try {
      const repository = new SaveRepository()
      expect(repository.load()).toEqual({
        kind: 'unavailable',
        message: 'Browser storage is unavailable.',
      })
    } finally {
      if (descriptor === undefined) delete (globalThis as { localStorage?: Storage }).localStorage
      else Object.defineProperty(globalThis, 'localStorage', descriptor)
    }
  })
})
