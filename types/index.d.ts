declare module 'claude-code' {
  interface PluginState {
    'spec-cycle-lens': {
      /** The last text proposed through $.prompt.suggest; the same text is not proposed twice in a session. */
      lastSuggested: string | null
      /** Which pane tab is shown. */
      tab: 'items' | 'run' | 'docs'
      /** The item the Run and Docs tabs show; null follows the active item. */
      selectedId: string | null
      /** The artifact the Docs tab is reading, repository-relative; null lists the artifacts. */
      docPath: string | null
      /** Each item's `status|verdict` at the last read, so a change can be announced once. */
      stages: Record<string, string>
      /** A counter bumped on every snapshot change so the drawings that read it redraw. */
      version: number
    }
  }
}
