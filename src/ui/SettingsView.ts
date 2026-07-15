import {
  AUTOSAVE_INTERVALS,
  type AutosaveIntervalSeconds,
  type GameSettings,
} from '../storage/schema'
import { MAX_PORTABLE_SAVE_LENGTH } from '../storage/codec'

export interface SettingsViewActions {
  readonly saveNow: () => void
  readonly exportClipboard: () => Promise<void>
  readonly exportFile: () => Promise<void>
  readonly importPortableSave: (text: string) => Promise<boolean>
  readonly wipeSave: () => boolean
  readonly settingsChanged: (settings: GameSettings) => void
  readonly reportError: (message: string) => void
}

export class SettingsView {
  public readonly element: HTMLElement
  private settings: GameSettings
  private readonly importDialog: HTMLDialogElement
  private readonly importText: HTMLTextAreaElement
  private readonly importError: HTMLElement
  private readonly wipeDialog: HTMLDialogElement
  private readonly exportDialog: HTMLDialogElement
  private readonly exportText: HTMLTextAreaElement

  public constructor(
    initialSettings: GameSettings,
    private readonly actions: SettingsViewActions,
  ) {
    this.settings = initialSettings
    this.element = document.createElement('div')
    this.element.className = 'options-view'
    this.element.innerHTML = `
      <h1>Main Options</h1>
      <section class="settings-section options-actions" aria-labelledby="save-options-heading">
        <h2 id="save-options-heading" class="visually-hidden">Save options</h2>
        <div class="options-button-grid">
          <button type="button" data-option-action="save">Save Now</button>
          <button type="button" data-option-action="export-clipboard">Export to Clipboard</button>
          <button type="button" data-option-action="export-file">Export as File</button>
          <button type="button" data-option-action="import-text">Import from Text</button>
          <button type="button" data-option-action="import-file">Import from File</button>
          <button type="button" class="danger-button" data-option-action="wipe">Wipe Save</button>
          <input class="visually-hidden" type="file" accept=".txt,text/plain" data-import-file />
        </div>
      </section>
      <section class="settings-section options-settings" aria-labelledby="game-settings-heading">
        <h2 id="game-settings-heading" class="visually-hidden">Game settings</h2>
        <div class="option-row">
          <span class="option-label" id="autosave-label">Autosave</span>
          <div class="segmented-control" role="group" aria-labelledby="autosave-label">
            <button type="button" data-autosave="false">Disabled</button>
            <button type="button" data-autosave="true">Enabled</button>
          </div>
        </div>
        <div class="option-row">
          <span class="option-label" id="autosave-interval-label">Autosave Interval</span>
          <div class="segmented-control interval-control" role="group" aria-labelledby="autosave-interval-label" data-interval-control>
            ${AUTOSAVE_INTERVALS.map((interval) => `<button type="button" data-autosave-interval="${interval}">${interval}s</button>`).join('')}
          </div>
        </div>
        <div class="option-row">
          <span class="option-label" id="tab-notification-label">Tab Notification</span>
          <div class="segmented-control" role="group" aria-labelledby="tab-notification-label">
            <button type="button" data-tab-notification="false">Disabled</button>
            <button type="button" data-tab-notification="true">Enabled</button>
          </div>
        </div>
      </section>
      <dialog class="options-dialog" data-import-dialog aria-labelledby="import-dialog-heading">
        <form method="dialog">
          <h2 id="import-dialog-heading">Import from Text</h2>
          <p>Paste a compressed save beginning with <code>LI1:</code>.</p>
          <textarea rows="8" spellcheck="false" autocomplete="off" aria-label="Compressed save text" data-import-text></textarea>
          <p class="dialog-error" role="alert" data-import-error></p>
          <div class="dialog-actions">
            <button type="submit" value="cancel">Cancel</button>
            <button type="button" data-confirm-import>Import Save</button>
          </div>
        </form>
      </dialog>
      <dialog class="options-dialog" data-wipe-dialog aria-labelledby="wipe-dialog-heading">
        <form method="dialog">
          <h2 id="wipe-dialog-heading">Wipe all progress?</h2>
          <p>This permanently removes the local save and resets all progress and settings.</p>
          <div class="dialog-actions">
            <button type="submit" value="cancel">Cancel</button>
            <button type="button" class="danger-button" data-confirm-wipe>Confirm Wipe</button>
          </div>
        </form>
      </dialog>
      <dialog class="options-dialog" data-export-dialog aria-labelledby="export-dialog-heading">
        <form method="dialog">
          <h2 id="export-dialog-heading">Copy Compressed Save</h2>
          <p>Clipboard access failed. Copy this save string manually.</p>
          <textarea rows="8" readonly aria-label="Compressed save export" data-export-text></textarea>
          <div class="dialog-actions">
            <button type="button" data-select-export>Select All</button>
            <button type="submit" value="close">Close</button>
          </div>
        </form>
      </dialog>
    `

    this.importDialog = this.requireElement('[data-import-dialog]')
    this.importText = this.requireElement('[data-import-text]')
    this.importError = this.requireElement('[data-import-error]')
    this.wipeDialog = this.requireElement('[data-wipe-dialog]')
    this.exportDialog = this.requireElement('[data-export-dialog]')
    this.exportText = this.requireElement('[data-export-text]')
    this.connect()
    this.update(initialSettings)
  }

