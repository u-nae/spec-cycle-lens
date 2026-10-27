import { expect, test } from 'claude-code/testing'

import { bandModel, bandWidth, layoutBand } from '../hooks/band'
import { EMPTY_READ } from '../hooks/snapshot'
import type { LensRead } from '../hooks/snapshot'
import { cells, truncate } from '../hooks/text'
import { item, prdSnapshot, run, snapshot } from './fixtures'

const readOf = (over: Partial<LensRead>): LensRead => ({ ...EMPTY_READ, hasConfig: true, hasFile: true, key: '1:1', ...over })

test('cells counts Hangul as two columns and truncate keeps within the budget', async () => {
  expect(cells('W05')).toBe(3)
  expect(cells('질문 1개')).toBe(8)
  expect(truncate('Record a revision for every change', 12)).toBe('Record a re…')
  expect(cells(truncate('구성 변경 커밋 서비스', 9))).toBeLessThanOrEqual(9)
  expect(truncate('short', 12)).toBe('short')
})

test('the model names the active item, the chip, the revision and the meter', async () => {
  const model = bandModel(readOf({ snapshot: prdSnapshot() }), null, 'unicode')!
  expect(model.id).toBe('W05')
  expect(model.chip).toBe('질문 1개')
  expect(model.revision).toBe('r1/2')
  expect(model.meter).toEqual({ done: 1, total: 3 })
  expect(model.glyph).toBe('◇')
  expect(model.warnings).toEqual([])
})

test('the model marks a pinned item, a stale snapshot and a broken file', async () => {
  const model = bandModel(readOf({ snapshot: prdSnapshot(), isStale: true, isBroken: true }), 'W04', 'unicode')!
  expect(model.id).toBe('📌W04')
  expect(model.chip).toBe('완료')
  expect(model.warnings).toEqual(['⚠ 스냅숏 오래됨', '⚠'])
})

test('the model is null where the band must not draw', async () => {
  expect(bandModel(EMPTY_READ, null, 'unicode')).toBeNull()
})

test('the layout fits 40, 60, 80 and 120 columns and keeps the id and the chip at 40', async () => {
  const model = bandModel(readOf({ snapshot: prdSnapshot(), isStale: true }), null, 'unicode')!
  for (const columns of [40, 60, 80, 120]) {
    const segments = layoutBand(model, columns)
    expect(bandWidth(segments)).toBeLessThanOrEqual(columns)
    expect(segments.find(s => s.kind === 'id')?.text).toBe('W05')
    expect(segments.find(s => s.kind === 'chip')?.text).toBe(' 질문 1개 ')
  }
  const wide = layoutBand(model, 120)
  expect(wide.find(s => s.kind === 'meter')).toBeDefined()
  expect(wide.find(s => s.kind === 'title')?.text).toBe('Record a revision for every confirmed configuration change')
  expect(wide.find(s => s.kind === 'warning')?.text).toBe('⚠ 스냅숏 오래됨')
  const narrow = layoutBand(model, 40)
  expect(narrow.find(s => s.kind === 'meter')).toBeUndefined()
})

test('coverage shows while implementing and the revision does not', async () => {
  const snap = snapshot([item('W07', { status: 'in-progress', run: run({ verdict: 'READY' }), handoff: { usable: true, errors: [], warnings: [], obligations_total: 5 }, verification: { covered: 2, total: 5, checked_at: null, tests: 'unknown', status_written: null } })])
  const model = bandModel(readOf({ snapshot: snap }), null, 'unicode')!
  expect(model.chip).toBe('구현 중 · cov 2/5')
  expect(model.revision).toBeNull()
  expect(model.glyph).toBe('◆')
})
