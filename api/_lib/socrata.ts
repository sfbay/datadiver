// api/_lib/socrata.ts — server-side event fetch for the cron.
// Reuses the app's normalizeEvent so cron events match the UI exactly.
import { normalizeEvent } from '../../src/utils/eventNormalization'
import type { DatasetId, NormalizedEvent } from '../../src/types/last48'

const SOCRATA: Record<DatasetId, { id: string; dateField: string }> = {
  '911-realtime': { id: 'gnap-fj3t', dateField: 'received_datetime' },
  'fire-ems-dispatch': { id: 'nuek-vuh3', dateField: 'received_dttm' },
  '311-cases': { id: 'vw6y-z8j6', dateField: 'requested_datetime' },
}
const BASE = 'https://data.sfgov.org/resource'

export async function fetchRecentEvents(
  streams: DatasetId[],
  sinceMs: number,
): Promise<NormalizedEvent[]> {
  const cutoff = new Date(sinceMs).toISOString().slice(0, 19) // 'YYYY-MM-DDTHH:MM:SS'
  const token = process.env.SOCRATA_APP_TOKEN
  const out: NormalizedEvent[] = []

  for (const ds of streams) {
    const cfg = SOCRATA[ds]
    if (!cfg) continue
    const url = new URL(`${BASE}/${cfg.id}.json`)
    url.searchParams.set('$where', `${cfg.dateField} >= '${cutoff}'`)
    url.searchParams.set('$order', `${cfg.dateField} DESC`)
    url.searchParams.set('$limit', '5000')

    try {
      const res = await fetch(url, token ? { headers: { 'X-App-Token': token } } : undefined)
      if (!res.ok) continue
      const rows = (await res.json()) as Record<string, unknown>[]
      for (const row of rows) {
        const ev = normalizeEvent(ds, row)
        if (ev) out.push(ev)
      }
    } catch {
      // skip a failed stream; other streams still produce a digest
    }
  }
  return out
}
