import { GameSimulation, type GameSnapshot } from '../game/GameSimulation'
import { currentGoal } from '../game/goals'
import { LockRenderer } from '../rendering/LockRenderer'
import { GameLoop } from '../runtime/GameLoop'
import { InputController } from '../runtime/InputController'
import { applyTheme, DEFAULT_THEME, THEMES, type ThemeId } from '../ui/themes'
import { UpgradesView } from '../ui/upgradesView'
import { decimalProgress, formatDecimal } from '../utils/format'
import { GAME_NAME, GAME_VERSION } from '../version'

type TabId = 'main' | 'settings'

export class App {
  private readonly simulation = new GameSimulation()
  private renderer!: LockRenderer
  private loop!: GameLoop
  private input!: InputController
  private pointsValue!: HTMLElement
  private goalText!: HTMLElement
  private goalFill!: HTMLElement
  private liveRegion!: HTMLElement
  private upgradesView!: UpgradesView
  private lastUiSignature = ''

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    applyTheme(DEFAULT_THEME)
    this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div class="top-space" aria-hidden="true"></div>
          <div class="header-points" aria-label="Current Points">
            <span>Points</span>
            <strong data-readout="points">0</strong>
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
            <div data-upgrades></div>
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
          <div class="goal-track" role="progressbar" aria-label="Progression goal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div class="goal-fill" data-goal-fill></div>
            <div class="goal-copy" data-goal-text>Earn 10 lifetime Points — 0 / 10 (0%)</div>
          </div>
        </footer>
        <div class="visually-hidden" aria-live="polite" aria-atomic="true" data-live></div>
      </div>
    `

    const canvas = this.requireElement<HTMLCanvasElement>('.lock-canvas')
    this.pointsValue = this.requireElement('[data-readout="points"]')
    this.goalText = this.requireElement('[data-goal-text]')
    this.goalFill = this.requireElement('[data-goal-fill]')
    this.liveRegion = this.requireElement('[data-live]')
    this.upgradesView = new UpgradesView((upgradeId) => {
      const result = this.simulation.purchase(upgradeId)
      if (result.kind === 'purchased') {
        this.liveRegion.textContent = `Upgrade purchased for ${formatDecimal(result.cost)} Points.`
      } else if (result.kind === 'unaffordable') {
        this.liveRegion.textContent = 'Not enough Points for that upgrade.'
      }
      this.lastUiSignature = ''
      this.render(performance.now())
      return result
    })
    this.requireElement('[data-upgrades]').append(this.upgradesView.element)
    this.renderThemeChoices()

    this.renderer = new LockRenderer(canvas)
    this.input = new InputController(canvas, this.activate)
    this.loop = new GameLoop(
      (deltaSeconds, now) => {
        const result = this.simulation.tick(deltaSeconds, now)
        if (result?.kind === 'passed-target') {
          this.renderer.showEffect('miss', now)
          const seconds = Math.round((result.state.cooldownEndsAt - now) / 1_000)
          this.liveRegion.textContent = `Target passed after ${result.state.hits} successful hits. ${seconds} second cooldown started.`
        } else if (result?.kind === 'forgiven-miss') {
          this.renderer.showEffect('forgiven', now)
          this.liveRegion.textContent = 'Miss forgiven. The consecutive multiplier was reset.'
        } else if (result?.kind === 'invulnerable') {
          this.liveRegion.textContent = 'Second Chance invulnerability prevented another miss.'
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
      this.liveRegion.textContent = `Run started. Zero of ${result.state.requiredHits} targets hit.`
    } else if (result.kind === 'hit') {
      this.renderer.showEffect(result.critical ? 'critical' : 'hit', now)
      if (hitAngle !== null) this.renderer.showGain(hitAngle, result.reward, result.critical, now)
      if (result.critical)
        this.liveRegion.textContent = `Critical hit. ${formatDecimal(result.reward)} Points earned.`
    } else if (result.kind === 'forgiven-miss') {
      this.renderer.showEffect('forgiven', now)
      this.liveRegion.textContent = 'Miss forgiven. The consecutive multiplier was reset.'
    } else if (result.kind === 'invulnerable') {
      this.liveRegion.textContent = 'Second Chance invulnerability blocked the input.'
    } else if (result.kind === 'miss') {
      this.renderer.showEffect('miss', now)
      const seconds = Math.round((result.state.cooldownEndsAt - now) / 1_000)
      this.liveRegion.textContent = `Run failed after ${result.state.hits} successful hits. ${seconds} second cooldown started.`
    } else if (result.kind === 'completed') {
      this.renderer.showEffect('completed', now)
      if (hitAngle !== null) {
        this.renderer.showGain(hitAngle, result.targetReward, result.critical, now)
      }
      this.liveRegion.textContent = `Run complete. ${formatDecimal(result.reward)} Points earned.`
    }
    this.render(now)
  }

  private render(now: number): void {
    const snapshot = this.simulation.getSnapshot()
    this.renderer.render(snapshot, now)

    const signature = this.uiSignature(snapshot)
    if (signature === this.lastUiSignature) return
    this.pointsValue.textContent = formatDecimal(snapshot.points)
    this.updateGoal(snapshot)
    this.upgradesView.update(snapshot)
    this.lastUiSignature = signature
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

  private uiSignature(snapshot: GameSnapshot): string {
    const runStats =
      snapshot.run.kind === 'active'
        ? `${snapshot.run.consecutiveHits}:${snapshot.run.missesRemaining}`
        : snapshot.run.kind
    return `${snapshot.points.toString()}:${snapshot.lifetimePoints.toString()}:${Object.values(snapshot.upgrades).join(',')}:${runStats}`
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
