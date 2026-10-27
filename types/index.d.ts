declare module 'claude-code' {
  interface PluginState {
    'spec-cycle-lens': {
      /** The last text proposed through $.prompt.suggest; the same text is not proposed twice. */
      lastSuggested: string | null
    }
  }
}
