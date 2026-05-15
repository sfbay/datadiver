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
import ExportButton from '@/components/export/ExportButton'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'

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
  const civicIndicators = useCivicIndicators()

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
      <header className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-700 px-[clamp(16px,3vw,64px)] py-3 bg-paper-50/50 dark:bg-espresso-950/50 backdrop-blur-xl z-20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-widest text-paper-500 dark:text-paper-600">
                <span className="text-paper-400 dark:text-paper-700">——</span> LIVE
              </div>
              {/* paper-100 (warm cream) vs sibling-standard text-white — intentional earth-tone purity */}
              <h1 className="font-display italic text-2xl text-ink dark:text-paper-100 leading-none whitespace-nowrap">
                The Last 48
              </h1>
              <p className="font-mono text-[10px] text-paper-500 dark:text-paper-600 mt-0.5">
                What's flowed in across SF in the past 48 hours
              </p>
            </div>
            {!window48.isLoading && window48.events.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-moss-500/80 bg-moss-500/10 px-2 py-1 rounded-full whitespace-nowrap">
                <span className="w-1 h-1 rounded-full bg-moss-500 pulse-live" />
                {window48.events.length.toLocaleString()} events
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ModeToggle mode={mode} onChange={setMode} />
            <ExportButton targetSelector="#last48-capture" filename="last-48" />
          </div>
        </div>
      </header>

      {/* Cross-view ticker — signals from other datasets */}
      <div className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-800 px-[clamp(16px,3vw,64px)] py-1 bg-paper-50/30 dark:bg-espresso-950/30 backdrop-blur-xl z-10">
        <CivicTicker
          items={civicIndicators.items.filter(i => i.source.view !== '/live-feeds')}
          size="compact"
        />
      </div>

      {/* Freshness honesty chip strip */}
      <div className="px-[clamp(16px,3vw,64px)] pb-2">
        <FreshnessChipStrip freshness={window48.freshness} />
      </div>

      {/* Dataset filter chips */}
      <div className="px-[clamp(16px,3vw,64px)] pb-3 border-b border-paper-200/40 dark:border-espresso-700">
        <DatasetFilterChips selected={datasets} onChange={setDatasets} />
      </div>

      {/* Mode renderer */}
      <div id="last48-capture" className="flex-1 relative">
        {mode === 'flow' && <FlowMode window48={window48} datasets={datasets} />}
        {mode === 'hotspots' && <HotspotsMode window48={window48} datasets={datasets} />}
      </div>

      {/* Scanner launcher strip */}
      <ScannerStrip />
    </div>
  )
}
