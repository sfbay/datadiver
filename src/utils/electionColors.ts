/**
 * Election-specific color utilities.
 *
 * Candidate colors are deterministic hashes based on name — each candidate
 * gets a unique hue. Margin and turnout use sequential scales.
 */
import * as d3 from 'd3'

const CANDIDATE_PALETTE = [
  '#616a96', // indigo
  '#b85545', // red
  '#7a9954', // emerald
  '#d4a435', // amber
  '#8b6282', // violet
  '#5c9693', // cyan
  '#d47149', // orange
  '#d17566', // pink
  '#14b8a6', // teal
  '#8b6282', // purple
  '#84cc16', // lime
  '#963e30', // rose
  '#5c9693', // sky
  '#eab308', // yellow
  '#8bb5b2', // cyan-light
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

/** Margin-of-victory color scale: 0% → light, 50%+ → saturated */
export function marginColor(margin: number): string {
  const scale = d3.scaleSequential(d3.interpolateRdYlBu)
    .domain([0.5, -0.5])
  return scale(margin)
}

/** Turnout % color scale: low (red) → mid (yellow) → high (green) */
export function turnoutColor(pct: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0.2, 0.5, 0.8])
    .range(['#b85545', '#d4a435', '#7a9954'])
    .clamp(true)
  return scale(pct)
}

/** Yes/No measure color: positive green gradient, negative red gradient */
export function measureColor(yesPct: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0.3, 0.5, 0.7])
    .range(['#b85545', '#f5f5f5', '#7a9954'])
    .clamp(true)
  return scale(yesPct)
}

export const ACCENT = '#616a96'
