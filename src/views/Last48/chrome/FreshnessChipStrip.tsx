// src/views/Last48/chrome/FreshnessChipStrip.tsx
//
// Two-row honesty chip strip:
//   Row 1 — DATA REFRESH: how long ago Socrata last published rows
//   Row 2 — EVENT LAG: how old the freshest event is
//
// Color-coded by lag magnitude. Click anywhere → methodology popover
// (deferred to Phase 1.x polish; for now no popover).

import { useEffect, useRef, useState } from 'react'
import type { FreshnessMap, DatasetId } from '@/types/last48'

const DATASET_LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases':         '311',
  '911-historical':    '911 Hist',
  'parking-revenue':   'Parking',
  'police-incidents':  'Police',
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

function lagColor(ms: number | null): string {
  if (ms == null) return 'text-paper-600'
  const minutes = ms / 60_000
  if (minutes < 30) return 'text-moss-600 dark:text-moss-400'         // < 30 min — fresh
  if (minutes < 360) return 'text-paper-700 dark:text-paper-400'      // < 6h — neutral
  if (minutes < 1440) return 'text-ochre-700 dark:text-ochre-500'     // < 24h — warning
  return 'text-brick-700 dark:text-brick-500'                          // >= 24h — concern
}

interface Props {
  freshness: FreshnessMap
  initialLoadedByDataset: Record<DatasetId, boolean>
}

export default function FreshnessChipStrip({ freshness, initialLoadedByDataset }: Props) {
  // Render ALL datasets always (with em-dash placeholders for null lag
  // values) so the chrome is visually stable across initial load and
  // partial-fetch states. The strip should never flash blank.
  const datasets = Object.keys(freshness) as DatasetId[]

  // Track previous initialLoadedByDataset values to detect false → true flips.
  const prevLoadedRef = useRef<Record<DatasetId, boolean>>(
    Object.fromEntries(datasets.map((id) => [id, false])) as Record<DatasetId, boolean>
  )

  // Set of dataset IDs currently showing the resolve pulse class.
  const [pulsingIds, setPulsingIds] = useState<Set<DatasetId>>(new Set())

  // Detect false → true flips and trigger the chip-resolve-pulse animation.
  useEffect(() => {
    const flipped: DatasetId[] = []
    for (const id of datasets) {
      const prev = prevLoadedRef.current[id] ?? false
      const curr = initialLoadedByDataset[id] ?? false
      if (!prev && curr) {
        flipped.push(id)
        prevLoadedRef.current[id] = true
      }
    }
    if (flipped.length === 0) return

    setPulsingIds((prev) => {
      const next = new Set(prev)
      for (const id of flipped) next.add(id)
      return next
    })

    // Remove pulse class after animation completes (~600ms).
    const t = setTimeout(() => {
      setPulsingIds((prev) => {
        const next = new Set(prev)
        for (const id of flipped) next.delete(id)
        return next
      })
    }, 650)

    return () => clearTimeout(t)
  }, [initialLoadedByDataset, datasets])

  return (
    <div className="flex flex-col gap-1 font-mono text-[10px] leading-tight">
      {/* Editorial eyebrow + trailing rule */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display italic text-[10px] text-paper-500 tracking-normal">
          Per-source freshness
        </span>
        <span className="flex-1 border-t border-paper-300/40 dark:border-espresso-700 mb-1" />
      </div>

      {/* Row 1 — DATA REFRESH */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-paper-600 tracking-wider">DATA REFRESH</span>
        {datasets.map((id) => {
          const f = freshness[id]
          const isInitialLoaded = initialLoadedByDataset[id] ?? false
          const isPulsing = pulsingIds.has(id)
          return (
            <span key={`refresh-${id}`} className={`flex items-baseline gap-1${isPulsing ? ' chip-resolve-pulse' : ''}`}>
              <span className="text-paper-700 dark:text-paper-500">{DATASET_LABELS[id]}</span>
              {isInitialLoaded ? (
                <span className={`${lagColor(f.refreshLagMs)} tabular-nums`}>{formatLag(f.refreshLagMs)}</span>
              ) : (
                <span className="animate-pulse text-paper-600 dark:text-paper-700">loading…</span>
              )}
            </span>
          )
        })}
      </div>

      {/* Row 2 — EVENT LAG */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-paper-600 tracking-wider">EVENT LAG&nbsp;&nbsp;</span>
        {datasets.map((id) => {
          const f = freshness[id]
          const isInitialLoaded = initialLoadedByDataset[id] ?? false
          const isPulsing = pulsingIds.has(id)
          return (
            <span key={`lag-${id}`} className={`flex items-baseline gap-1${isPulsing ? ' chip-resolve-pulse' : ''}`}>
              <span className="text-paper-700 dark:text-paper-500">{DATASET_LABELS[id]}</span>
              {isInitialLoaded ? (
                <span className={`${lagColor(f.eventLagMs)} tabular-nums`}>{formatLag(f.eventLagMs)}</span>
              ) : (
                <span className="animate-pulse text-paper-600 dark:text-paper-700">loading…</span>
              )}
            </span>
          )
        })}
      </div>
    </div>
  )
}
