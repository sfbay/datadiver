/**
 * Pure paint functions for the precinct fill. Hue answers WHO leads here;
 * opacity answers HOW DECISIVELY — four discrete steps, not a continuous
 * ramp (steps read as "levels of decisiveness"; continuous reads as noise
 * at 500-polygon scale).
 */
import { marginColor, measureColor, turnoutColor } from '@/utils/electionColors'
import { cleanCandidateName } from '@/utils/electionData'

export interface PrecinctLeader {
  /** Clean candidate name (party suffix stripped) — keys the color map. */
  name: string
  /** Leader votes / total votes in this precinct. */
  share: number
  /** (Leader − runner-up) / total. */
  lead: number
}

export interface Fill {
  color: string
  opacity: number
}

const FALLBACK = '#a8926a' // paper-500 — unmatched candidate

/** Convert D3's RGB output to hex for consistency with test expectations. */
function rgbToHex(rgb: string): string {
  const match = rgb.match(/\d+/g)
  if (!match || match.length < 3) return rgb
  const hex = match.slice(0, 3).map((x) => parseInt(x).toString(16).padStart(2, '0')).join('')
  return `#${hex}`
}

export function leaderOf(votes: Record<string, number>): PrecinctLeader | null {
  const entries = Object.entries(votes)
  const total = entries.reduce((sum, [, v]) => sum + v, 0)
  if (total === 0) return null
  const sorted = [...entries].sort((a, b) => b[1] - a[1])
  const [topName, topVotes] = sorted[0]
  const runnerUp = sorted[1]?.[1] ?? 0
  return {
    name: cleanCandidateName(topName),
    share: topVotes / total,
    lead: (topVotes - runnerUp) / total,
  }
}

/** Four steps of decisiveness keyed to the leader's SHARE. */
export function decisivenessOpacity(share: number): number {
  if (share < 0.34) return 0.25
  if (share < 0.5) return 0.4
  if (share < 0.65) return 0.55
  return 0.7
}

/** Quartile boundaries of this race's leader shares — the race-relative
 *  decisiveness ladder. Absolute cutpoints flatten lopsided races (Biden 85%
 *  citywide put ~every precinct in the top step); quartiles guarantee all
 *  four steps appear in every race. Null (→ absolute fallback) when there are
 *  too few precincts or the spread is degenerate. */
export function leaderShareQuartiles(shares: number[]): [number, number, number] | null {
  if (shares.length < 8) return null
  const s = [...shares].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(p * s.length))]
  const qs: [number, number, number] = [q(0.25), q(0.5), q(0.75)]
  return qs[0] === qs[2] ? null : qs
}

export function decisivenessOpacityRelative(share: number, q: [number, number, number]): number {
  if (share < q[0]) return 0.25
  if (share < q[1]) return 0.4
  if (share < q[2]) return 0.55
  return 0.7
}

/** Single-hue support ramp for a FOCUSED candidate: race-relative, continuous.
 *  Single hue is the regime where continuous tonal variation reads as a field
 *  (the demographic-underlay recipe) rather than noise. */
export function focusFill(share: number, extent: [number, number], hex: string): Fill {
  const [min, max] = extent
  const t = max > min ? (share - min) / (max - min) : 0.5
  return { color: hex, opacity: 0.12 + t * 0.63 }
}

export function resultsFill(
  leader: PrecinctLeader,
  colorMap: Map<string, string>,
  quartiles?: [number, number, number] | null,
): Fill {
  return {
    color: colorMap.get(leader.name) ?? FALLBACK,
    opacity: quartiles
      ? decisivenessOpacityRelative(leader.share, quartiles)
      : decisivenessOpacity(leader.share),
  }
}

/** Yes/no diverging ramp (brick → paper-300 → moss). */
export function propFill(yesShare: number): Fill {
  return { color: rgbToHex(measureColor(yesShare)), opacity: 0.55 }
}

export function turnoutFill(turnout: number): Fill {
  return { color: rgbToHex(turnoutColor(turnout)), opacity: 0.55 }
}

/** Margin of victory — indigo intensity, magnitude only. */
export function marginFill(lead: number): Fill {
  return { color: rgbToHex(marginColor(lead)), opacity: 0.55 }
}

export function isProposition(raceId: string, title: string): boolean {
  return /^(proposition|measure)/i.test(raceId) || /^(proposition|measure)/i.test(title.trim())
}
