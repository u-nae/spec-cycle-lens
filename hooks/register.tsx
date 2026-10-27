// Wiring only: every `$` call is spelled `$.noun.method` and every function that takes `$` is declared
// at the top of this file, as the validator asks; the judgement lives in the pure modules (snapshot,
// active, next-command, band, pane). The mod reads .spec-cycle/status.json and never writes a
// spec-cycle file, never submits a prompt (PRD P1, P2).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { pickActive } from './active'
import { bandModel, layoutBand, renderBand } from './band'
import { editorCandidates, editorMode } from './editor'
import type { EditorMode } from './editor'
import { fsPort, readPin, writePin } from './host'
import { nextCommand } from './next-command'
import type { Next } from './next-command'
import { renderPane } from './pane'
import type { DocView, Tab } from './pane'
import { EMPTY_READ, isStale, join, readLens, readSignature, snapshotKey } from './snapshot'
import type { LensRead, Paths } from './snapshot'
import { transitions } from './transitions'

const PANE = 'lens'
const DEFAULT_SNAPSHOT = '.spec-cycle/status.json'
const TURN_POLL_MS = 2_000
const TICK_MS = 60_000
const EDITOR_TIMEOUT_MS = 10_000
const REFRESH_TIMEOUT_MS = 60_000
const MAX_DOC_BYTES = 4 * 1024 * 1024

const lastSuggested = atom({ plugin: 'spec-cycle-lens', key: 'lastSuggested' } as const, null)
const tab = atom({ plugin: 'spec-cycle-lens', key: 'tab' } as const, 'items')
const selectedId = atom({ plugin: 'spec-cycle-lens', key: 'selectedId' } as const, null)
const docPath = atom({ plugin: 'spec-cycle-lens', key: 'docPath' } as const, null)
const stages = atom({ plugin: 'spec-cycle-lens', key: 'stages' } as const, {})
const version = atom({ plugin: 'spec-cycle-lens', key: 'version' } as const, 0)

/** The module's own state: lost on a reload, rebuilt by session.start. */
type Lens = {
  bandOn: boolean
  suggestOn: boolean
  toastsOn: boolean
  editor: EditorMode
  script: string
  icons: string
  snapshotPath: string
  configPath: string
  paths: Paths | null
  current: LensRead
  signature: string
  pinned: string | null
  turnTimer: Timer | null
  tickTimer: Timer | null
  /** Documents read for the Docs tab, by repository-relative path. */
  docs: Map<string, DocView>
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '.' : path.slice(0, index)
}

async function bump($: EngineInterface): Promise<void> {
  await update($, version, n => n + 1)
}

// Announces verdict changes since the last read (PRD 6.7); the first read of a session only sets the baseline.
async function announce($: EngineInterface, lens: Lens): Promise<void> {
  if (!lens.toastsOn || !lens.current.snapshot) return
  const previous = await read($, stages)
  const { baseline, toasts } = transitions(previous, lens.current.snapshot)
  await update($, stages, () => baseline)
  for (const text of toasts) $.ui.toast(text)
}

async function publish($: EngineInterface, lens: Lens): Promise<void> {
  const next = readSignature(lens.current)
  if (next === lens.signature) return
  lens.signature = next
  await announce($, lens)
  await bump($)
}

// `full` parses the file whatever its key; otherwise only a changed key (mtime:size) is read again.
async function reload($: EngineInterface, lens: Lens, full: boolean): Promise<void> {
  if (!lens.paths) return
  const fs = fsPort($)
  if (!full && (await snapshotKey(fs, lens.paths)) === lens.current.key) return
  lens.current = await readLens(fs, lens.paths, lens.current)
  await publish($, lens)
}

async function refreshStale($: EngineInterface, lens: Lens): Promise<void> {
  if (lens.paths && lens.current.snapshot) {
    const stale = await isStale(fsPort($), lens.paths.cwd, lens.current.snapshot)
    if (stale !== lens.current.isStale) lens.current = { ...lens.current, isStale: stale }
  }
  await bump($)
}

function nextOf(lens: Lens): Next {
  const active = pickActive(lens.current.snapshot, lens.pinned)
  return nextCommand({ hasConfig: lens.current.hasConfig, hasFile: lens.current.hasFile, snapshot: lens.current.snapshot, active })
}

async function suggest($: EngineInterface, lens: Lens): Promise<void> {
  if (!lens.suggestOn) return
  const text = nextOf(lens).suggest
  if (text === null || text === (await read($, lastSuggested))) return
  await update($, lastSuggested, () => text)
  void $.prompt.suggest({ text })
}

function stopTurnTimer(lens: Lens): void {
  lens.turnTimer?.cancel()
  lens.turnTimer = null
}

