// src/views/Last48/detail/Last48EventCard.tsx
//
// Fixed-position detail panel for a selected FLOW event.
// Uses DetailPanelShell (top-right anchor, slide-in animation, outside-click
// dismissal, corner glow) — same pattern as IncidentDetailPanel, CaseDetailPanel, etc.
//
// Interaction contract (click-driven):
//   • Click a map dot or rail row → parent sets selectedEvent → panel opens
//   • Click X, press Esc, or click outside → parent clears selectedEvent → panel closes

import { Link } from 'react-router-dom'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

// ---------------------------------------------------------------------------
// Dataset metadata — label, pigment accent, explore link + caption
// ---------------------------------------------------------------------------

const DATASET_META: Record<
  DatasetId,
  {
    label: string
    color: string
    exploreLabel: string
    exploreCaption: string
    exploreRoute: (id: string) => string
  }
> = {
  '911-realtime': {
    label: '911 DISPATCH',
    color: '#616a96',
    exploreLabel: 'Explore in 911 Dispatch',
    exploreCaption: 'Filter by this incident in the Dispatch view',
    exploreRoute: (id) => `/dispatch-911?incident=${encodeURIComponent(id)}`,
  },
  '911-historical': {
    label: '911 DISPATCH',
    color: '#5c9693',
    exploreLabel: 'Explore in 911 Dispatch',
    exploreCaption: 'Filter by this incident in the Dispatch view',
    exploreRoute: (id) => `/dispatch-911?incident=${encodeURIComponent(id)}`,
  },
  'fire-ems-dispatch': {
    label: 'FIRE/EMS',
    color: '#b85a33',
    exploreLabel: 'Explore in Fire/EMS',
    exploreCaption: 'See full response timeline in Emergency Response',
    exploreRoute: (id) => `/emergency-response?incident=${encodeURIComponent(id)}`,
  },
  '311-cases': {
    label: '311 CASE',
    color: '#7a9954',
    exploreLabel: 'Explore in 311',
    exploreCaption: 'Browse related cases in the 311 view',
    exploreRoute: (id) => `/cases-311?case=${encodeURIComponent(id)}`,
  },
  'parking-revenue': {
    label: 'PARKING METER',
    color: '#d4a435',
    exploreLabel: 'Explore in Parking Revenue',
    exploreCaption: "See this meter's session history",
    exploreRoute: (id) => `/parking-revenue?meter=${encodeURIComponent(id)}`,
  },
  'police-incidents': {
    label: 'POLICE INCIDENT',
    color: '#963e30',
    exploreLabel: 'Explore in Crime',
    exploreCaption: 'See this report in the Crime view',
    exploreRoute: (id) => `/crime-incidents?incident=${encodeURIComponent(id)}`,
  },
}

// ---------------------------------------------------------------------------
// Age formatting — returns magnitude + a full-word "X ago" unit phrase
// so the headline reads as one line: "43 minutes ago", "2 hours ago", etc.
// ---------------------------------------------------------------------------

function formatAge(receivedAt: number): { magnitude: string; unit: string } {
  const ms = Date.now() - receivedAt
  const sec = Math.max(1, Math.floor(ms / 1000))
  if (sec < 90) return { magnitude: String(sec), unit: sec === 1 ? 'second ago' : 'seconds ago' }
  const min = Math.floor(sec / 60)
  if (min < 90) return { magnitude: String(min), unit: min === 1 ? 'minute ago' : 'minutes ago' }
  const h = Math.floor(min / 60)
  if (h < 48) return { magnitude: String(h), unit: h === 1 ? 'hour ago' : 'hours ago' }
  const d = Math.floor(h / 24)
  return { magnitude: String(d), unit: d === 1 ? 'day ago' : 'days ago' }
}

// AP-style month abbreviations: short forms get a period; months ≤5 letters
// (March, April, May, June, July) remain unabbreviated.
const AP_MONTH: Record<string, string> = {
  January: 'Jan.',
  February: 'Feb.',
  March: 'March',
  April: 'April',
  May: 'May',
  June: 'June',
  July: 'July',
  August: 'Aug.',
  September: 'Sept.',
  October: 'Oct.',
  November: 'Nov.',
  December: 'Dec.',
}

/** AP style: "Wed. May 13, 2026" — weekday abbreviated w/ period; month per AP_MONTH. */
function formatApDate(ms: number): string {
  const d = new Date(ms)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }) // "Wed"
  const monthLong = d.toLocaleDateString('en-US', { month: 'long' })   // "September"
  const month = AP_MONTH[monthLong] ?? monthLong
  return `${weekday}. ${month} ${d.getDate()}, ${d.getFullYear()}`
}

function formatTimeOfDay(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

// ---------------------------------------------------------------------------
// Field helpers — compact dataset-specific metadata rows
// ---------------------------------------------------------------------------

function extractField(raw: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = raw[k]
    if (v != null && v !== '') return String(v)
  }
  return null
}

