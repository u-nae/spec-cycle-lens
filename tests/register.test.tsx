import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'

import { BAND, CONFIG_FILE, CWD, HINT, SNAPSHOT_FILE, fakeFs, item, prdSnapshot, run, snapshot } from './fixtures'
import type { FakeFs } from './fixtures'

type Engine = Parameters<TestBody>[0]

type World = {
  fs: FakeFs
  suggested: string[]
  toasts: string[]
  gates: string[]
  clock: ReturnType<typeof mock.clock>
}

function world(on: On, files: Record<string, { text: string; mtimeMs: number }>): World {
  const w: World = { fs: fakeFs(on, files), suggested: [], toasts: [], gates: [], clock: mock.clock(on, { now: Date.parse('2026-10-27T01:00:00.000Z') }) }
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('prompt.suggest', (_, e) => {
    w.suggested.push(e.text)
    return { isShown: true }
  })
  on('prompt.fill', () => {
    w.gates.push('fill')
    return { value: { isFilled: false } } as never
  })
  on('prompt.submit', () => {
    w.gates.push('submit')
    return { drop: 'test' } as never
  })
  on('ui.toast', (_, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.end', (_, e) => ({ sessionId: e.sessionId }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
  return w
}

const snapshotFiles = (snap = prdSnapshot(), mtimeMs = 5000) => ({
  [SNAPSHOT_FILE]: { text: JSON.stringify(snap), mtimeMs },
  [CONFIG_FILE]: { text: 'schema_version: "1.1"', mtimeMs: 1 },
})

async function completeTurn($: Engine, turnId = 't1') {
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId, reason: 'answer' })
}

test('A11: a project without a snapshot draws no band and raises no toast', async ($, on) => {
  const w = world(on, {})
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'lens-band' })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /engine/ }))?.text).toBe('engine')
  await ui.unmount()
  expect(w.toasts).toEqual([])
  expect(w.suggested).toEqual(['/spec-cycle:init'])
})

test('A15: the same next command is suggested once; prompt.fill and prompt.submit are never called', async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await completeTurn($, 't1')
  await completeTurn($, 't2')
  expect(w.suggested).toEqual(['/spec-cycle:run W05'])
  expect(w.gates).toEqual([])
})

test('a headless session suggests nothing at start', async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: null, isInteractive: false })
  expect(w.suggested).toEqual([])
})

test('suggest off neither proposes nor adds a hint tail', { options: { suggest: 'off' } }, async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(w.suggested).toEqual([])
  const ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /next:/ })).toBeUndefined()
  await ui.unmount()
})

test('A16: a changed status.json is read at the next turn.complete; an unchanged one is not parsed again', async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(w.fs.reads).toBe(1)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /질문 1개/ })).toBeDefined()
  await ui.unmount()

  await completeTurn($, 't1')
  expect(w.fs.reads).toBe(1)

  const next = prdSnapshot()
  next.items[1]!.status = 'in-progress'
  next.items[1]!.run!.verdict = 'READY'
  next.items[1]!.handoff = { usable: true, errors: [], warnings: [], obligations_total: 8 }
  w.fs.files.set(SNAPSHOT_FILE, { text: JSON.stringify(next), mtimeMs: 6000 })
  await completeTurn($, 't2')
  expect(w.fs.reads).toBe(2)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /구현 중/ })).toBeDefined()
  await ui.unmount()
  expect(w.suggested).toEqual(['/spec-cycle:run W05', '/spec-cycle:verify W05'])
})

test('during a turn the file is polled every two seconds by its mtime and size', async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'go', turnId: 't1' })
  const statsBefore = w.fs.stats
  await w.clock.advance(2_000)
  expect(w.fs.stats).toBeGreaterThan(statsBefore)
  expect(w.fs.reads).toBe(1)
  const next = prdSnapshot()
  next.items[1]!.run!.verdict = 'BLOCKED_AT_LIMIT'
  w.fs.files.set(SNAPSHOT_FILE, { text: JSON.stringify(next), mtimeMs: 7000 })
  await w.clock.advance(2_000)
  expect(w.fs.reads).toBe(2)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /한도 도달/ })).toBeDefined()
  await ui.unmount()
  await completeTurn($, 't1')
  const stats = w.fs.stats
  await w.clock.advance(4_000)
  expect(w.fs.stats).toBe(stats)
})

