// api/_lib/socrata.ts — server-side event fetch for the cron.
// Reuses the app's normalizeEvent so cron events match the UI exactly.
import { normalizeEvent } from '../../src/utils/eventNormalization.js'
import { sfLocalCutoff } from '../../src/utils/sfTime.js'
import type { DatasetId, NormalizedEvent } from '../../src/types/last48'

const SOCRATA: Record<DatasetId, { id: string; dateField: string }> = {
  '911-realtime': { id: 'gnap-fj3t', dateField: 'received_datetime' },
  'fire-ems-dispatch': { id: 'nuek-vuh3', dateField: 'received_dttm' },
  '311-cases': { id: 'vw6y-z8j6', dateField: 'requested_datetime' },
}
const BASE = 'https://data.sfgov.org/resource'

export interface StreamFetchResult {
  events: NormalizedEvent[]
  ok: boolean
}

const PAGE_SIZE = 5000
// 4 pages = 20k rows per stream per run — far above any real 48h volume (the
// busiest stream runs ~4–5k). If the cap is ever hit we log and stay ok:true —
// ASC ordering means the unseen tail is the NEWEST rows, which sit above the
// watermark and simply arrive next run. Nothing is permanently lost.
const MAX_PAGES = 4

/** Fetch each unique stream ONCE per cron run (the caller fans results out
 *  across subscriptions — N subscribers sharing 3 streams = 3 reads, not 3N).
 *
 *  ASC ordering + $offset pagination: rows arriving mid-pagination append
 *  after the cursor, so pages never shift underneath us the way DESC pages
 *  do — and any truncation drops the newest tail (recoverable next run), not
 *  the oldest (permanently below the advancing watermark).
 *
 *  A stream that errors returns ok:false and NO events: delivering a partial
 *  page would email an arbitrary slice while its watermark can't advance,
 *  duplicating those events in the next digest. Skipping the stream keeps
 *  every one of its events eligible for the next run. */
export async function fetchStreamEvents(
  streams: DatasetId[],
  sinceMs: number,
): Promise<Record<string, StreamFetchResult>> {
  // SF wall-clock digits — DataSF datetimes are floating local times. The
  // cron host runs TZ=UTC, so toISOString() digits here shrank every digest
  // window by 7–8h. See src/utils/sfTime.ts.
  const cutoff = sfLocalCutoff(sinceMs)
  const token = process.env.SOCRATA_APP_TOKEN
  const out: Record<string, StreamFetchResult> = {}

  for (const ds of [...new Set(streams)]) {
    const cfg = SOCRATA[ds]
    if (!cfg) continue
    const events: NormalizedEvent[] = []
    let ok = true
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${BASE}/${cfg.id}.json`)
      url.searchParams.set('$where', `${cfg.dateField} >= '${cutoff}'`)
      url.searchParams.set('$order', `${cfg.dateField} ASC`)
      url.searchParams.set('$limit', String(PAGE_SIZE))
      url.searchParams.set('$offset', String(page * PAGE_SIZE))
      try {
        const res = await fetch(url, token ? { headers: { 'X-App-Token': token } } : undefined)
        if (!res.ok) {
          ok = false
          break
        }
        const rows = (await res.json()) as Record<string, unknown>[]
        for (const row of rows) {
          const ev = normalizeEvent(ds, row)
          if (ev) events.push(ev)
        }
        if (rows.length < PAGE_SIZE) break
        if (page === MAX_PAGES - 1)
          console.warn(`[cron] ${ds}: page cap hit (${MAX_PAGES * PAGE_SIZE} rows) — newest tail defers to next run`)
      } catch {
        ok = false
        break
      }
    }
    out[ds] = { events: ok ? events : [], ok }
  }
  return out
}
