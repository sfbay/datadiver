// src/views/Trees/Trees.tsx
//
// Trees — San Francisco's street-tree inventory (spec
// docs/superpowers/specs/2026-09-30-trees-design.md; §10 supersedes).
//
// This file owns the page: the URL params (all view-owned, written with
// `replace: true` — useUrlSync never touches them; the view is dateless), the
// header and lens pills, the map (one source, four filtered layers in
// mapLayers.ts), and the mounts for the rail, the tree card and the legend.
//
// Two files feed it, both committed by scripts/build-trees.ts and fetched
// lazily (useTrees.ts): the small aggregates file and the ~144k-site
// snapshot. The header chip dates the page by the SNAPSHOT ("Data as of"),
// because every figure on it is the snapshot's (R12). The only live read is
// the inventory's freshness probe, which only adds a note to that chip when
// the city has published something newer.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import ExportButton from '@/components/export/ExportButton'
import { ErrorState } from '@/components/ui/ErrorState'
import { MapScanOverlay } from '@/components/ui/Skeleton'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useDataset } from '@/hooks/useDataset'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import { useActiveCity } from '@/cities/useActiveCity'
import { useAppStore } from '@/stores/appStore'
import { apDate } from '@/utils/apDate'
import { TRUNK_CLASSES, TRUNK_LABEL } from '@/lib/trees/trunk'
import { parseSpecies, speciesLabel } from '@/lib/trees/species'
import { SUBHEAD, STUMP_LEGEND } from './treesPhrase'
import { liveEdgeRelation, parseLens, resolveSpecies, type Lens } from './treesUrl'
import { msSinceSnapshotFetch, useTreesAggregates, useTreesSnapshot } from './useTrees'
import { TREES_SOURCE, TREE_LAYERS, TREE_POINT_LAYER_IDS, MOSS_500, lensPaint, siteFeatures } from './mapLayers'

const LENS_PILLS: readonly { id: Lens; label: string }[] = [
  { id: 'explore', label: 'Explore' },
  { id: 'equity', label: 'Equity' },
  { id: 'safety', label: 'Safety' },
]

const VIEW = 'trees' as const
const SLOW = { timeoutMs: 20_000, retries: 1 } as const
const NO_NAMES: readonly string[] = []

