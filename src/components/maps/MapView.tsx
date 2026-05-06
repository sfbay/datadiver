import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SF_CENTER, SF_DEFAULT_ZOOM, SF_DEFAULT_PITCH, SF_DEFAULT_BEARING } from '@/utils/geo'
import { useAppStore } from '@/stores/appStore'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

/** SF terrain — vertical exaggeration applied to Mapbox DEM tiles.
 *  1.0 is realistic (subtle at city zoom); 2.0 makes the SF hills
 *  (Twin Peaks, Sutro, Russian, Bernal, etc.) unambiguously visible
 *  without making the data look fake. Adjust here for the whole site. */
const TERRAIN_EXAGGERATION = 2.0

/** Apply the terrain DEM source + setTerrain + warm fog on a map.
 *  Called both on initial style load and after each setStyle (theme
 *  switch), since setStyle wipes terrain state. */
function applyTerrainAndFog(map: mapboxgl.Map, dark: boolean) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    })
  }
  map.setTerrain({ source: 'mapbox-dem', exaggeration: TERRAIN_EXAGGERATION })

  // Hillshade layer — draws light/shadow on terrain slopes so the SF
  // hills read as topography rather than soft gradient. Mapbox's
  // dark-v11 / light-v11 styles don't ship with hillshade enabled, so
  // we add it explicitly. Inserted beneath the first symbol layer so
  // street + neighborhood labels render on top.
  if (!map.getLayer('dd-hillshade')) {
    const layers = map.getStyle().layers || []
    const firstSymbol = layers.find((l) => l.type === 'symbol')
    map.addLayer(
      {
        id: 'dd-hillshade',
        type: 'hillshade',
        source: 'mapbox-dem',
        paint: {
          // Palette-matched: espresso shadows + paper highlights for
          // dark mode; ink shadows + cream highlights for light.
          'hillshade-shadow-color': dark ? '#140c08' : '#7a5f42',
          'hillshade-highlight-color': dark ? '#5e4831' : '#fbf6ea',
          'hillshade-accent-color': dark ? '#3a2a1e' : '#ddcba8',
          'hillshade-illumination-direction': 335,
          'hillshade-exaggeration': 0.6,
        },
      },
      firstSymbol?.id,
    )
  }

  // Atmospheric fog tuned to the earth-tone palette — fades distant
  // terrain into espresso (dark) or cream (light), giving the foreground
  // data more visual punch via depth contrast.
  map.setFog({
    'horizon-blend': 0.05,
    'color': dark ? '#1e140d' : '#f5ecd9',         // bg ground tone
    'high-color': dark ? '#2a1d13' : '#ecdfc5',    // mid sky
    'space-color': dark ? '#140c08' : '#fbf6ea',   // outer
    'star-intensity': 0,                            // no nighttime stars
  })
}

export interface MapHandle {
  getMap: () => mapboxgl.Map | null
}

interface MapViewProps {
  onMapReady?: (map: mapboxgl.Map) => void
  children?: React.ReactNode
  className?: string
}

