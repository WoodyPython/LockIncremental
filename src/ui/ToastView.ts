export interface ToastTimers {
  readonly setTimeout: (callback: () => void, milliseconds: number) => number
  readonly clearTimeout: (handle: number) => void
}

const BROWSER_TIMERS: ToastTimers = {
  setTimeout: (callback, milliseconds) => window.setTimeout(callback, milliseconds),
  clearTimeout: (handle) => {
    window.clearTimeout(handle)
  },
}

const SUCCESS_DURATION_MS = 3_000
const ERROR_DURATION_MS = 6_000
const EXIT_DURATION_MS = 220

export class ToastView {
  public readonly element: HTMLElement
  private readonly message: HTMLElement
  private timeoutHandle: number | null = null

  public constructor(private readonly timers: ToastTimers = BROWSER_TIMERS) {
    this.element = document.createElement('div')
    this.element.className = 'save-toast'
    this.element.hidden = true
    this.element.dataset.saveToast = ''
    this.element.setAttribute('role', 'status')
    this.element.setAttribute('aria-live', 'polite')
    this.element.setAttribute('aria-atomic', 'true')
    this.message = document.createElement('span')
    this.message.dataset.saveToastMessage = ''
    const closeButton = document.createElement('button')
    closeButton.type = 'button'
    closeButton.className = 'save-toast-close'
    closeButton.setAttribute('aria-label', 'Dismiss notification')
    closeButton.addEventListener('click', this.dismiss)
    this.element.append(this.message, closeButton)
  }

  public show(message: string, error = false): void {
    this.clearTimer()
    this.message.textContent = message
    this.element.classList.toggle('is-error', error)
    this.element.hidden = false
    this.element.classList.remove('is-entering', 'is-exiting')
    void this.element.offsetWidth
    this.element.classList.add('is-entering')
    this.timeoutHandle = this.timers.setTimeout(
      this.beginDismiss,
      error ? ERROR_DURATION_MS : SUCCESS_DURATION_MS,
    )
  }

  public destroy(): void {
    this.clearTimer()
    this.element.remove()
  }

  private readonly hide = (): void => {
    this.timeoutHandle = null
    this.element.classList.remove('is-entering', 'is-exiting')
    this.element.hidden = true
  }

  private readonly dismiss = (): void => {
    this.clearTimer()
    this.beginDismiss()
  }

  private readonly beginDismiss = (): void => {
    this.timeoutHandle = null
    this.element.classList.remove('is-entering')
    this.element.classList.add('is-exiting')
    this.timeoutHandle = this.timers.setTimeout(this.hide, EXIT_DURATION_MS)
  }

  private clearTimer(): void {
    if (this.timeoutHandle === null) return
    this.timers.clearTimeout(this.timeoutHandle)
    this.timeoutHandle = null
  }
}
