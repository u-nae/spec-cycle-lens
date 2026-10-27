import { expect, test } from 'claude-code/testing'

import { nextCommand } from '../hooks/next-command'
import type { NextInput } from '../hooks/next-command'
import { item, run, snapshot, question } from './fixtures'

const ready = (over: Parameters<typeof item>[1] = {}) => item('W05', {
  run: run({ verdict: 'READY', artifacts: { ...run().artifacts, handoff: 'h' } }),
  handoff: { usable: true, errors: [], warnings: [], obligations_total: 4 },
  ...over,
})

// Each row of PRD 6.2: the input, the suggestion and the band chip.
const withActive = (active: ReturnType<typeof item>): NextInput => ({ hasConfig: true, hasFile: true, snapshot: snapshot([active]), active })

const rows: Array<[string, NextInput, string | null, string | null]> = [
  ['no status.json and no config.yaml', { hasConfig: false, hasFile: false, snapshot: null, active: null }, '/spec-cycle:init', null],
  ['config.yaml but no snapshot', { hasConfig: true, hasFile: false, snapshot: null, active: null }, null, 'spec-cycle: 스냅숏 없음 · /lens refresh'],
  ['zero work items', { hasConfig: true, hasFile: true, snapshot: snapshot([]), active: null }, '/spec-cycle:work-items', '작업 항목 없음'],
  ['pending, no run', { hasConfig: true, hasFile: true, snapshot: snapshot([item('W05')]), active: item('W05') }, '/spec-cycle:run W05', '대기'],
  ['run under way (verdict null)', withActive(item('W05', { run: run() })), null, '작성/비평 중'],
  ['REVISE', withActive(item('W05', { run: run({ verdict: 'REVISE' }) })), null, 'REVISE r1/2'],
  ['NEEDS_HUMAN', withActive(item('W05', { run: run({ verdict: 'NEEDS_HUMAN', open_questions: [question] }) })), '/spec-cycle:run W05', '질문 1개'],
  ['BLOCKED_AT_LIMIT', withActive(item('W05', { run: run({ verdict: 'BLOCKED_AT_LIMIT', revision_count: 2 }) })), null, '한도 도달'],
  ['READY, handoff usable, pending', withActive(ready()), '/spec-cycle:implement W05', 'READY'],
  ['READY but handoff unusable', withActive(ready({ handoff: { usable: false, errors: ['baseline docs/PRD.md changed since the handoff; rerun the gate'], warnings: [], obligations_total: 4 } })), '/spec-cycle:run W05', '입력 변경됨'],
  ['in-progress without verification', withActive(ready({ status: 'in-progress' })), '/spec-cycle:verify W05', '구현 중'],
  ['in-progress with uncovered obligations', withActive(ready({ status: 'in-progress', verification: { covered: 3, total: 7, checked_at: null, tests: 'unknown', status_written: null } })), '/spec-cycle:verify W05', '구현 중 · cov 3/7'],
  ['done, with a next candidate', { hasConfig: true, hasFile: true, snapshot: snapshot([item('W05', { status: 'done' }), item('W06')]), active: item('W05', { status: 'done' }) }, '/spec-cycle:run W06', '완료'],
  ['done, nothing left', { hasConfig: true, hasFile: true, snapshot: snapshot([item('W05', { status: 'done' })]), active: item('W05', { status: 'done' }) }, null, '완료'],
  ['every item done, no active item', { hasConfig: true, hasFile: true, snapshot: snapshot([item('W01', { status: 'done' }), item('W02', { status: 'done' })]), active: null }, null, '모두 완료 2/2'],
  ['no active item while dependencies wait', { hasConfig: true, hasFile: true, snapshot: snapshot([item('W01', { status: 'done' }), item('W02', { dependencies: ['W03'], dependencies_done: false })]), active: null }, null, '대기 · 의존성 미충족'],
  ['deferred', withActive(item('W05', { status: 'deferred' })), null, '보류'],
]

for (const [name, input, suggestion, label] of rows) {
  test(`nextCommand: ${name}`, async () => {
    const next = nextCommand(input)
    expect(next.suggest).toBe(suggestion)
    expect(next.label).toBe(label)
  })
}

test('nextCommand tones: warnings for the limit and changed inputs, ok for READY', async () => {
  expect(nextCommand(withActive(item('W05', { run: run({ verdict: 'BLOCKED_AT_LIMIT' }) }))).tone).toBe('warn')
  expect(nextCommand(withActive(ready({ handoff: { usable: false, errors: ['x'], warnings: [], obligations_total: 1 } }))).tone).toBe('warn')
  expect(nextCommand(withActive(ready())).tone).toBe('ok')
  expect(nextCommand(withActive(item('W05'))).tone).toBe('normal')
})

test('nextCommand never proposes anything that is not a spec-cycle command', async () => {
  for (const [, input] of rows) {
    const { suggest } = nextCommand(input)
    if (suggest !== null) expect(suggest).toMatch(/^\/spec-cycle:(init|work-items|run \S+|implement \S+|verify \S+)$/)
  }
})
