import { expect, test } from 'claude-code/testing'

import { editorCandidates, editorMode } from '../hooks/editor'

const path = '/p/.spec-cycle/runs/t-w05/spec-brief.md'

test('off opens nothing; tmux-nvim opens nvim in a tmux window', async () => {
  expect(editorCandidates('off', { visual: 'code --wait', platform: 'darwin' }, path)).toEqual([])
  expect(editorCandidates('tmux-nvim', { editor: 'nvim', platform: 'darwin' }, path)).toEqual([['tmux', 'new-window', '-n', 'nvim', 'nvim', path]])
})

test('auto: a windowed VISUAL/EDITOR without --wait, then code/cursor by TERM_PROGRAM, then open on macOS', async () => {
  expect(editorCandidates('auto', { visual: 'code --wait', editor: 'nvim', termProgram: 'vscode', platform: 'darwin' }, path)).toEqual([
    ['code', path], ['open', path],
  ])
  expect(editorCandidates('auto', { editor: '/usr/local/bin/zed -w', termProgram: 'Apple_Terminal', platform: 'darwin' }, path)).toEqual([
    ['/usr/local/bin/zed', path], ['open', path],
  ])
  expect(editorCandidates('auto', { editor: 'nvim', termProgram: 'cursor', platform: 'linux' }, path)).toEqual([['cursor', path], ['xdg-open', path]])
})

test('auto skips terminal editors (vim family, nano, emacs)', async () => {
  for (const editor of ['vim', 'nvim', 'vi', 'nano', 'emacs', '/opt/homebrew/bin/nvim']) {
    expect(editorCandidates('auto', { visual: editor, platform: 'linux' }, path)).toEqual([['xdg-open', path]])
  }
  expect(editorMode('auto')).toBe('auto')
  expect(editorMode('tmux-nvim')).toBe('tmux-nvim')
  expect(editorMode('anything else')).toBe('off')
  expect(editorMode(undefined)).toBe('off')
})
