// Builders shared by the tests: items, runs and snapshots as spec-cycle 0.4.0 writes them.
import type { Item, Snapshot } from '../hooks/snapshot'

export function item(id: string, over: Partial<Item> = {}): Item {
  return {
    id, parent_id: null, title: `Title of ${id}`, status: 'pending', priority: null, dependencies: [], dependencies_done: true,
    external_ref: null, run: null, handoff: null, verification: null, ...over,
  }
}

export function run(over: Partial<NonNullable<Item['run']>> = {}): NonNullable<Item['run']> {
  return {
    id: 't-x', dir: '.spec-cycle/runs/t-x', updated_at: '2026-10-27T00:00:00.000Z', revision_count: 1, max_revisions: 2,
    critic_passes: 2, verdict: null, findings: { critical: 0, major: 0, minor: 0, note: 0 }, open_questions: [], route: 'GHERKIN',
    artifacts: { handoff: null, brief: null, verification: null, decision_log: null, critic_reports: [], spec_files: [] },
    ...over,
  }
}

export const question = {
  question_id: 'Q-W05-1', question: 'Keep or drop?', blocking: true, recommended_default: 'A', recommended_label: 'Keep',
  recommendation_rationale: 'Keeping reverses easily.',
}

export function snapshot(items: Item[], over: Partial<Snapshot> = {}): Snapshot {
  return {
    schema_version: '1.0', generated_at: '2026-10-27T00:00:00.000Z', generated_by: 'spec-cycle@0.4.0 status',
    config: { path: '.spec-cycle/config.yaml', intake: 'native', execution: 'inline', run_root: '.spec-cycle/runs', work_items: 'docs/work-items.yaml' },
    inputs: [{ path: 'docs/PRD.md', mtime_ms: 1000 }, { path: 'docs/work-items.yaml', mtime_ms: 1000 }],
    items,
    ...over,
  }
}

/** The W05 of the PRD: NEEDS_HUMAN with one open question, between W04 (done) and W06 (pending, blocked). */
export function prdSnapshot(): Snapshot {
  return snapshot([
    item('W04', { status: 'done', run: run({ verdict: 'READY', artifacts: { ...run().artifacts, handoff: 'h' } }), handoff: { usable: true, errors: [], warnings: [], obligations_total: 3 } }),
    item('W05', { title: 'Record a revision for every confirmed configuration change', dependencies: ['W04'], run: run({ verdict: 'NEEDS_HUMAN', open_questions: [question], findings: { critical: 0, major: 1, minor: 2, note: 0 } }) }),
    item('W06', { dependencies: ['W05'], dependencies_done: false }),
  ])
}

/** A file system in memory, answered beneath the plugin through the test's `on`. */
export type FakeFs = {
  files: Map<string, { text: string; mtimeMs: number }>
  reads: number
  stats: number
}

export function fakeFs(on: (event: any, hook: any) => unknown, initial: Record<string, { text: string; mtimeMs: number }> = {}): FakeFs {
  const fs: FakeFs = { files: new Map(Object.entries(initial)), reads: 0, stats: 0 }
  on('fs.exists', (_: unknown, e: { path: string }) => ({ value: fs.files.has(e.path) }))
  on('fs.stat', (_: unknown, e: { path: string }) => {
    fs.stats += 1
    const file = fs.files.get(e.path)
    if (!file) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: 'file', size: file.text.length, mtimeMs: file.mtimeMs, isLink: false } }
  })
  on('fs.read', (_: unknown, e: { path: string }) => {
    fs.reads += 1
    const file = fs.files.get(e.path)
    if (!file) throw new Error(`ENOENT ${e.path}`)
    return { value: file.text }
  })
  return fs
}

export const CWD = '/proj'
export const SNAPSHOT_FILE = `${CWD}/.spec-cycle/status.json`
export const CONFIG_FILE = `${CWD}/.spec-cycle/config.yaml`

export const BAND = {
  plugin: 'spec-cycle-lens',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 80, scroll: { offset: 0, bodyRows: 5 }, view: {} },
} as const

export const PANE = {
  plugin: 'spec-cycle-lens',
  component: 'Pane',
  requestId: 'lens',
  props: { title: 'spec-cycle lens', isFocused: true, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const

export const HINT = {
  plugin: 'spec-cycle-lens',
  component: 'PromptHint',
  props: { isDraft: true, isWorking: false, hint: '? for shortcuts' },
} as const
