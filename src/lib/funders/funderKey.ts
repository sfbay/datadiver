// A funder has no id anywhere in pitq-e56w. The NAME is the id, and every
// surface that merges on it must say so (spec §2). Nothing fuzzier than
// case + whitespace + trailing periods — "Jr." stays a different person.
export function fold(s: string | undefined | null): string {
  return (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\.+$/, '')
}

export function funderKey(row: { transaction_first_name?: string; transaction_last_name: string; entity_code?: string }): string {
  const isPerson = !row.entity_code || row.entity_code === 'IND'
  return `${isPerson ? fold(row.transaction_first_name) : ''}|${fold(row.transaction_last_name)}`
}

export function parseFunderParam(raw: string | null): { first: string; last: string; key: string } | null {
  if (!raw) return null
  const bar = raw.indexOf('|')
  if (bar < 0) return null
  const first = fold(raw.slice(0, bar))
  const last = fold(raw.slice(bar + 1))
  if (!last) return null
  return { first, last, key: `${first}|${last}` }
}

export function formatFunderParam(key: string): string {
  return key.toLowerCase()
}

const KEEP_UPPER = new Set(['SF', 'CA', 'LLC', 'PAC', 'LGBTQ', 'AI', 'II', 'III'])
function caseWord(w: string): string {
  if (KEEP_UPPER.has(w)) return w
  return w.charAt(0) + w.slice(1).toLowerCase()
}

export function displayName(key: string): string {
  const bar = key.indexOf('|')
  const first = bar >= 0 ? key.slice(0, bar) : ''
  const last = bar >= 0 ? key.slice(bar + 1) : key
  return [first, last].filter(Boolean).join(' ').split(' ').map(caseWord).join(' ')
}
