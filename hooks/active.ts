import type { Item, Snapshot } from './snapshot'

const runTime = (item: Item): number => (item.run ? Date.parse(item.run.updated_at) || 0 : 0)

function newestRun(items: Item[]): Item | null {
  let best: Item | null = null
  for (const item of items) {
    if (!item.run) continue
    if (best === null || runTime(item) > runTime(best)) best = item
  }
  return best
}

/**
 * The one item the band and the suggestion speak of (PRD 6.1):
 * 1. the pinned item, when the list still has it;
 * 2. the `in-progress` item with the newest run;
 * 3. the item with a run, not `done`, whose run is newest;
 * 4. the first `pending` item in list order whose dependencies are all done;
 * 5. none.
 */
export function pickActive(snapshot: Snapshot | null, pinned: string | null): Item | null {
  if (!snapshot) return null
  const items = snapshot.items
  if (pinned !== null) {
    const found = items.find(item => item.id === pinned)
    if (found) return found
  }
  return (
    newestRun(items.filter(item => item.status === 'in-progress'))
    ?? newestRun(items.filter(item => item.status !== 'done'))
    ?? items.find(item => item.status === 'pending' && item.dependencies_done)
    ?? null
  )
}
