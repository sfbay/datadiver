/** Color scales for data visualization */
import * as d3 from 'd3'

/** Response time color scale — calibrated to SF 10-min 90th percentile standard */
export function responseTimeColor(minutes: number): string {
  // ≤5 min = pure green, 5-10 = green darkens to yellow, 10-15 = yellow to red, 15+ = deep red
  const scale = d3.scaleLinear<string>()
    .domain([0, 5, 10, 15, 25])
    .range(['#10b981', '#10b981', '#f59e0b', '#ef4444', '#7f1d1d'])
    .clamp(true)
  return scale(minutes)
}

/** Revenue intensity color scale (light → dark blue) */
export function revenueColor(amount: number, max: number): string {
  const scale = d3.scaleSequential(d3.interpolateBlues)
    .domain([0, max])
  return scale(amount)
}

/** Categorical color palette for charts */
export const CHART_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#f43f5e', // rose
] as const

/** Service type colors */
export const SERVICE_COLORS = {
  fire: '#ef4444',
  police: '#3b82f6',
  ems: '#10b981',
  all: '#8b5cf6',
} as const

/** Payment method colors */
export const PAYMENT_COLORS = {
  COIN: '#f59e0b',
  CARD: '#3b82f6',
  SMRT: '#10b981', // smart/app payment
} as const

/** Sensitivity filter colors */
export const SENSITIVITY_COLORS = {
  sensitive: '#a78bfa',    // violet
  'non-sensitive': '#60a5fa', // blue
  all: '#64748b',          // slate
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
  if (minutes <= 10) return '#10b981'  // green — good offload
  if (minutes <= 15) return '#f59e0b'  // amber — concerning
  if (minutes <= 20) return '#f97316'  // orange — delayed
  return '#ef4444'                      // red — critical
}

/** 311 resolution time color scale — calibrated to hours/days */
export function resolutionTimeColor(hours: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0, 24, 72, 168, 720])
    .range(['#10b981', '#10b981', '#f59e0b', '#ef4444', '#7f1d1d'])
    .clamp(true)
  return scale(hours)
}

/** 311 service category accent colors */
export const SERVICE_CATEGORY_COLORS: Record<string, string> = {
  'Street and Sidewalk Cleaning': '#10b981',
  'Graffiti': '#f59e0b',
  'Parking Enforcement': '#3b82f6',
  'Encampments': '#ef4444',
  'Abandoned Vehicle': '#8b5cf6',
}

/** SFPD incident resolution colors */
export const RESOLUTION_COLORS: Record<string, string> = {
  'Cite or Arrest Adult': '#ef4444',
  'Cite or Arrest Juvenile': '#f97316',
  'Exceptional Adult': '#f59e0b',
  'Open or Active': '#3b82f6',
  'Unfounded': '#64748b',
}

export function resolutionColor(resolution: string): string {
  return RESOLUTION_COLORS[resolution] || '#94a3b8'
}

/** Fine amount color scale — parking citations ($0→green, $75→amber, $200→orange, $500→red) */
export function fineAmountColor(amount: number): string {
  const scale = d3.scaleLinear<string>()
    .domain([0, 75, 200, 500])
    .range(['#10b981', '#f59e0b', '#f97316', '#ef4444'])
    .clamp(true)
  return scale(amount)
}

/** Traffic crash severity colors */
export const CRASH_SEVERITY_COLORS: Record<string, string> = {
  'Fatal': '#7f1d1d',
  'Injury (Severe)': '#dc2626',
  'Injury (Other Visible)': '#f59e0b',
  'Injury (Complaint of Pain)': '#fbbf24',
}

/** Traffic crash mode colors */
export const CRASH_MODE_COLORS: Record<string, string> = {
  'Vehicle-Pedestrian': '#dc2626',
  'Vehicle-Bicycle': '#f59e0b',
  'Vehicle(s) Only Involved': '#64748b',
}

/** Meter cap colors (actual SF designations) */
export const CAP_COLORS: Record<string, { color: string; label: string }> = {
  Grey: { color: '#6b7280', label: 'Standard' },
  Green: { color: '#10b981', label: 'Short-Term' },
  Yellow: { color: '#f59e0b', label: 'Commercial' },
  Red: { color: '#ef4444', label: 'Special' },
  Brown: { color: '#92400e', label: 'Port' },
  Purple: { color: '#8b5cf6', label: 'Accessible' },
}
