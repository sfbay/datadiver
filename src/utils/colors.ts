/** Color scales for data visualization */
import * as d3 from 'd3'

/** Response time color scale (green → yellow → red) */
export function responseTimeColor(minutes: number): string {
  // Under 4 min = green, 4-8 min = yellow, 8+ min = red
  const scale = d3.scaleLinear<string>()
    .domain([0, 4, 8, 15])
    .range(['#10b981', '#f59e0b', '#ef4444', '#991b1b'])
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

/** Meter cap colors (actual SF designations) */
export const CAP_COLORS: Record<string, { color: string; label: string }> = {
  Grey: { color: '#6b7280', label: 'Standard' },
  Green: { color: '#10b981', label: 'Short-Term' },
  Yellow: { color: '#f59e0b', label: 'Commercial' },
  Red: { color: '#ef4444', label: 'Special' },
  Brown: { color: '#92400e', label: 'Port' },
  Purple: { color: '#8b5cf6', label: 'Accessible' },
}
