import { expect, test } from 'claude-code/testing'

import { EMPTY_READ, isStale, parseSnapshot, readLens, readSignature, snapshotKey } from '../hooks/snapshot'
import type { Fs } from '../hooks/snapshot'
import { prdSnapshot } from './fixtures'

function memoryFs(initial: Record<string, { text: string; mtimeMs: number }>) {
  const files = new Map(Object.entries(initial))
  const log = { reads: 0 }
  const fs: Fs = {
    exists: async path => files.has(path),
    stat: async path => {
      const file = files.get(path)
      if (!file) throw new Error('ENOENT')
      return { mtimeMs: file.mtimeMs, size: file.text.length }
    },
    read: async path => {
      log.reads += 1
      const file = files.get(path)
      if (!file) throw new Error('ENOENT')
      return file.text
    },
  }
  return { fs, files, log }
}

const paths = { cwd: '/p', snapshotPath: '.spec-cycle/status.json', configPath: '.spec-cycle/config.yaml' }
const good = JSON.stringify(prdSnapshot())

test('parseSnapshot accepts a schema 1.x document and rejects anything else', async () => {
  expect(parseSnapshot(good)?.items.length).toBe(3)
  expect(parseSnapshot('{')).toBeNull()
  expect(parseSnapshot('[]')).toBeNull()
  expect(parseSnapshot('{"schema_version":"2.0","items":[],"config":{}}')).toBeNull()
  expect(parseSnapshot('{"schema_version":"1.0","items":[{"id":1}],"config":{}}')).toBeNull()
  expect(parseSnapshot('{"schema_version":"1.0","items":[],"config":{}}')?.items).toEqual([])
})

test('readLens reports a project with no snapshot, with and without a config', async () => {
  const empty = memoryFs({})
  expect(await readLens(empty.fs, paths)).toEqual({ ...EMPTY_READ, hasConfig: false })
  const configured = memoryFs({ '/p/.spec-cycle/config.yaml': { text: 'schema_version: "1.1"', mtimeMs: 1 } })
  expect(await readLens(configured.fs, paths)).toEqual({ ...EMPTY_READ, hasConfig: true })
})

test('readLens parses once per key and reuses the document while the file is unchanged', async () => {
  const m = memoryFs({ '/p/.spec-cycle/status.json': { text: good, mtimeMs: 5000 }, '/p/.spec-cycle/config.yaml': { text: '', mtimeMs: 1 } })
  const first = await readLens(m.fs, paths)
  expect(first.snapshot?.items[1]?.id).toBe('W05')
  expect(first.key).toBe(`5000:${good.length}`)
  expect(await snapshotKey(m.fs, paths)).toBe(first.key)
  const second = await readLens(m.fs, paths, first)
  expect(m.log.reads).toBe(1)
  expect(second.snapshot).toBe(first.snapshot)
  m.files.set('/p/.spec-cycle/status.json', { text: good, mtimeMs: 6000 })
  const third = await readLens(m.fs, paths, second)
  expect(m.log.reads).toBe(2)
  expect(third.key).toBe(`6000:${good.length}`)
})

test('readLens keeps the previous document and flags a file that stopped parsing', async () => {
  const m = memoryFs({ '/p/.spec-cycle/status.json': { text: good, mtimeMs: 5000 } })
  const first = await readLens(m.fs, paths)
  m.files.set('/p/.spec-cycle/status.json', { text: '{"schema_version":"1.0", "items": [', mtimeMs: 7000 })
  const broken = await readLens(m.fs, paths, first)
  expect(broken.isBroken).toBe(true)
  expect(broken.snapshot).toBe(first.snapshot)
  expect(broken.key).toBe('7000:35')
  m.files.set('/p/.spec-cycle/status.json', { text: good, mtimeMs: 8000 })
  const healed = await readLens(m.fs, paths, broken)
  expect(healed.isBroken).toBe(false)
  // A snapshot deleted after a read leaves nothing to show.
  m.files.delete('/p/.spec-cycle/status.json')
  expect((await readLens(m.fs, paths, healed)).snapshot).toBeNull()
})

test('isStale compares input mtimes with the snapshot and ignores inputs that are gone', async () => {
  const m = memoryFs({ '/p/docs/PRD.md': { text: 'x', mtimeMs: 1000 } })
  expect(await isStale(m.fs, '/p', prdSnapshot())).toBe(false)
  m.files.set('/p/docs/PRD.md', { text: 'x', mtimeMs: 1000.4 })
  expect(await isStale(m.fs, '/p', prdSnapshot())).toBe(false)
  m.files.set('/p/docs/PRD.md', { text: 'x', mtimeMs: 1001 })
  expect(await isStale(m.fs, '/p', prdSnapshot())).toBe(true)
})

test('readSignature changes with what the band draws and not otherwise', async () => {
  const base = { ...EMPTY_READ, hasConfig: true, hasFile: true, key: 'k', snapshot: prdSnapshot() }
  const same = { ...base, snapshot: { ...prdSnapshot(), generated_at: '2026-10-28T00:00:00.000Z' } }
  expect(readSignature(same)).toBe(readSignature(base))
  const changed = { ...base, snapshot: { ...prdSnapshot(), items: prdSnapshot().items.map(i => (i.id === 'W05' ? { ...i, status: 'in-progress' } : i)) } }
  expect(readSignature(changed)).not.toBe(readSignature(base))
  expect(readSignature({ ...base, isStale: true })).not.toBe(readSignature(base))
})
