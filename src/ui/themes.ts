export type ThemeId = 'ocean' | 'ember' | 'forest' | 'monochrome'

export interface ThemeDefinition {
  readonly id: ThemeId
  readonly name: string
  readonly description: string
}

export const DEFAULT_THEME: ThemeId = 'ocean'

export const THEMES: readonly ThemeDefinition[] = [
  { id: 'ocean', name: 'Ocean', description: 'Deep teal with warm gold highlights.' },
  { id: 'ember', name: 'Ember', description: 'Charcoal with vivid orange and red.' },
  { id: 'forest', name: 'Forest', description: 'Dark green with cream and amber.' },
  { id: 'monochrome', name: 'Monochrome', description: 'Clean slate tones with white accents.' },
]

export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
}
