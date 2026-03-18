import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import mapboxgl from 'mapbox-gl'
import MapView, { type MapHandle } from '@/components/maps/MapView'
import StatCard from '@/components/ui/StatCard'
import { MapLoadingIndicator } from '@/components/ui/Skeleton'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useDistrictBoundaries } from '@/hooks/useDistrictBoundaries'
import {
  SCANNER_FEEDS,
  FEED_SOURCES,
  getFeedsGroupedByService,
  getUniqueSources,
  type ScannerFeed,
} from '@/data/scannerFeeds'
import {
  SFPD_DISTRICTS,
  SFFD_BATTALIONS,
  getFeedsForDistrict,
  getFeedsForBattalion,
  type SFPDDistrict,
  type SFFDBattalion,
} from '@/data/neighborhoodDistricts'

// ── Service icon map ──────────────────────────────────────────────────────────
const SERVICE_ICONS: Record<string, string> = {
  police: '🚔',
  fire: '🚒',
  ems: '🚑',
  mixed: '📡',
}

const SERVICE_COLORS: Record<string, string> = {
  police: '#60a5fa',
  fire: '#f97316',
  ems: '#34d399',
  mixed: '#a78bfa',
}

// ── Source label helper ───────────────────────────────────────────────────────
function sourceLabel(source: ScannerFeed['source']): string {
  return FEED_SOURCES[source].label
}

