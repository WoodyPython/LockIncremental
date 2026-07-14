import { GameSimulation, type GameSnapshot } from '../game/GameSimulation'
import { currentGoal } from '../game/goals'
import { LockRenderer } from '../rendering/LockRenderer'
import { GameLoop } from '../runtime/GameLoop'
import { InputController } from '../runtime/InputController'
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeId } from '../ui/themes'
import { UpgradesView } from '../ui/upgradesView'
import { decimalProgress, formatDecimal } from '../utils/format'
import { GAME_NAME, GAME_VERSION } from '../version'
import { presentActivation, presentTick, type GamePresentation } from './presentation'
import { TabsController } from './tabs'

export class App {
  private readonly simulation = new GameSimulation()
  private renderer: LockRenderer | null = null
  private loop: GameLoop | null = null
  private input: InputController | null = null
  private tabs: TabsController | null = null
  private pointsValue!: HTMLElement
  private medalsValue!: HTMLElement
  private resourceRow!: HTMLElement
  private mainContent!: HTMLElement
  private goalText!: HTMLElement
  private goalFill!: HTMLElement
  private liveRegion!: HTMLElement
  private upgradesView!: UpgradesView

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    if (this.loop !== null) return
    applyTheme(DEFAULT_THEME)
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="top-space" aria-hidden="true"></div>
          <nav class="tabs" role="tablist" aria-label="Primary navigation">
            <button id="tab-main" class="tab is-active" type="button" role="tab" data-tab="main" aria-selected="true" aria-controls="panel-main" tabindex="0">Main</button>
            <button id="tab-settings" class="tab" type="button" role="tab" data-tab="settings" aria-selected="false" aria-controls="panel-settings" tabindex="-1">Settings</button>
          </nav>
        </header>
        <main class="main-content">
          <section id="panel-main" class="tab-panel" role="tabpanel" data-panel="main" aria-labelledby="tab-main">
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
            <div class="progression-resources" data-resources>
              <div class="progression-points" aria-label="Current Points">
                <strong data-readout="points">0</strong>
                <span>Points</span>
              </div>
              <div class="progression-medals" aria-label="Current Medals" aria-hidden="true" data-medal-readout>
                <strong data-readout="medals">0</strong>
                <span>Medals</span>
              </div>
            </div>
            <div class="progression-separator" data-upgrades-divider aria-hidden="true"></div>
            <div data-upgrades></div>
          </section>
          <section id="panel-settings" class="tab-panel settings-panel" role="tabpanel" data-panel="settings" hidden aria-labelledby="tab-settings">
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
          <div class="goal-track" role="progressbar" aria-label="Progression goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="goal-fill" data-goal-fill></div>
            <div class="goal-copy" data-goal-text>Earn 100 lifetime Points — 0 / 100 (0%)</div>
          </div>
        </footer>
        <div class="visually-hidden" aria-live="polite" aria-atomic="true" data-live></div>
      </div>
    `

    const canvas = this.requireElement<HTMLCanvasElement>('.lock-canvas')
    this.pointsValue = this.requireElement('[data-readout="points"]')
    this.medalsValue = this.requireElement('[data-readout="medals"]')
    this.resourceRow = this.requireElement('[data-resources]')
    this.mainContent = this.requireElement('.main-content')
    this.goalText = this.requireElement('[data-goal-text]')
    this.goalFill = this.requireElement('[data-goal-fill]')
    this.liveRegion = this.requireElement('[data-live]')
    this.upgradesView = new UpgradesView(
      (upgradeId) => {
        const result = this.simulation.purchase(upgradeId)
        if (result.kind === 'purchased') {
          this.liveRegion.textContent = `Upgrade purchased for ${formatDecimal(result.cost)} Points.`
        } else if (result.kind === 'unaffordable') {
          this.liveRegion.textContent = 'Not enough Points for that upgrade.'
        }
        this.renderUi()
      },
      (upgradeId) => {
        const result = this.simulation.purchaseMedalUpgrade(upgradeId)
        if (result.kind === 'purchased') {
          const currency = result.cost.eq(1) ? 'Medal' : 'Medals'
          this.liveRegion.textContent = `Upgrade purchased for ${formatDecimal(result.cost)} ${currency}.`
        } else if (result.kind === 'unaffordable') {
          this.liveRegion.textContent = 'Not enough Medals for that upgrade.'
        }
        this.renderUi()
      },
    )
    this.requireElement('[data-upgrades]').append(this.upgradesView.element)
    this.renderThemeChoices()

    this.renderer = new LockRenderer(canvas)
    this.input = new InputController(canvas, this.activate)
    this.loop = new GameLoop(
      (deltaSeconds, now) => {
        const beforeTick = this.simulation.getRunState()
        const missedTargetAngle = beforeTick.kind === 'active' ? beforeTick.targetAngle : null
        const result = this.simulation.tick(deltaSeconds, now)
        if (result !== null) {
          this.applyPresentation(presentTick(result, now, missedTargetAngle), now)
        }
      },
      (now) => {
        this.render(now)
      },
    )

    this.tabs = new TabsController(this.root)
    this.tabs.connect()
    this.input.connect()
    this.loop.start()
    this.renderUi()
  }

  public destroy(): void {
    if (this.loop !== null) this.upgradesView.destroy()
    this.loop?.stop()
    this.input?.disconnect()
    this.renderer?.destroy()
    this.tabs?.destroy()
    this.loop = null
    this.input = null
    this.renderer = null
    this.tabs = null
    this.root.replaceChildren()
  }

  private readonly activate = (): void => {
    const now = performance.now()
    const beforeActivation = this.simulation.getRunState()
    const hitAngle = beforeActivation.kind === 'active' ? beforeActivation.targetAngle : null
    const result = this.simulation.activate(now)
    this.applyPresentation(presentActivation(result, now, hitAngle), now)
    this.render(now)
  }

  private render(now: number): void {
    this.renderer?.render(this.simulation.getRunState(), now)
  }

  private renderUi(): void {
    const snapshot = this.simulation.getSnapshot()
    this.pointsValue.textContent = formatDecimal(snapshot.points)
    this.medalsValue.textContent = formatDecimal(snapshot.medals)
    const medalShopUnlocked = snapshot.lifetimeMedals.gte(1)
    this.resourceRow.classList.toggle('has-medals', medalShopUnlocked)
    this.mainContent.classList.toggle('is-medal-layout', medalShopUnlocked)
    this.requireElement('[data-medal-readout]').setAttribute(
      'aria-hidden',
      String(!medalShopUnlocked),
    )
    this.updateGoal(snapshot)
    this.upgradesView.update(snapshot)
  }

  private applyPresentation(presentation: GamePresentation, now: number): void {
    if (presentation.announcement !== undefined) {
      this.liveRegion.textContent = presentation.announcement
    }
    if (presentation.effect !== undefined) this.renderer?.showEffect(presentation.effect, now)
    if (presentation.gain !== undefined) {
      const { angle, amount, critical } = presentation.gain
      this.renderer?.showGain(angle, amount, critical, now)
    }
    if (presentation.shieldAngle !== undefined) {
      this.renderer?.showShield(presentation.shieldAngle, now)
    }
    if (presentation.economyChanged) this.renderUi()
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
    this.renderer?.invalidatePalette()
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-theme-choice]')) {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme))
    }
    const selectedTheme = THEMES.find((candidate) => candidate.id === theme)
    this.liveRegion.textContent = `${selectedTheme?.name ?? 'Selected'} theme applied.`
  }

  private updateGoal(snapshot: GameSnapshot): void {
    const goal = currentGoal(snapshot)
    const progress = decimalProgress(goal.current, goal.requirement)
    const percent = progress * 100
    this.goalText.textContent = goal.showNumbers
      ? `${goal.label} — ${formatDecimal(goal.current)} / ${formatDecimal(goal.requirement)} (${percent.toFixed(1)}%)`
      : goal.label
    this.goalFill.style.width = `${percent}%`
    const track = this.requireElement('.goal-track')
    track.setAttribute('aria-valuenow', percent.toFixed(1))
  }

  private requireElement<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (element === null) throw new Error(`Missing required element: ${selector}`)
    return element
  }
}
