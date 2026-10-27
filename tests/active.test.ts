import { expect, test } from 'claude-code/testing'

import { pickActive } from '../hooks/active'
import type { Item, Snapshot } from '../hooks/snapshot'

export function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id, parent_id: null, title: `Title ${id}`, status: 'pending', priority: null, dependencies: [], dependencies_done: true,
    external_ref: null, run: null, handoff: null, verification: null, ...over,
  }
}

export function run(over: Partial<NonNullable<Item['run']>> = {}): NonNullable<Item['run']> {
  return {
    id: 't-x', dir: '.spec-cycle/runs/t-x', updated_at: '2026-10-27T00:00:00.000Z', revision_count: 0, max_revisions: 2,
    critic_passes: 0, verdict: null, findings: null, open_questions: [], route: null,
    artifacts: { handoff: null, brief: null, verification: null, decision_log: null, critic_reports: [], spec_files: [] },
    ...over,
  }
}

export function snapshot(items: Item[]): Snapshot {
  return {
    schema_version: '1.0', generated_at: '2026-10-27T00:00:00.000Z', generated_by: 'spec-cycle@0.4.0 status',
    config: { path: '.spec-cycle/config.yaml', intake: 'native', execution: 'inline', run_root: '.spec-cycle/runs', work_items: 'docs/work-items.yaml' },
    inputs: [], items,
  }
}

test('rule 1: a pinned item wins when the list has it', async () => {
  const snap = snapshot([item('W01', { status: 'in-progress', run: run() }), item('W02')])
  expect(pickActive(snap, 'W02')?.id).toBe('W02')
  expect(pickActive(snap, 'W99')?.id).toBe('W01')
})

test('rule 2: the in-progress item with the newest run', async () => {
  const snap = snapshot([
    item('W01', { status: 'in-progress', run: run({ updated_at: '2026-10-27T01:00:00.000Z' }) }),
    item('W02', { status: 'in-progress', run: run({ updated_at: '2026-10-27T02:00:00.000Z' }) }),
    item('W03', { status: 'pending', run: run({ updated_at: '2026-10-27T03:00:00.000Z' }) }),
  ])
  expect(pickActive(snap, null)?.id).toBe('W02')
})

test('rule 3: without in-progress, the not-done item whose run is newest', async () => {
  const snap = snapshot([
    item('W01', { status: 'done', run: run({ updated_at: '2026-10-27T05:00:00.000Z' }) }),
    item('W02', { status: 'pending', run: run({ updated_at: '2026-10-27T01:00:00.000Z' }) }),
    item('W03', { status: 'pending', run: run({ updated_at: '2026-10-27T02:00:00.000Z' }) }),
    item('W04', { status: 'pending' }),
  ])
  expect(pickActive(snap, null)?.id).toBe('W03')
})

test('rule 4: the first pending item whose dependencies are done, in list order', async () => {
  const snap = snapshot([
    item('W01', { status: 'done' }),
    item('W02', { status: 'pending', dependencies: ['W05'], dependencies_done: false }),
    item('W03', { status: 'deferred' }),
    item('W04', { status: 'pending', dependencies: ['W01'], dependencies_done: true }),
    item('W05', { status: 'pending' }),
  ])
  expect(pickActive(snap, null)?.id).toBe('W04')
})

test('rule 5: nothing eligible, and no snapshot', async () => {
  expect(pickActive(snapshot([item('W01', { status: 'done' }), item('W02', { dependencies_done: false })]), null)).toBeNull()
  expect(pickActive(snapshot([]), null)).toBeNull()
  expect(pickActive(null, 'W01')).toBeNull()
})
