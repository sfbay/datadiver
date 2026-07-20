/**
 * Election-specific color utilities.
 *
 * Candidate colors are assigned by VOTE RANK within a race — color encodes
 * standing, not identity. Margin and turnout use sequential scales.
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

/**
 * Build a Map<candidateName, color> for a race — assigned by VOTE RANK, so
 * the palette's ordering finally does its job: rank 1 = indigo, rank 2 =
 * terracotta (cool vs warm, unmistakable at any size), and the first SEVEN
 * ranks each land in a different pigment family before any family repeats
 * at another weight.
 *
 * Replaces a name-hash scheme whose randomized placement defeated that
 * ordering — the 2024 mayor's top two hashed to plum-500 and plum-600
 * (same family, one ramp step apart), Peskin/Farrell to near-twin salmons,
 * and Safaí exact-collided into a race-dependent fallback. Color here
 * encodes STANDING, not identity: a candidate may wear a different color
 * in a different election, but within any race the biggest bars are
 * always maximally separated.
 *
 * Sorted by totalVotes internally (stable for ties/missing), so the map is
 * independent of input array order. Races beyond 16 candidates wrap the
 * palette — sliver-scale write-in territory, accepted.
 */
export function buildCandidateColorMap(
  candidates: { name: string; totalVotes?: number }[]
): Map<string, string> {
  const ranked = [...candidates].sort(
    (a, b) => (b.totalVotes ?? 0) - (a.totalVotes ?? 0),
  )
  const map = new Map<string, string>()
  ranked.forEach((c, i) => {
    map.set(c.name, CANDIDATE_PALETTE[i % CANDIDATE_PALETTE.length])
  })
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
