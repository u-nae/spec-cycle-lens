// Which commands may open a file in an editor (PRD 6.8), from the environment alone; pure.

export type EditorEnv = {
  visual?: string
  editor?: string
  termProgram?: string
  platform: 'darwin' | 'linux' | 'win32' | string
}

export type EditorMode = 'off' | 'auto' | 'tmux-nvim'

const TERMINAL_EDITORS = /^(n?vim?|vi|nano|emacs|micro|helix|hx|ed)$/

function basename(command: string): string {
  const index = command.lastIndexOf('/')
  return index < 0 ? command : command.slice(index + 1)
}

// `$VISUAL`/`$EDITOR` as a windowed editor: split on spaces, drop `--wait`/`-w`, refuse terminal editors.
function windowed(value: string | undefined): string[] | null {
  if (!value) return null
  const parts = value.trim().split(/\s+/).filter(part => part !== '--wait' && part !== '-w')
  const command = parts[0]
  if (!command || TERMINAL_EDITORS.test(basename(command))) return null
  return parts
}

/** The argument vectors to try, in order; each is `$.process.run(argv)`. Empty when the mode is off. */
export function editorCandidates(mode: EditorMode, env: EditorEnv, path: string): string[][] {
  if (mode === 'off') return []
  if (mode === 'tmux-nvim') return [['tmux', 'new-window', '-n', 'nvim', 'nvim', path]]
  const candidates: string[][] = []
  const fromEnv = windowed(env.visual) ?? windowed(env.editor)
  if (fromEnv) candidates.push([...fromEnv, path])
  if (env.termProgram === 'vscode') candidates.push(['code', path])
  else if (env.termProgram === 'cursor' || env.termProgram === 'Cursor') candidates.push(['cursor', path])
  candidates.push(env.platform === 'darwin' ? ['open', path] : ['xdg-open', path])
  const seen = new Set<string>()
  return candidates.filter(argv => {
    const key = argv.join('\0')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function editorMode(value: unknown): EditorMode {
  return value === 'auto' || value === 'tmux-nvim' ? value : 'off'
}
