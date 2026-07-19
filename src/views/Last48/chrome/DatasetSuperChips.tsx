// src/views/Last48/chrome/DatasetSuperChips.tsx
//
// Living-ticker pill row that unifies the previous two stacked rows
// (FreshnessChipStrip + DatasetFilterChips) into one super-chip per
// dataset. Each chip combines:
//
//   - layer toggle (whole pill is the button)
//   - dataset identity (pigment dot + small-caps eyebrow)
//   - volume (big italic count + per-hour rate)
//   - 48h rate microvis (24×2h bins) with a NOW tick at the right edge
//     and a diagonal-hatch overlay marking the publish-lag zone, so the
//     gap between "newest event" and "now" reads as latency rather than
//     missing data (see feedback_latency_baseline_per_dataset.md)
//   - twin freshness indicators (data refresh + event lag, color-coded)
//
// Active state earns the corner-glow signature (Tier 2 glow per
// CLAUDE.md — subtle on interaction only). Inactive state is outline-
// only with dimmed pigment.

import { useEffect, useState, type CSSProperties } from 'react'
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

// ─────────────────────────────────────────────────────────────────────────────
// LiveSparkline — 24×2h bar chart with publish-lag hatch + NOW tick
// ─────────────────────────────────────────────────────────────────────────────
//
// Two visual affordances make the publishing latency legible:
//   1. The right N bins (where N = ceil(eventLagMs / BIN_MS)) are covered
//      by a diagonal-hatch overlay marking the "publish lag zone" — bins
//      where data hasn't yet arrived from the source publisher.
//   2. A 1px NOW tick at the right edge anchors "this point is now," so
//      the gap between the last bar and NOW reads as latency, not absence.
//
// Without these cues, Fire/EMS (~20h lag) and 311 (~23h lag) sparklines
// look like they "only have 24h of data" — when in fact they have the
// full 48h, just shifted older.

const SPARK_WIDTH  = 120
const SPARK_HEIGHT = 26

interface LiveSparklineProps {
  values: number[]              // 24 bins, oldest → newest
  pigment: string
  isActive: boolean
  isLoaded: boolean
  eventLagMs: number | null
  patternId: string             // per-chip id so multiple SVGs can coexist
}

function LiveSparkline({
  values, pigment, isActive, isLoaded, eventLagMs, patternId,
}: LiveSparklineProps) {
  const max     = Math.max(...values, 1)
  const barCount = values.length
  const barUnit = SPARK_WIDTH / barCount     // slot = bar + 1px gap
  const barWidth = Math.max(2, barUnit - 1)
  const barColor = isActive ? pigment : INACTIVE_BAR
  const barOpacity = !isLoaded ? 0.2 : isActive ? 0.9 : 0.45

  // Number of bins to mark as "publish lag zone." Cap at total bins.
  const lagBins = eventLagMs == null
    ? 0
    : Math.min(barCount, Math.ceil(eventLagMs / BIN_MS))
  const lagStartIdx = barCount - lagBins
  const lagX     = lagStartIdx * barUnit
  const lagWidth = lagBins * barUnit - 1

  return (
    <svg
      // Scales to its container (viewBox preserves the drawing) and caps at
      // SPARK_WIDTH, so the chip can shrink to fit 3-across on a narrow
      // foldable without clipping. Desktop chips are wide enough that it
      // renders at full SPARK_WIDTH, unchanged.
      className="block h-auto w-full"
      viewBox={`0 -1 ${SPARK_WIDTH} ${SPARK_HEIGHT + 3}`}
      preserveAspectRatio="xMaxYMid meet"
      aria-hidden
      style={{ maxWidth: SPARK_WIDTH, overflow: 'visible' }}
    >
      <defs>
        <pattern
          id={patternId}
          patternUnits="userSpaceOnUse"
          width="5"
          height="5"
          patternTransform="rotate(-45)"
        >
          <line
            x1="0" y1="0" x2="0" y2="5"
            stroke="#a8926a"
            strokeWidth="0.6"
            opacity={isActive ? 0.45 : 0.25}
          />
        </pattern>
      </defs>

      {lagBins > 0 && isLoaded && (
        <rect
          x={lagX}
          y={0}
          width={lagWidth}
          height={SPARK_HEIGHT}
          fill={`url(#${patternId})`}
        />
      )}

      {values.map((v, i) => {
        if (v <= 0) return null
        const h = Math.max(1, (v / max) * SPARK_HEIGHT)
        return (
          <rect
            key={i}
            x={i * barUnit}
            y={SPARK_HEIGHT - h}
            width={barWidth}
            height={h}
            fill={barColor}
            opacity={barOpacity}
            rx={0.5}
          />
        )
      })}

      {isLoaded && (
        <line
          x1={SPARK_WIDTH - 0.5}
          x2={SPARK_WIDTH - 0.5}
          y1={-1}
          y2={SPARK_HEIGHT + 2}
          stroke="#a8926a"
          strokeWidth="1"
          opacity={isActive ? 0.7 : 0.45}
        />
      )}
    </svg>
  )
}

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

/** Chip arrival states (see Last48.tsx arrivalByDataset):
 *  'loading'   — fetching or queued; quiet synchronized shimmer.
 *  'streaming' — this stream's dots are actively landing on the map;
 *                the pronounced beacon (brighter, faster, pigment ring).
 *  'idle'      — settled (or disabled/errored); no sheen. */
