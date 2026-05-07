/**
 * Color scales for data visualization — earth-tone palette.
 *
 * Migration map applied here (2026-05-06): every bright Tailwind hex
 * (#10b981 emerald, #f59e0b amber, #ef4444 red, #f97316 orange,
 * #3b82f6 blue, #a78bfa violet, etc.) → its earth-tone equivalent
 * (moss / ochre / brick / terracotta / indigo / plum). Same semantic
 * roles (success / warning / danger / info), warmer hues. Functions
 * exported here are the source of truth for chart colors across the
 * site, so a single migration cascades to many callers.
 *
 * The CityBudget compliance dashboard intentionally does NOT use these
 * scales — it has its own reserved-palette commitment for the drill-
 * down narrative (see CLAUDE.md "Color palette commitment").
 */
import * as d3 from 'd3'

/** Response time color scale — calibrated to SF 10-min 90th percentile standard */
export function responseTimeColor(minutes: number): string {
  // ≤5 min = moss (fast), 5-10 = moss → ochre, 10-15 = ochre → brick, 15+ = deep brick
  const scale = d3.scaleLinear<string>()
    .domain([0, 5, 10, 15, 25])
    .range(['#7a9954', '#7a9954', '#d4a435', '#b85545', '#6f2b20'])
    .clamp(true)
  return scale(minutes)
}

/** Revenue intensity color scale — sequential teal (warm replacement for the
 *  default sequential blue interpolator, which read as cool electric on the
 *  cream/espresso surfaces). Light teal at low values, deeper at high. */
export function revenueColor(amount: number, max: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0, max * 0.5, max])
    .range(['#ecdfc5', '#8bb5b2', '#2e5856'])
    .clamp(true)
  return scale(amount)
}

/** Categorical color palette for charts — eight earth-tone pigments rotated
 *  to maximize visual distinction in legends. Ordering: cool/info → growth →
 *  warning → danger → editorial → information → secondary danger → muted. */
export const CHART_COLORS = [
  '#3f7573', // teal-600 — info
  '#7a9954', // moss-500 — success
  '#d4a435', // ochre-500 — warning
  '#963e30', // brick-600 — critical
  '#8b6282', // plum-500 — editorial
  '#5c9693', // teal-500 — secondary info
  '#d47149', // terracotta-500 — alert
  '#d17566', // brick-400 — secondary danger
] as const

/** Service type colors — warm earth-tone equivalents. */
export const SERVICE_COLORS = {
  fire: '#963e30',     // brick-600 — emergency
  police: '#474e74',   // indigo-600 — civic authority, rare cool
  ems: '#7a9954',      // moss-500 — healing / wellbeing
  all: '#8b6282',      // plum-500 — composite / aggregate
} as const

/** Payment method colors — physical-cue mapping. */
export const PAYMENT_COLORS = {
  COIN: '#b58620',     // ochre-600 — metallic warmth
  CARD: '#5c9693',     // teal-500 — card sweep / ID-style
  SMRT: '#7a9954',     // moss-500 — modern / app-positive
} as const

/** Sensitivity filter colors — gentle pigments per category. */
export const SENSITIVITY_COLORS = {
  sensitive: '#8b6282',          // plum-500 — delicate, editorial
  'non-sensitive': '#5c9693',    // teal-500 — neutral info
  all: '#a8926a',                 // paper-500 — composite muted
} as const

/** Disposition code → readable label */
export const DISPOSITION_LABELS: Record<string, string> = {
  HAN: 'Handled',
  GOA: 'Gone on Arrival',
  CIT: 'Cited',
  ARR: 'Arrest',
  REP: 'Report Filed',
  ADV: 'Advised',
  CAN: 'Cancelled',
  ND: 'No Dispatch',
  UTL: 'Unable to Locate',
  NOM: 'No Merit',
  VAS: 'Vehicle Abatement',
  SFD: 'Referred to SFD',
  CSA: 'Community Service',
  '22': 'Cancel',
  ABA: 'Abated',
} as const

