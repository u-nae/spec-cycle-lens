import { pickActive } from './active'
import { glyphs, iconSet, statusGlyph } from './icons'
import { nextCommand } from './next-command'
import type { Next, Tone } from './next-command'
import type { LensRead } from './snapshot'
import { cells, truncate } from './text'

/** What the band says, before any width is known. */
export type BandModel = {
  glyph: string
  id: string | null
  title: string | null
  chip: string
  tone: Tone
  revision: string | null
  meter: { done: number; total: number } | null
  warnings: string[]
}

export function bandModel(read: LensRead, pinned: string | null, icons: string | undefined): BandModel | null {
  const set = iconSet(icons)
  const g = glyphs(set)
  const active = pickActive(read.snapshot, pinned)
  const next: Next = nextCommand({ hasConfig: read.hasConfig, hasFile: read.hasFile, snapshot: read.snapshot, active })
  if (next.label === null) return null
  const items = read.snapshot?.items ?? []
  const warnings: string[] = []
  if (read.isStale) warnings.push(`${g.warn} 스냅숏 오래됨`)
  if (read.isBroken) warnings.push(g.warn)
  const run = active?.run ?? null
  const revision = run && run.revision_count !== null && run.max_revisions !== null && active?.status !== 'in-progress'
    ? `r${run.revision_count}/${run.max_revisions}`
    : null
  return {
    glyph: active ? statusGlyph(set, active.status) : g.pending,
    id: active ? (pinned === active.id ? `${g.pin}${active.id}` : active.id) : null,
    title: active?.title ?? null,
    chip: next.label,
    tone: next.tone,
    revision,
    meter: items.length > 0 ? { done: items.filter(item => item.status === 'done').length, total: items.length } : null,
    warnings,
  }
}

export type Segment = { text: string; kind: 'glyph' | 'id' | 'title' | 'chip' | 'revision' | 'meter' | 'count' | 'warning' | 'gap' }

const METER_CELLS = 8
const MIN_METER_ROOM = 12

/**
 * Lays the model out in `columns` cells: the fixed parts first (glyph, id, chip, revision, count, warnings), the
 * meter only when 12 cells remain, and the title cut to what is left. The id and the chip survive any width.
 */
export function layoutBand(model: BandModel, columns: number): Segment[] {
  const gap: Segment = { text: ' ', kind: 'gap' }
  const chip: Segment = { text: ` ${model.chip} `, kind: 'chip' }
  const head: Segment[] = [{ text: model.glyph, kind: 'glyph' }]
  if (model.id) head.push(gap, { text: model.id, kind: 'id' })
  const tail: Segment[] = []
  if (model.revision) tail.push(gap, { text: model.revision, kind: 'revision' })
  const count = model.meter ? `${model.meter.done}/${model.meter.total} done` : null
  if (count) tail.push(gap, { text: count, kind: 'count' })
  for (const warning of model.warnings) tail.push(gap, { text: warning, kind: 'warning' })

  const width = (segments: Segment[]) => segments.reduce((sum, segment) => sum + cells(segment.text), 0)
  let room = columns - width(head) - 1 - cells(chip.text) - width(tail)
  // The chip and the id stay; the count, the warnings and the revision go first when the row is too narrow.
  while (room < 0 && tail.length > 0) {
    tail.splice(-2, 2)
    room = columns - width(head) - 1 - cells(chip.text) - width(tail)
  }
  const middle: Segment[] = []
  if (model.meter && room >= MIN_METER_ROOM + 1) {
    const on = Math.round((model.meter.done / Math.max(1, model.meter.total)) * METER_CELLS)
    const meter = '━'.repeat(on) + '─'.repeat(METER_CELLS - on)
    const index = tail.findIndex(segment => segment.kind === 'count')
    if (index >= 0) tail.splice(index, 0, { text: meter, kind: 'meter' }, gap)
    else tail.push(gap, { text: meter, kind: 'meter' })
    room -= METER_CELLS + 1
  }
  if (model.title && room >= 3) {
    middle.push(gap, { text: truncate(model.title, room - 1), kind: 'title' })
  }
  return [...head, ...middle, gap, chip, ...tail]
}

export function bandWidth(segments: Segment[]): number {
  return segments.reduce((sum, segment) => sum + cells(segment.text), 0)
}

type Elements = { Box: any; Text: any; Button: any }

export function renderBand(elements: Elements, segments: Segment[], tone: Tone, onPress: () => void) {
  const { Button, Text } = elements
  const chipColor = tone === 'warn' ? 'yellow' : tone === 'ok' ? 'green' : 'cyan'
  const parts = segments.map((segment, index) => {
    switch (segment.kind) {
      case 'glyph': return <Text key={`s${index}`} color={chipColor}>{segment.text}</Text>
      case 'id': return <Text key={`s${index}`} bold>{segment.text}</Text>
      case 'chip': return <Text key={`s${index}`} inverse color={chipColor}>{segment.text}</Text>
      case 'warning': return <Text key={`s${index}`} color="yellow">{segment.text}</Text>
      case 'title': return <Text key={`s${index}`}>{segment.text}</Text>
      default: return <Text key={`s${index}`} dimColor>{segment.text}</Text>
    }
  })
  return (
    <Button key="lens-band" plain onPress={onPress}>
      {parts}
    </Button>
  )
}
