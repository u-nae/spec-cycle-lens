import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { CWD, PANE, SNAPSHOT_FILE, CONFIG_FILE, fakeFs, prdSnapshot } from './fixtures'

async function start($: any, on: On) {
  mock.clock(on, { now: Date.parse('2026-10-27T01:00:00.000Z') })
  mock.store(on)
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('prompt.suggest', () => ({ isShown: true }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
}

test('the pane lists the items and opens the run of a pressed item, on every surface', async ($, on) => {
  fakeFs(on, {
    [SNAPSHOT_FILE]: { text: JSON.stringify(prdSnapshot()), mtimeMs: 5000 },
    [CONFIG_FILE]: { text: '', mtimeMs: 1 },
  })
  await start($, on)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ key: 'item:W04' })).toBeDefined()
    expect(await ui.find({ key: 'item:W05' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /의존성 대기: W05/ })).toBeDefined()
    await ui.press({ key: 'item:W05' })
    expect(await ui.find({ type: 'Text', text: /Q-W05-1 \(blocking\): Keep or drop\?/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /권장 A Keep/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /findings critical 0 · major 1 · minor 2/ })).toBeDefined()
    await ui.press({ key: 'tab:items' })
    expect(await ui.find({ key: 'item:W06' })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane pins the selected item with p and the band follows', async ($, on) => {
  fakeFs(on, {
    [SNAPSHOT_FILE]: { text: JSON.stringify(prdSnapshot()), mtimeMs: 5000 },
    [CONFIG_FILE]: { text: '', mtimeMs: 1 },
  })
  await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'item:W04' })
  await ui.press({ key: 'tab:items' })
  expect((await ui.find({ key: 'pin' }))?.text).toBe('pin W04')
  await ui.press({ key: 'pin' })
  expect((await ui.find({ key: 'pin' }))?.text).toBe('unpin W04')
  expect(await ui.find({ type: 'Text', text: /📌W04/ })).toBeDefined()
  await ui.unmount()
})

test('the pane explains an empty project and a missing snapshot', async ($, on) => {
  fakeFs(on, {})
  await start($, on)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /spec-cycle:init/ })).toBeDefined()
  await ui.unmount()
})

test('the pane narrows its cards under 44 columns', async ($, on) => {
  fakeFs(on, {
    [SNAPSHOT_FILE]: { text: JSON.stringify(prdSnapshot()), mtimeMs: 5000 },
    [CONFIG_FILE]: { text: '', mtimeMs: 1 },
  })
  await start($, on)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: { ...PANE.props, bodyColumns: 40 } })
  const drawn = JSON.stringify(await ui.drawn())
  expect(drawn.includes('"borderStyle":"round"')).toBe(false)
  expect(await ui.find({ key: 'item:W05' })).toBeDefined()
  await ui.unmount()
})
