import { describe, expect, it, vi } from 'vitest'

import { GameLoop, type GameLoopEnvironment } from './GameLoop'

function createEnvironment() {
  let callback: FrameRequestCallback | null = null
  let visibilityListener: (() => void) | null = null
  let hidden = false
  const environment: GameLoopEnvironment = {
    requestFrame: vi.fn((next: FrameRequestCallback): number => {
      callback = next
      return 7
    }),
    cancelFrame: vi.fn(),
    isHidden: () => hidden,
    addVisibilityListener: vi.fn((listener: () => void): void => {
      visibilityListener = listener
    }),
    removeVisibilityListener: vi.fn(),
  }
  return {
    environment,
    frame: (now: number) => callback?.(now),
    setHidden: (next: boolean) => {
      hidden = next
      visibilityListener?.()
    },
  }
}

describe('GameLoop', () => {
  it('starts and stops idempotently', () => {
    const fake = createEnvironment()
    const loop = new GameLoop(vi.fn(), vi.fn(), fake.environment)
    loop.start()
    loop.start()
    expect(fake.environment.requestFrame).toHaveBeenCalledTimes(1)
    expect(fake.environment.addVisibilityListener).toHaveBeenCalledTimes(1)
    loop.stop()
    loop.stop()
    expect(fake.environment.cancelFrame).toHaveBeenCalledTimes(1)
    expect(fake.environment.removeVisibilityListener).toHaveBeenCalledTimes(1)
  })

  it('resets elapsed time across visibility changes', () => {
    const fake = createEnvironment()
    const update = vi.fn()
    const loop = new GameLoop(update, vi.fn(), fake.environment)
    loop.start()
    fake.frame(100)
    fake.frame(150)
    expect(update).toHaveBeenLastCalledWith(0.05, 150)
    fake.setHidden(true)
    fake.frame(1_000)
    fake.setHidden(false)
    fake.frame(2_000)
    expect(update).toHaveBeenLastCalledWith(0, 2_000)
  })
})
