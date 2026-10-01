// src/views/Trees/Trees.tsx
//
// Trees — San Francisco's street-tree inventory (spec
// docs/superpowers/specs/2026-09-30-trees-design.md; §10 supersedes).
//
// This file owns the page: the URL params (all view-owned, written with
// `replace: true` — useUrlSync never touches them; the view is dateless), the
// header and lens pills, the map (one source, four filtered layers in
// mapLayers.ts, plus the Equity lens's neighborhood choropleth on its own
// source), and the mounts for the rail, the tree card and the legend.
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
import { useBoundariesAsset } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { HATCH_IMAGE_ID, ensureHatchPattern } from '@/components/maps/DemographicUnderlay'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useDataset } from '@/hooks/useDataset'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import { useActiveCity } from '@/cities/useActiveCity'
import { useIsMobile } from '@/hooks/useIsMobile'
import { eventFlyToOffset } from '@/utils/cameraPadding'
import { useAppStore } from '@/stores/appStore'
import { apDate } from '@/utils/apDate'
import { TRUNK_CLASSES, TRUNK_LABEL } from '@/lib/trees/trunk'
import { parseSpecies, speciesLabel } from '@/lib/trees/species'
import { SUBHEAD, STUMP_LEGEND } from './treesPhrase'
import {
  LENSES, LENS_LABEL, liveEdgeRelation, parseEquityRank, parseLens, parseTreeId, resolveNeighborhood, resolveSpecies,
  type EquityRank, type Lens,
} from './treesUrl'
import { msSinceSnapshotFetch, useTreesAggregates, useTreesSnapshot } from './useTrees'
import {
  TREES_SOURCE, TREE_LAYERS, TREE_POINT_LAYER_IDS, MOSS_500, DOT_MINZOOM, lensPaint, siteFeatures,
  SELECTED_KEYLINE_LAYER, SELECTED_LAYERS, SELECTED_SOURCE, selectedFeature, selectedKeyline,
  EMPTY_FC, EQUITY_SOURCE, equityFeatures, equityLayers,
} from './mapLayers'
import { choroplethStops } from './equityView'
import TreeCard, { TREE_CARD_REM } from './TreeCard'
import { snapshotSite } from './treeCardModel'
import TreesRail from './TreesRail'
import TreesLegend from './TreesLegend'
import DataNotesPopover from './DataNotesPopover'
import type { NoteSectionId } from './dataNotes'

/** A lens's `?lens=` value: Explore is the default, so it deletes the key. */
const lensValue = (l: Lens): string | null => (l === 'explore' ? null : l)

const VIEW = 'trees' as const
const SLOW = { timeoutMs: 20_000, retries: 1 } as const
const NO_NAMES: readonly string[] = []
/** Clicks in the rail re-target the card, and reading the data notes the
 *  card's own link opened must not close it, so neither dismisses it. */
const CARD_INSIDE = ['[data-trees-rail]', '[data-trees-notes]']

/** The tree card's pixel width for the flyTo offset (its `max-w-[54vw]`
 *  cap on mobile — DetailPanelShell's mobileCompact). */
function cardPx(mobile: boolean): number {
  let rootPx = 16
  try {
    rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  } catch { /* no DOM — the default root size */ }
  const width = TREE_CARD_REM * rootPx
  return Math.min(width, mobile ? window.innerWidth * 0.54 : window.innerWidth - 2.5 * rootPx)
}

interface EdgeRow { edge?: string }

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

