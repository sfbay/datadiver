// src/views/Restaurants/Restaurants.tsx
//
// Behind the Storefront — SF restaurant inspections told as turnover and
// ownership (spec docs/superpowers/specs/2026-09-24-restaurant-inspections-design.md,
// with Jesse's §11 rulings superseding everything above them).
//
// This file owns the page: the URL params (§4.6, all view-owned and written
// with `replace: true` — useUrlSync never touches them; the view is dateless),
// the header and lens pills, the three LIVE filter cards (§4.2), the map and
// its three lenses (§4.3, layers in mapLayers.ts), and the mounts for the
// publishing strip, the storylines rail and the storefront biography.
//
// Two clocks never share the tray: the cards are LIVE (tvy3-wexg, the chosen
// window); every snapshot figure (turnover, owners, repeat closures) lives in
// the rail's ledes, stamped with the snapshot's `asOf`.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type mapboxgl from 'mapbox-gl'
import MapView from '@/components/maps/MapView'
import CardTray, { type CardDef } from '@/components/ui/CardTray'
import ExportButton from '@/components/export/ExportButton'
import { ErrorState } from '@/components/ui/ErrorState'
import { SkeletonStatCards, MapScanOverlay, MapProgressBar } from '@/components/ui/Skeleton'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useMapTooltip } from '@/hooks/useMapTooltip'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useMapCameraPresets } from '@/hooks/useMapCameraPresets'
import { useProgressScope } from '@/hooks/useLoadingProgress'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useActiveCity } from '@/cities/useActiveCity'
import { useAppStore } from '@/stores/appStore'
import { eventFlyToOffset } from '@/utils/cameraPadding'
import { apDate } from '@/utils/apDate'
import type { StorefrontSnapshot, TurnoverBucket } from '@/lib/storefronts/types'
import { useStorefronts, indexStorefronts } from './useStorefronts'
import { useRestaurantData, type CardFigures, type NeighborhoodRate } from './useRestaurantData'
import { parseFeedWindow, type FeedWindowId } from './inspectionFeed'
import { parsePlacardFilter, PLACARD_WORD, type Placard } from './placard'
import {
  THIN_FEED_BADGE, BREAK_NOTICE, CARD_NOTE, DURATION_NOTE, NEIGHBORHOOD_RATES_NOTE, TURNOVER_LEGEND,
  MAILING_CITY_NOTE, MAILING_WITHHELD_NOTE, INSPECTOR_NOTE, turnoverNote, ownersNote, sameMailingNote,
  windowRange, apCount,
} from './restaurantPhrase'
import {
  RING_SOURCE, PLACARD_SOURCE, OWNER_SOURCE, SELECTED_SOURCE,
  TURNOVER_LAYERS, CLOSURE_LAYERS, OWNER_LAYERS, SELECTED_LAYERS,
  RING_LAYER_IDS, PLACARD_POINT_LAYER_IDS, OWNER_LAYER_IDS,
  turnoverFeatures, closureFeatures, ownerFeatures, selectedFeature, themePaint,
  TEAL_700, LEGEND, storefrontPanelPx, type ClosureMapPoint,
} from './mapLayers'
import PublishingStrip from './PublishingStrip'
import StorylineRail from './StorylineRail'
import StorefrontPanel from './StorefrontPanel'

type Lens = 'turnover' | 'closures' | 'owners'
const LENSES: readonly { id: Lens; label: string }[] = [
  { id: 'turnover', label: 'Turnover' },
  { id: 'closures', label: 'Closures' },
  { id: 'owners', label: 'Owners' },
]
const parseLens = (raw: string | null): Lens => (raw === 'closures' || raw === 'owners' ? raw : 'turnover')

const BUCKETS: readonly TurnoverBucket[] = ['three-owners', 'same-owner', 'owner-returned', 'owners-unknown']
const parseBucket = (raw: string | null): TurnoverBucket | null =>
  BUCKETS.includes(raw as TurnoverBucket) ? (raw as TurnoverBucket) : null
const BUCKET_CHIP: Readonly<Record<TurnoverBucket, string>> = {
  'three-owners': 'Three or more owners',
  'same-owner': 'Same owner, new names',
  'owner-returned': 'Owner came back',
  'owners-unknown': 'Owners not on record',
}