async function setPin($: EngineInterface, lens: Lens, id: string | null): Promise<void> {
  lens.pinned = id
  if (lens.paths) await writePin($, lens.paths.cwd, id)
  await bump($)
}

function openPane($: EngineInterface) {
  return $.ui.open({ id: PANE, title: 'spec-cycle lens', focus: true })
}

// Reads one artifact for the Docs tab; the path is the snapshot's, repository-relative, never typed by anyone.
async function openDoc($: EngineInterface, lens: Lens, path: string): Promise<void> {
  if (!lens.paths) return
  const fs = fsPort($)
  const file = join(lens.paths.cwd, path)
  let doc: DocView = { path, text: null, error: null }
  try {
    if (!(await fs.exists(file))) doc = { path, text: null, error: `파일이 없습니다: ${path}` }
    else if ((await fs.stat(file)).size > MAX_DOC_BYTES) doc = { path, text: null, error: `4 MiB보다 커서 pane에서 열 수 없습니다: ${path}` }
    else doc = { path, text: await fs.read(file), error: null }
  } catch (error) {
    doc = { path, text: null, error: `읽기 실패: ${String((error as Error)?.message ?? error)}` }
  }
  lens.docs.set(path, doc)
  await update($, docPath, () => path)
}

async function copyPath($: EngineInterface, lens: Lens, path: string): Promise<void> {
  const absolute = lens.paths ? join(lens.paths.cwd, path) : path
  const copied = await $.ui.copy({ text: absolute })
  $.ui.toast(copied.isCopied ? `경로를 복사했습니다: ${path}` : `복사할 수 없습니다 (${copied.reason}): ${absolute}`)
}

// PRD 6.8: a windowed $VISUAL/$EDITOR, then code/cursor by TERM_PROGRAM, then open; each a 10 s process.
async function openInEditor($: EngineInterface, lens: Lens, path: string): Promise<void> {
  if (lens.editor === 'off' || !lens.paths) return copyPath($, lens, path)
  const absolute = join(lens.paths.cwd, path)
  const env = {
    visual: await $.env.get('VISUAL'),
    editor: await $.env.get('EDITOR'),
    termProgram: await $.env.get('TERM_PROGRAM'),
    // The API has no platform field; macOS exports a TMPDIR under /var/folders and a zsh OSTYPE of darwin*.
    platform: (await $.env.get('OSTYPE'))?.startsWith('darwin') || (await $.env.get('TMPDIR'))?.startsWith('/var/folders') ? 'darwin' : 'other',
  }
  for (const argv of editorCandidates(lens.editor, env, absolute)) {
    try {
      const ran = await $.process.run(argv, { cwd: lens.paths.cwd, timeoutMs: EDITOR_TIMEOUT_MS })
      if (ran.exitCode === 0) {
        $.ui.toast(`${argv[0]}로 열었습니다: ${path}`)
        return
      }
    } catch {
      // the next candidate
    }
  }
  await copyPath($, lens, path)
}

// PRD 6.9: with a configured script, refresh runs it; without one, refresh only reads the file again.
async function refresh($: EngineInterface, lens: Lens): Promise<string> {
  if (lens.script !== '' && lens.paths) {
    const ran = await $.process.run(['node', lens.script, 'status', '--json', '--write'], { cwd: lens.paths.cwd, timeoutMs: REFRESH_TIMEOUT_MS })
    if (ran.exitCode !== 0) {
      await reload($, lens, true)
      return `spec-cycle lens: status --write failed (exit ${ran.exitCode}): ${ran.stderr.trim().split('\n')[0] ?? ''}`
    }
  }
  await reload($, lens, true)
  if (lens.current.hasFile) {
    return `spec-cycle lens: snapshot ${lens.script !== '' ? 'rewritten and ' : ''}read again (${lens.current.snapshot?.generated_by ?? 'unreadable JSON'}).`
  }
  return 'spec-cycle lens: no snapshot yet. Any spec-cycle subcommand writes .spec-cycle/status.json; set specCycleScript in /config to let /lens refresh run `status --json --write`.'
}

