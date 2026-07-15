export class InputController {
  private hovered = false

  public constructor(
    private readonly element: HTMLElement,
    private readonly activate: () => void,
  ) {}

  public connect(): void {
    this.element.addEventListener('pointerdown', this.handlePointerDown)
    this.element.addEventListener('pointerenter', this.handlePointerEnter)
    this.element.addEventListener('pointerleave', this.handlePointerLeave)
    this.element.ownerDocument.addEventListener('keydown', this.handleKeyDown)
  }

  public disconnect(): void {
    this.element.removeEventListener('pointerdown', this.handlePointerDown)
    this.element.removeEventListener('pointerenter', this.handlePointerEnter)
    this.element.removeEventListener('pointerleave', this.handlePointerLeave)
    this.element.ownerDocument.removeEventListener('keydown', this.handleKeyDown)
    this.hovered = false
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!event.isPrimary || event.button !== 0) return
    event.preventDefault()
    this.element.focus({ preventScroll: true })
    this.activate()
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!isActivationKey(event)) return
    const focused = this.element.ownerDocument.activeElement === this.element
    if (!focused && (!this.hovered || isInteractiveTarget(event.target))) return
    event.preventDefault()
    this.activate()
  }

  private readonly handlePointerEnter = (): void => {
    this.hovered = true
  }

  private readonly handlePointerLeave = (): void => {
    this.hovered = false
  }
}

export function isActivationKey(event: Pick<KeyboardEvent, 'repeat' | 'code' | 'key'>): boolean {
  return !event.repeat && (event.code === 'Space' || event.key === 'Enter')
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest('button, input, textarea, select, a[href], [contenteditable="true"]') !== null
  )
}
