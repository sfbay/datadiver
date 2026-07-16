// src/utils/humanizeCivic.ts
//
// Plain-English clarity layer for SF civic-data shorthand. The source feeds
// abbreviate heavily ("Traf Violation Cite", "Meet W/Citizen"); DataDiver's
// voice is journalistic, not scanner-speak, so we expand them. Used by the
// Last 48 heartbeat (and reusable by the rail / detail card).

import type { DatasetId } from '@/types/last48'

// Token-level expansions (lowercase keys; values lowercased before final
// sentence-casing). Extend as new abbreviations surface.
const TOKEN_MAP: Record<string, string> = {
  traf: 'traffic', susp: 'suspicious', veh: 'vehicle', aud: 'audible',
  cite: 'citation', aslt: 'assault', bldg: 'building', med: 'medical',
  viol: 'violation', alm: 'alarm', intox: 'intoxicated', juv: 'juvenile',
  poss: 'possible', dist: 'disturbance', stbg: 'stabbing', prsn: 'person',
  info: 'information', unk: 'unknown', dem: 'demonstration', encmpmt: 'encampment',
}

/** Expand SF call-type shorthand into a plain-English, sentence-cased phrase. */
export function humanizeCallType(raw: string | undefined): string {
  if (!raw) return ''
  // "W/" / "w/" is the field shorthand for "with" (e.g. "Meet W/Citizen").
  // Underscores are word separators too (311 category keys: "Garbage_and_debris").
  const withExpanded = raw.replace(/_/g, ' ').replace(/\bw\//gi, 'with ')
  const tokens = withExpanded.split(/\s+/).filter(Boolean)
  const expanded = tokens.map((tok) => {
    const key = tok.toLowerCase().replace(/[.,]/g, '')
    return TOKEN_MAP[key] ?? tok
  })
  const lower = expanded.join(' ').toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

/** Plain-English stream name for headlines and full sentences (e.g. the Last
 *  48 heartbeat: "911 calls have been coming in faster…"). Keep the trailing
 *  noun — dropping it breaks the sentence grammar. */
export function humanizeStreamName(datasetId: DatasetId): string {
  switch (datasetId) {
    case '911-realtime': return '911 calls'
    case 'fire-ems-dispatch': return 'Fire & EMS responses'
    case '311-cases': return '311 reports'
  }
}

/** Compact stream label for dense surfaces where the row already reads as a
 *  list of events (the digest email rows). No trailing noun — "911 / Fire/EMS
 *  / 311" are unambiguous and shorter. NOT for use in full sentences. */
export function streamLabelShort(datasetId: DatasetId): string {
  switch (datasetId) {
    case '911-realtime': return '911'
    case 'fire-ems-dispatch': return 'Fire/EMS'
    case '311-cases': return '311'
  }
}