export const register: Register = (on, options) => {
  const snapshotPath = typeof options.snapshotPath === 'string' && options.snapshotPath !== '' ? options.snapshotPath : DEFAULT_SNAPSHOT
  const lens: Lens = {
    bandOn: options.band !== 'off',
    suggestOn: options.suggest !== 'off',
    toastsOn: options.toasts !== 'off',
    editor: editorMode(options.openInEditor),
    script: typeof options.specCycleScript === 'string' ? options.specCycleScript.trim() : '',
    icons: typeof options.icons === 'string' ? options.icons : 'unicode',
    snapshotPath,
    configPath: `${dirname(snapshotPath)}/config.yaml`,
    paths: null,
    current: EMPTY_READ,
    signature: '',
    pinned: null,
    turnTimer: null,
    tickTimer: null,
    docs: new Map(),
  }

  on('session.start', async ($, e, next) => {
    lens.paths = { cwd: e.cwd, snapshotPath: lens.snapshotPath, configPath: lens.configPath }
    await $.command.register({
      name: 'lens',
      description: 'spec-cycle lens: work items, runs and the next command',
      argumentHint: '[pin <id> | unpin | refresh]',
    })
    lens.pinned = await readPin($, e.cwd)
    await reload($, lens, true)
    lens.tickTimer?.cancel()
    lens.tickTimer = $.clock.every(TICK_MS, () => {
      void refreshStale($, lens)
    })
    if (e.isInteractive) await suggest($, lens)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('session.end', ($, e, next) => {
    stopTurnTimer(lens)
    if (e.reason !== 'clear') {
      lens.tickTimer?.cancel()
      lens.tickTimer = null
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear raises session.end (reason clear) and no session.start after it: the module's own state and
  // the drawn band stay, and the next turn.complete reads again. Nothing here can refuse anything:
  // prompt.submit and tool.call are gates, so the turn is watched from turn.start with a timer instead.
  on('turn.start', ($, e, next) => {
    if (!e.agentId) {
      stopTurnTimer(lens)
      lens.turnTimer = $.clock.every(TURN_POLL_MS, () => {
        void reload($, lens, false)
      })
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (!e.agentId) {
      stopTurnTimer(lens)
      await reload($, lens, true)
      await suggest($, lens)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'lens' }, async ($, e) => {
    const [verb, argument] = e.args.trim().split(/\s+/)
    if (verb === 'pin' && argument) {
      if (!lens.current.snapshot?.items.some(item => item.id === argument)) {
        return { text: `spec-cycle lens: no work item ${argument} in the snapshot.` }
      }
      await setPin($, lens, argument)
      return { text: `spec-cycle lens: pinned ${argument}. /lens unpin releases it.` }
    }
    if (verb === 'unpin') {
      await setPin($, lens, null)
      return { text: 'spec-cycle lens: pin released; the active item follows the snapshot again.' }
    }
    if (verb === 'refresh') return { text: await refresh($, lens) }
    const placed = await openPane($)
    return { text: placed.isPlaced ? 'spec-cycle lens pane opened.' : `spec-cycle lens pane is waiting for room (${placed.reason}).` }
  }).catch(() => ({ text: 'spec-cycle lens: the command failed; see the debug log.' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    await read($, version)
    const below = await next(e)
    if (!lens.bandOn || e.props.hasSurvey) return below
    const model = bandModel(lens.current, lens.pinned, lens.icons)
    if (model === null) return below
    const segments = layoutBand(model, e.props.bodyColumns)
    const band = renderBand($.ui.resolve(e), segments, model.tone, () => {
      void openPane($)
    })
    if (!below) return band
    const { Box } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {below}
        {band}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // With a draft in the box the suggestion cannot show, so the command rides on the hint line instead.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    await read($, version)
    if (!lens.suggestOn || !e.props.isDraft || e.props.isWorking) return next(e)
    const text = nextOf(lens).suggest
    if (text === null) return next(e)
    return next({ ...e, props: { ...e.props, tail: `next: ${text}` } })
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    await read($, version)
    const shownTab = await read($, tab)
    const wanted = await read($, selectedId)
    const reading = await read($, docPath)
    const items = lens.current.snapshot?.items ?? []
    const selected = items.find(item => item.id === wanted) ?? pickActive(lens.current.snapshot, lens.pinned)
    const now = await $.clock.now()
    const doc = shownTab === 'docs' && reading !== null ? (lens.docs.get(reading) ?? { path: reading, text: null, error: null }) : null
    return renderPane(
      $.ui.resolve(e),
      {
        read: lens.current,
        tab: shownTab as Tab,
        selected,
        pinned: lens.pinned,
        icons: lens.icons,
        bodyColumns: e.props.bodyColumns,
        doc,
        canOpenInEditor: lens.editor !== 'off',
        cwd: lens.paths?.cwd ?? '',
      },
      {
        showTab: shown => {
          void update($, docPath, () => null).then(() => update($, tab, () => shown))
        },
        select: id => {
          void update($, selectedId, () => id).then(() => update($, docPath, () => null)).then(() => update($, tab, () => 'run'))
        },
        togglePin: id => {
          void setPin($, lens, lens.pinned === id ? null : id)
        },
        openDoc: path => {
          void openDoc($, lens, path)
        },
        closeDoc: () => {
          void update($, docPath, () => null)
        },
        openInEditor: path => {
          void openInEditor($, lens, path)
        },
        copyPath: path => {
          void copyPath($, lens, path)
        },
      },
      now,
    )
  }).catch(($, e, next) => next(e))
}
