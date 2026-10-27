declare module 'claude-code' {
  interface PluginState {
    'spec-cycle-lens': {
      /** The last text proposed through $.prompt.suggest; the same text is not proposed twice in a session. */
      lastSuggested: string | null
      /** Which pane tab is shown. */
      tab: 'items' | 'run'
      /** The item the Run tab shows; null follows the active item. */
      selectedId: string | null
      /** A counter bumped on every snapshot change so the drawings that read it redraw. */
      version: number
    }
  }
}