const MapView = forwardRef<MapHandle, MapViewProps>(({ onMapReady, children, className = '' }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [isReady, setIsReady] = useState(false)
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen)
  const onMapReadyRef = useRef(onMapReady)
  onMapReadyRef.current = onMapReady

  useImperativeHandle(ref, () => ({
    getMap: () => mapRef.current,
  }))

  useEffect(() => {
    if (!containerRef.current) return

    // Clean up any existing map (handles StrictMode double-mount)
    if (mapRef.current) {
      mapRef.current.remove()
      mapRef.current = null
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: isDarkMode
        ? 'mapbox://styles/mapbox/dark-v11'
        : 'mapbox://styles/mapbox/light-v11',
      center: [SF_CENTER.lng, SF_CENTER.lat],
      zoom: SF_DEFAULT_ZOOM,
      pitch: SF_DEFAULT_PITCH,
      bearing: SF_DEFAULT_BEARING,
      antialias: true,
      preserveDrawingBuffer: true,
      attributionControl: false,
    })

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    // Apply terrain + fog every time the style loads. style.load fires once
    // on initial style load AND each time setStyle() is called (theme
    // switch), so a single binding covers both. We read the live dark-mode
    // state from the store at fire time so the fog tint matches the
    // current theme even mid-session.
    const handleStyleLoad = () => {
      applyTerrainAndFog(map, useAppStore.getState().isDarkMode)
    }
    map.on('style.load', handleStyleLoad)
    if (map.isStyleLoaded()) handleStyleLoad()

    mapRef.current = map

    // Notify parent immediately — useMapLayer handles retry if style isn't ready
    setIsReady(true)
    onMapReadyRef.current?.(map)

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update style on theme change
  useEffect(() => {
    if (!mapRef.current || !isReady) return
    const style = isDarkMode
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11'
    mapRef.current.setStyle(style)
  }, [isDarkMode, isReady])

  // Resize map when sidebar toggles — wait for CSS transition to finish
  useEffect(() => {
    if (!mapRef.current || !isReady) return
    const timer = setTimeout(() => mapRef.current?.resize(), 520)
    return () => clearTimeout(timer)
  }, [isSidebarOpen, isReady])

  // Debug camera readout — gated by `?debug=map` URL param. When enabled,
  // shows live pitch/bearing/zoom/center as the user pans/rotates/tilts the
  // map. Useful for tuning SF_DEFAULT_PITCH / SF_DEFAULT_BEARING values
  // visually rather than by guesswork. Hidden in normal use.
  const [debugCam, setDebugCam] = useState<null | {
    pitch: number; bearing: number; zoom: number; center: [number, number]
  }>(null)
  const debugEnabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debug') === 'map'

  useEffect(() => {
    if (!isReady || !debugEnabled || !mapRef.current) return
    const m = mapRef.current
    const update = () => setDebugCam({
      pitch: m.getPitch(),
      bearing: m.getBearing(),
      zoom: m.getZoom(),
      center: [m.getCenter().lng, m.getCenter().lat],
    })
    update()
    m.on('move', update)
    return () => { try { m.off('move', update) } catch { /* */ } }
  }, [isReady, debugEnabled])

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div ref={containerRef} className="w-full h-full" />
      {/* Overlay gradient at top for stat cards readability */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-slate-950/60 via-slate-950/20 to-transparent pointer-events-none z-[1]" />
      {/* Overlay gradient at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-slate-950/40 to-transparent pointer-events-none z-[1]" />
      {/* Children (stat overlays, etc.) */}
      <div className="absolute inset-0 z-[2] pointer-events-none">
        <div className="pointer-events-auto">
          {children}
        </div>
      </div>
      {/* Debug camera readout — opt-in via ?debug=map */}
      {debugCam && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[5] px-3 py-2 rounded-lg
          bg-slate-900/85 backdrop-blur-sm border border-emerald-500/30
          text-[10px] font-mono text-emerald-300 leading-relaxed
          shadow-lg shadow-black/40 pointer-events-none">
          <div className="text-[8px] uppercase tracking-[0.2em] text-emerald-500/70 mb-1">
            map camera (debug)
          </div>
          <div className="grid grid-cols-[80px_1fr] gap-x-2">
            <span className="text-slate-400">pitch</span>
            <span>{debugCam.pitch.toFixed(2)}°</span>
            <span className="text-slate-400">bearing</span>
            <span>{debugCam.bearing.toFixed(2)}°</span>
            <span className="text-slate-400">zoom</span>
            <span>{debugCam.zoom.toFixed(2)}</span>
            <span className="text-slate-400">center</span>
            <span>[{debugCam.center[0].toFixed(4)}, {debugCam.center[1].toFixed(4)}]</span>
          </div>
          <div className="mt-2 pt-2 border-t border-emerald-500/15 text-[9px] text-emerald-200/70">
            paste-ready:<br />
            <span className="text-amber-300">SF_DEFAULT_PITCH = {Math.round(debugCam.pitch * 10) / 10}</span><br />
            <span className="text-amber-300">SF_DEFAULT_BEARING = {Math.round(debugCam.bearing * 10) / 10}</span><br />
            <span className="text-amber-300">SF_DEFAULT_ZOOM = {Math.round(debugCam.zoom * 100) / 100}</span><br />
            <span className="text-amber-300">{`SF_CENTER = { lat: ${debugCam.center[1].toFixed(4)}, lng: ${debugCam.center[0].toFixed(4)} }`}</span>
          </div>
        </div>
      )}
    </div>
  )
})

MapView.displayName = 'MapView'
export default MapView
