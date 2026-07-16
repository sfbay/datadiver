// api/_lib/db.ts — Neon serverless client + typed queries (server-only).
import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { DueSubscription, SubscriptionDraft } from '../../src/lib/alerts/types'
import type { DatasetId } from '../../src/types/last48'

let _sql: NeonQueryFunction<false, false> | null = null
function sql(): NeonQueryFunction<false, false> {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    _sql = neon(url)
  }
  return _sql
}

/** Insert one attempt and return how many this IP has made in the last hour,
 *  including this one. Single statement (data-modifying CTE) so concurrent
 *  requests can't interleave between insert and count the way two separate
 *  queries could. The outer SELECT's snapshot predates the CTE's own insert
 *  — hence the +1. */
export async function recordSubscribeAttempt(ip: string): Promise<number> {
  const rows = await sql()`
    WITH ins AS (INSERT INTO subscribe_attempts (ip) VALUES (${ip}))
    SELECT count(*)::int + 1 AS n FROM subscribe_attempts
    WHERE ip = ${ip} AND created_at > now() - interval '1 hour'`
  return rows[0].n as number
}

/** Upsert the subscriber (left unconfirmed) and insert the subscription +
 *  locations. Returns the subscriber id for the confirm token. */
export async function createPendingSubscription(
  draft: SubscriptionDraft,
): Promise<{ subscriberId: string; subscriptionId: string }> {
  const subRows = await sql()`
    INSERT INTO subscribers (email) VALUES (${draft.email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email, unsubscribed_at = NULL
    RETURNING id`
  const subscriberId = subRows[0].id as string

  const insRows = await sql()`
    INSERT INTO subscriptions (subscriber_id, name, cadence, filters, radius_miles)
    VALUES (${subscriberId}, ${draft.name ?? 'My alert'}, ${draft.cadence},
            ${JSON.stringify(draft.filters)}::jsonb, ${draft.radiusMiles})
    RETURNING id`
  const subscriptionId = insRows[0].id as string

  for (const loc of draft.locations) {
    await sql()`
      INSERT INTO subscription_locations (subscription_id, label, lat, lng)
      VALUES (${subscriptionId}, ${loc.label ?? null}, ${loc.lat}, ${loc.lng})`
  }
  return { subscriberId, subscriptionId }
}

/** Confirm ONE subscription (tokens are subscription-scoped so a new alert on
 *  an already-confirmed email still requires an inbox click — the consent gap
 *  fix). Also stamps the subscriber's confirmed_at on first confirmation, and
 *  seeds this subscription's watermarks to "now" so the first digest contains
 *  only events from after sign-up — not a backlog of the whole 48h window.
 *  Returns false when the subscription doesn't exist or its subscriber has
 *  unsubscribed. */
export async function confirmSubscription(subscriptionId: string): Promise<boolean> {
  const rows = await sql()`
    UPDATE subscriptions s SET confirmed_at = COALESCE(s.confirmed_at, now())
    FROM subscribers sub
    WHERE s.id = ${subscriptionId} AND sub.id = s.subscriber_id AND sub.unsubscribed_at IS NULL
    RETURNING s.subscriber_id, s.filters`
  if (rows.length === 0) return false
  const subscriberId = rows[0].subscriber_id as string
  await sql()`
    UPDATE subscribers SET confirmed_at = COALESCE(confirmed_at, now()) WHERE id = ${subscriberId}`

  const nowMs = Date.now()
  const streams = ((rows[0].filters as { streams?: string[] } | null)?.streams ?? []) as string[]
  const seed = JSON.stringify(Object.fromEntries(streams.map((s) => [s, nowMs])))
  await sql()`
    UPDATE subscriptions
    SET stream_watermarks = CASE WHEN stream_watermarks = '{}'::jsonb THEN ${seed}::jsonb ELSE stream_watermarks END,
        last_event_ts = CASE WHEN last_event_ts = 0 THEN ${nowMs} ELSE last_event_ts END
    WHERE id = ${subscriptionId}`
  return true
}

/** Prune rate-limit rows older than a day, plus never-confirmed subscriptions
 *  (and their orphaned never-confirmed subscribers) past the 7-day confirm
 *  token life. Called from the daily cron. */
