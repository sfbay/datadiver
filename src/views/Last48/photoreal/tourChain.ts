// src/views/Last48/photoreal/tourChain.ts
//
// Stop ORDER for the photoreal tour. buildPass() already picks WHICH events
// (the newest PASS_SIZE with coordinates, newest first). Here they are
// re-ordered as a greedy nearest-neighbour chain from the newest, so each
// hop is short and the next stop's tiles are mostly already resident —
// tile streaming is the frame-rate ceiling (spike, 2026-09-09). The set is
// still "the freshest 24", so the tour's promise holds.
import { buildPass, PASS_SIZE } from '../ambient/tour'
import type { NormalizedEvent } from '@/types/last48'

export function chainTour(events: NormalizedEvent[], limit: number = PASS_SIZE): string[] {
  const ids = buildPass(events, limit)
  if (ids.length === 0) return []
  const byId = new Map(events.map((e) => [e.id, e]))
  const pool = ids.slice(1)
  const out = [ids[0]]
  while (pool.length) {
    const cur = byId.get(out[out.length - 1])!
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    pool.forEach((id, i) => {
      const e = byId.get(id)!
      // Equirectangular squared distance is enough at city scale.
      const d = ((e.longitude! - cur.longitude!) * 0.79) ** 2 + (e.latitude! - cur.latitude!) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    out.push(pool.splice(best, 1)[0])
  }
  return out
}
