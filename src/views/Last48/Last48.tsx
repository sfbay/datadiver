// src/views/Last48/Last48.tsx
//
// Top-level page for The Last 48. Owns:
//   - Layer state from URL search params (?fill=, ?points=)
//     Legacy ?mode=hotspots URLs migrate at parse time → ?fill=anomaly
//   - The useLast48Window hook (single instance per page)
//   - Layout chrome (freshness chips, dataset filter chips, layer controls, scanner strip)
//   - Last48UnifiedView — single persistent MapView with composable layers

import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLast48Window } from '@/hooks/useLast48Window'
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'
import type { CensusVariable } from '@/types/census'
import Last48UnifiedView from './modes/Last48UnifiedView'
import LayerControls, { type BaseFill } from './chrome/LayerControls'
import DatasetSuperChips from './chrome/DatasetSuperChips'
import ScannerStrip from './chrome/ScannerStrip'
import ExportButton from '@/components/export/ExportButton'
import CivicTicker from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'

// ── URL param parsers ──────────────────────────────────────────────────────

function parseFill(s: string | null, legacyMode: string | null): BaseFill {
  // Legacy ?mode=hotspots → anomaly. Otherwise read ?fill=.
  if (s === 'anomaly' || s === 'demographic' || s === 'none') return s
  if (legacyMode === 'hotspots') return 'anomaly'
  return 'none'
}

function parsePoints(s: string | null): boolean {
  // Default on; only turn off if explicitly ?points=off.
  return s !== 'off'
}

function parseDatasets(s: string | null): DatasetId[] {
  if (!s) return LAST48_DATASETS
  const parts = s.split(',').map((p) => p.trim()) as DatasetId[]
  // Filter to known IDs to defend against URL tampering. Legacy URL params
  // with retired Tier 2 ids (911-historical, parking-revenue, police-incidents)
  // are silently dropped — they're no longer in LAST48_DATASETS.
  const known = new Set<DatasetId>(LAST48_DATASETS)
  return parts.filter((p) => known.has(p))
}

// ── Component ───────────────────────────────────────────────────────────────

export default function Last48() {
  const [searchParams, setSearchParams] = useSearchParams()

  const fill    = parseFill(searchParams.get('fill'), searchParams.get('mode'))
  const pointsOn = parsePoints(searchParams.get('points'))
  const datasets = useMemo(() => parseDatasets(searchParams.get('datasets')), [searchParams])

  // Underlay variable is transient UI state — no reason to URL-persist it.
  const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>(null)

  const window48 = useLast48Window({ datasets })
  const civicIndicators = useCivicIndicators()

  const setFill = (next: BaseFill) => {
    const np = new URLSearchParams(searchParams)
    if (next === 'none') np.delete('fill')
    else np.set('fill', next)
    np.delete('mode')   // retire legacy param
    setSearchParams(np, { replace: true })
  }

  const setPointsOn = (next: boolean) => {
    const np = new URLSearchParams(searchParams)
    if (next) np.delete('points')
    else np.set('points', 'off')
    setSearchParams(np, { replace: true })
  }

  const setDatasets = (next: DatasetId[]) => {
    const np = new URLSearchParams(searchParams)
    const allDefault =
      LAST48_DATASETS.every((d) => next.includes(d)) &&
      next.length === LAST48_DATASETS.length
    if (allDefault) np.delete('datasets')
    else np.set('datasets', next.join(','))
    setSearchParams(np, { replace: true })
  }

  // Per-id toggle handler for DatasetSuperChips — adds the id if missing,
  // removes it if present. The pill is the whole click target.
  const toggleDataset = (id: DatasetId) => {
    setDatasets(
      datasets.includes(id)
        ? datasets.filter((d) => d !== id)
        : [...datasets, id]
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header — Phase 1's compact-blur chrome with the rule-leading LIVE
          eyebrow + italic display h1 + descriptive subtitle. The right
          cluster now hosts Phase 5's LayerControls (FLOW toggle + base-fill
          picker) in place of the retired ModeToggle, followed by ExportButton. */}
      <header className="flex-shrink-0 border-b border-paper-200/40 dark:border-espresso-700 px-[clamp(16px,3vw,64px)] py-3 bg-paper-50/50 dark:bg-espresso-950/50 backdrop-blur-xl z-20">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="min-w-0">
              <div className="font-mono text-[10px] tracking-widest text-paper-500 dark:text-paper-600">
                LIVE
              </div>
              {/* paper-100 (warm cream) vs sibling-standard text-white — intentional earth-tone purity */}
              <h1 className="font-display italic text-2xl text-ink dark:text-paper-100 leading-none whitespace-nowrap">
                The Last 48
              </h1>
              <p className="font-mono text-[10px] text-paper-500 dark:text-paper-600 mt-0.5">
                48 hours of civic data, updated continuously via official and public APIs
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
            <LayerControls
              pointsOn={pointsOn}
              onPointsToggle={setPointsOn}
              fill={fill}
              onFillChange={setFill}
              underlayVariable={underlayVariable}
              onUnderlayChange={setUnderlayVariable}
            />
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

      {/* Super-chip row — unified per-dataset control:
          toggle + count + per-hour rate + 48h sparkline + twin freshness dots */}
      <div className="px-[clamp(16px,3vw,64px)] py-3 border-b border-paper-200/40 dark:border-espresso-700">
        <DatasetSuperChips
          enabled={datasets}
          onToggle={toggleDataset}
          byDataset={window48.byDataset}
          freshness={window48.freshness}
          initialLoadedByDataset={window48.initialLoadedByDataset}
        />
      </div>

      {/* Unified composable view */}
      <div id="last48-capture" className="flex-1 relative">
        <Last48UnifiedView
          window48={window48}
          datasets={datasets}
          pointsOn={pointsOn}
          fill={fill}
          underlayVariable={underlayVariable}
        />
      </div>

      {/* Scanner launcher strip */}
      <ScannerStrip />
    </div>
  )
}