const BRICK_600 = '#963e30'
const OCHRE_500 = '#d4a435'
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const NO_PERMITS: string[] = []
const RAIL_INSIDE = ['[data-storyline-rail]']
/** The storefront biography's width right now (px) — the fly-to offset keeps
 *  the door clear of it on EVERY viewport (the panel is a top-right card on
 *  mobile too, narrowed by `mobileCompact`). */
function panelPx(mobile: boolean): number {
  let rootPx = 16
  try {
    rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  } catch { /* no DOM — the default root size */ }
  return storefrontPanelPx(rootPx, window.innerWidth, mobile)
}

const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)

const pct = (share: number): string => `${(share * 100).toFixed(1)}%`

/** An owner / brand / shared mailing address / curated group → its storefronts.
 *  `?owner=` and `?group=` both resolve through here, so the rail can hand
 *  over whichever identity a row carries. */
function resolveOwnerSet(snap: StorefrontSnapshot, value: string | null): { label: string; keys: string[] } | null {
  if (!value) return null
  const owner = snap.owners.find((o) => o.name === value)
  if (owner) return { label: owner.name, keys: owner.storefronts }
  const brand = snap.franchises.find((f) => f.brand === value)
  if (brand) return { label: brand.brand, keys: [...new Set(brand.owners.flatMap((o) => o.storefronts))] }
  const group = snap.groups.find((g) => g.id === value)
  if (group) return { label: group.label, keys: group.storefronts }
  const shared = snap.sharedAddresses.find((a) => a.key === value)
  if (shared) return { label: shared.address, keys: shared.storefronts }
  return null
}

