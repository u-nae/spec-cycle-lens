import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'spec-cycle-lens',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 5 },
    view: {},
  },
} as const

const PANE = {
  plugin: 'spec-cycle-lens',
  component: 'Pane',
  requestId: 'lens',
  props: {
    title: 'spec-cycle lens',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

test('session.start registers /lens and suggests once', async ($, on) => {
  const registered: string[] = []
  const suggested: string[] = []
  on('command.register', (_, e) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  on('prompt.suggest', (_, e) => {
    suggested.push(e.text)
    return { isShown: true }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  expect(registered).toEqual(['lens', 'lens'])
  expect(suggested).toEqual(['/spec-cycle:run W05'])
})

// Nothing draws beneath the plugin in a test: this hook stands for the engine's
// own band (or another mod's), which the lens must stack on top of, never replace.
function engineBand(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

test('the band draws the item id and the stage chip above the engine band', async ($, on) => {
  engineBand(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ type: 'Text', text: /W05/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /NEEDS_HUMAN/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the band yields to a survey', async ($, on) => {
  engineBand(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /W05/ })).toBeUndefined()
  await ui.unmount()
})

test('band off leaves the engine band alone', { options: { band: 'off' } }, async ($, on) => {
  engineBand(on)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /W05/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()
})

test('/lens opens the pane and the pane mounts on every surface', async ($, on) => {
  const opened: string[] = []
  on('command.register', (_, e) => ({ value: { command: e.name } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('prompt.suggest', () => ({ isShown: true }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ran = await $.command.run({
    command: 'lens',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 120 },
  })
  expect(ran.text).toBe('spec-cycle lens pane opened.')
  expect(opened).toEqual(['lens'])

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /spec-cycle lens/ })).toBeDefined()
    await ui.unmount()
  }
})
