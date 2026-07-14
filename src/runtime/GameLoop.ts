export interface GameLoopEnvironment {
  readonly requestFrame: (callback: FrameRequestCallback) => number
  readonly cancelFrame: (handle: number) => void
  readonly isHidden: () => boolean
  readonly addVisibilityListener: (listener: () => void) => void
  readonly removeVisibilityListener: (listener: () => void) => void
}

const BROWSER_ENVIRONMENT: GameLoopEnvironment = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => {
    cancelAnimationFrame(handle)
  },
  isHidden: () => document.hidden,
  addVisibilityListener: (listener) => {
    document.addEventListener('visibilitychange', listener)
  },
  removeVisibilityListener: (listener) => {
    document.removeEventListener('visibilitychange', listener)
  },
}

export class GameLoop {
  private animationFrame: number | null = null
  private lastTime: number | null = null
  private running = false

  public constructor(
    private readonly update: (deltaSeconds: number, now: number) => void,
    private readonly render: (now: number) => void,
    private readonly environment: GameLoopEnvironment = BROWSER_ENVIRONMENT,
  ) {}

  public start(): void {
    if (this.running) return
    this.running = true
    this.environment.addVisibilityListener(this.handleVisibilityChange)
    this.scheduleFrame()
  }

  public stop(): void {
    if (!this.running) return
    this.running = false
    if (this.animationFrame !== null) this.environment.cancelFrame(this.animationFrame)
    this.animationFrame = null
    this.lastTime = null
    this.environment.removeVisibilityListener(this.handleVisibilityChange)
  }

  private readonly handleVisibilityChange = (): void => {
    this.lastTime = null
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return
    if (!this.environment.isHidden()) {
      const deltaSeconds = this.lastTime === null ? 0 : (now - this.lastTime) / 1_000
      this.update(deltaSeconds, now)
      this.render(now)
      this.lastTime = now
    } else {
      this.lastTime = null
    }
    this.scheduleFrame()
  }

  private scheduleFrame(): void {
    if (!this.running) return
    this.animationFrame = this.environment.requestFrame(this.frame)
  }
}