  public update(settings: GameSettings): void {
    this.settings = settings
    this.updatePressed('[data-autosave]', String(settings.autosaveEnabled))
    this.updatePressed('[data-autosave-interval]', String(settings.autosaveIntervalSeconds))
    this.updatePressed('[data-tab-notification]', String(settings.tabNotificationsEnabled))
    const intervalControl = this.requireElement('[data-interval-control]')
    intervalControl.setAttribute('aria-disabled', String(!settings.autosaveEnabled))
    for (const button of intervalControl.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = !settings.autosaveEnabled
    }
  }

  public setImportError(message: string): void {
    if (this.importDialog.open) this.importError.textContent = message
  }

  public showPortableText(text: string): void {
    this.exportText.value = text
    this.exportDialog.showModal()
    this.exportText.focus()
    this.exportText.select()
  }

  private connect(): void {
    this.element.querySelector('[data-option-action="save"]')?.addEventListener('click', () => {
      this.actions.saveNow()
    })
    this.element
      .querySelector('[data-option-action="export-clipboard"]')
      ?.addEventListener('click', () => void this.actions.exportClipboard())
    this.element
      .querySelector('[data-option-action="export-file"]')
      ?.addEventListener('click', () => void this.actions.exportFile())
    this.element
      .querySelector('[data-option-action="import-text"]')
      ?.addEventListener('click', () => {
        this.importError.textContent = ''
        this.importDialog.showModal()
        this.importText.focus()
      })
    const fileInput = this.requireElement<HTMLInputElement>('[data-import-file]')
    this.element
      .querySelector('[data-option-action="import-file"]')
      ?.addEventListener('click', () => {
        fileInput.click()
      })
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0]
      fileInput.value = ''
      if (file === undefined) return
      if (file.size > MAX_PORTABLE_SAVE_LENGTH) {
        this.actions.reportError('The selected save file is too large.')
        return
      }
      void file
        .text()
        .then((text) => this.actions.importPortableSave(text))
        .catch(() => {
          this.actions.reportError('The selected save file could not be read.')
        })
    })
    this.element.querySelector('[data-option-action="wipe"]')?.addEventListener('click', () => {
      this.wipeDialog.showModal()
    })
    this.element.querySelector('[data-confirm-import]')?.addEventListener('click', () => {
      void this.confirmImport()
    })
    this.element.querySelector('[data-confirm-wipe]')?.addEventListener('click', () => {
      if (this.actions.wipeSave()) this.wipeDialog.close()
    })
    this.element.querySelector('[data-select-export]')?.addEventListener('click', () => {
      this.exportText.focus()
      this.exportText.select()
    })

    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-autosave]')) {
      button.addEventListener('click', () => {
        this.changeSettings({
          ...this.settings,
          autosaveEnabled: button.dataset.autosave === 'true',
        })
      })
    }
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(
      '[data-autosave-interval]',
    )) {
      button.addEventListener('click', () => {
        const interval = Number(button.dataset.autosaveInterval) as AutosaveIntervalSeconds
        this.changeSettings({ ...this.settings, autosaveIntervalSeconds: interval })
      })
    }
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(
      '[data-tab-notification]',
    )) {
      button.addEventListener('click', () => {
        this.changeSettings({
          ...this.settings,
          tabNotificationsEnabled: button.dataset.tabNotification === 'true',
        })
      })
    }
  }

  private async confirmImport(): Promise<void> {
    this.importError.textContent = ''
    const imported = await this.actions.importPortableSave(this.importText.value)
    if (imported) {
      this.importText.value = ''
      this.importDialog.close()
    } else {
      if (this.importError.textContent === '') {
        this.importError.textContent =
          'The save was not imported. Check the save text and try again.'
      }
    }
  }

  private changeSettings(settings: GameSettings): void {
    this.update(settings)
    this.actions.settingsChanged(settings)
  }

  private updatePressed(selector: string, selectedValue: string): void {
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(selector)) {
      const value =
        button.dataset.autosave ?? button.dataset.autosaveInterval ?? button.dataset.tabNotification
      button.setAttribute('aria-pressed', String(value === selectedValue))
    }
  }

  private requireElement<T extends Element = HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector)
    if (element === null) throw new Error(`Missing settings element: ${selector}`)
    return element
  }
}
