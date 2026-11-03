// The few `$` calls the mod makes, each spelled `$.noun.method` so the validator sees them
// (never destructure or alias `$`).
import type { EngineInterface } from 'claude-code'

import type { Fs } from './snapshot'

export function fsPort($: EngineInterface): Fs {
  return {
    exists: (path: string) => $.fs.exists(path),
    stat: async (path: string) => {
      const stat = await $.fs.stat(path)
      return { mtimeMs: stat.mtimeMs, size: stat.size }
    },
    read: (path: string) => $.fs.read(path),
  }
}

const pinKey = (cwd: string) => `pin:${cwd}`
// Keyed by session id: a resume keeps the id, so the switch survives it; another session is not touched.
const offKey = (sessionId: string) => `off:${sessionId}`

/** The session id, or null when the engine cannot say; the switch then lives in memory only. */
export async function sessionIdOf($: EngineInterface): Promise<string | null> {
  try {
    const id = await $.session.id()
    return typeof id === 'string' && id !== '' ? id : null
  } catch {
    return null
  }
}

export async function readOff($: EngineInterface): Promise<boolean> {
  const id = await sessionIdOf($)
  return id !== null && (await $.store.get(offKey(id))) === true
}

export async function writeOff($: EngineInterface, off: boolean): Promise<void> {
  const id = await sessionIdOf($)
  if (id === null) return
  if (off) await $.store.set(offKey(id), true)
  else await $.store.delete(offKey(id))
}

export async function readPin($: EngineInterface, cwd: string): Promise<string | null> {
  const value = await $.store.get(pinKey(cwd))
  return typeof value === 'string' ? value : null
}

export async function writePin($: EngineInterface, cwd: string, id: string | null): Promise<void> {
  if (id === null) await $.store.delete(pinKey(cwd))
  else await $.store.set(pinKey(cwd), id)
}
