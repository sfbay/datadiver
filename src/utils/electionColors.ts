/**
 * Election-specific color utilities.
 *
 * Candidate colors are deterministic hashes based on name — each candidate
 * gets a unique hue. Margin and turnout use sequential scales.
 */
import * as d3 from 'd3'

const CANDIDATE_PALETTE = [
  '#6366f1', // indigo
  '#ef4444', // red
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#14b8a6', // teal
  '#a855f7', // purple
  '#84cc16', // lime
  '#f43f5e', // rose
  '#0ea5e9', // sky
  '#eab308', // yellow
  '#22d3ee', // cyan-light
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
    .range(['#ef4444', '#f59e0b', '#10b981'])
    .clamp(true)
  return scale(pct)
}

/** Yes/No measure color: positive green gradient, negative red gradient */
export function measureColor(yesPct: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0.3, 0.5, 0.7])
    .range(['#ef4444', '#f5f5f5', '#10b981'])
    .clamp(true)
  return scale(yesPct)
}

export const ACCENT = '#6366f1'
