// src/views/Last48/detail/eventCardModel.ts
//
// The event card's FIELD LOGIC — shared by the flat map's Last48EventCard
// and the photoreal PhotorealBubble so the two cards cannot drift. Pure;
// eventCardModel.test.ts runs one fixture per stream. Extracted verbatim
// from Last48EventCard.tsx on 2026-09-09; `formatAge` gained an injectable
// `now` for tests, `locationLine` is new (precision word first — see
// photoreal/markerPrecision.ts).
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import { PRECISION, PRECISION_LABEL } from '../photoreal/markerPrecision'

// ---------------------------------------------------------------------------
// Dataset display metadata — label + pigment accent. Routing is computed
// separately by resolveExplore() (below) because the destination is
// conditional: 911 has no map view of its own, so it routes by call type and
// geocoding rather than to a fixed sibling.
// ---------------------------------------------------------------------------

export const DATASET_META: Record<DatasetId, { label: string; color: string }> = {
  '911-realtime':      { label: '911 DISPATCH', color: '#616a96' },
  'fire-ems-dispatch': { label: 'FIRE/EMS',     color: '#b85a33' },
  '311-cases':         { label: '311 CASE',     color: '#7a9954' },
}

// ---------------------------------------------------------------------------
// Age formatting — returns magnitude + a full-word "X ago" unit phrase
// so the headline reads as one line: "43 minutes ago", "2 hours ago", etc.
// ---------------------------------------------------------------------------

export function formatAge(receivedAt: number, now: number = Date.now()): { magnitude: string; unit: string } {
  const ms = now - receivedAt
  const sec = Math.max(1, Math.floor(ms / 1000))
  if (sec < 90) return { magnitude: String(sec), unit: sec === 1 ? 'second ago' : 'seconds ago' }
  const min = Math.floor(sec / 60)
  if (min < 90) return { magnitude: String(min), unit: min === 1 ? 'minute ago' : 'minutes ago' }
  const h = Math.floor(min / 60)
  if (h < 48) return { magnitude: String(h), unit: h === 1 ? 'hour ago' : 'hours ago' }
  const d = Math.floor(h / 24)
  return { magnitude: String(d), unit: d === 1 ? 'day ago' : 'days ago' }
}

// AP-style month abbreviations: short forms get a period; months ≤5 letters
// (March, April, May, June, July) remain unabbreviated.
export const AP_MONTH: Record<string, string> = {
  January: 'Jan.',
  February: 'Feb.',
  March: 'March',
  April: 'April',
  May: 'May',
  June: 'June',
  July: 'July',
  August: 'Aug.',
  September: 'Sept.',
  October: 'Oct.',
  November: 'Nov.',
  December: 'Dec.',
}

// Pinned to Pacific: the row renders "… PT", so the date/weekday must come
// from the SF calendar, not the viewer's (a late-night SF event is "Tue."
// even when the reader's clock in New York already says Wednesday).
export const SF_TZ = 'America/Los_Angeles'

/** AP style: "Wed. May 13, 2026" — weekday abbreviated w/ period; month per AP_MONTH. */
export function formatApDate(ms: number): string {
  const d = new Date(ms)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: SF_TZ }) // "Wed"
  const monthLong = d.toLocaleDateString('en-US', { month: 'long', timeZone: SF_TZ }) // "September"
  const month = AP_MONTH[monthLong] ?? monthLong
  const day = d.toLocaleDateString('en-US', { day: 'numeric', timeZone: SF_TZ })
  // No year (Jesse, 2026-09-21): a card in a 48-hour window does not need
  // to say which year it is, and dropping it keeps the date line to one
  // line beside the time on the immersive card.
  return `${weekday}. ${month} ${day}`
}

/** Just the AP-style weekday abbreviation, e.g. "Mon." — disambiguates the day
 *  within the 48h window without the full date's width (used on mobile). */
export function formatApWeekday(ms: number): string {
  const weekday = new Date(ms).toLocaleDateString('en-US', { weekday: 'short', timeZone: SF_TZ })
  return `${weekday}.`
}

// ---------------------------------------------------------------------------
// Field helpers — compact dataset-specific metadata rows
// ---------------------------------------------------------------------------

export function extractField(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && v !== '') return String(v)
  }
  return null
}

