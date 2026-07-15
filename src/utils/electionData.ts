/**
 * Pure helpers for the certified election result files. All cross-file name
 * joins go through here ONCE (spec: normalize at a module boundary, never
 * ad-hoc at call sites).
 */
import { toSentenceCase } from '@/utils/format'
import type { NeighborhoodResultsFile } from '@/types/elections'

/** dsov names are UPPERCASE; vendored geojson is title case. One key joins both. */
export const nhoodKey = (s: string): string => s.toUpperCase().trim()

/** Precinct/neighborhood vote keys embed "\n(PARTY)"; summary names are clean. */
export function cleanCandidateName(raw: string): string {
  const nl = raw.indexOf('\n')
  return (nl === -1 ? raw : raw.slice(0, nl)).trim()
}

function isYesKey(k: string): boolean {
  const u = k.trim().toUpperCase()
  return u === 'YES' || u.endsWith(' YES')
}
function isNoKey(k: string): boolean {
  const u = k.trim().toUpperCase()
  return u === 'NO' || u.endsWith(' NO')
}

/** Yes share of a proposition's precinct votes, or null when nothing was cast. */
export function yesShareOf(votes: Record<string, number>): number | null {
  let yes = 0
  let no = 0
  for (const [k, v] of Object.entries(votes)) {
    if (isYesKey(k)) yes += v
    else if (isNoKey(k)) no += v
  }
  const total = yes + no
  return total > 0 ? yes / total : null
}

/** Dejargoned share: "7 in 10 votes", never a raw fraction or percent. */
export function sharePhrase(share: number): string {
  const tenths = Math.round(share * 10)
  if (tenths <= 0) return 'fewer than 1 in 10 votes'
  if (tenths >= 10) return 'nearly every vote'
  return `${tenths} in 10 votes`
}

/** Compact display name for a precinct leader: "Harris", "Yes", "Lurie". */
export function leaderDisplayName(cleanName: string): string {
  if (isYesKey(cleanName)) return 'Yes'
  if (isNoKey(cleanName)) return 'No'
  const firstTicket = cleanName.split('/')[0].trim()
  const last = firstTicket.split(' ').pop() ?? firstTicket
  return toSentenceCase(last)
}

/** Modern names title-case cleanly; legacy26 names are abbreviations
 *  ("CVC CTR/DWTN") that title-casing would mangle — keep them verbatim. */
export function displayNhood(name: string, scheme: NeighborhoodResultsFile['scheme']): string {
  return scheme === 'analysis41' ? toSentenceCase(name) : name
}