export default function Restaurants() {
  useProgressScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const city = useActiveCity()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const isMobile = useIsMobile()
  const nowYear = new Date().getFullYear()

  // ── URL state (§4.6) ──
  const lens = parseLens(searchParams.get('lens'))
  const windowId = parseFeedWindow(searchParams.get('window'))
  const placard = parsePlacardFilter(searchParams.get('placard'))
  const at = searchParams.get('at')
  const owner = searchParams.get('owner')
  const group = searchParams.get('group')
  const bucket = parseBucket(searchParams.get('bucket'))
  const nh = searchParams.get('nh')

  /** Write view params; a null/default value deletes its key. */
  const setParams = useCallback((patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === '') next.delete(k)
        else next.set(k, v)
      }
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setLens = useCallback((l: Lens) => setParams({ lens: l === 'turnover' ? null : l }), [setParams])
  const setWindow = useCallback((w: FeedWindowId) => setParams({ window: w === 'since' ? null : w }), [setParams])
  const setAt = useCallback((key: string | null) => setParams({ at: key }), [setParams])
  const setBucket = useCallback((b: string | null) => setParams({ bucket: parseBucket(b) }), [setParams])
  const setOwner = useCallback((o: string | null) => setParams({ owner: o }), [setParams])
  const setNh = useCallback((n: string | null) => setParams({ nh: n }), [setParams])
  /** A card filter pulls the map into the closures lens — placards are drawn
   *  only there, so a filter on another lens would change nothing visible. */
  const togglePlacard = useCallback((p: 'closure' | 'conditional') => {
    if (placard === p) setParams({ placard: null })
    else setParams({ placard: p, lens: 'closures' })
  }, [placard, setParams])

  // ── data ──
  const { data: snapshot, error: snapshotError, loading: snapshotLoading, retry: retrySnapshot } = useStorefronts()
  const index = useMemo(() => (snapshot ? indexStorefronts(snapshot) : null), [snapshot])
  const selected = (at && index?.byKey.get(at)) || null
  const data = useRestaurantData({ window: windowId, placard, nh, atPermits: selected?.permits ?? NO_PERMITS })
  const ownerSet = useMemo(() => (snapshot ? resolveOwnerSet(snapshot, owner ?? group) : null), [snapshot, owner, group])

  // ── cards (§4.2): three LIVE figures, each a filter ──
  const cityFig = data.cards.citywide
  const nhFig = data.cards.nhood
  const nhRate = nh ? data.neighborhoodRates.find((r) => r.nhood !== '' && r.nhood === nh) : undefined
  const cardDefs = useMemo<CardDef[]>(() => {
    if (!cityFig) return []
    const fig: CardFigures = nh && nhFig ? nhFig : cityFig
    const since = windowId === 'since'
    const badge = since ? { text: THIN_FEED_BADGE, color: OCHRE_500 } : undefined
    const rated = data.neighborhoodRates.filter((r) => r.closedShare !== null)
    const shareScale = (pick: (r: NeighborhoodRate) => number | null, cityCount: number) => {
      const share = nhRate ? pick(nhRate) : null
      if (!nh || share === null || rated.length < 2 || cityFig.inspected === 0) return undefined
      const shares = rated.map((r) => pick(r) as number)
      return { value: share, range: [Math.min(...shares), Math.max(...shares)] as [number, number], reference: cityCount / cityFig.inspected }
    }
    const shareLine = (count: number, cityCount: number) => {
      if (!nh || !nhFig) return undefined
      if (nhFig.inspected === 0 || !nhRate || nhRate.closedShare === null) return `${nh} · too few inspected to rate`
      return `${nh} · ${pct(count / nhFig.inspected)} · citywide ${pct(cityCount / Math.max(1, cityFig.inspected))}`
    }
    const counts = data.neighborhoodRates.filter((r) => r.nhood !== '').map((r) => r.inspected)
    return [
      {
        id: 'closed',
        label: 'Places closed',
        shortLabel: 'Closed',
        value: fig.closed.toLocaleString('en-US'),
        color: BRICK_600,
        defaultExpanded: true,
        badge,
        subtitle: shareLine(fig.closed, cityFig.closed) ?? 'closed at least once',
        positionScale: shareScale((r) => r.closedShare, cityFig.closed),
        onActivate: () => togglePlacard('closure'),
        active: placard === 'closure',
        activateHint: placard === 'closure' ? 'Show every place again' : 'Show the places closed in this window',
      },
      {
        id: 'yellow',
        label: 'Yellow placards',
        shortLabel: 'Yellow',
        value: fig.yellow.toLocaleString('en-US'),
        color: OCHRE_500,
        delay: 80,
        defaultExpanded: true,
        badge,
        subtitle: shareLine(fig.yellow, cityFig.yellow) ?? 'places given a conditional pass',
        positionScale: shareScale((r) => r.yellowShare, cityFig.yellow),
        onActivate: () => togglePlacard('conditional'),
        active: placard === 'conditional',
        activateHint: placard === 'conditional' ? 'Show every place again' : 'Show the places given a yellow placard',
      },
      {
        id: 'inspected',
        label: 'Places inspected',
        shortLabel: 'Inspected',
        value: fig.inspected.toLocaleString('en-US'),
        color: TEAL_700,
        delay: 160,
        defaultExpanded: true,
        badge,
        subtitle: nh && nhFig ? `${nh} · citywide ${cityFig.inspected.toLocaleString('en-US')}` : windowRange(data.window),
        secondary: fig.closed > 0 ? { value: `1 in ${Math.round(fig.inspected / fig.closed)}`, caption: 'closed' } : undefined,
        positionScale: nh && nhFig && counts.length > 1
          ? { value: nhFig.inspected, range: [Math.min(...counts), Math.max(...counts)] as [number, number] }
          : undefined,
        onActivate: () => setParams({ placard: null }),
        active: false,
        activateHint: 'Show every place inspected',
      },
    ]
  }, [cityFig, nhFig, nh, nhRate, windowId, placard, data.neighborhoodRates, data.window, togglePlacard, setParams])

  // ── map ──
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const handleMapReady = useCallback((map: mapboxgl.Map) => { setMapInstance(map) }, [])

  const ringsGeo = useMemo(
    () => (snapshot && lens === 'turnover' ? turnoverFeatures(snapshot.storefronts, { bucket }) : EMPTY_FC),
    [snapshot, lens, bucket],
  )
  const repeatStorefronts = useMemo(() => snapshot?.storefronts.filter((s) => s.repeatCurrent) ?? [], [snapshot])
  const placardGeo = useMemo(() => {
    if (lens !== 'closures') return EMPTY_FC
    const points: ClosureMapPoint[] = data.mapReadings.map(({ addressKey, ...r }) => ({
      ...r,
      key: index?.keyByPermit.get(r.permit) ?? (index?.byKey.has(addressKey) ? addressKey : null),
    }))
    return closureFeatures({ points, repeatStorefronts, placard })
  }, [lens, data.mapReadings, index, repeatStorefronts, placard])
  const ownerGeo = useMemo(
    () => (snapshot && lens === 'owners' ? ownerFeatures(snapshot.storefronts, new Set(ownerSet?.keys ?? [])) : EMPTY_FC),
    [snapshot, lens, ownerSet],
  )
  const selectedGeo = useMemo(() => selectedFeature(selected), [selected])
  const ownerMapped = ownerGeo.features.filter((f) => f.properties?.hit === 1).length

  // useMapLayer ignores null after first population — clear with EMPTY_FC.
  useMapLayer(mapInstance, RING_SOURCE, ringsGeo, TURNOVER_LAYERS)
  useMapLayer(mapInstance, PLACARD_SOURCE, placardGeo, CLOSURE_LAYERS)
  useMapLayer(mapInstance, OWNER_SOURCE, ownerGeo, OWNER_LAYERS)
  useMapLayer(mapInstance, SELECTED_SOURCE, selectedGeo, SELECTED_LAYERS)

  // Theme-aware keylines and rings (paper on espresso, espresso on cream).
  useEffect(() => {
    if (!mapInstance) return
    const wanted = themePaint(isDarkMode)
    const apply = () => {
      for (const { layer, prop, value } of wanted) {
        try {
          if (mapInstance.getLayer(layer) && mapInstance.getPaintProperty(layer, prop as 'circle-stroke-color') !== value) {
            mapInstance.setPaintProperty(layer, prop as 'circle-stroke-color', value)
          }
        } catch { /* style mid-swap; the next idle re-applies */ }
      }
    }
    apply()
    mapInstance.on('idle', apply)
    return () => { try { mapInstance.off('idle', apply) } catch { /* */ } }
  }, [mapInstance, isDarkMode])

  // Tooltips — one per rank layer; the ranks partition, so a hover never doubles.
  const ringTip = useCallback((p: Record<string, unknown>) => {
    const strict = Number(p.chainStrict) || 0
    const all = Number(p.chainAll) || 0
    return `
      <div class="tooltip-label">${esc(p.address)}</div>
      <div class="tooltip-value">${esc(p.now)}</div>
      ${strict >= 2 ? `<div style="margin-top:6px">${esc(p.chain)}</div>` : ''}
      ${strict >= 2 ? `<div style="margin-top:4px;opacity:0.7">${apCount(strict)} operators counted${all > strict ? ` · ${apCount(all)} names seen` : ''}</div>` : ''}
      ${Number(p.repeat) === 1 ? `<div style="margin-top:4px;color:${LEGEND.closure}">Closed more than once since 2020</div>` : ''}
    `
  }, [])
  const placardTip = useCallback((p: Record<string, unknown>) => {
    const latest = String(p.latest ?? '') as Placard | ''
    return `
      <div class="tooltip-label">${esc(p.address)}</div>
      <div class="tooltip-value">${esc(p.name)}</div>
      ${Number(p.rank) === 1 ? `<div style="margin-top:6px;color:${LEGEND.closure}">Closed more than once since 2020</div>` : ''}
      ${latest && p.lastDate ? `<div style="margin-top:4px">Latest inspection ${esc(apDate(String(p.lastDate), nowYear))}: ${esc(PLACARD_WORD[latest])}</div>` : ''}
    `
  }, [nowYear])
  const ownerTip = useCallback((p: Record<string, unknown>) => `
      <div class="tooltip-label">${esc(p.address)}</div>
      <div class="tooltip-value">${esc(p.now)}</div>
    `, [])
  useMapTooltip(mapInstance, RING_LAYER_IDS[0], ringTip)
  useMapTooltip(mapInstance, RING_LAYER_IDS[1], ringTip)
  useMapTooltip(mapInstance, RING_LAYER_IDS[2], ringTip)
  useMapTooltip(mapInstance, RING_LAYER_IDS[3], ringTip)
  useMapTooltip(mapInstance, RING_LAYER_IDS[4], ringTip)
  useMapTooltip(mapInstance, PLACARD_POINT_LAYER_IDS[0], placardTip)
  useMapTooltip(mapInstance, PLACARD_POINT_LAYER_IDS[1], placardTip)
  useMapTooltip(mapInstance, PLACARD_POINT_LAYER_IDS[2], placardTip)
  useMapTooltip(mapInstance, PLACARD_POINT_LAYER_IDS[3], placardTip)
  useMapTooltip(mapInstance, OWNER_LAYER_IDS[0], ownerTip)
  useMapTooltip(mapInstance, OWNER_LAYER_IDS[1], ownerTip)

  // Click any rank → ?at=<storefront key>. A live permit whose door is not in
  // the storefront histories has no biography, so its click does nothing.
  useEffect(() => {
    if (!mapInstance) return
    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      const key = e.features?.[0]?.properties?.key
      if (key) setAt(String(key))
    }
    const layers = [...RING_LAYER_IDS, ...PLACARD_POINT_LAYER_IDS, ...OWNER_LAYER_IDS]
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
  }, [mapInstance, setAt])

  // Fly to the selected storefront — map click, rail pick, lookup, or a
  // deep link — offset so the door lands clear of the biography panel.
  const flownTo = useRef<string | null>(null)
  useEffect(() => {
    if (!mapInstance || !selected || selected.lat == null || selected.lng == null) return
    if (flownTo.current === selected.key) return
    flownTo.current = selected.key
    try {
      mapInstance.flyTo({
        center: [selected.lng, selected.lat],
        zoom: Math.max(mapInstance.getZoom(), 16),
        duration: 900,
        offset: eventFlyToOffset(mapInstance, panelPx(isMobile)),
      })
    } catch { /* map mid-construction; the next selection flies */ }
  }, [mapInstance, selected, isMobile])
  useEffect(() => { if (!at) flownTo.current = null }, [at])

  const handleSelect = useCallback((key: string) => {
    flownTo.current = null
    setAt(key)
  }, [setAt])

  // ?nh= flight — centered in the visible well below the card tray.
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  const cameraPadding = useMemo(() => (isMobile ? { top: 90 } : { top: 200, bottom: 90 }), [isMobile])
  useMapCameraPresets(mapInstance, { selectedNeighborhood: nh, neighborhoodBoundaries, viewportPadding: cameraPadding })

  // ── header chips: every filter, each with its own off switch ──
  const chips: { key: string; label: string; clear: () => void }[] = []
  if (placard) {
    chips.push({ key: 'placard', label: placard === 'closure' ? 'Places closed' : 'Yellow placards', clear: () => setParams({ placard: null }) })
  }
  if (bucket) chips.push({ key: 'bucket', label: BUCKET_CHIP[bucket], clear: () => setParams({ bucket: null }) })
  if (ownerSet) chips.push({ key: 'owner', label: ownerSet.label, clear: () => setParams({ owner: null, group: null }) })
  if (nh) chips.push({ key: 'nh', label: nh, clear: () => setParams({ nh: null }) })

  const cardsReady = !!cityFig && (!nh || !!nhFig)
  const mapBusy = snapshotLoading || (lens === 'closures' && data.mapLoading)
  const loadError = data.error ?? snapshotError?.message ?? null
  // Retry re-requests EVERYTHING that failed — the committed snapshot too
  // (data.refetch alone re-runs only the live Socrata queries).
  const retryAll = useCallback(() => {
    if (snapshotError) retrySnapshot()
    data.refetch()
  }, [snapshotError, retrySnapshot, data])

  return (
    <div className="h-full flex flex-col">
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-20">
        <div className="flex flex-wrap items-start justify-between gap-3 desk:items-center">
          <div className="flex flex-wrap items-center gap-4 min-w-0">
            <div className="min-w-0">
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Behind the Storefront
              </h1>
              <p className="hidden sm:block text-label italic text-slate-500 dark:text-slate-400 mt-1">
                Same door, new sign.
              </p>
            </div>
            {data.edge && (
              <span className="inline-flex items-center gap-1.5 text-micro font-mono text-teal-700 dark:text-teal-400 bg-teal-500/10 px-2 py-1 rounded-full flex-shrink-0">
                Updated {apDate(data.edge, nowYear)} · {city.portal.host}
              </span>
            )}
            {chips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {chips.map((c) => (
                  <span
                    key={c.key}
                    className="inline-flex items-center gap-1 text-micro font-mono text-ink dark:text-paper-200 bg-teal-500/15 ring-1 ring-teal-500/30 pl-2 pr-0.5 py-0.5 rounded-full"
                  >
                    {c.label}
                    <button
                      type="button"
                      onClick={c.clear}
                      aria-label={`Clear filter: ${c.label}`}
                      title="Clear filter"
                      className="w-4 h-4 rounded-full leading-none hover:bg-teal-500/20 transition-colors"
                    >×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 flex-shrink-0">
            <div role="radiogroup" aria-label="Storyline" className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {LENSES.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={lens === l.id}
                  onClick={() => setLens(l.id)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    lens === l.id
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <DataNotes snapshot={snapshot} nowYear={nowYear} />
            <ExportButton targetSelector="#restaurants-capture" filename="restaurants" />
          </div>
        </div>
      </header>

      {/* What the city published — replaces the EraTrack (spec §4.1); the
          window pills live at its right end. */}
      <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
        <PublishingStrip snapshot={snapshot} windowId={windowId} onWindow={setWindow} edge={data.edge} />
      </div>

      <div id="restaurants-capture" className="flex-1 overflow-hidden flex">
        <div className="flex-1 relative">
          <MapView onMapReady={handleMapReady}>
            {mapBusy && <MapScanOverlay label={snapshotLoading ? 'Reading storefront histories' : 'Reading placards'} color={LEGEND.ring} />}
            <MapProgressBar color={LEGEND.ring} />

            {loadError && (
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-20 w-full max-w-md rounded-[14px] backdrop-blur-xl bg-white/60 dark:bg-slate-900/60">
                <ErrorState message={loadError} onRetry={retryAll} what={data.error ? 'inspections' : 'storefront histories'} />
              </div>
            )}

            {!cardsReady && data.cardsLoading && <SkeletonStatCards count={3} />}
            {cardsReady && <CardTray viewId="restaurants" cards={cardDefs} hideComparison />}

            <MapLegend lens={lens} ownerLabel={ownerSet?.label ?? null} ownerTotal={ownerSet?.keys.length ?? 0} ownerMapped={ownerMapped} truncated={data.mapTruncated} />

            {selected && snapshot && (
              <StorefrontPanel
                storefront={selected}
                lane={data.lane}
                laneLoading={data.laneLoading}
                asOf={snapshot.asOf}
                onClose={() => setAt(null)}
                onFlyTo={handleSelect}
                snapshot={snapshot}
                insideSelectors={RAIL_INSIDE}
              />
            )}
          </MapView>
        </div>

        {/* StorylineRail renders its own MapSidebar (desktop rail / mobile
            sheet); `display: contents` keeps the marker out of the flex
            layout while giving the biography panel an inside-selector, so a
            rail click that opens a new storefront doesn't first close it. */}
        <div data-storyline-rail className="contents">
          <StorylineRail
            lens={lens}
            onLens={setLens}
            snapshot={snapshot}
            neighborhoodRates={data.neighborhoodRates}
            ratesLoading={data.ratesLoading}
            closuresList={data.closuresList}
            closuresLoading={data.closuresLoading}
            snapshotError={snapshotError?.message ?? null}
            ratesError={data.ratesError}
            closuresError={data.closuresError}
            onRetry={retryAll}
            windowId={windowId}
            selectedKey={selected?.key ?? null}
            onSelect={handleSelect}
            bucket={bucket}
            onBucket={setBucket}
            owner={owner ?? group}
            onOwner={setOwner}
            nh={nh}
            onNh={setNh}
          />
        </div>
      </div>
    </div>
  )
}

// ── legend ─────────────────────────────────────────────────────────────────

function MapLegend({ lens, ownerLabel, ownerTotal, ownerMapped, truncated }: {
  lens: Lens
  ownerLabel: string | null
  ownerTotal: number
  ownerMapped: number
  truncated: boolean
}) {
  const row = (swatch: ReactNode, text: string) => (
    <div className="flex items-center gap-2">
      <span className="w-4 flex items-center justify-center flex-shrink-0">{swatch}</span>
      <span className="text-micro text-slate-600 dark:text-slate-300">{text}</span>
    </div>
  )
  const dot = (color: string, size = 8) => <span className="rounded-full" style={{ width: size, height: size, backgroundColor: color }} />
  return (
    <div className="absolute bottom-11 right-5 z-10 glass-card rounded-xl p-3 max-w-[15rem] space-y-1.5">
      {lens === 'turnover' && (
        <>
          {row(
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              {[2.5, 4.5, 6.5].map((r) => <circle key={r} cx="8" cy="8" r={r} fill="none" stroke={LEGEND.ring} strokeWidth="1" />)}
            </svg>,
            'One ring per business counted',
          )}
          {row(dot(LEGEND.repeat, 6), 'Current business closed more than once')}
          {row(dot(LEGEND.pinprick, 4), 'Other storefronts (zoom in)')}
          <p className="text-micro italic text-slate-500 dark:text-slate-400 pt-0.5">{TURNOVER_LEGEND}</p>
        </>
      )}
      {lens === 'closures' && (
        <>
          {row(dot(LEGEND.repeat, 10), 'Closed more than once since 2020')}
          {row(dot(LEGEND.closure), 'Latest inspection: closed')}
          {row(dot(LEGEND.conditional, 7), 'Latest inspection: yellow placard')}
          {row(dot(LEGEND.pass, 6), 'Latest inspection: green placard')}
          {truncated && <p className="text-micro italic text-slate-500 dark:text-slate-400 pt-0.5">Showing the first 10,000 places.</p>}
        </>
      )}
      {lens === 'owners' && (
        ownerLabel
          ? (
            <>
              {row(dot(LEGEND.owner, 9), ownerLabel)}
              <p className="text-micro text-slate-500 dark:text-slate-400">
                {apCount(ownerTotal)} {ownerTotal === 1 ? 'storefront' : 'storefronts'}
                {ownerMapped < ownerTotal ? ` · ${apCount(ownerMapped)} on the map` : ''}
              </p>
            </>
          )
          : <p className="text-micro text-slate-500 dark:text-slate-400">Pick an owner in the sidebar to see its storefronts.</p>
      )}
    </div>
  )
}

// ── data notes: the precision behind every simplified label (§11) ────────────

function DataNotes({ snapshot, nowYear }: { snapshot: StorefrontSnapshot | null; nowYear: number }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const match = snapshot?.stats?.registryMatch
  const notes: { title: string; body: string }[] = [
    { title: 'The cards', body: CARD_NOTE },
    { title: 'The July 2025 feed change', body: BREAK_NOTICE },
    { title: 'How long a closure lasted', body: DURATION_NOTE },
    { title: 'Neighborhood rates', body: NEIGHBORHOOD_RATES_NOTE },
    ...(snapshot ? [{ title: 'Turnover', body: turnoverNote(snapshot.asOf, snapshot.excludedAddresses, nowYear) }] : []),
    ...(match && match.total > 0 ? [{ title: 'Owners', body: ownersNote((match.matched / match.total) * 100) }] : []),
    { title: 'The city beside each owner', body: MAILING_CITY_NOTE },
    { title: 'What is withheld', body: MAILING_WITHHELD_NOTE },
    { title: 'Same mailing address', body: sameMailingNote() },
    { title: 'Inspectors', body: INSPECTOR_NOTE },
  ]

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-2.5 py-1.5 rounded-md text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-ink dark:hover:text-white bg-slate-100/80 dark:bg-white/[0.04] transition-colors"
      >
        Data notes
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Data notes"
          data-export-ignore
          className="absolute right-0 top-full mt-2 z-50 w-[min(26rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl bg-paper-50 dark:bg-espresso-900 ring-1 ring-slate-200/60 dark:ring-white/[0.06] shadow-xl p-4 space-y-3"
        >
          {notes.map((n) => (
            <div key={n.title}>
              <p className="text-label font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{n.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink dark:text-paper-200">{n.body}</p>
            </div>
          ))}
          <p className="text-[13px] leading-relaxed text-ink dark:text-paper-200">
            Sources and known limitations:{' '}
            <Link className="underline decoration-teal-500/50 hover:decoration-teal-500" to="/about#source-sf-tvy3-wexg">inspections</Link>
            {' · '}
            <Link className="underline decoration-teal-500/50 hover:decoration-teal-500" to="/about#source-sf-dd-storefront-histories">storefront histories</Link>
          </p>
        </div>
      )}
    </div>
  )
}