export type ChipArrival = 'idle' | 'loading' | 'streaming'

interface SuperChipProps {
  datasetId: DatasetId
  events: NormalizedEvent[]
  freshness: { refreshLagMs: number | null; eventLagMs: number | null } | undefined
  isLoaded: boolean
  isActive: boolean
  arrival: ChipArrival
  onToggle: () => void
}

function SuperChip({
  datasetId,
  events,
  freshness,
  isLoaded,
  isActive,
  arrival,
  onToggle,
}: SuperChipProps) {
  const pigment = PIGMENTS[datasetId]
  const label = LABELS[datasetId]

  // Sheen lingers 700ms past arrival-complete so the fade-out (600ms CSS
  // opacity transition) plays instead of the band popping off mid-sweep.
  const isArriving = arrival !== 'idle'
  const [sheenMounted, setSheenMounted] = useState(isArriving)
  useEffect(() => {
    if (isArriving) {
      setSheenMounted(true)
      return
    }
    const t = setTimeout(() => setSheenMounted(false), 700)
    return () => clearTimeout(t)
  }, [isArriving])
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
        relative flex-1 min-w-0 md:w-full text-left
        rounded-xl border transition-all duration-200
        px-3 py-2.5 md:px-4 md:py-3 overflow-hidden
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

      {/* Arrival sheen — pigment band sweeping left → right (the sparkline's
          time direction). Two registers: quiet 'loading' shimmer while the
          stream fetches/queues, and the 'streaming' beacon (brighter band,
          faster cadence, pigment ring) while its dots are actively landing
          on the map. Fades out over 600ms when the sweep settles. */}
      {sheenMounted && (
        <span
          className={`chip-sheen ${arrival === 'streaming' ? 'is-streaming' : ''}`}
          style={{
            opacity: isArriving ? 1 : 0,
            '--sheen': `${pigment}29`,
            '--sheen-hot': `${pigment}59`,
            '--sheen-ring': pigment,
            '--sheen-bloom': `${pigment}47`,
          } as CSSProperties}
          aria-hidden
        />
      )}

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
          className="font-mono text-micro tracking-[0.18em] uppercase text-paper-700 dark:text-paper-300"
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
      <div className="flex flex-col items-start gap-1 mt-1.5 relative md:flex-row md:items-end md:gap-3">
        <div className="flex items-baseline gap-2 shrink-0">
          {isLoaded ? (
            <>
              <span
                className="font-display italic text-[24px] md:text-[30px] leading-none tabular-nums text-paper-900 dark:text-paper-100"
                style={{ opacity: isActive ? 1 : 0.55 }}
              >
                {count.toLocaleString()}
              </span>
              <span className="hidden md:inline font-mono text-micro text-paper-500 dark:text-paper-500 tabular-nums whitespace-nowrap">
                {perHour}/hr
              </span>
            </>
          ) : (
            <span className="animate-pulse font-mono text-micro text-paper-500 dark:text-paper-600">
              loading…
            </span>
          )}
        </div>

        <div className="w-full min-w-0 md:w-auto md:ml-auto md:shrink md:basis-[120px]" aria-hidden>
          <LiveSparkline
            values={sparkData}
            pigment={pigment}
            isActive={isActive}
            isLoaded={isLoaded}
            eventLagMs={eventLag}
            patternId={`lag-hatch-${datasetId}`}
          />
        </div>
      </div>

      {/* ── Row 3: twin freshness indicators ───────────────────────────── */}
      {/* Twin freshness — hidden on the lean mobile chip (the sparkline's hatch
          already encodes event lag); returns at md+. */}
      <div className="hidden md:flex items-center gap-3 mt-2 font-mono text-nano tracking-wider text-paper-600 dark:text-paper-500">
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
  /** Per-dataset arrival state — 'loading' (fetching/queued), 'streaming'
   *  (dots actively landing on the canvas), 'idle' (settled). See
   *  Last48.tsx arrivalByDataset. */
  arrivalByDataset: Record<DatasetId, ChipArrival>
}

export default function DatasetSuperChips({
  enabled,
  onToggle,
  byDataset,
  freshness,
  initialLoadedByDataset,
  arrivalByDataset,
}: Props) {
  return (
    // Liquid grid (auto-fit + minmax, no breakpoints — house convention):
    // 3 chips fit across once the row clears ~700px (e.g. a Pixel Fold
    // unfolded), collapsing to 1 on a phone. Chips are min-w-0 + the
    // sparkline scales, so they shrink to share a narrower 3-across row
    // instead of dropping 311 to its own line.
    <div className="flex gap-2 md:grid md:grid-cols-[repeat(auto-fit,minmax(228px,1fr))] items-stretch">
      {LAST48_DATASETS.map((id) => (
        <SuperChip
          key={id}
          datasetId={id}
          events={byDataset[id] ?? []}
          freshness={freshness[id]}
          isLoaded={initialLoadedByDataset[id] ?? false}
          isActive={enabled.includes(id)}
          arrival={arrivalByDataset[id] ?? 'idle'}
          onToggle={() => onToggle(id)}
        />
      ))}
    </div>
  )
}
