// src/views/Last48/chrome/DatasetSuperChips.tsx
//
// Living-ticker pill row that unifies the previous two stacked rows
// (FreshnessChipStrip + DatasetFilterChips) into one super-chip per
// dataset. Each chip combines:
//
//   - layer toggle (whole pill is the button)
//   - dataset identity (pigment dot + small-caps eyebrow)
//   - volume (big italic count + per-hour rate)
//   - 48h rate microvis (SparkBars binned 2h × 24)
//   - twin freshness indicators (data refresh + event lag, color-coded)
//
// Active state earns the corner-glow signature (Tier 2 glow per
// CLAUDE.md — subtle on interaction only). Inactive state is outline-
// only with dimmed pigment.

import type { CSSProperties } from 'react'
import SparkBars from '@/components/charts/SparkBars'
import {
  LAST48_DATASETS,
  type DatasetId,
  type FreshnessMap,
  type NormalizedEvent,
} from '@/types/last48'

const PIGMENTS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',  // indigo
  'fire-ems-dispatch': '#b85a33',  // terracotta
  '311-cases':         '#7a9954',  // moss
}

const LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911 REALTIME',
  'fire-ems-dispatch': 'FIRE / EMS',
  '311-cases':         '311 CASES',
}

const INACTIVE_BAR = '#a8926a' // paper-500

// 24 bins of 2h each across the 48h window. Reads as a clean weekly-
// rhythm shape: morning peaks, late-night troughs.
const SPARKLINE_BINS = 24
const WINDOW_MS = 48 * 60 * 60 * 1000
const BIN_MS = WINDOW_MS / SPARKLINE_BINS

function binEventsByHour(events: NormalizedEvent[]): number[] {
  const now = Date.now()
  const counts = new Array<number>(SPARKLINE_BINS).fill(0)
  for (const e of events) {
    const age = now - e.receivedAt
    if (age < 0 || age >= WINDOW_MS) continue
    const idx = SPARKLINE_BINS - 1 - Math.floor(age / BIN_MS)
    counts[idx] += 1
  }
  return counts
}

function formatLag(ms: number | null): string {
  if (ms == null) return '—'
  const sec = Math.floor(ms / 1000)
  if (sec < 90) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 90) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 48) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}

// Same magnitude-coding as the retired FreshnessChipStrip so users
// who learned the previous rhythm carry the mental model forward.
function lagColor(ms: number | null): string {
  if (ms == null) return '#a8926a' // paper-500
  const minutes = ms / 60_000
  if (minutes < 30)    return '#7a9954' // moss — fresh
  if (minutes < 360)   return '#a8926a' // paper-500 — neutral (< 6h)
  if (minutes < 1440)  return '#d4a435' // ochre — warning (< 24h)
  return '#963e30' // brick — concern (≥ 24h)
}

// ─────────────────────────────────────────────────────────────────────────────
// Single chip
// ─────────────────────────────────────────────────────────────────────────────

interface SuperChipProps {
  datasetId: DatasetId
  events: NormalizedEvent[]
  freshness: { refreshLagMs: number | null; eventLagMs: number | null } | undefined
  isLoaded: boolean
  isActive: boolean
  onToggle: () => void
}

