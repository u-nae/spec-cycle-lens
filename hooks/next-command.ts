import type { Item, Snapshot } from './snapshot'

export type Tone = 'normal' | 'warn' | 'ok'

/** What to propose in the prompt (never submitted) and what the band's stage chip says. */
export type Next = { suggest: string | null; label: string | null; tone: Tone }

export type NextInput = {
  hasConfig: boolean
  hasFile: boolean
  snapshot: Snapshot | null
  active: Item | null
}

const none = (label: string | null, tone: Tone = 'normal'): Next => ({ suggest: null, label, tone })
const run = (id: string, label: string, tone: Tone = 'normal'): Next => ({ suggest: `/spec-cycle:run ${id}`, label, tone })

function coverage(item: Item): string {
  return item.verification ? ` · cov ${item.verification.covered}/${item.verification.total}` : ''
}

/** The table of PRD 6.2, one row per state; pure, so the table is the test. */
export function nextCommand({ hasConfig, hasFile, snapshot, active }: NextInput): Next {
  if (!hasFile && !hasConfig) return { suggest: '/spec-cycle:init', label: null, tone: 'normal' }
  if (!hasFile || !snapshot) return none('spec-cycle: 스냅숏 없음 · /lens refresh')
  if (snapshot.items.length === 0) return { suggest: '/spec-cycle:work-items', label: '작업 항목 없음', tone: 'normal' }
  if (!active) {
    const done = snapshot.items.filter(item => item.status === 'done').length
    if (done === snapshot.items.length) return none(`모두 완료 ${done}/${done}`, 'ok')
    return none('대기 · 의존성 미충족')
  }
  const { id } = active
  if (active.status === 'done') {
    const candidate = snapshot.items.find(item => item.status === 'pending' && item.dependencies_done && !item.run)
    return { suggest: candidate ? `/spec-cycle:run ${candidate.id}` : null, label: '완료', tone: 'ok' }
  }
  if (active.status === 'deferred') return none('보류')
  if (active.status === 'in-progress') {
    return { suggest: `/spec-cycle:verify ${id}`, label: `구현 중${coverage(active)}`, tone: 'normal' }
  }
  const run_ = active.run
  if (!run_) return run(id, '대기')
  const revision = run_.revision_count !== null && run_.max_revisions !== null ? ` r${run_.revision_count}/${run_.max_revisions}` : ''
  switch (run_.verdict) {
    case null:
      return none('작성/비평 중')
    case 'REVISE':
      return none(`REVISE${revision}`)
    case 'NEEDS_HUMAN':
      return run(id, `질문 ${run_.open_questions.length}개`)
    case 'BLOCKED_AT_LIMIT':
      return none('한도 도달', 'warn')
    case 'READY':
      if (active.handoff && !active.handoff.usable) return run(id, '입력 변경됨', 'warn')
      if (active.handoff) return { suggest: `/spec-cycle:implement ${id}`, label: 'READY', tone: 'ok' }
      return none('READY · handoff 없음', 'warn')
    default:
      return none(String(run_.verdict))
  }
}