// ── FeedCard ─────────────────────────────────────────────────────────────────
function FeedCard({ feed }: { feed: ScannerFeed }) {
  const color = SERVICE_COLORS[feed.service] ?? '#94a3b8'
  const icon = SERVICE_ICONS[feed.service] ?? '📡'

  return (
    <div className="glass-card rounded-xl p-4 flex flex-col gap-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none">{icon}</span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink dark:text-slate-200 leading-tight truncate">
              {feed.name}
            </p>
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
              via {sourceLabel(feed.source)}
            </p>
          </div>
        </div>
        {/* Live pill */}
        <span
          className="flex-shrink-0 inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}18`, color }}
        >
          <span className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: color }} />
          {feed.service}
        </span>
      </div>

      {/* Description */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
        {feed.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600">
          {feed.coverage.type === 'citywide' ? 'Citywide' : 'District'}
        </span>
        <a
          href={feed.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-mono transition-colors hover:opacity-80"
          style={{ color }}
        >
          Listen ↗
        </a>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
type SidebarTab = 'service' | 'district'

export default function LiveFeeds() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)
  const mapHandleRef = useRef<MapHandle>(null)

  // ── URL state ──────────────────────────────────────────────────────────────
  const sidebarTab = (searchParams.get('tab') as SidebarTab) || 'service'
  const selectedDistrict = searchParams.get('district') as SFPDDistrict | null
  const selectedBattalion = searchParams.get('battalion') as SFFDBattalion | null

  const setSidebarTab = useCallback(
    (tab: SidebarTab) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (tab === 'service') next.delete('tab')
          else next.set('tab', tab)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setSelectedDistrict = useCallback(
    (d: SFPDDistrict | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!d) next.delete('district')
          else next.set('district', d)
          // Clear battalion when selecting district
          next.delete('battalion')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setSelectedBattalion = useCallback(
    (b: SFFDBattalion | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (!b) next.delete('battalion')
          else next.set('battalion', b)
          // Clear district when selecting battalion
          next.delete('district')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // ── Boundaries ─────────────────────────────────────────────────────────────
  const { districts: districtGeojson, isLoading: districtLoading } = useDistrictBoundaries()

  // ── Map layers ─────────────────────────────────────────────────────────────
  // Build GeoJSON with highlight property for selected district
  const districtGeojsonWithHighlight = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!districtGeojson) return null
    return {
      type: 'FeatureCollection',
      features: districtGeojson.features.map((f) => {
        const name = String(f.properties?.district ?? '')
        // Geo data uses UPPERCASE; SFPD_DISTRICTS uses title case — compare case-insensitively
        const selected = selectedDistrict
          ? name.toLowerCase() === selectedDistrict.toLowerCase()
          : false
        return {
          ...f,
          properties: { ...f.properties, selected: selected ? 1 : 0 },
        }
      }),
    }
  }, [districtGeojson, selectedDistrict])

  const districtLayers = useMemo(
    (): mapboxgl.AnyLayer[] => [
      {
        id: 'sfpd-districts-fill',
        type: 'fill',
        source: 'sfpd-districts',
        paint: {
          'fill-color': [
            'case',
            ['==', ['get', 'selected'], 1],
            '#60a5fa',
            'rgba(96, 165, 250, 0.07)',
          ],
          'fill-opacity': [
            'case',
            ['==', ['get', 'selected'], 1],
            0.3,
            0.12,
          ],
        },
      } as mapboxgl.AnyLayer,
      {
        id: 'sfpd-districts-outline',
        type: 'line',
        source: 'sfpd-districts',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'selected'], 1],
            '#60a5fa',
            'rgba(148, 163, 184, 0.35)',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'selected'], 1],
            2,
            1,
          ],
        },
      } as mapboxgl.AnyLayer,
    ],
    [],
  )

  useMapLayer(mapInstance, 'sfpd-districts', districtGeojsonWithHighlight, districtLayers)

  // ── Map click handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance) return

    const handleClick = (e: mapboxgl.MapLayerMouseEvent) => {
      if (!e.features || e.features.length === 0) return
      const raw = String(e.features[0].properties?.district ?? '')
      if (!raw) return
      // Convert UPPERCASE geo property to title case for matching SFPD_DISTRICTS
      const titleCase = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase() as SFPDDistrict
      const match = SFPD_DISTRICTS.find(
        (d) => d.toLowerCase() === titleCase.toLowerCase(),
      ) as SFPDDistrict | undefined
      if (!match) return
      setSelectedDistrict(selectedDistrict === match ? null : match)
    }

    const handleMouseEnter = () => {
      mapInstance.getCanvas().style.cursor = 'pointer'
    }
    const handleMouseLeave = () => {
      mapInstance.getCanvas().style.cursor = ''
    }

    const tryAttach = () => {
      try {
        if (mapInstance.getLayer('sfpd-districts-fill')) {
          mapInstance.on('click', 'sfpd-districts-fill', handleClick)
          mapInstance.on('mouseenter', 'sfpd-districts-fill', handleMouseEnter)
          mapInstance.on('mouseleave', 'sfpd-districts-fill', handleMouseLeave)
          return true
        }
      } catch { /* layer not ready yet */ }
      return false
    }

    if (!tryAttach()) {
      const interval = setInterval(() => {
        if (tryAttach()) clearInterval(interval)
      }, 300)
      return () => {
        clearInterval(interval)
        try {
          mapInstance.off('click', 'sfpd-districts-fill', handleClick)
          mapInstance.off('mouseenter', 'sfpd-districts-fill', handleMouseEnter)
          mapInstance.off('mouseleave', 'sfpd-districts-fill', handleMouseLeave)
        } catch { /* */ }
      }
    }

    return () => {
      try {
        mapInstance.off('click', 'sfpd-districts-fill', handleClick)
        mapInstance.off('mouseenter', 'sfpd-districts-fill', handleMouseEnter)
        mapInstance.off('mouseleave', 'sfpd-districts-fill', handleMouseLeave)
      } catch { /* */ }
    }
  }, [mapInstance, selectedDistrict, setSelectedDistrict])

  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    setMapInstance(map)
  }, [])

  // ── Derived feed data ──────────────────────────────────────────────────────
  const feedsByService = useMemo(() => getFeedsGroupedByService(), [])

  const feedsForDistrict = useMemo(
    () => (selectedDistrict ? getFeedsForDistrict(selectedDistrict) : null),
    [selectedDistrict],
  )

  const feedsForBattalion = useMemo(
    () => (selectedBattalion ? getFeedsForBattalion(selectedBattalion) : null),
    [selectedBattalion],
  )

  // Feeds to show for the active district/battalion selection
  const contextFeeds = feedsForDistrict ?? feedsForBattalion ?? null

  // ── Stat values ───────────────────────────────────────────────────────────
  const totalFeeds = SCANNER_FEEDS.length
  const totalPlatforms = useMemo(() => getUniqueSources(SCANNER_FEEDS).length, [])

  // ── Attribution sources list ───────────────────────────────────────────────
  const attributionSources = useMemo(
    () =>
      Object.entries(FEED_SOURCES).map(([, meta]) => (
        <a
          key={meta.aboutUrl}
          href={meta.aboutUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-slate-300 transition-colors"
        >
          {meta.label}
        </a>
      )),
    [],
  )

  return (
    <div className="h-full flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
              Live Scanner Feeds
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
              SFPD &middot; SFFD &middot; Community Radio Streams
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-blue-400/80 bg-blue-500/10 px-2 py-1 rounded-full">
              <span className="w-1 h-1 rounded-full bg-blue-400 pulse-live" />
              {totalFeeds} active feeds
            </span>
          </div>
        </div>
      </header>

      {/* ── Body: map + sidebar ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex">
        {/* ── Map hero ─────────────────────────────────────────────────────── */}
        <div className="flex-1 relative">
          <MapView ref={mapHandleRef} onMapReady={handleMapReady}>
            {/* Loading indicator while boundaries fetch */}
            {districtLoading && (
              <MapLoadingIndicator label="Loading districts" color="#60a5fa" />
            )}

            {/* ── Stat cards — top left ──────────────────────────────────── */}
            <div className="absolute top-5 left-5 z-10 flex gap-2.5">
              <StatCard
                label="Scanner Feeds"
                value={String(totalFeeds)}
                color="#60a5fa"
                delay={0}
              />
              <StatCard
                label="Platforms"
                value={String(totalPlatforms)}
                color="#a78bfa"
                delay={80}
              />
            </div>

            {/* Selected district badge */}
            {selectedDistrict && (
              <div className="absolute top-5 right-5 z-10 flex items-center gap-2 glass-card rounded-full px-3 py-1.5">
                <span className="text-[10px] font-mono uppercase tracking-wider text-blue-400">
                  {selectedDistrict} District
                </span>
                <button
                  onClick={() => setSelectedDistrict(null)}
                  className="text-slate-400 hover:text-white transition-colors text-[11px] leading-none"
                  aria-label="Clear district filter"
                >
                  ×
                </button>
              </div>
            )}

            {/* Map hint */}
            {!districtLoading && !selectedDistrict && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 glass-card rounded-full px-4 py-1.5 pointer-events-none">
                <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 text-center whitespace-nowrap">
                  Click a district to see its scanner feeds
                </p>
              </div>
            )}
          </MapView>
        </div>

        {/* ── Sidebar ──────────────────────────────────────────────────────── */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          {/* Tab bar */}
          <div className="flex border-b border-slate-200/50 dark:border-white/[0.04] flex-shrink-0">
            {(
              [
                ['service', 'By Service'],
                ['district', 'By District'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 py-2.5 text-[10px] font-mono uppercase tracking-[0.15em] transition-all duration-200 ${
                  sidebarTab === key
                    ? 'text-ink dark:text-white border-b-2 border-blue-500'
                    : 'text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ── BY SERVICE ─────────────────────────────────────────────── */}
            {sidebarTab === 'service' && (
              <>
                {Object.entries(feedsByService).map(([groupLabel, feeds]) => {
                  if (feeds.length === 0) return null
                  return (
                    <div key={groupLabel}>
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                          {groupLabel}
                        </p>
                        <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                      </div>
                      <div className="space-y-2">
                        {feeds.map((feed) => (
                          <FeedCard key={feed.id} feed={feed} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </>
            )}

            {/* ── BY DISTRICT ────────────────────────────────────────────── */}
            {sidebarTab === 'district' && (
              <>
                {/* Selected district feeds */}
                {(selectedDistrict || selectedBattalion) && contextFeeds && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-blue-400">
                        {selectedDistrict
                          ? `${selectedDistrict} District Feeds`
                          : `${selectedBattalion} Feeds`}
                      </p>
                      <div className="flex-1 h-[1px] bg-blue-500/20" />
                    </div>
                    <div className="space-y-2 mb-4">
                      {contextFeeds.map((feed) => (
                        <FeedCard key={feed.id} feed={feed} />
                      ))}
                    </div>
                  </div>
                )}

                {/* SFPD Districts list */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                      SFPD Districts
                    </p>
                    <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                  </div>
                  <div className="space-y-0.5">
                    {SFPD_DISTRICTS.map((district) => {
                      const isActive = selectedDistrict === district
                      const feedCount = getFeedsForDistrict(district).length
                      return (
                        <button
                          key={district}
                          onClick={() =>
                            setSelectedDistrict(isActive ? null : district)
                          }
                          className={`w-full text-left py-2 px-3 rounded-lg transition-all duration-150 flex items-center justify-between ${
                            isActive
                              ? 'bg-blue-500/10 ring-1 ring-blue-500/30 text-blue-400'
                              : 'hover:bg-white/80 dark:hover:bg-white/[0.04] text-ink dark:text-slate-200'
                          }`}
                        >
                          <span className="text-[12px] font-medium">{district}</span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600">
                            {feedCount} feed{feedCount !== 1 ? 's' : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* SFFD Battalions list */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                      SFFD Battalions
                    </p>
                    <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                  </div>
                  <div className="space-y-0.5">
                    {SFFD_BATTALIONS.map((battalion) => {
                      const isActive = selectedBattalion === battalion
                      const feedCount = getFeedsForBattalion(battalion).length
                      return (
                        <button
                          key={battalion}
                          onClick={() =>
                            setSelectedBattalion(isActive ? null : battalion)
                          }
                          className={`w-full text-left py-2 px-3 rounded-lg transition-all duration-150 flex items-center justify-between ${
                            isActive
                              ? 'bg-orange-500/10 ring-1 ring-orange-500/30 text-orange-400'
                              : 'hover:bg-white/80 dark:hover:bg-white/[0.04] text-ink dark:text-slate-200'
                          }`}
                        >
                          <span className="text-[12px] font-medium">{battalion}</span>
                          <span className="text-[10px] font-mono text-slate-400 dark:text-slate-600">
                            {feedCount} feed{feedCount !== 1 ? 's' : ''}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* ── Attribution footer — pinned outside scroll ──────────────── */}
          <div className="flex-shrink-0 border-t border-slate-200/50 dark:border-white/[0.04] px-4 py-3">
            <p className="text-[9px] font-mono text-slate-400/50 dark:text-slate-600 leading-relaxed">
              Community-operated scanner streams.{' '}
              <span className="inline-flex flex-wrap gap-x-1">
                {attributionSources.map((node, i) => (
                  <span key={i}>
                    {node}
                    {i < attributionSources.length - 1 && (
                      <span className="text-slate-600 mx-0.5">&middot;</span>
                    )}
                  </span>
                ))}
              </span>{' '}
              are independent services.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
