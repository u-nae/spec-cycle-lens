import type { Item, Snapshot } from './snapshot'

/** One line per item that says where it stands; a change of it is a transition worth a toast. */
export function stageKey(item: Item): string {
  return `${item.status}|${item.run?.verdict ?? ''}`
}

export type Baseline = Record<string, string>

export function baselineOf(snapshot: Snapshot): Baseline {
  const next: Baseline = {}
  for (const item of snapshot.items) next[item.id] = stageKey(item)
  return next
}

function nextCandidate(snapshot: Snapshot, after: string): string | null {
  const index = snapshot.items.findIndex(item => item.id === after)
  const later = snapshot.items.slice(index + 1).find(item => item.status === 'pending' && item.dependencies_done)
  return (later ?? snapshot.items.find(item => item.status === 'pending' && item.dependencies_done))?.id ?? null
}

/**
 * The toasts of PRD 6.7 for the items whose stage changed since `previous`. An empty `previous` is the
 * session's first read: it sets the baseline and says nothing.
 */
export function transitions(previous: Baseline, snapshot: Snapshot): { baseline: Baseline; toasts: string[] } {
  const baseline = baselineOf(snapshot)
  const toasts: string[] = []
  if (Object.keys(previous).length === 0) return { baseline, toasts }
  for (const item of snapshot.items) {
    const before = previous[item.id]
    const now = stageKey(item)
    if (before === undefined || before === now) continue
    const [status, verdict] = now.split('|')
    const wasDone = before.startsWith('done|')
    if (status === 'done' && !wasDone) {
      const next = nextCandidate(snapshot, item.id)
      toasts.push(next ? `${item.id} 완료 · 다음 ${next}` : `${item.id} 완료`)
      continue
    }
    if (verdict === before.split('|')[1]) continue
    switch (verdict) {
      case 'READY':
        toasts.push(`${item.id} READY · /spec-cycle:implement ${item.id}`)
        break
      case 'NEEDS_HUMAN': {
        const open = item.run?.open_questions ?? []
        const first = open[0]
        toasts.push(`${item.id} 질문 ${open.length}개${first?.recommended_default ? ` · 권장안 ${first.recommended_default}` : ''}`)
        break
      }
      case 'BLOCKED_AT_LIMIT':
        toasts.push(`${item.id} revision 한도 도달`)
        break
      default:
        break
    }
  }
  return { baseline, toasts }
}
