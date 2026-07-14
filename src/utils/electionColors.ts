/**
 * Election-specific color utilities.
 *
 * Candidate colors are deterministic hashes based on name — each candidate
 * gets a unique hue. Margin and turnout use sequential scales.
 */
import * as d3 from 'd3'

/**
 * Qualitative candidate ramp — 16 distinct earth-tone values drawn from the
 * seven pigment families. Indigo leads because indigo is Elections' pigment.
 *
 * Ordered so ADJACENT entries sit in different hue families: candidates are
 * rendered in rank order, so neighbours in this array end up neighbours on
 * screen, and two adjacent salmons read as one candidate.
 *
 * Every value must be distinct — a repeat silently paints two candidates in a
 * race the same colour. `electionColors.test.ts` pins that.
 */
export const CANDIDATE_PALETTE = [
  '#616a96', // indigo-500
  '#b85a33', // terracotta-600
  '#7a9954', // moss-500
  '#d4a435', // ochre-500
  '#8b6282', // plum-500
  '#5c9693', // teal-500
  '#963e30', // brick-600
  '#9db87a', // moss-400
  '#474e74', // indigo-600
  '#d47149', // terracotta-500
  '#2e5856', // teal-700
  '#e8c06b', // ochre-400
  '#6b4563', // plum-600
  '#8bb5b2', // teal-400
  '#8f6817', // ochre-700
  '#d17566', // brick-400
]

/** Simple string hash → stable index */
function hashName(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/** Deterministic color for a candidate name (hashed, not index-based) */
export function candidateColor(name: string): string {
  return CANDIDATE_PALETTE[hashName(name) % CANDIDATE_PALETTE.length]
}

/** Build a Map<candidateName, color> for a race's candidates (name-hashed, stable across orderings) */
export function buildCandidateColorMap(
  candidates: { name: string }[]
): Map<string, string> {
  const map = new Map<string, string>()
  // Use index-based assignment to avoid hash collisions within a single race,
  // but hash-based for cross-race stability
  const usedColors = new Set<string>()
  for (const c of candidates) {
    let color = candidateColor(c.name)
    // If hash collision within this race, fall back to next unused color
    if (usedColors.has(color)) {
      color = CANDIDATE_PALETTE.find((p) => !usedColors.has(p)) || color
    }
    usedColors.add(color)
    map.set(c.name, color)
  }
  return map
}

/**
 * Margin-of-victory scale — magnitude, not direction. A dead heat reads pale;
 * a landslide reads deep. Single hue (Elections' indigo) so intensity is the
 * only variable: a second hue here would compete with the candidate ramp.
 *
 * Was `d3.interpolateRdYlBu`, which emitted saturated rainbow blues nowhere in
 * the earth-tone system, and — with `domain([0.5, -0.5])` against a margin that
 * is always ≥ 0 — only ever traversed its yellow→red half anyway.
 */
export function marginColor(margin: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0, 0.25, 0.5])
    .range(['#8a92b5', '#616a96', '#474e74']) // indigo 400 → 500 → 600
    .clamp(true)
  return scale(margin)
}

/** Turnout scale: low (brick) → mid (ochre) → high (moss). */
export function turnoutColor(pct: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0.2, 0.5, 0.8])
    .range(['#b85545', '#d4a435', '#7a9954']) // brick-500 → ochre-500 → moss-500
    .clamp(true)
  return scale(pct)
}

/**
 * Yes/No measure scale — diverging, neutral at the 50% split.
 * The midpoint is warm paper, not white: `#f5f5f5` disappeared against the
 * cream light-mode surface, so a race at 50/50 rendered as a hole in the map.
 */
export function measureColor(yesPct: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0.3, 0.5, 0.7])
    .range(['#b85545', '#d9c9a7', '#7a9954']) // brick-500 → paper-300 → moss-500
    .clamp(true)
  return scale(yesPct)
}

export const ACCENT = '#616a96'
