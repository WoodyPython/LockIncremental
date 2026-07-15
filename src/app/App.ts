import { GameSimulation, type GameSnapshot } from '../game/GameSimulation'
import { currentGoal } from '../game/goals'
import { LockRenderer } from '../rendering/LockRenderer'
import { GameLoop } from '../runtime/GameLoop'
import { InputController } from '../runtime/InputController'
import { decodePortableSave, encodePortableSave } from '../storage/codec'
import { PersistenceController, type SaveResult } from '../storage/PersistenceController'
import { SaveRepository } from '../storage/repository'
import {
  createSaveEnvelope,
  DEFAULT_GAME_SETTINGS,
  hydrateGameState,
  type GameSettings,
  type SaveEnvelope,
} from '../storage/schema'
import { SettingsView } from '../ui/SettingsView'
import { ToastView } from '../ui/ToastView'
import { UpgradesView } from '../ui/upgradesView'
import { decimalProgress, formatDecimal } from '../utils/format'
import { GAME_NAME, GAME_VERSION } from '../version'
import { presentActivation, presentTick, type GamePresentation } from './presentation'
import { TabsController } from './tabs'

export class App {
  private simulation = new GameSimulation()
  private settings: GameSettings = { ...DEFAULT_GAME_SETTINGS }
  private readonly repository = new SaveRepository()
  private automaticWritesSuspended = false
  private startupProblem: string | null = null
  private renderer: LockRenderer | null = null
  private loop: GameLoop | null = null
  private input: InputController | null = null
  private tabs: TabsController | null = null
  private persistence: PersistenceController | null = null
  private pointsValue!: HTMLElement
  private medalsValue!: HTMLElement
  private resourceRow!: HTMLElement
  private progressionLayout!: HTMLElement
  private mainContent!: HTMLElement
  private goalText!: HTMLElement
  private goalFill!: HTMLElement
  private liveRegion!: HTMLElement
  private upgradesView!: UpgradesView
  private settingsView!: SettingsView
  private toastView!: ToastView

  public constructor(private readonly root: HTMLElement) {}

  public mount(): void {
    if (this.loop !== null) return
    this.loadInitialState()
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
            <div class="progression-layout" data-progression-layout>
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
            </div>
          </section>
          <section id="panel-settings" class="tab-panel settings-panel" role="tabpanel" data-panel="settings" hidden aria-labelledby="tab-settings" data-settings-panel></section>
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
    this.progressionLayout = this.requireElement('[data-progression-layout]')
    this.mainContent = this.requireElement('.main-content')
    this.goalText = this.requireElement('[data-goal-text]')
    this.goalFill = this.requireElement('[data-goal-fill]')
    this.liveRegion = this.requireElement('[data-live]')
    this.toastView = new ToastView()
    this.root.append(this.toastView.element)

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

    this.settingsView = new SettingsView(this.settings, {
      saveNow: this.saveNow,
      exportClipboard: this.exportClipboard,
      exportFile: this.exportFile,
      importPortableSave: this.importPortableSave,
      wipeSave: this.wipeSave,
      settingsChanged: this.changeSettings,
      reportError: this.reportError,
    })
    this.requireElement('[data-settings-panel]').append(this.settingsView.element)

    this.renderer = new LockRenderer(canvas)
    this.input = new InputController(canvas, this.activate)
    this.loop = new GameLoop(
      (deltaSeconds, now) => {
        const result = this.simulation.tick(deltaSeconds, now)
        if (result !== null) {
          this.applyPresentation(presentTick(result, now, result.state.markerAngle), now)
          if (result.kind === 'passed-target') this.persistence?.checkpoint()
        }
      },
      (now) => {
        this.render(now)
      },
    )

    this.tabs = new TabsController(this.root)
    this.tabs.connect()
    this.persistence = new PersistenceController(
      () => this.captureGameState(),
      () => this.settings,
      this.handleSaveResult,
      this.repository,
    )
    this.persistence.connect(this.settings, this.automaticWritesSuspended)
    this.input.connect()
    this.loop.start()
    this.renderUi()

    if (this.startupProblem !== null) this.reportError(this.startupProblem)
  }

  public destroy(): void {
    if (this.loop !== null) this.upgradesView.destroy()
    this.persistence?.destroy()
    this.loop?.stop()
    this.input?.disconnect()
    this.renderer?.destroy()
    this.tabs?.destroy()
    this.toastView.destroy()
    this.loop = null
    this.input = null
    this.renderer = null
    this.tabs = null
    this.persistence = null
    this.root.replaceChildren()
  }

  private loadInitialState(): void {
    const loaded = this.repository.load()
    if (loaded.kind === 'loaded') {
      this.simulation = new GameSimulation({
        initialState: hydrateGameState(loaded.envelope),
        initialNow: performance.now(),
      })
      this.settings = { ...loaded.envelope.settings }
      return
    }
    if (loaded.kind === 'invalid') {
      this.startupProblem = `Stored progress was not loaded: ${loaded.message} Automatic saves are paused until you save, import, or wipe.`
      this.automaticWritesSuspended = true
    } else if (loaded.kind === 'unavailable') {
      this.startupProblem = `${loaded.message} Progress will remain available only for this session.`
      this.automaticWritesSuspended = true
    }
  }

  private readonly activate = (): void => {
    const now = performance.now()
    const beforeActivation = this.simulation.getRunState()
    const hitAngle = beforeActivation.kind === 'active' ? beforeActivation.targetAngle : null
    const result = this.simulation.activate(now)
    const effectAngle = result.kind === 'forgiven-miss' ? result.state.markerAngle : hitAngle
    this.applyPresentation(presentActivation(result, now, effectAngle), now)
    if (result.kind === 'miss') this.persistence?.checkpoint()
    this.render(now)
  }