test('A17: broken JSON keeps the previous state and shows a warning glyph', async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  w.fs.files.set(SNAPSHOT_FILE, { text: '{"schema_version": "1.0", "items": [', mtimeMs: 6000 })
  await completeTurn($, 't1')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /W05/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^⚠$/ })).toBeDefined()
  await ui.unmount()
  expect(w.toasts).toEqual([])
})

test('A18: the band survives /clear and the next turn reads the file again', async ($, on) => {
  const w = world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /W05/ })).toBeDefined()
  await ui.unmount()
  w.fs.files.set(SNAPSHOT_FILE, { text: JSON.stringify(snapshot([item('W09')])), mtimeMs: 9000 })
  await completeTurn($, 't1')
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /W09/ })).toBeDefined()
  await ui.unmount()
})

test('a stale snapshot is marked after the minute tick without reading the file', async ($, on) => {
  const w = world(on, { ...snapshotFiles(), [`${CWD}/docs/PRD.md`]: { text: '#', mtimeMs: 1000 } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  w.fs.files.set(`${CWD}/docs/PRD.md`, { text: '##', mtimeMs: 2000 })
  await w.clock.advance(60_000)
  expect(w.fs.reads).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /스냅숏 오래됨/ })).toBeDefined()
  await ui.unmount()
})

test('the hint line carries the command while a draft is typed', async ($, on) => {
  world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  let ui = await $.ui.mount({ ...HINT, surface: 'terminal' })
  expect(JSON.stringify(await ui.drawn())).toMatch(/next: \/spec-cycle:run W05|engine/)
  await ui.unmount()
})

test('/lens pin and unpin move the active item and are kept in the store', async ($, on) => {
  world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const runLens = (args: string) => $.command.run({ command: 'lens', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })
  expect((await runLens('pin W99')).text).toMatch(/no work item W99/)
  expect((await runLens('pin W04')).text).toMatch(/pinned W04/)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /📌W04/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /완료/ })).toBeDefined()
  await ui.unmount()
  // The pin is kept in the store: a new session start (a reload) reads it back.
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /📌W04/ })).toBeDefined()
  await ui.unmount()
  expect((await runLens('unpin')).text).toMatch(/released/)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^W05$/ })).toBeDefined()
  await ui.unmount()
  expect((await runLens('refresh')).text).toMatch(/read again/)
  expect((await runLens('')).text).toBe('spec-cycle lens pane opened.')
})

test('A14: the band stays on one row at 40, 60, 80 and 120 columns with the id and the chip', async ($, on) => {
  const stale = prdSnapshot()
  world(on, { ...snapshotFiles(stale), [`${CWD}/docs/PRD.md`]: { text: '#', mtimeMs: 2000 } })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  for (const bodyColumns of [40, 60, 80, 120]) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, bodyColumns } })
    const band = await ui.find({ key: 'lens-band' })
    expect(band).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^W05$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /질문 1개/ })).toBeDefined()
    await ui.unmount()
  }
})

test('band off leaves the engine band alone', { options: { band: 'off' } }, async ($, on) => {
  world(on, snapshotFiles())
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'lens-band' })).toBeUndefined()
  await ui.unmount()
})

test('a snapshot at a configured path is read from there', { options: { snapshotPath: 'tmp/gate/status.json' } }, async ($, on) => {
  const w = world(on, {
    [`${CWD}/tmp/gate/status.json`]: { text: JSON.stringify(snapshot([item('W01', { status: 'in-progress', run: run() })])), mtimeMs: 1 },
    [`${CWD}/tmp/gate/config.yaml`]: { text: '', mtimeMs: 1 },
  })
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  expect(w.suggested).toEqual(['/spec-cycle:verify W01'])
})
