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
 *  feels too clinical. */
export function formatApTime(ms: number): string {
  const d = new Date(ms)
  let h = d.getHours()
  const m = d.getMinutes()
  const period = h >= 12 ? 'p.m.' : 'a.m.'
  h = h % 12
  if (h === 0) h = 12
  return `${h}:${String(m).padStart(2, '0')} ${period}`
}