  private readonly saveNow = (): void => {
    this.persistence?.saveNow('manual')
  }

  private readonly exportClipboard = async (): Promise<void> => {
    let portable: string
    try {
      portable = await this.createPortableSave()
    } catch (error) {
      this.reportError(this.errorMessage(error, 'The compressed save could not be created.'))
      return
    }
    try {
      await navigator.clipboard.writeText(portable)
      this.announceStatus('Compressed save copied to the clipboard.')
    } catch {
      this.settingsView.showPortableText(portable)
      this.announceStatus(
        'Clipboard access failed. Copy the compressed save from the dialog.',
        true,
      )
    }
  }

  private readonly exportFile = async (): Promise<void> => {
    try {
      const portable = await this.createPortableSave()
      const blob = new Blob([portable], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `lock-incremental-save-${this.fileTimestamp()}.txt`
      link.hidden = true
      document.body.append(link)
      try {
        link.click()
        window.setTimeout(() => {
          URL.revokeObjectURL(url)
        }, 0)
      } catch (error) {
        URL.revokeObjectURL(url)
        throw error
      } finally {
        link.remove()
      }
      this.announceStatus('Compressed save exported as a text file.')
    } catch (error) {
      this.reportError(this.errorMessage(error, 'The compressed save file could not be created.'))
    }
  }

  private readonly importPortableSave = async (text: string): Promise<boolean> => {
    let decoded: Awaited<ReturnType<typeof decodePortableSave>>
    try {
      decoded = await decodePortableSave(text)
    } catch (error) {
      this.reportImportError(this.errorMessage(error, 'The compressed save could not be decoded.'))
      return false
    }
    if (!decoded.ok) {
      this.reportImportError(`Import failed: ${decoded.message}`)
      return false
    }

    const backup = createSaveEnvelope(this.captureGameState(), this.settings)
    const imported = createSaveEnvelope(
      hydrateGameState(decoded.envelope),
      decoded.envelope.settings,
    )
    const persistence = this.persistence
    if (!persistence?.commitImport(imported)) {
      this.settingsView.setImportError('The imported save could not be stored.')
      return false
    }
    try {
      this.applyEnvelope(imported)
    } catch {
      persistence.commitImport(backup)
      this.applyEnvelope(backup)
      this.reportImportError(
        'The imported save could not be applied. Previous progress was restored.',
      )
      return false
    }
    this.announceStatus('Compressed save imported successfully.')
    return true
  }

  private readonly wipeSave = (): boolean => {
    if (!this.persistence?.removeSave()) return false
    this.automaticWritesSuspended = false
    this.simulation = new GameSimulation()
    this.settings = { ...DEFAULT_GAME_SETTINGS }
    this.renderer?.clearEffects()
    this.settingsView.update(this.settings)
    this.persistence.configure(this.settings)
    this.tabs?.setAttention('settings', false)
    this.renderUi()
    this.render(performance.now())
    this.announceStatus('All saved progress and settings were wiped.')
    return true
  }

  private readonly changeSettings = (settings: GameSettings): void => {
    this.settings = { ...settings }
    if (!settings.tabNotificationsEnabled) this.tabs?.setAttention('settings', false)
    this.persistence?.configure(settings)
    if (this.automaticWritesSuspended) {
      this.reportError(
        'Settings changed for this session. Resolve the stored-save error to persist them.',
      )
      return
    }
    this.persistence?.saveNow('settings')
  }

  private readonly handleSaveResult = (result: SaveResult): void => {
    if (!result.ok) {
      this.reportError(result.message ?? 'Progress could not be saved.')
      return
    }
    if (result.reason === 'manual' || result.reason === 'import') {
      this.automaticWritesSuspended = false
    }
    if (result.reason === 'manual') this.announceStatus('Progress saved.')
  }

  private applyEnvelope(envelope: SaveEnvelope): void {
    this.simulation = new GameSimulation({
      initialState: hydrateGameState(envelope),
      initialNow: performance.now(),
    })
    this.settings = { ...envelope.settings }
    this.renderer?.clearEffects()
    this.settingsView.update(this.settings)
    this.persistence?.configure(this.settings)
    this.renderUi()
    this.render(performance.now())
  }

  private async createPortableSave(): Promise<string> {
    return encodePortableSave(createSaveEnvelope(this.captureGameState(), this.settings))
  }

  private captureGameState(): ReturnType<GameSimulation['getDurableState']> {
    return this.simulation.getDurableState(performance.now())
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
    this.progressionLayout.classList.toggle('is-medal-unlocked', medalShopUnlocked)
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

  private announceStatus(message: string, error = false): void {
    this.toastView.show(message, error)
  }

  private readonly reportError = (message: string): void => {
    this.announceStatus(message, true)
    if (this.settings.tabNotificationsEnabled && !this.tabs?.isActive('settings')) {
      this.tabs?.setAttention('settings', true)
    }
  }

  private reportImportError(message: string): void {
    this.reportError(message)
    this.settingsView.setImportError(message)
  }

  private errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message !== '' ? error.message : fallback
  }

  private fileTimestamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-:]/gu, '')
      .replace(/\.\d{3}Z$/u, 'Z')
  }

  private requireElement<T extends Element = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector)
    if (element === null) throw new Error(`Missing required element: ${selector}`)
    return element
  }
}