/** APOT (Ambulance Patient Offload Time) color scale — clinical thresholds */
export function apotTimeColor(minutes: number): string {
  if (minutes <= 10) return '#7a9954'  // moss-500 — good offload
  if (minutes <= 15) return '#d4a435'  // ochre-500 — concerning
  if (minutes <= 20) return '#d47149'  // terracotta-500 — delayed
  return '#963e30'                      // brick-600 — critical
}

/** 311 resolution time color scale — calibrated to hours/days */
export function resolutionTimeColor(hours: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0, 24, 72, 168, 720])
    .range(['#7a9954', '#7a9954', '#d4a435', '#b85545', '#6f2b20'])
    .clamp(true)
  return scale(hours)
}

/** 311 service category accent colors — distinct earth pigments per category. */
export const SERVICE_CATEGORY_COLORS: Record<string, string> = {
  'Street and Sidewalk Cleaning': '#7a9954',  // moss — civic upkeep
  'Graffiti': '#d4a435',                       // ochre — visible mark
  'Parking Enforcement': '#3f7573',            // teal — DPT
  'Encampments': '#963e30',                    // brick — critical
  'Abandoned Vehicle': '#8b6282',              // plum — out-of-place
}

/** SFPD incident resolution colors — severity-graded earth-tones. */
export const RESOLUTION_COLORS: Record<string, string> = {
  'Cite or Arrest Adult': '#963e30',     // brick-600 — most consequential
  'Cite or Arrest Juvenile': '#d47149',  // terracotta-500 — adjacent severe
  'Exceptional Adult': '#d4a435',        // ochre-500 — qualified outcome
  'Open or Active': '#616a96',           // indigo-500 — pending / cool
  'Unfounded': '#a8926a',                 // paper-500 — neutral muted
}

export function resolutionColor(resolution: string): string {
  return RESOLUTION_COLORS[resolution] || '#a8926a'
}

/** Fine amount color scale — parking citations (warm gradient: $0 light moss
 *  → $75 ochre → $200 terracotta → $500 deep brick). */
export function fineAmountColor(amount: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0, 75, 200, 500])
    .range(['#9db87a', '#d4a435', '#d47149', '#963e30'])
    .clamp(true)
  return scale(amount)
}

/** Traffic crash severity colors — brick-deepening for fatal/severe + ochre
 *  for less severe. Same severity ramp as response-time, semantically aligned. */
export const CRASH_SEVERITY_COLORS: Record<string, string> = {
  'Fatal': '#6f2b20',                       // brick-700 — deepest
  'Injury (Severe)': '#963e30',             // brick-600
  'Injury (Other Visible)': '#d4a435',      // ochre-500
  'Injury (Complaint of Pain)': '#e8c06b',  // ochre-400 — softest
}

/** Traffic crash mode colors — vulnerability ranking. */
export const CRASH_MODE_COLORS: Record<string, string> = {
  'Vehicle-Pedestrian': '#963e30',          // brick-600 — most vulnerable
  'Vehicle-Bicycle': '#d4a435',             // ochre-500 — caution
  'Vehicle(s) Only Involved': '#a8926a',    // paper-500 — neutral
}

/** Meter cap colors — actual SF physical meter cap designations. Real-world
 *  reference colors stay close to the literal cap colors but shifted into
 *  the earth-tone palette where reasonable (Grey/Brown stay near literal,
 *  Green→moss, Yellow→ochre, Red→brick, Purple→plum). */
export const CAP_COLORS: Record<string, { color: string; label: string }> = {
  Grey:   { color: '#7a5f42', label: 'Standard' },     // ink-500 — neutral warm grey
  Green:  { color: '#7a9954', label: 'Short-Term' },   // moss-500
  Yellow: { color: '#d4a435', label: 'Commercial' },   // ochre-500
  Red:    { color: '#963e30', label: 'Special' },      // brick-600
  Brown:  { color: '#8f4426', label: 'Port' },         // terracotta-700 — kept brown-ish
  Purple: { color: '#8b6282', label: 'Accessible' },   // plum-500
}
