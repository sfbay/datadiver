/** Convert ALL CAPS or mixed case to Title Case — capitalize first letter of every word.
 *  Preserves known abbreviations (SF, CA, LLC, INC, DPH, etc.) */
const KEEP_UPPER = new Set(['SF', 'CA', 'LLC', 'INC', 'DBA', 'NA', 'LP', 'LLP', 'PC', 'MD', 'JR', 'SR', 'II', 'III', 'IV', 'DPH', 'MTA', 'PUC', 'HRD', 'USA', 'TV'])

export function toSentenceCase(str: string): string {
  if (!str) return ''
  return str.replace(/\b([A-Za-z])([A-Za-z]*)\b/g, (match, first, rest) => {
    // Preserve known abbreviations
    if (KEEP_UPPER.has(match.toUpperCase())) return match.toUpperCase()
    return first.toUpperCase() + rest.toLowerCase()
  })
}

export function toTitleCase(str: string): string {
  return toSentenceCase(str)
}
