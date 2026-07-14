export class InputController {
  public constructor(
    private readonly element: HTMLElement,
    private readonly activate: () => void,
  ) {}

  public connect(): void {
    this.element.addEventListener('pointerdown', this.handlePointerDown)
    this.element.addEventListener('keydown', this.handleKeyDown)
  }

  public disconnect(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown)
    this.element.removeEventListener('keydown', this.handleKeyDown)
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    this.element.focus({ preventScroll: true })
    this.activate()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!isActivationKey(event)) return
    event.preventDefault()
    this.activate()
  }
}

export function isActivationKey(event: Pick<KeyboardEvent, 'repeat' | 'code' | 'key'>): boolean {
  return !event.repeat && (event.code === 'Space' || event.key === 'Enter')
}
