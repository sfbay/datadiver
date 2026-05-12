// src/views/Last48/Last48.tsx
//
// Top-level page for The Last 48. Owns:
//   - Mode resolution from URL search params (?mode=flow|hotspots)
//   - The useLast48Window hook (single instance per page)
//   - Layout chrome (freshness chips, dataset filter chips, mode toggle, scanner strip)
//   - Mode-specific renderer mounted in the map area

import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLast48Window } from '@/hooks/useLast48Window'
import { TIER_1_DATASETS, TIER_2_DATASETS, type DatasetId } from '@/types/last48'
import FlowMode from './modes/FlowMode'
import HotspotsMode from './modes/HotspotsMode'
import FreshnessChipStrip from './chrome/FreshnessChipStrip'
import DatasetFilterChips from './chrome/DatasetFilterChips'
import ModeToggle from './chrome/ModeToggle'
import ScannerStrip from './chrome/ScannerStrip'

type Mode = 'flow' | 'hotspots'

function parseMode(s: string | null): Mode {
  return s === 'hotspots' ? 'hotspots' : 'flow'
}

function parseDatasets(s: string | null): DatasetId[] {
  if (!s) return TIER_1_DATASETS
  const parts = s.split(',').map((p) => p.trim()) as DatasetId[]
  // Filter to known IDs to defend against URL tampering
  const known = new Set<DatasetId>([...TIER_1_DATASETS, ...TIER_2_DATASETS])
  return parts.filter((p) => known.has(p))
}

export default function Last48() {
  const [searchParams, setSearchParams] = useSearchParams()

  const mode = parseMode(searchParams.get('mode'))
  const datasets = useMemo(() => parseDatasets(searchParams.get('datasets')), [searchParams])

  const window48 = useLast48Window({ datasets })

  const setMode = (next: Mode) => {
    const np = new URLSearchParams(searchParams)
    if (next === 'flow') np.delete('mode')
    else np.set('mode', next)
    setSearchParams(np, { replace: true })
  }

  const setDatasets = (next: DatasetId[]) => {
    const np = new URLSearchParams(searchParams)
    const allTier1 = TIER_1_DATASETS.every((d) => next.includes(d)) && next.length === TIER_1_DATASETS.length
    if (allTier1) np.delete('datasets')
    else np.set('datasets', next.join(','))
    setSearchParams(np, { replace: true })
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <header className="px-[clamp(16px,3vw,64px)] pt-6 pb-3 flex items-baseline gap-6 flex-wrap z-20">
        <div className="flex-1 min-w-[200px]">
          <h1 className="font-display text-xl md:text-2xl tracking-tight">
            <span className="text-paper-500">── LIVE · </span>
            <span>The Last 48</span>
          </h1>
          <p className="font-mono text-[11px] text-paper-600 mt-1">
            What's flowed in across SF in the past 48 hours
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ModeToggle mode={mode} onChange={setMode} />
          <a
            href="?mode=kiosk"
            className="font-mono text-[11px] text-paper-500 hover:text-paper-300 underline-offset-2 hover:underline"
            title="Open in kiosk mode (coming soon)"
            onClick={(e) => { e.preventDefault(); /* Phase 4 */ }}
          >
            📺 Open in kiosk
          </a>
        </div>
      </header>

      {/* Freshness honesty chip strip */}
      <div className="px-[clamp(16px,3vw,64px)] pb-2">
        <FreshnessChipStrip freshness={window48.freshness} />
      </div>

      {/* Dataset filter chips */}
      <div className="px-[clamp(16px,3vw,64px)] pb-3 border-b border-paper-200/40 dark:border-espresso-700">
        <DatasetFilterChips selected={datasets} onChange={setDatasets} />
      </div>

      {/* Mode renderer */}
      <div className="flex-1 relative">
        {mode === 'flow' && <FlowMode window48={window48} datasets={datasets} />}
        {mode === 'hotspots' && <HotspotsMode window48={window48} datasets={datasets} />}
      </div>

      {/* Scanner launcher strip */}
      <ScannerStrip />
    </div>
  )
}