/** Per-dataset compact fields. Returns [[label, value], …]. */
function compactFields(event: NormalizedEvent): Array<[string, string]> {
  const { raw, datasetId } = event
  switch (datasetId) {
    case '911-realtime':
    case '911-historical':
      return [
        ['Disposition', extractField(raw, 'disposition') ?? '—'],
        ['Priority',    extractField(raw, 'priority_final', 'original_priority', 'priority') ?? '—'],
        ['Unit',        extractField(raw, 'unit_id', 'primary_unit') ?? '—'],
      ]
    case 'fire-ems-dispatch':
      return [
        ['Unit',    extractField(raw, 'unit_id') ?? '—'],
        ['Station', extractField(raw, 'station_area') ?? '—'],
      ]
    case '311-cases':
      return [
        ['Status', extractField(raw, 'status_description', 'status') ?? '—'],
        ['Agency', extractField(raw, 'agency_responsible') ?? '—'],
      ]
    case 'parking-revenue':
      return [
        ['Amount', extractField(raw, 'session_paid_amt') ? `$${extractField(raw, 'session_paid_amt')}` : '—'],
        ['Method', extractField(raw, 'payment_type') ?? '—'],
      ]
    case 'police-incidents':
      return [
        ['Subcategory', extractField(raw, 'incident_subcategory') ?? '—'],
        ['Resolution',  extractField(raw, 'resolution') ?? '—'],
      ]
    default:
      return []
  }
}

/** Derive the dataset-native ID for the explore link. */
function extractId(event: NormalizedEvent): string {
  const { raw } = event
  return String(
    raw.cad_number ??
    raw.incident_id ??
    raw.service_request_id ??
    raw.post_id ??
    raw.call_number ??
    event.id
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  event: NormalizedEvent | null
  onClose: () => void
}

export default function Last48EventCard({ event, onClose }: Props) {
  const meta = event ? DATASET_META[event.datasetId] : null

  return (
    <DetailPanelShell
      open={!!event}
      onClose={onClose}
      isLoading={false}
      widthClass="w-[clamp(260px,22vw,320px)]"
      glowColor={meta?.color ?? '#b85a33'}
    >
      {event && meta && (() => {
        const { magnitude, unit } = formatAge(event.receivedAt)
        const fields = compactFields(event)
        const exploreId = extractId(event)

        return (
          <>
            {/* ── Age headline ─────────────────────────────────────── */}
            {/* Big italic Fraunces number + "X ago" unit phrase on the
                same line. AP-style date + time of day on the next line.   */}
            <div className="mb-3 mt-1">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-display italic text-[48px] leading-none text-paper-100 dark:text-paper-100 tabular-nums">
                  {magnitude}
                </span>
                <span className="font-display italic text-[16px] text-paper-300 dark:text-paper-400 leading-tight">
                  {unit}
                </span>
              </div>

              {/* AP-style date + time on a single subdued line below the headline */}
              <p className="font-mono text-[11px] text-paper-400 dark:text-paper-500 mt-1.5 tabular-nums">
                {formatApDate(event.receivedAt)} · {formatTimeOfDay(event.receivedAt)} PT
              </p>
            </div>

            {/* ── Eyebrow: dataset label + state pill ──────────────── */}
            <div className="flex items-center gap-2 mb-2">
              <span
                className="font-mono text-[9px] tracking-[0.18em] uppercase"
                style={{ color: meta.color }}
              >
                ── {meta.label}
              </span>
              {event.state && (
                <span
                  className="inline-flex items-center px-1.5 py-0 rounded font-mono text-[8px] tracking-wider uppercase leading-4"
                  style={{
                    backgroundColor: event.state === 'open'
                      ? 'rgba(157,184,122,0.18)'
                      : 'rgba(94,72,49,0.30)',
                    color: event.state === 'open' ? '#9db87a' : '#a8926a',
                    border: `1px solid ${event.state === 'open' ? 'rgba(157,184,122,0.35)' : 'rgba(94,72,49,0.45)'}`,
                  }}
                >
                  {event.state === 'open' ? 'OPEN' : `CLOSED · ${event.disposition ?? '—'}`}
                </span>
              )}
            </div>

            {/* ── Headline: call type / description ────────────────── */}
            <h3 className="font-display italic text-[18px] leading-snug text-paper-100 dark:text-paper-100 mb-1">
              {event.headline ?? 'Event'}
            </h3>

            {/* ── Location ─────────────────────────────────────────── */}
            {event.neighborhood && (
              <p className="font-mono text-[10px] text-paper-400 dark:text-paper-500 mb-3">
                {event.neighborhood}
              </p>
            )}

            {/* ── Compact field rows ────────────────────────────────── */}
            {fields.length > 0 && (
              <ul className="mb-3 flex flex-col gap-1">
                {fields.map(([label, value]) => (
                  <li key={label} className="flex justify-between items-baseline gap-3">
                    <span className="font-display italic text-[11px] text-paper-500 dark:text-paper-600 shrink-0">
                      {label}
                    </span>
                    <span className="font-mono text-[11px] text-paper-200 dark:text-paper-300 tabular-nums text-right truncate">
                      {value}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* ── Double-rule divider ───────────────────────────────── */}
            <div className="border-t border-paper-200/20 dark:border-espresso-700/60 mb-px" />
            <div className="border-t border-paper-200/10 dark:border-espresso-700/30 mb-2" />

            {/* ── Footer explore link ───────────────────────────────── */}
            <Link
              to={meta.exploreRoute(exploreId)}
              className="block font-mono text-[11px] tracking-wider text-ochre-500 hover:text-ochre-400 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500"
              onClick={onClose}
            >
              {meta.exploreLabel} →
            </Link>
            <p className="font-display italic text-[10px] text-paper-500 dark:text-paper-600 mt-0.5">
              {meta.exploreCaption}
            </p>
          </>
        )
      })()}
    </DetailPanelShell>
  )
}
