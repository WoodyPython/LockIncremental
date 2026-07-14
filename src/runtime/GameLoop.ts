export class GameLoop {
  private animationFrame: number | null = null
  private lastTime: number | null = null

  public constructor(
    private readonly update: (deltaSeconds: number, now: number) => void,
    private readonly render: (now: number) => void,
  ) {}

  public start(): void {
    if (this.animationFrame !== null) return
    document.addEventListener('visibilitychange', this.handleVisibilityChange)
    this.animationFrame = requestAnimationFrame(this.frame)
  }

  public stop(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame)
    this.animationFrame = null
    this.lastTime = null
    document.removeEventListener('visibilitychange', this.handleVisibilityChange)
  }

  private readonly handleVisibilityChange = (): void => {
    this.lastTime = null
  }

  private readonly frame = (now: number): void => {
    if (!document.hidden) {
      const deltaSeconds = this.lastTime === null ? 0 : (now - this.lastTime) / 1_000
      this.update(deltaSeconds, now)
      this.render(now)
      this.lastTime = now
    } else {
      this.lastTime = null
    }
    this.animationFrame = requestAnimationFrame(this.frame)
  }
}