interface EdgeRow { edge?: string }

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export default function Trees() {
  useProgressScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const city = useActiveCity()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const nowYear = new Date().getFullYear()
  const tuneOn = searchParams.get('tune') === '1'

  // ── data ──
  const { data: snap, error: snapError, loading: snapLoading, retry: retrySnap } = useTreesSnapshot()
  // Did THIS mount find the snapshot already cached (a remount)? Then there
  // was no fetch to time — `?tune=1` says so instead of reporting the gap.
  const [snapCachedAtMount] = useState(() => snap !== null)
  const { data: agg, error: aggError, retry: retryAgg } = useTreesAggregates()

  // ── URL state — stale or junk values are silent no-ops (treesUrl.ts) ──
  // `tree`, `nh` and `rank` (parseTreeId / resolveNeighborhood /
  // parseEquityRank) are read where they are consumed — the tree card and the
  // rail — and written through setParam below.
  const lens = parseLens(searchParams.get('lens'))
  const species = resolveSpecies(searchParams.get('species'), snap?.species ?? NO_NAMES)
  const speciesIdx = species !== null && snap ? snap.species.indexOf(species) : null

  /** Write one view param; null or '' deletes its key. */
  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setLens = useCallback((l: Lens) => setParam('lens', l === 'explore' ? null : l), [setParam])

  // ── freshness probe: the inventory's own edge for the chip ──
  const edgeQ = useDataset<EdgeRow>(
    'streetTrees', { $select: 'max(data_as_of) AS edge', $limit: 1 }, [],
    { ...SLOW, cite: { viewId: VIEW, purpose: 'freshness' } },
  )
  const liveEdge = edgeQ.data[0]?.edge ?? null
  const dataAsOf = agg?.dataAsOf ?? snap?.dataAsOf ?? null
  const newerTitle = dataAsOf && liveEdgeRelation(dataAsOf, liveEdge) === 'later'
    ? `The city has published newer data (${apDate(liveEdge as string, nowYear)}). This page shows the snapshot.`
    : undefined

  // ── map ──
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  const built = useMemo(() => {
    if (!snap) return null
    const fc = siteFeatures(snap)
    return { fc, ms: msSinceSnapshotFetch() }
  }, [snap])
  const geo = built?.fc ?? null

  // `?tune=1`: the plan's performance gate — once per mount.
  const tuneLogged = useRef(false)
  useEffect(() => {
    if (!tuneOn || !built || tuneLogged.current) return
    tuneLogged.current = true
    const n = built.fc.features.length
    if (snapCachedAtMount || built.ms === null) console.log(`[trees] snapshot cached, ${n} features`)
    else console.log(`[trees] snapshot fetch→features: ${Math.round(built.ms)} ms, ${n} features`)
  }, [tuneOn, built, snapCachedAtMount])

  useMapLayer(mapInstance, TREES_SOURCE, geo, TREE_LAYERS)

  // Lens filters + paint + zoom floors, re-applied on idle: useMapLayer
  // re-adds the static specs after a theme swap. Every write is guarded by a
  // compare, so an idle never triggers a repaint that triggers another idle.
  useEffect(() => {
    if (!mapInstance) return
    const wanted = lensPaint(lens, speciesIdx, isDarkMode)
    const apply = () => {
      for (const [layer, filter] of Object.entries(wanted.filters)) {
        try {
          if (!mapInstance.getLayer(layer)) continue
          if (JSON.stringify(mapInstance.getFilter(layer)) !== JSON.stringify(filter)) mapInstance.setFilter(layer, filter)
        } catch { /* style mid-swap; the next idle re-applies */ }
      }
      for (const [layer, props] of Object.entries(wanted.paint)) {
        for (const [prop, value] of Object.entries(props)) {
          try {
            if (!mapInstance.getLayer(layer)) continue
            const p = prop as 'circle-opacity'
            if (mapInstance.getPaintProperty(layer, p) !== value) mapInstance.setPaintProperty(layer, p, value as number)
          } catch { /* style mid-swap; the next idle re-applies */ }
        }
      }
      for (const [layer, [min, max]] of Object.entries(wanted.zoom)) {
        try {
          const l = mapInstance.getLayer(layer) as { minzoom?: number; maxzoom?: number } | undefined
          if (!l) continue
          if ((l.minzoom ?? 0) !== min || (l.maxzoom ?? 24) !== max) mapInstance.setLayerZoomRange(layer, min, max)
        } catch { /* style mid-swap; the next idle re-applies */ }
      }
    }
    apply()
    mapInstance.on('idle', apply)
    return () => { try { mapInstance.off('idle', apply) } catch { /* */ } }
  }, [mapInstance, lens, speciesIdx, isDarkMode])

  // Hover tooltips (useMapTooltip stands down on no-hover devices itself).
  const tip = useCallback((p: Record<string, unknown>) => {
    const kind = Number(p.kind)
    const cls = TRUNK_CLASSES[Number(p.cls)]
    const name = kind === 1 ? STUMP_LEGEND : speciesLabel(parseSpecies(snap?.species[Number(p.sp)] ?? null))
    return `
      <div class="tooltip-label">${esc(name)}</div>
      ${kind === 0 && cls ? `<div class="tooltip-value">Trunk size as recorded: ${esc(TRUNK_LABEL[cls])}</div>` : ''}
    `
  }, [snap])
  useMapTooltip(mapInstance, TREE_POINT_LAYER_IDS[0], tip)
  useMapTooltip(mapInstance, TREE_POINT_LAYER_IDS[1], tip)
  useMapTooltip(mapInstance, TREE_POINT_LAYER_IDS[2], tip)

  // Click any drawn site → ?tree=<site id>.
  useEffect(() => {
    if (!mapInstance) return
    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id
      if (id != null) setParam('tree', String(id))
    }
    const layers = TREE_POINT_LAYER_IDS
    const attached = new Set<string>()
    const tryAttach = () => {
      for (const layer of layers) {
        if (attached.has(layer)) continue
        try {
          if (mapInstance.getLayer(layer)) {
            mapInstance.on('click', layer, handleClick)
            attached.add(layer)
          }
        } catch { /* style not ready */ }
      }
      return attached.size === layers.length
    }
    const interval = tryAttach() ? null : setInterval(() => { if (tryAttach() && interval) clearInterval(interval) }, 500)
    return () => {
      if (interval) clearInterval(interval)
      attached.forEach((l) => { try { mapInstance.off('click', l, handleClick) } catch { /* */ } })
    }
  }, [mapInstance, setParam])

  const loadError = snapError ?? aggError
  const retryAll = useCallback(() => {
    if (snapError) retrySnap()
    if (aggError) retryAgg()
  }, [snapError, aggError, retrySnap, retryAgg])

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-20">
        <div className="flex flex-wrap items-start justify-between gap-3 desk:items-center">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Street trees
              </h1>
              <p className="hidden sm:block text-label italic text-slate-500 dark:text-slate-400 mt-1">
                {SUBHEAD}
              </p>
            </div>
            {dataAsOf && (
              <span
                title={newerTitle}
                className="inline-flex items-center gap-1.5 text-micro font-mono text-moss-700 dark:text-moss-400 bg-moss-500/10 px-2 py-1 rounded-full flex-shrink-0"
              >
                Data as of {apDate(dataAsOf, nowYear)} · {city.portal.host}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            <div role="radiogroup" aria-label="Lens" className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {LENS_PILLS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={lens === l.id}
                  onClick={() => setLens(l.id)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    lens === l.id
                      ? 'bg-ochre-500/15 text-ink dark:text-white'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <ExportButton targetSelector="#trees-capture" filename="trees" />
          </div>
        </div>
      </header>

      <div id="trees-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView onMapReady={handleMapReady}>
            {snapLoading && <MapScanOverlay label="Reading the street-tree inventory" color={MOSS_500} />}

            {loadError && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md rounded-[14px] backdrop-blur-xl bg-white/60 dark:bg-slate-900/60">
                <ErrorState message={loadError.message} onRetry={retryAll} what={snapError ? 'the street-tree inventory' : 'the street-tree summaries'} />
              </div>
            )}

            {/* Legend mount (later task). */}
            {/* Tree card mount (later task): DetailPanelShell keyed on treeId. */}
          </MapView>
        </div>

        {/* Rail mount (later task): MapSidebar with the three lens tabs, fed
            by the aggregates file — never waits for the snapshot. */}
      </div>
    </div>
  )
}
