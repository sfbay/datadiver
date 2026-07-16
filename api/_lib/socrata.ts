// api/_lib/socrata.ts — server-side event fetch for the cron + welcome
// edition. All per-stream knowledge (endpoint, date field, window, extra
// filters, normalizer) lives in the ALERT_STREAMS registry.
import { ALERT_STREAMS, streamWhere, type AlertEvent, type AlertStreamId } from '../../src/lib/alerts/streams.js'

const BASE = 'https://data.sfgov.org/resource'

export interface StreamFetchResult {
  events: AlertEvent[]
  ok: boolean
}

const PAGE_SIZE = 5000
// 4 pages = 20k rows per stream per run — far above any real volume (the
// busiest live stream runs ~4–5k per 48h; released windows fetch ~1–2k).
// If the cap is ever hit we log and stay ok:true — ASC ordering means the
// unseen tail is the NEWEST rows, which sit above the watermark (live) or
// outside sent-id memory (released) and simply arrive next run.
const MAX_PAGES = 4

/** Fetch each unique stream ONCE per run (the caller fans results out
 *  across subscriptions). Windows come from the registry per stream;
 *  `windowOverrides` narrows them per call (the welcome edition fetches
 *  live streams at 24h instead of 48h).
 *
 *  ASC ordering + $offset pagination: rows arriving mid-pagination append
 *  after the cursor, so pages never shift underneath us the way DESC pages
 *  do — and any truncation drops the newest tail (recoverable next run),
 *  not the oldest (permanently below the advancing watermark). A stream
 *  that errors returns ok:false and NO events: delivering a partial page
 *  would email an arbitrary slice while its dedup state can't advance. */
export async function fetchStreamEvents(
  streams: string[],
  nowMs: number,
  windowOverrides?: Partial<Record<string, number>>,
): Promise<Record<string, StreamFetchResult>> {
  const token = process.env.SOCRATA_APP_TOKEN
  const out: Record<string, StreamFetchResult> = {}

  for (const ds of [...new Set(streams)]) {
    const cfg = ALERT_STREAMS[ds as AlertStreamId]
    if (!cfg) continue
    const events: AlertEvent[] = []
    let ok = true
    for (let page = 0; page < MAX_PAGES; page++) {
      const url = new URL(`${BASE}/${cfg.socrataId}.json`)
      url.searchParams.set('$where', streamWhere(ds as AlertStreamId, nowMs, windowOverrides?.[ds]))
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
          const ev = cfg.normalize(row)
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
