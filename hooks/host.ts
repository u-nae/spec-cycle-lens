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

export async function readPin($: EngineInterface, cwd: string): Promise<string | null> {
  const value = await $.store.get(pinKey(cwd))
  return typeof value === 'string' ? value : null
}

export async function writePin($: EngineInterface, cwd: string, id: string | null): Promise<void> {
  if (id === null) await $.store.delete(pinKey(cwd))
  else await $.store.set(pinKey(cwd), id)
}
