export type TabId = 'main' | 'settings'

const TAB_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End'])

export class TabsController {
  private readonly tabs: readonly HTMLButtonElement[]
  private readonly panels: readonly HTMLElement[]
  private connected = false

  public constructor(private readonly root: HTMLElement) {
    this.tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    this.panels = Array.from(root.querySelectorAll<HTMLElement>('[role="tabpanel"]'))
  }

  public connect(): void {
    if (this.connected) return
    this.root.addEventListener('click', this.handleClick)
    this.root.addEventListener('keydown', this.handleKeyDown)
    this.connected = true
  }

  public destroy(): void {
    if (!this.connected) return
    this.root.removeEventListener('click', this.handleClick)
    this.root.removeEventListener('keydown', this.handleKeyDown)
    this.connected = false
  }

  public select(selected: TabId, moveFocus = false): void {
    for (const tab of this.tabs) {
      const active = tab.dataset.tab === selected
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
      tab.tabIndex = active ? 0 : -1
      if (active && moveFocus) tab.focus()
    }
    for (const panel of this.panels) panel.hidden = panel.dataset.panel !== selected
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    const tab = target.closest<HTMLButtonElement>('[role="tab"]')
    if (tab === null || !this.root.contains(tab)) return
    const id = this.tabId(tab)
    if (id !== null) this.select(id)
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!TAB_KEYS.has(event.key) || !(event.target instanceof HTMLButtonElement)) return
    const currentIndex = this.tabs.indexOf(event.target)
    if (currentIndex < 0) return
    event.preventDefault()
    let nextIndex: number
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = this.tabs.length - 1
    else {
      const offset = event.key === 'ArrowRight' ? 1 : -1
      nextIndex = (currentIndex + offset + this.tabs.length) % this.tabs.length
    }
    const nextTab = this.tabs[nextIndex]
    const id = nextTab === undefined ? null : this.tabId(nextTab)
    if (id !== null) this.select(id, true)
  }

  private tabId(tab: HTMLButtonElement): TabId | null {
    return tab.dataset.tab === 'main' || tab.dataset.tab === 'settings' ? tab.dataset.tab : null
  }
}