export async function pruneStaleRows(): Promise<void> {
  await sql()`DELETE FROM subscribe_attempts WHERE created_at < now() - interval '1 day'`
  await sql()`
    DELETE FROM subscriptions WHERE confirmed_at IS NULL AND created_at < now() - interval '8 days'`
  await sql()`
    DELETE FROM subscribers sub
    WHERE sub.confirmed_at IS NULL AND sub.created_at < now() - interval '8 days'
      AND NOT EXISTS (SELECT 1 FROM subscriptions s WHERE s.subscriber_id = sub.id)`
}

/** Hard-delete the subscriber; cascade removes subscriptions + locations. */
export async function deleteSubscriber(subscriberId: string): Promise<void> {
  await sql()`DELETE FROM subscribers WHERE id = ${subscriberId}`
}

/** All active, individually-confirmed subscriptions belonging to confirmed,
 *  non-unsubscribed people, with email + locations joined. Cadence-due
 *  filtering happens in JS via the pure isSubscriptionDue. */
export async function getActiveConfirmedSubscriptions(): Promise<DueSubscription[]> {
  const rows = await sql()`
    SELECT s.id, s.subscriber_id, s.name, s.cadence, s.filters, s.radius_miles,
           EXTRACT(EPOCH FROM s.last_sent_at) * 1000 AS last_sent_ms,
           s.last_event_ts, s.stream_watermarks, s.active, sub.email,
           COALESCE((
             SELECT json_agg(json_build_object('label', l.label, 'lat', l.lat, 'lng', l.lng))
             FROM subscription_locations l WHERE l.subscription_id = s.id
           ), '[]') AS locations
    FROM subscriptions s
    JOIN subscribers sub ON sub.id = s.subscriber_id
    WHERE s.active = true
      AND s.confirmed_at IS NOT NULL
      AND sub.confirmed_at IS NOT NULL
      AND sub.unsubscribed_at IS NULL`

  return rows.map((r): DueSubscription => ({
    id: r.id as string,
    subscriberId: r.subscriber_id as string,
    email: r.email as string,
    name: r.name as string,
    cadence: r.cadence as DueSubscription['cadence'],
    filters: {
      streams: ((r.filters?.streams ?? []) as string[]) as DatasetId[],
      categories: (r.filters?.categories ?? []) as string[],
    },
    radiusMiles: Number(r.radius_miles),
    locations: (r.locations as Array<{ label: string | null; lat: number; lng: number }>).map((l) => ({
      label: l.label ?? undefined,
      lat: Number(l.lat),
      lng: Number(l.lng),
    })),
    lastSentAt: r.last_sent_ms == null ? null : Number(r.last_sent_ms),
    lastEventTs: Number(r.last_event_ts),
    streamWatermarks: Object.fromEntries(
      Object.entries((r.stream_watermarks ?? {}) as Record<string, unknown>).map(([k, v]) => [k, Number(v)]),
    ),
    active: r.active as boolean,
  }))
}

/** A digest was sent: advance the cadence clock, merge the per-stream
 *  watermarks (nextWatermarks pre-floors them — jsonb || overwrites keys),
 *  and keep the legacy scalar at the global max so a code rollback still
 *  dedups approximately. */
export async function markDispatched(
  subscriptionId: string,
  newWatermarks: Partial<Record<string, number>>,
  sentAt: number,
): Promise<void> {
  const maxAll = Object.values(newWatermarks).reduce<number>((a, b) => Math.max(a, Number(b)), 0)
  await sql()`
    UPDATE subscriptions
    SET last_sent_at = to_timestamp(${sentAt} / 1000.0),
        stream_watermarks = stream_watermarks || ${JSON.stringify(newWatermarks)}::jsonb,
        last_event_ts = GREATEST(last_event_ts, ${maxAll})
    WHERE id = ${subscriptionId}`
}

/** Nothing matched this period: advance the cadence clock only (watermark
 *  stays, so a later event in the same window is still caught). */
export async function markChecked(subscriptionId: string, sentAt: number): Promise<void> {
  await sql()`
    UPDATE subscriptions SET last_sent_at = to_timestamp(${sentAt} / 1000.0)
    WHERE id = ${subscriptionId}`
}
