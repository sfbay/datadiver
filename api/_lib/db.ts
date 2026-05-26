// api/_lib/db.ts — Neon serverless client + typed queries (server-only).
import { neon } from '@neondatabase/serverless'
import type { DueSubscription, SubscriptionDraft } from '../../src/lib/alerts/types'
import type { DatasetId } from '../../src/types/last48'

const sql = neon(process.env.DATABASE_URL!)

/** Insert one attempt and return how many this IP has made in the last hour. */
export async function recordSubscribeAttempt(ip: string): Promise<number> {
  await sql`INSERT INTO subscribe_attempts (ip) VALUES (${ip})`
  const rows = await sql`
    SELECT count(*)::int AS n FROM subscribe_attempts
    WHERE ip = ${ip} AND created_at > now() - interval '1 hour'`
  return rows[0].n as number
}

/** Upsert the subscriber (left unconfirmed) and insert the subscription +
 *  locations. Returns the subscriber id for the confirm token. */
export async function createPendingSubscription(
  draft: SubscriptionDraft,
): Promise<{ subscriberId: string; subscriptionId: string }> {
  const subRows = await sql`
    INSERT INTO subscribers (email) VALUES (${draft.email})
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id`
  const subscriberId = subRows[0].id as string

  const insRows = await sql`
    INSERT INTO subscriptions (subscriber_id, name, cadence, filters, radius_miles)
    VALUES (${subscriberId}, ${draft.name ?? 'My alert'}, ${draft.cadence},
            ${JSON.stringify(draft.filters)}::jsonb, ${draft.radiusMiles})
    RETURNING id`
  const subscriptionId = insRows[0].id as string

  for (const loc of draft.locations) {
    await sql`
      INSERT INTO subscription_locations (subscription_id, label, lat, lng)
      VALUES (${subscriptionId}, ${loc.label ?? null}, ${loc.lat}, ${loc.lng})`
  }
  return { subscriberId, subscriptionId }
}

export async function confirmSubscriber(subscriberId: string): Promise<boolean> {
  const rows = await sql`
    UPDATE subscribers SET confirmed_at = COALESCE(confirmed_at, now())
    WHERE id = ${subscriberId} AND unsubscribed_at IS NULL
    RETURNING id`
  return rows.length > 0
}

/** Hard-delete the subscriber; cascade removes subscriptions + locations. */
export async function deleteSubscriber(subscriberId: string): Promise<void> {
  await sql`DELETE FROM subscribers WHERE id = ${subscriberId}`
}

/** All active subscriptions belonging to confirmed, non-unsubscribed people,
 *  with email + locations joined. Cadence-due filtering happens in JS via the
 *  pure isSubscriptionDue. */
export async function getActiveConfirmedSubscriptions(): Promise<DueSubscription[]> {
  const rows = await sql`
    SELECT s.id, s.subscriber_id, s.name, s.cadence, s.filters, s.radius_miles,
           EXTRACT(EPOCH FROM s.last_sent_at) * 1000 AS last_sent_ms,
           s.last_event_ts, s.active, sub.email,
           COALESCE((
             SELECT json_agg(json_build_object('label', l.label, 'lat', l.lat, 'lng', l.lng))
             FROM subscription_locations l WHERE l.subscription_id = s.id
           ), '[]') AS locations
    FROM subscriptions s
    JOIN subscribers sub ON sub.id = s.subscriber_id
    WHERE s.active = true
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
    active: r.active as boolean,
  }))
}

/** A digest was sent: advance both clocks. */
export async function markDispatched(
  subscriptionId: string,
  newWatermark: number,
  sentAt: number,
): Promise<void> {
  await sql`
    UPDATE subscriptions
    SET last_sent_at = to_timestamp(${sentAt} / 1000.0),
        last_event_ts = GREATEST(last_event_ts, ${newWatermark})
    WHERE id = ${subscriptionId}`
}

/** Nothing matched this period: advance the cadence clock only (watermark
 *  stays, so a later event in the same window is still caught). */
export async function markChecked(subscriptionId: string, sentAt: number): Promise<void> {
  await sql`
    UPDATE subscriptions SET last_sent_at = to_timestamp(${sentAt} / 1000.0)
    WHERE id = ${subscriptionId}`
}