export default function Trees() {
  useProgressScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const city = useActiveCity()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const isMobile = useIsMobile()
  const nowYear = new Date().getFullYear()
  const tuneOn = searchParams.get('tune') === '1'

  // ── data ──
  const { data: snap, error: snapError, loading: snapLoading, retry: retrySnap } = useTreesSnapshot()
  // Did THIS mount find the snapshot already cached (a remount)? Then there
  // was no fetch to time — `?tune=1` says so instead of reporting the gap.
  const [snapCachedAtMount] = useState(() => snap !== null)
  const { data: agg, error: aggError, retry: retryAgg } = useTreesAggregates()

  // ── URL state — stale or junk values are silent no-ops (treesUrl.ts) ──
  const lens = parseLens(searchParams.get('lens'))
  // Equity: the measure re-ranks the rail AND re-paints the choropleth; `nh`
  // resolves against the aggregates' neighborhood names (null until loaded).
  const rank = parseEquityRank(searchParams.get('rank'))
  const nhNames = useMemo(() => agg?.neighborhoods.map((n) => n.name) ?? NO_NAMES, [agg])
  const nh = resolveNeighborhood(searchParams.get('nh'), nhNames)
  const treeId = parseTreeId(searchParams.get('tree'))
  // A species resolves against the RANKED names once the aggregates file is
  // in (the rail's rows), else against the snapshot's published strings.
  const rankedNames = useMemo(() => agg?.species.map((s) => s.name) ?? NO_NAMES, [agg])
  const species = resolveSpecies(searchParams.get('species'), rankedNames.length ? rankedNames : snap?.species ?? NO_NAMES)
  const speciesIdx = species !== null && snap ? snap.species.indexOf(species) : null

  /** Write view params in ONE navigation; null or '' deletes a key. */
  const setParams = useCallback((values: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === '') next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])
  const setParam = useCallback((key: string, value: string | null) => setParams({ [key]: value }), [setParams])

  /** `?lens=` is the one source of truth: the header pills and the rail's
   *  tabs both write it here. */
  const setLens = useCallback((l: Lens) => setParam('lens', lensValue(l)), [setParam])

  // ── the data-notes popover: the header button opens it at 'general', each
  // rail tab at its lens's section, the tree card at 'tree' ──
  const [notesSection, setNotesSection] = useState<NoteSectionId | null>(null)
  const openNotes = useCallback((sec: NoteSectionId) => setNotesSection(sec), [])
  const closeNotes = useCallback(() => setNotesSection(null), [])

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

  // ── the selected site: ring + flight (only for a site in the snapshot
  // with a published point; a live-only site gets the card, no ring) ──
  const selectedCenter = useMemo(() => {
    if (treeId === null) return null
    return snapshotSite(snap, treeId)?.center ?? null
  }, [snap, treeId])
  const selectedFc = useMemo(() => selectedFeature(selectedCenter), [selectedCenter])
  useMapLayer(mapInstance, SELECTED_SOURCE, selectedFc, SELECTED_LAYERS)

  // ── the equity choropleth: its own source, drawn ONLY under the Equity
  // lens (an EMPTY collection otherwise — never null, which useMapLayer
  // ignores after the first population), below the basemap labels. The
  // ~1 MB polygon file loads on the first visit to the lens (cached after).
  const { boundaries } = useBoundariesAsset(lens === 'equity' ? city.areas.geojsonPath : null)
  const equityFc = useMemo(
    () => (lens === 'equity' && agg ? equityFeatures(boundaries, agg.neighborhoods) : EMPTY_FC),
    [lens, agg, boundaries],
  )
  const equitySpecs = useMemo(
    () => equityLayers({ rows: agg?.neighborhoods ?? [], by: rank, dark: isDarkMode, selected: nh, hatchImage: HATCH_IMAGE_ID }),
    [agg, rank, isDarkMode, nh],
  )
  useMapLayer(mapInstance, EQUITY_SOURCE, equityFc, equitySpecs, { belowLabels: true })
  const equityLegend = useMemo(
    // The same call (and theme) as the fill, so the legend cannot drift.
    () => (agg ? { stops: choroplethStops(agg.neighborhoods, rank, isDarkMode), by: rank } : null),
    [agg, rank, isDarkMode],
  )

  // The flagged neighborhoods' hatch is the demographic underlay's image —
  // registered here too, and again whenever a style swap drops it (Mapbox
  // asks through 'styleimagemissing').
  useEffect(() => {
    if (!mapInstance) return
    const ensure = () => { try { ensureHatchPattern(mapInstance) } catch { /* style not ready; the miss event retries */ } }
    const onMissing = (e: { id?: string }) => { if (e.id === HATCH_IMAGE_ID) ensure() }
    ensure()
    mapInstance.on('style.load', ensure)
    mapInstance.on('styleimagemissing', onMissing)
    return () => {
      try {
        mapInstance.off('style.load', ensure)
        mapInstance.off('styleimagemissing', onMissing)
      } catch { /* map disposed */ }
    }
  }, [mapInstance])

  // `?nh=` flies the camera (SF's preset table covers all 41 names, so no
  // polygon fallback is passed — the lazily loaded boundaries would re-fire
  // the flight every time the lens changed). Selection never filters.
  useMapCameraPresets(mapInstance, { selectedNeighborhood: nh })

  // The legend's dot rows describe nothing below the dot zoom. Read the zoom
  // on `zoomend` only (never every zoom frame) and store the boolean: setting
  // the same value again does not re-render.
  const [dotsVisible, setDotsVisible] = useState(false)
  useEffect(() => {
    if (!mapInstance) return
    const read = () => { try { setDotsVisible(mapInstance.getZoom() >= DOT_MINZOOM) } catch { /* map disposed */ } }
    read()
    mapInstance.on('zoomend', read)
    return () => { try { mapInstance.off('zoomend', read) } catch { /* map disposed */ } }
  }, [mapInstance])

  // Keyline follows the theme; the ring stays above the tree layers (a
  // theme swap re-adds sources in retry order). Both writes are guarded by
  // a compare — an unconditional set on idle would repaint forever.
  useEffect(() => {
    if (!mapInstance) return
    const wanted = selectedKeyline(isDarkMode)
    const apply = () => {
      try {
        if (!mapInstance.getLayer(SELECTED_KEYLINE_LAYER)) return
        if (JSON.stringify(mapInstance.getPaintProperty(SELECTED_KEYLINE_LAYER, 'circle-stroke-color')) !== JSON.stringify(wanted)) {
          mapInstance.setPaintProperty(SELECTED_KEYLINE_LAYER, 'circle-stroke-color', wanted)
        }
        const order = (mapInstance.getStyle().layers ?? []).map((l) => l.id)
        const ringAt = order.indexOf(SELECTED_KEYLINE_LAYER)
        const highestTree = Math.max(...TREE_LAYERS.map((l) => order.indexOf(l.id)))
        if (ringAt >= 0 && ringAt < highestTree) {
          for (const l of SELECTED_LAYERS) mapInstance.moveLayer(l.id)
        }
      } catch { /* style mid-swap; the next idle re-applies */ }
    }
    apply()
    mapInstance.on('idle', apply)
    return () => { try { mapInstance.off('idle', apply) } catch { /* */ } }
  }, [mapInstance, isDarkMode])

  // Fly to the selected site — map click or deep link — offset so the point
  // lands clear of the card. Once per site.
  const flownTo = useRef<number | null>(null)
  useEffect(() => {
    if (!mapInstance || treeId === null || !selectedCenter) return
    if (flownTo.current === treeId) return
    flownTo.current = treeId
    try {
      mapInstance.flyTo({
        center: selectedCenter,
        zoom: Math.max(mapInstance.getZoom(), 16),
        duration: 900,
        offset: eventFlyToOffset(mapInstance, cardPx(isMobile)),
      })
    } catch { /* map mid-construction; the next selection flies */ }
  }, [mapInstance, treeId, selectedCenter, isMobile])
  useEffect(() => { if (treeId === null) flownTo.current = null }, [treeId])

  const closeCard = useCallback(() => setParam('tree', null), [setParam])
  const pickNeighborhood = useCallback((name: string) => setParam('nh', name), [setParam])
  const selectNeighborhood = useCallback((name: string | null) => setParam('nh', name), [setParam])
  // `perK` is the default, so it deletes the key.
  const setRank = useCallback((r: EquityRank) => setParam('rank', r === 'perK' ? null : r), [setParam])
  // The card's species-rank line opens the species in Explore (ruling R14):
  // `?species=` AND the Explore lens, in one write.
  const pickSpecies = useCallback((name: string) => setParams({ species: name, lens: lensValue('explore') }), [setParams])
  // The rail's ranking row toggles; null clears the pick.
  const toggleSpecies = useCallback((name: string | null) => setParam('species', name), [setParam])
  const pickTree = useCallback((id: number) => setParam('tree', String(id)), [setParam])
  const selectedLabel = useMemo(() => {
    if (species === null) return null
    const row = agg?.species.find((s) => s.name === species)
    return row ? (row.common ?? row.latin ?? row.name) : speciesLabel(parseSpecies(species))
  }, [agg, species])

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
            // Compared as JSON, like the filters: an expression-valued paint
            // property is a fresh array on every read, so `!==` would always
            // differ and every idle would repaint — forever.
            if (JSON.stringify(mapInstance.getPaintProperty(layer, p)) !== JSON.stringify(value)) {
              mapInstance.setPaintProperty(layer, p, value as number)
            }
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
              {LENSES.map((l) => (
                <button
                  key={l}
                  type="button"
                  role="radio"
                  aria-checked={lens === l}
                  onClick={() => setLens(l)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    lens === l
                      ? 'bg-ochre-500/15 text-ink dark:text-white'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {LENS_LABEL[l]}
                </button>
              ))}
            </div>
            <DataNotesPopover aggregates={agg} nowYear={nowYear} section={notesSection} onOpen={openNotes} onClose={closeNotes} />
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

            {/* The legend sits under the mobile sheet's peek, so it is
                desktop only; the dots' meaning is also in each tooltip. */}
            {!isMobile && (
              <TreesLegend
                lens={lens}
                speciesLabel={selectedLabel}
                dark={isDarkMode}
                equity={equityLegend}
                dotsVisible={dotsVisible}
                unmeasured={agg?.totals.unmeasuredTrunks ?? null}
              />
            )}
            {treeId !== null && (
              <TreeCard
                key={treeId}
                siteId={treeId}
                snapshot={snap}
                snapshotError={snapError?.message ?? null}
                aggregates={agg}
                nowYear={nowYear}
                onClose={closeCard}
                onRetrySnapshot={retrySnap}
                onPickNeighborhood={pickNeighborhood}
                onPickSpecies={pickSpecies}
                onOpenNotes={openNotes}
                insideSelectors={CARD_INSIDE}
              />
            )}
          </MapView>
        </div>

        <TreesRail
          lens={lens}
          onLens={setLens}
          agg={agg}
          aggError={aggError?.message ?? null}
          onRetry={retryAgg}
          species={species}
          onSpecies={toggleSpecies}
          onTree={pickTree}
          onNeighborhood={pickNeighborhood}
          rank={rank}
          onRank={setRank}
          neighborhood={nh}
          onSelectNeighborhood={selectNeighborhood}
          onOpenNotes={openNotes}
          nowYear={nowYear}
        />
      </div>
    </div>
  )
}