function SuperChip({
  datasetId,
  events,
  freshness,
  isLoaded,
  isActive,
  onToggle,
}: SuperChipProps) {
  const pigment = PIGMENTS[datasetId]
  const label = LABELS[datasetId]
  const count = events.length
  const perHour = (count / 48).toFixed(count >= 100 ? 0 : 1)
  const sparkData = isLoaded
    ? binEventsByHour(events)
    : new Array<number>(SPARKLINE_BINS).fill(0)

  const refreshLag = freshness?.refreshLagMs ?? null
  const eventLag   = freshness?.eventLagMs ?? null

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={isActive}
      aria-label={`${label}, ${isActive ? 'active' : 'inactive'}. ${count} events. Click to toggle.`}
      className={`
        relative flex-1 min-w-[260px] max-w-[420px] text-left
        rounded-xl border transition-all duration-200
        px-4 py-3 overflow-hidden
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
        focus-visible:ring-offset-paper-50 dark:focus-visible:ring-offset-espresso-950
        ${isActive
          ? 'border-paper-300/60 dark:border-espresso-700 bg-paper-100/70 dark:bg-espresso-900/80 glow-host shadow-sm'
          : 'border-paper-300/50 dark:border-espresso-700/50 bg-transparent opacity-55 hover:opacity-85 hover:border-paper-500 dark:hover:border-espresso-500'
        }
      `}
      style={
        isActive
          ? ({ '--glow': pigment, '--tw-ring-color': pigment } as CSSProperties)
          : undefined
      }
    >
      {isActive && <span className="glow-corner is-sm" aria-hidden />}

      {/* ── Row 1: pigment dot + name + active marker ─────────────────── */}
      <div className="flex items-center gap-2 relative">
        <span
          className="inline-block w-2 h-2 rounded-full transition-all"
          style={{
            backgroundColor: pigment,
            opacity: isActive ? 1 : 0.45,
            boxShadow: isActive ? `0 0 6px ${pigment}66` : 'none',
          }}
          aria-hidden
        />
        <span
          className="font-mono text-[10px] tracking-[0.18em] uppercase text-paper-700 dark:text-paper-300"
          style={isActive ? { color: pigment } : undefined}
        >
          {label}
        </span>
        {isActive && (
          <span
            className="ml-auto font-mono text-[8px] tracking-widest uppercase"
            style={{ color: pigment, opacity: 0.7 }}
            aria-hidden
          >
            LIVE
          </span>
        )}
      </div>

      {/* ── Row 2: count + per-hour + sparkline ────────────────────────── */}
      <div className="flex items-end gap-3 mt-1.5 relative">
        <div className="flex items-baseline gap-2 min-w-0">
          {isLoaded ? (
            <>
              <span
                className="font-display italic text-[30px] leading-none tabular-nums text-ink dark:text-paper-100"
                style={{ opacity: isActive ? 1 : 0.55 }}
              >
                {count.toLocaleString()}
              </span>
              <span className="font-mono text-[10px] text-paper-500 dark:text-paper-500 tabular-nums whitespace-nowrap">
                {perHour}/hr
              </span>
            </>
          ) : (
            <span className="animate-pulse font-mono text-[10px] text-paper-500 dark:text-paper-600">
              loading…
            </span>
          )}
        </div>

        <div
          className="ml-auto flex-shrink-0 transition-opacity"
          style={{ opacity: isActive && isLoaded ? 0.9 : isLoaded ? 0.4 : 0.2 }}
          aria-hidden
        >
          <SparkBars
            values={sparkData}
            height={26}
            gap={1}
            barColor={isActive ? pigment : INACTIVE_BAR}
            accentColor={pigment}
            highlightLast={isActive && count > 0}
          />
        </div>
      </div>

      {/* ── Row 3: twin freshness indicators ───────────────────────────── */}
      <div className="flex items-center gap-3 mt-2 font-mono text-[9px] tracking-wider text-paper-600 dark:text-paper-500">
        <span className="flex items-center gap-1.5" title="Data refresh lag — how long since the source publisher last updated rows">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full transition-colors"
            style={{ backgroundColor: lagColor(refreshLag) }}
            aria-hidden
          />
          <span className="uppercase">DATA</span>
          <span className="tabular-nums text-paper-700 dark:text-paper-400">
            {isLoaded ? formatLag(refreshLag) : '—'}
          </span>
        </span>
        <span className="flex items-center gap-1.5" title="Event lag — how old the freshest event in the window is">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full transition-colors"
            style={{ backgroundColor: lagColor(eventLag) }}
            aria-hidden
          />
          <span className="uppercase">EVENT</span>
          <span className="tabular-nums text-paper-700 dark:text-paper-400">
            {isLoaded ? formatLag(eventLag) : '—'}
          </span>
        </span>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Row of chips
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  enabled: DatasetId[]
  onToggle: (id: DatasetId) => void
  byDataset: Record<DatasetId, NormalizedEvent[]>
  freshness: FreshnessMap
  initialLoadedByDataset: Record<DatasetId, boolean>
}

export default function DatasetSuperChips({
  enabled,
  onToggle,
  byDataset,
  freshness,
  initialLoadedByDataset,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 items-stretch">
      {LAST48_DATASETS.map((id) => (
        <SuperChip
          key={id}
          datasetId={id}
          events={byDataset[id] ?? []}
          freshness={freshness[id]}
          isLoaded={initialLoadedByDataset[id] ?? false}
          isActive={enabled.includes(id)}
          onToggle={() => onToggle(id)}
        />
      ))}
    </div>
  )
}
