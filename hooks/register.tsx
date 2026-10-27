// Wiring only: every `$` call is spelled `$.noun.method` and every function that takes `$` is declared
// at the top of this file, as the validator asks; the judgement lives in the pure modules (snapshot,
// active, next-command, band, pane). The mod reads .spec-cycle/status.json and never writes a
// spec-cycle file, never submits a prompt (PRD P1, P2).
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { pickActive } from './active'
import { bandModel, layoutBand, renderBand } from './band'
import { fsPort, readPin, writePin } from './host'
import { nextCommand } from './next-command'
import type { Next } from './next-command'
import { renderPane } from './pane'
import type { Tab } from './pane'
import { EMPTY_READ, isStale, readLens, readSignature, snapshotKey } from './snapshot'
import type { LensRead, Paths } from './snapshot'

const PANE = 'lens'
const DEFAULT_SNAPSHOT = '.spec-cycle/status.json'
const TURN_POLL_MS = 2_000
const TICK_MS = 60_000

const lastSuggested = atom({ plugin: 'spec-cycle-lens', key: 'lastSuggested' } as const, null)
const tab = atom({ plugin: 'spec-cycle-lens', key: 'tab' } as const, 'items')
const selectedId = atom({ plugin: 'spec-cycle-lens', key: 'selectedId' } as const, null)
const version = atom({ plugin: 'spec-cycle-lens', key: 'version' } as const, 0)

/** The module's own state: lost on a reload, rebuilt by session.start. */
type Lens = {
  bandOn: boolean
  suggestOn: boolean
  icons: string
  snapshotPath: string
  configPath: string
  paths: Paths | null
  current: LensRead
  signature: string
  pinned: string | null
  turnTimer: Timer | null
  tickTimer: Timer | null
}

function dirname(path: string): string {
  const index = path.lastIndexOf('/')
  return index < 0 ? '.' : path.slice(0, index)
}

async function bump($: EngineInterface): Promise<void> {
  await update($, version, n => n + 1)
}

async function publish($: EngineInterface, lens: Lens): Promise<void> {
  const next = readSignature(lens.current)
  if (next === lens.signature) return
  lens.signature = next
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

export const register: Register = (on, options) => {
  const snapshotPath = typeof options.snapshotPath === 'string' && options.snapshotPath !== '' ? options.snapshotPath : DEFAULT_SNAPSHOT
  const lens: Lens = {
    bandOn: options.band !== 'off',
    suggestOn: options.suggest !== 'off',
    icons: typeof options.icons === 'string' ? options.icons : 'unicode',
    snapshotPath,
    configPath: `${dirname(snapshotPath)}/config.yaml`,
    paths: null,
    current: EMPTY_READ,
    signature: '',
    pinned: null,
    turnTimer: null,
    tickTimer: null,
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
    if (verb === 'refresh') {
      await reload($, lens, true)
      return {
        text: lens.current.hasFile
          ? `spec-cycle lens: snapshot read again (${lens.current.snapshot?.generated_by ?? 'unreadable JSON'}).`
          : 'spec-cycle lens: no snapshot yet. Any spec-cycle subcommand writes .spec-cycle/status.json; `status --json --write` does so on demand.',
      }
    }
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
    const items = lens.current.snapshot?.items ?? []
    const selected = items.find(item => item.id === wanted) ?? pickActive(lens.current.snapshot, lens.pinned)
    const now = await $.clock.now()
    return renderPane(
      $.ui.resolve(e),
      { read: lens.current, tab: shownTab as Tab, selected, pinned: lens.pinned, icons: lens.icons, bodyColumns: e.props.bodyColumns },
      {
        showTab: shown => {
          void update($, tab, () => shown)
        },
        select: id => {
          void update($, selectedId, () => id).then(() => update($, tab, () => 'run'))
        },
        togglePin: id => {
          void setPin($, lens, lens.pinned === id ? null : id)
        },
      },
      now,
    )
  }).catch(($, e, next) => next(e))
}