/** Per-dataset compact fields. Returns [[label, value], …]. */
export function compactFields(event: NormalizedEvent): Array<[string, string]> {
  const { raw, datasetId } = event
  switch (datasetId) {
    case '911-realtime':
      return [
        ['Disposition', extractField(raw, 'disposition') ?? '—'],
        ['Unit',        extractField(raw, 'unit_id', 'primary_unit') ?? '—'],
      ]
    case 'fire-ems-dispatch':
      return [
        ['Unit',    extractField(raw, 'unit_id') ?? '—'],
        ['Station', extractField(raw, 'station_area') ?? '—'],
      ]
    case '311-cases':
      return [
        ['Status', extractField(raw, 'status_description', 'status') ?? '—'],
        ['Agency', extractField(raw, 'agency_responsible') ?? '—'],
      ]
  }
}

/** Rows with real values only — em-dash placeholders waste vertical space. */
export function populatedFields(event: NormalizedEvent): Array<[string, string]> {
  return compactFields(event).filter(([, v]) => v !== '—' && v.trim() !== '')
}

/** Derive the dataset-native ID for the explore link. */
export function extractId(event: NormalizedEvent): string {
  const { raw } = event
  return String(
    raw.cad_number ??
    raw.incident_id ??
    raw.service_request_id ??
    raw.post_id ??
    raw.call_number ??
    event.id
  )
}

// Violent-911 keywords matched against `call_type_final_desc`. SF 911 CAD
// values include "Shooting", "Person w/Gun", "Stabbing", "Robbery",
// "Aggravated Assault", "Strongarm Robbery", "Shots Fired", etc.
export const VIOLENT_911 =
  /\b(shoot|shots?|gun|firearm|armed|weapon|stab|knife|assault|batter|robber|homicide|fight|strongarm)\b/i

export interface ExploreLink {
  to: string
  label: string
  caption: string
}

/**
 * Resolve where the card's "explore" link should go — the "understand more"
 * leg of the editorial link path.
 *
 *   • Fire/EMS, 311  → their sibling MAP view, deep-linked to THIS record
 *     (those views read ?incident= / ?case= and select + fly to it).
 *   • 911            → has no map view of its own, so route by CALL TYPE to a
 *     related map (violent → Crime Incidents, else → Emergency Response),
 *     landing on the event's NEIGHBORHOOD. We deliberately do NOT pin a
 *     record there: a 911 cad_number doesn't share an id with crime/Fire-EMS
 *     rows, and recent 911 calls predate any crime report (police publish
 *     lag), so a record pin would resolve to nothing. Land on place instead.
 *   • Suppressed 911 (no neighborhood) → fall back to the only 911-native
 *     surface, the chart-centric Dispatch view. This is the design note's
 *     "non-geocoded → keep the stats-view link" rule, falling out naturally.
 */
export function resolveExplore(event: NormalizedEvent): ExploreLink | null {
  const enc = encodeURIComponent
  switch (event.datasetId) {
    case 'fire-ems-dispatch':
      return {
        to: `/emergency-response?incident=${enc(extractId(event))}`,
        label: 'Open on the Emergency Response map',
        caption: 'See this incident and its full response timeline.',
      }
    case '311-cases':
      return {
        to: `/cases-311?case=${enc(extractId(event))}`,
        label: 'Open on the 311 map',
        caption: 'See this case in the 311 map view.',
      }
    case '911-realtime': {
      const nh = event.neighborhood
      if (!nh) {
        return {
          to: `/dispatch-911?incident=${enc(extractId(event))}`,
          label: 'Open in 911 Dispatch',
          caption: 'Sensitive call — explore patterns in the Dispatch view.',
        }
      }
      if (VIOLENT_911.test(event.callType ?? event.headline ?? '')) {
        return {
          to: `/crime-incidents?neighborhood=${enc(nh)}`,
          label: 'See crime context',
          caption: `Violent-crime map for ${nh}.`,
        }
      }
      return {
        to: `/emergency-response?neighborhood=${enc(nh)}`,
        label: 'See response context',
        caption: `Fire/EMS response map for ${nh}.`,
      }
    }
  }
  return null // unreachable (switch is exhaustive over DatasetId)
}

/** "Nearest intersection · 19th St & Dolores St" / "Address · 831 Fulton St".
 *  The precision word leads because the marker shape already implies it and
 *  the card must say the same thing. null when the event has no coordinates
 *  (the card renders its suppressed line instead). */
export function locationLine(event: NormalizedEvent): { label: string; place: string } | null {
  if (event.longitude == null || event.latitude == null) return null
  return {
    label: PRECISION_LABEL[PRECISION[event.datasetId]],
    place: event.address ?? event.neighborhood ?? 'SF',
  }
}
