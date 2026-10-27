import type { Item } from './snapshot'

export type IconSet = 'unicode' | 'nerd' | 'emoji'

type Glyphs = { pending: string; inProgress: string; done: string; deferred: string; warn: string; pin: string; meterOn: string; meterOff: string }

const SETS: Record<IconSet, Glyphs> = {
  unicode: { pending: '◇', inProgress: '◆', done: '✓', deferred: '−', warn: '⚠', pin: '📌', meterOn: '━', meterOff: '─' },
  nerd: { pending: '\u{f10c}', inProgress: '\u{f111}', done: '\u{f00c}', deferred: '\u{f068}', warn: '\u{f071}', pin: '\u{f08d}', meterOn: '━', meterOff: '─' },
  emoji: { pending: '⬜', inProgress: '🟦', done: '✅', deferred: '⏸', warn: '⚠️', pin: '📌', meterOn: '━', meterOff: '─' },
}

export function iconSet(name: string | undefined): IconSet {
  return name === 'nerd' || name === 'emoji' ? name : 'unicode'
}

export function glyphs(set: IconSet): Glyphs {
  return SETS[set]
}

export function statusGlyph(set: IconSet, status: Item['status']): string {
  const g = SETS[set]
  switch (status) {
    case 'in-progress': return g.inProgress
    case 'done': return g.done
    case 'deferred': return g.deferred
    default: return g.pending
  }
}
