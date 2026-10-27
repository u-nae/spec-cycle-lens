import { expect, test } from 'claude-code/testing'

import { baselineOf, stageKey, transitions } from '../hooks/transitions'
import { item, prdSnapshot, question, run, snapshot } from './fixtures'

test('the first read only sets the baseline', async () => {
  const { baseline, toasts } = transitions({}, prdSnapshot())
  expect(toasts).toEqual([])
  expect(baseline).toEqual({ W04: 'done|READY', W05: 'pending|NEEDS_HUMAN', W06: 'pending|' })
})

test('each transition of PRD 6.7 is one toast, and an unchanged item none', async () => {
  const before = baselineOf(prdSnapshot())
  const ready = snapshot([item('W05', { run: run({ verdict: 'READY' }) }), item('W06')])
  expect(transitions(before, ready).toasts).toEqual(['W05 READY · /spec-cycle:implement W05'])

  const asked = snapshot([item('W06', { run: run({ verdict: 'NEEDS_HUMAN', open_questions: [question, { ...question, question_id: 'Q-2' }] }) })])
  expect(transitions(before, asked).toasts).toEqual(['W06 질문 2개 · 권장안 A'])

  const blocked = snapshot([item('W05', { run: run({ verdict: 'BLOCKED_AT_LIMIT' }) })])
  expect(transitions(before, blocked).toasts).toEqual(['W05 revision 한도 도달'])

  const done = snapshot([item('W05', { status: 'done', run: run({ verdict: 'READY' }) }), item('W06', { dependencies_done: true })])
  expect(transitions(before, done).toasts).toEqual(['W05 완료 · 다음 W06'])

  const doneLast = snapshot([item('W05', { status: 'done', run: run({ verdict: 'READY' }) })])
  expect(transitions(before, doneLast).toasts).toEqual(['W05 완료'])

  expect(transitions(before, prdSnapshot()).toasts).toEqual([])
})

test('REVISE, a new item and a status change without a verdict change are quiet', async () => {
  const before = baselineOf(prdSnapshot())
  const revise = snapshot([item('W05', { run: run({ verdict: 'REVISE' }) }), item('W07', { run: run({ verdict: 'READY' }) })])
  expect(transitions(before, revise).toasts).toEqual([])
  const implementing = snapshot([item('W04', { status: 'in-progress', run: run({ verdict: 'READY' }) })])
  expect(transitions({ W04: 'pending|READY' }, implementing).toasts).toEqual([])
  expect(stageKey(item('W01'))).toBe('pending|')
})
