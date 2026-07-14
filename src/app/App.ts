import Decimal from 'break_infinity.js'
import { GameSimulation } from '../game/GameSimulation'
import { GOAL_REQUIREMENT, TARGET_REWARD } from '../game/constants'
import { LockRenderer } from '../rendering/LockRenderer'
import { GameLoop } from '../runtime/GameLoop'
import { InputController } from '../runtime/InputController'
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeId } from '../ui/themes'
import { createUpgradesView } from '../ui/upgradesView'
import { decimalProgress, formatDecimal } from '../utils/format'
import { GAME_NAME, GAME_VERSION } from '../version'

type TabId = 'main' | 'settings'

export class App {
  private readonly simulation = new GameSimulation()
  private renderer!: LockRenderer
  private loop!: GameLoop
  private input!: InputController
  private currencyValue!: HTMLElement
  private goalText!: HTMLElement
  private goalFill!: HTMLElement
  private liveRegion!: HTMLElement
  private lastReadout = ''

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    applyTheme(DEFAULT_THEME)
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="top-space" aria-hidden="true"></div>
          <div class="header-currency" aria-label="Current currency">
            <span>Currency</span>
            <strong data-readout="currency">0</strong>
          </div>
          <div class="header-separator" aria-hidden="true"></div>
          <nav class="tabs" aria-label="Primary navigation">
            <button class="tab is-active" type="button" data-tab="main" aria-selected="true">Main</button>
            <button class="tab" type="button" data-tab="settings" aria-selected="false">Settings</button>
          </nav>
        </header>
        <main>
          <section class="tab-panel" data-panel="main" aria-labelledby="main-heading">
            <h1 id="main-heading" class="visually-hidden">Main game</h1>
            <div class="game-stage">
              <canvas
                class="lock-canvas"
                width="600"
                height="600"
                tabindex="0"
                role="button"
                aria-label="Lock game. Activate to start, then activate when the rotating bar overlaps the target."
              ></canvas>
            </div>
            <div data-upgrades hidden></div>
          </section>
          <section class="tab-panel settings-panel" data-panel="settings" hidden aria-labelledby="settings-heading">
            <h1 id="settings-heading">Settings</h1>
            <section class="settings-section" aria-labelledby="theme-heading">
              <h2 id="theme-heading">Theme</h2>
              <div class="theme-grid" data-themes></div>
            </section>
            <div class="notice-panel">
              <h2>Persistence is coming next</h2>
              <p>Saving, import/export, autosave, notifications, and wipe controls will arrive in a later milestone.</p>
              <p>Progress and theme selection currently last for this browser session only.</p>
            </div>
          </section>
        </main>
        <footer class="status-footer">
          <div class="version">${GAME_NAME} v${GAME_VERSION} by WoodyPython</div>
          <div class="goal-track" role="progressbar" aria-label="Lifetime currency goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="goal-fill" data-goal-fill></div>
            <div class="goal-copy" data-goal-text>Earn 100 lifetime currency — 0 / 100 (0%)</div>
          </div>
        </footer>
        <div class="visually-hidden" aria-live="polite" aria-atomic="true" data-live></div>
      </div>
    `

    const canvas = this.requireElement<HTMLCanvasElement>('.lock-canvas')
    this.currencyValue = this.requireElement('[data-readout="currency"]')
    this.goalText = this.requireElement('[data-goal-text]')
    this.goalFill = this.requireElement('[data-goal-fill]')
    this.liveRegion = this.requireElement('[data-live]')
    this.requireElement('[data-upgrades]').append(createUpgradesView())
    this.renderThemeChoices()

    this.renderer = new LockRenderer(canvas)
    this.input = new InputController(canvas, this.activate)
    this.loop = new GameLoop(
      (deltaSeconds, now) => {
        const result = this.simulation.tick(deltaSeconds, now)
        if (result !== null) {
          this.renderer.showEffect('miss', now)
          this.liveRegion.textContent = `Target passed after ${result.state.hits} successful hits. Five second cooldown started.`
        }
      },
      (now) => {
        this.render(now)
      },
    )

    for (const tab of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      tab.addEventListener('click', () => {
        this.selectTab(tab.dataset.tab as TabId)
      })
    }
    this.input.connect()
    this.loop.start()
  }

  private readonly activate = (): void => {
    const now = performance.now()
    const beforeActivation = this.simulation.getSnapshot().run
    const hitAngle = beforeActivation.kind === 'active' ? beforeActivation.targetAngle : null
    const result = this.simulation.activate(now)
    if (result.kind === 'started') {
      this.liveRegion.textContent = 'Run started. Zero of twenty targets hit.'
    } else if (result.kind === 'hit') {
      this.renderer.showEffect('hit', now)
      if (hitAngle !== null) this.renderer.showGain(hitAngle, result.reward, now)
    } else if (result.kind === 'miss') {
      this.renderer.showEffect('miss', now)
      this.liveRegion.textContent = `Run failed after ${result.state.hits} successful hits. Five second cooldown started.`
    } else if (result.kind === 'completed') {
      this.renderer.showEffect('completed', now)
      if (hitAngle !== null) this.renderer.showGain(hitAngle, TARGET_REWARD, now)
      this.liveRegion.textContent = 'Run complete. Twenty-five currency earned.'
    }
    this.render(now)
  }

  private render(now: number): void {
    const snapshot = this.simulation.getSnapshot()
    this.renderer.render(snapshot, now)

    const readout = formatDecimal(snapshot.currency)
    if (readout !== this.lastReadout) {
      this.currencyValue.textContent = readout
      this.updateGoal(snapshot.lifetimeCurrency)
      this.lastReadout = readout
    }
  }

  private renderThemeChoices(): void {
    const container = this.requireElement('[data-themes]')
    for (const theme of THEMES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'theme-choice'
      button.dataset.themeChoice = theme.id
      button.setAttribute('aria-pressed', String(theme.id === DEFAULT_THEME))

      const name = document.createElement('strong')
      name.textContent = theme.name
      const description = document.createElement('span')
      description.textContent = theme.description
      button.append(name, description)
      button.addEventListener('click', () => {
        this.selectTheme(theme.id)
      })
      container.append(button)
    }
  }

  private selectTheme(theme: ThemeId): void {
    applyTheme(theme)
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme))
    }
    const selectedTheme = THEMES.find((candidate) => candidate.id === theme)
    this.liveRegion.textContent = `${selectedTheme?.name ?? 'Selected'} theme applied.`
  }

  private updateGoal(lifetimeCurrency: Decimal): void {
    const requirement = new Decimal(GOAL_REQUIREMENT)
    const progress = decimalProgress(lifetimeCurrency, requirement)
    const percent = progress * 100
    this.goalText.textContent = `Earn 100 lifetime currency — ${formatDecimal(lifetimeCurrency)} / 100 (${percent.toFixed(1)}%)`
    this.goalFill.style.width = `${percent}%`
    const track = this.requireElement('.goal-track')
    track.setAttribute('aria-valuenow', percent.toFixed(1))
  }

  private selectTab(selected: TabId): void {
    for (const tab of this.root.querySelectorAll<HTMLButtonElement>('[data-tab]')) {
      const active = tab.dataset.tab === selected
      tab.classList.toggle('is-active', active)
      tab.setAttribute('aria-selected', String(active))
    }
    for (const panel of this.root.querySelectorAll<HTMLElement>('[data-panel]')) {
      panel.hidden = panel.dataset.panel !== selected
    }
  }

  private requireElement<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (element === null) throw new Error(`Missing required element: ${selector}`)
    return element
  }
}
