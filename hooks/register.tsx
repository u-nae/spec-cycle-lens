// Stage 0 spike: proves the three surfaces the mod needs (band, pane, prompt
// suggestion) on this Claude Code build with fixed text. No snapshot is read
// yet; see docs/superpowers/specs/2026-10-27-spec-cycle-lens-prd.md §8.
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const PANE = 'lens'
const COMMAND = 'lens'
const SPIKE_SUGGESTION = '/spec-cycle:run W05'

const lastSuggested = atom(
  { plugin: 'spec-cycle-lens', key: 'lastSuggested' } as const,
  null,
)

export const register: Register = (on, options) => {
  const bandOn = options.band !== 'off'
  const suggestOn = options.suggest !== 'off'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Open the spec-cycle lens pane',
      argumentHint: '[pin <id> | unpin | refresh]',
    })
    if (suggestOn && e.isInteractive) {
      const seen = await read($, lastSuggested)
      if (seen !== SPIKE_SUGGESTION) {
        await update($, lastSuggested, () => SPIKE_SUGGESTION)
        void $.prompt.suggest({ text: SPIKE_SUGGESTION })
      }
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const placed = await $.ui.open({ id: PANE, title: 'spec-cycle lens' })
    return {
      text: placed.isPlaced
        ? 'spec-cycle lens pane opened.'
        : 'spec-cycle lens pane is waiting for room (widen the terminal or use fullscreen).',
    }
  }).catch(() => ({ text: 'spec-cycle lens: could not open the pane.' }))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (!bandOn || e.props.hasSurvey) return below
    const { Box, Button, Text } = $.ui.resolve(e)
    const band = (
      <Button
        key="band"
        plain
        onPress={() => {
          void $.ui.open({ id: PANE, title: 'spec-cycle lens' })
        }}
      >
        <Text color="cyan">◆</Text> <Text bold>W05</Text>{' '}
        <Text>Record a revision…</Text>{' '}
        <Text inverse> NEEDS_HUMAN · 질문 1 </Text>{' '}
        <Text dimColor>r1/2</Text>{' '}
        <Text dimColor>spike</Text>
      </Button>
    )
    if (!below) return band
    return (
      <Box flexDirection="column">
        {below}
        {band}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold>spec-cycle lens (spike)</Text>
        <Text dimColor>
          Items / Run / Docs tabs arrive in stage 2. Width: {e.props.bodyColumns}
        </Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
