// src/lib/alerts/sentIds.ts
// Per-subscription memory of released-tier event ids already emailed.
// Released datasets are full-replace pipelines with no publication
// timestamp, and their event dates are routinely backdated — a watermark
// would silently drop late-appearing rows forever. First-appearance
// detection by id is the only honest dedup (see the PR D spec).
// Radius sparsity keeps this tiny in practice: a ¼-mi pin accumulates
// tens of ids, and the cap below is a defensive ceiling, not a budget.
import { ALERT_STREAMS, isReleasedStream, type AlertEvent, type AlertStreamId } from './streams.js'

/** jsonb shape stored on subscriptions.sent_event_ids:
 *  { [streamId]: { [eventId]: eventMs } } */
export type SentIdMap = Partial<Record<string, Record<string, number>>>

const GRACE_MS = 30 * 24 * 3600_000
export const MAX_IDS_PER_STREAM = 400

/** Events whose id has not been emailed to this subscription yet. */
export function unseenEvents<E extends { id: string; datasetId: string }>(
  sent: SentIdMap,
  events: E[],
): E[] {
  return events.filter((e) => !(e.id in (sent[e.datasetId] ?? {})))
}

export const RELEASED_CAP_PER_STREAM = 25

/** Newest N released events per stream. The welcome edition's catch-up can
 *  pull a dense corridor's whole 90–120d registry window into one first
 *  email; capping keeps it sane, and because sent-ids record only what we
 *  SEND, the overflow stays unseen and drips into subsequent digests. */
export function capReleasedPerStream<E extends { datasetId: string; receivedAt: number }>(
  events: E[],
  cap: number = RELEASED_CAP_PER_STREAM,
): E[] {
  const byStream = new Map<string, E[]>()
  for (const e of events) {
    const arr = byStream.get(e.datasetId)
    if (arr) arr.push(e)
    else byStream.set(e.datasetId, [e])
  }
  const out: E[] = []
  for (const arr of byStream.values())
    out.push(...arr.sort((a, b) => b.receivedAt - a.receivedAt).slice(0, cap))
  return out
}

/** The FULL map to persist after a send: prior ids merged with the newly
 *  matched released events, pruned to each stream's fetch window + grace
 *  (an id outside the window can never be fetched again, so remembering it
 *  is dead weight), then hard-capped at the newest MAX_IDS_PER_STREAM.
 *  Live-stream events are ignored — watermarks own live dedup. */
export function nextSentIds(sent: SentIdMap, matched: AlertEvent[], nowMs: number): SentIdMap {
  const next: SentIdMap = {}
  for (const [stream, ids] of Object.entries(sent)) {
    if (ids && isReleasedStream(stream)) next[stream] = { ...ids }
  }
  for (const e of matched) {
    if (!isReleasedStream(e.datasetId)) continue
    ;(next[e.datasetId] ??= {})[e.id] = e.receivedAt
  }
  for (const [stream, ids] of Object.entries(next)) {
    if (!ids) continue
    const windowMs = ALERT_STREAMS[stream as AlertStreamId]?.windowMs ?? 0
    const floor = nowMs - (windowMs + GRACE_MS)
    let entries = Object.entries(ids).filter(([, ms]) => ms >= floor)
    if (entries.length > MAX_IDS_PER_STREAM) {
      entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_IDS_PER_STREAM)
    }
    next[stream] = Object.fromEntries(entries)
  }
  return next
}
