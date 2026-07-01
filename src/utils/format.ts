/** Convert ALL CAPS or mixed case to Title Case — capitalize first letter of every word.
 *  Preserves known abbreviations (SF, CA, LLC, INC, DPH, etc.) */
const KEEP_UPPER = new Set(['SF', 'CA', 'LLC', 'INC', 'DBA', 'NA', 'LP', 'LLP', 'PC', 'MD', 'JR', 'SR', 'II', 'III', 'IV', 'DPH', 'MTA', 'PUC', 'HRD', 'USA', 'TV'])

export function toSentenceCase(str: string): string {
  if (!str) return ''
  const result = str.replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (match, first, rest) => {
    // Preserve known abbreviations
    if (KEEP_UPPER.has(match.toUpperCase())) return match.toUpperCase()
    return first.toUpperCase() + rest.toLowerCase()
  })
  // Fix possessives/contractions: 'S → 's, 'T → 't, etc.
  return result.replace(/'([A-Z])\b/g, (_, ch) => `'${ch.toLowerCase()}`)
}

export function toTitleCase(str: string): string {
  return toSentenceCase(str)
}

/** Headline normalizer for event call types / service subtypes.
 *  Detects input shape and routes to the right transform:
 *    - snake_case_values  → "Snake case values" (sentence case, _ → space,
 *      capitalize only the first letter — descriptive, not titular)
 *    - ALL CAPS / mixed   → title case via toSentenceCase (preserves SF/CA
 *      and other known abbreviations — categorical-label register)
 *
 *  Choose by detection: presence of underscores in the source string. 311's
 *  service_subtype values are descriptive (snake_case sentences); 911 and
 *  Fire/EMS call types are categorical labels (ALL CAPS or mixed case). */
export function formatHeadline(s: string | undefined): string {
  if (!s) return ''
  if (s.includes('_')) {
    const spaced = s.replace(/_/g, ' ').toLowerCase()
    return spaced.charAt(0).toUpperCase() + spaced.slice(1)
  }
  return toSentenceCase(s)
}

/** AP-style time of day: "2:22 p.m.", "12:05 a.m.", "10:55 a.m." — lowercase
 *  meridiem with periods, single-digit hours unpadded, minutes always 2 digits.
 *  Use for absolute timestamps in calm reading contexts where 24-hour mono
 *  feels too clinical.
 *
 *  Pinned to America/Los_Angeles: SF civic event times are SF facts, and the
 *  UI labels them "PT" — a viewer in New York should read the same clock as a
 *  viewer in the Mission. (Cached formatter; construction is the slow part.) */
const SF_AP_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Los_Angeles',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export function formatApTime(ms: number): string {
  let h = '12'
  let m = '00'
  let period = 'a.m.'
  for (const p of SF_AP_TIME.formatToParts(ms)) {
    if (p.type === 'hour') h = p.value
    else if (p.type === 'minute') m = p.value
    else if (p.type === 'dayPeriod') period = p.value === 'AM' ? 'a.m.' : 'p.m.'
  }
  return `${h}:${m} ${period}`
}
