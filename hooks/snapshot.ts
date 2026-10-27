// The status snapshot spec-cycle writes (spec-cycle references/contracts.md, "Status snapshot") and
// how the mod reads it: a pure module over an Fs port, so a test feeds it files from memory.

export type Verdict = 'READY' | 'REVISE' | 'NEEDS_HUMAN' | 'BLOCKED_AT_LIMIT'
export type ItemStatus = 'pending' | 'in-progress' | 'done' | 'deferred'

export type OpenQuestion = {
  question_id: string
  question: string | null
  blocking: boolean
  recommended_default: string | null
  recommended_label: string | null
  recommendation_rationale: string | null
}

export type RunInfo = {
  id: string
  dir: string
  updated_at: string
  revision_count: number | null
  max_revisions: number | null
  critic_passes: number
  verdict: Verdict | null
  findings: { critical: number; major: number; minor: number; note: number } | null
  open_questions: OpenQuestion[]
  route: string | null
  artifacts: {
    handoff: string | null
    brief: string | null
    verification: string | null
    decision_log: string | null
    critic_reports: string[]
    spec_files: string[]
  }
}

export type HandoffInfo = { usable: boolean; errors: string[]; warnings: string[]; obligations_total: number }

export type VerificationInfo = {
  covered: number
  total: number
  checked_at: string | null
  tests: 'passed' | 'failed' | 'confirmed' | 'unknown'
  status_written: string | null
}

export type Item = {
  id: string
  parent_id: string | null
  title: string
  status: ItemStatus | string
  priority: string | null
  dependencies: string[]
  dependencies_done: boolean
  external_ref: string | null
  run: RunInfo | null
  handoff: HandoffInfo | null
  verification: VerificationInfo | null
}

export type SnapshotInput = { path: string; mtime_ms: number; kind?: 'dir-max' }

export type Snapshot = {
  schema_version: string
  generated_at: string
  generated_by: string
  config: { path: string; intake: string; execution: string; run_root: string; work_items: string }
  inputs: SnapshotInput[]
  items: Item[]
}

/** What the mod needs of the file system; `$.fs` behind the Host, memory in a test. */
export type Fs = {
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<{ mtimeMs: number; size: number }>
  read: (path: string) => Promise<string>
}

export type Paths = { cwd: string; snapshotPath: string; configPath: string }

/** What one read came to. `snapshot` is the last document that parsed; `isBroken` says the file on disk no longer does. */
export type LensRead = {
  hasConfig: boolean
  hasFile: boolean
  snapshot: Snapshot | null
  key: string | null
  isBroken: boolean
  isStale: boolean
}

export const EMPTY_READ: LensRead = { hasConfig: false, hasFile: false, snapshot: null, key: null, isBroken: false, isStale: false }

export function join(cwd: string, relative: string): string {
  if (relative.startsWith('/')) return relative
  return `${cwd.replace(/\/+$/, '')}/${relative}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parses a snapshot document; null when it is not JSON or not a schema 1.x snapshot with an item list. */
export function parseSnapshot(text: string): Snapshot | null {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  if (typeof value.schema_version !== 'string' || !value.schema_version.startsWith('1.')) return null
  if (!Array.isArray(value.items) || !isRecord(value.config)) return null
  for (const item of value.items) {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.status !== 'string') return null
  }
  return value as unknown as Snapshot
}

/** `mtimeMs:size` of the file, or null when it is absent. The cache key a reader compares before parsing again. */
export async function snapshotKey(fs: Fs, paths: Paths): Promise<string | null> {
  const file = join(paths.cwd, paths.snapshotPath)
  if (!(await fs.exists(file))) return null
  const stat = await fs.stat(file)
  return `${Math.round(stat.mtimeMs)}:${stat.size}`
}

/** True when any input the snapshot lists is newer on disk than the snapshot recorded (no hashing: stat only). */
export async function isStale(fs: Fs, cwd: string, snapshot: Snapshot): Promise<boolean> {
  for (const input of snapshot.inputs) {
    const file = join(cwd, input.path)
    if (!(await fs.exists(file))) continue
    const stat = await fs.stat(file)
    if (Math.round(stat.mtimeMs) > input.mtime_ms) return true
  }
  return false
}

/**
 * Reads the snapshot. With `previous` whose key matches the file, the document is reused and only the
 * freshness is checked again. A file that stops parsing keeps the previous document and marks the read broken.
 */
export async function readLens(fs: Fs, paths: Paths, previous: LensRead = EMPTY_READ): Promise<LensRead> {
  const hasConfig = await fs.exists(join(paths.cwd, paths.configPath))
  const key = await snapshotKey(fs, paths)
  if (key === null) return { ...EMPTY_READ, hasConfig }
  if (key === previous.key && previous.snapshot) {
    return { ...previous, hasConfig, hasFile: true, isStale: await isStale(fs, paths.cwd, previous.snapshot) }
  }
  const snapshot = parseSnapshot(await fs.read(join(paths.cwd, paths.snapshotPath)))
  if (snapshot === null) {
    return { hasConfig, hasFile: true, snapshot: previous.snapshot, key, isBroken: true, isStale: previous.isStale }
  }
  return { hasConfig, hasFile: true, snapshot, key, isBroken: false, isStale: await isStale(fs, paths.cwd, snapshot) }
}

/** A short signature of what the band and pane draw from a read; a changed signature is worth a redraw. */
export function readSignature(read: LensRead): string {
  const items = read.snapshot?.items.map(item => [
    item.id, item.status, item.run?.verdict ?? '', item.run?.revision_count ?? '', item.run?.open_questions.length ?? '',
    item.handoff?.usable ?? '', item.verification ? `${item.verification.covered}/${item.verification.total}` : '',
  ].join('|')).join(';') ?? ''
  return `${read.hasConfig}:${read.hasFile}:${read.isBroken}:${read.isStale}:${read.key ?? ''}:${items}`
}
