import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SF_CENTER, SF_DEFAULT_ZOOM, SF_DEFAULT_PITCH, SF_DEFAULT_BEARING } from '@/utils/geo'
import { useAppStore } from '@/stores/appStore'
import MapLabelTuner from './MapLabelTuner'
import { classifyLabelLayer, type LabelGroup } from './labelGroups'

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

/** Baked basemap label paint, per group × theme — dialed in visually via the
 *  ?labeltune=1 panel (MapLabelTuner). Replaces the stock dark-v11 / light-v11
 *  label styling, which (a) ships a hard, zero-blur halo that muddies glyphs
 *  over dense choropleths and (b) in light-v11 colors neighborhood labels
 *  lighter than street labels, making them read inconsistently.
 *
 *  Light mode: warm all label text to espresso `#2a1d13` @ 0.7 (fixes the
 *  neighborhood-vs-street mismatch) with thin crisp halos, keeping the stock
 *  (light) halo color. Dark mode: warm text to cream and halo to espresso off
 *  the stock white/black, @ 0.6, with a softer street halo. `haloColor`
 *  omitted → leave the stock (theme) halo color untouched. */
interface LabelStyle {
  haloWidth: number
  haloBlur: number
  textOpacity: number
  textColor: string
  haloColor?: string
}
const LABEL_STYLES: Record<'light' | 'dark', Record<LabelGroup, LabelStyle>> = {
  light: {
    place: { haloWidth: 0.8, haloBlur: 0.3, textOpacity: 0.7, textColor: '#2a1d13' },
    road:  { haloWidth: 1,   haloBlur: 0.4, textOpacity: 0.7, textColor: '#2a1d13' },
    other: { haloWidth: 1,   haloBlur: 2,   textOpacity: 0.7, textColor: '#2a1d13' },
  },
  dark: {
    place: { haloWidth: 1, haloBlur: 2,   textOpacity: 0.6, textColor: '#f5ecd9', haloColor: '#2a1d13' },
    road:  { haloWidth: 1, haloBlur: 3.4, textOpacity: 0.6, textColor: '#f5ecd9', haloColor: '#2a1d13' },
    other: { haloWidth: 1, haloBlur: 2,   textOpacity: 0.6, textColor: '#f5ecd9', haloColor: '#2a1d13' },
  },
}

/** Apply the baked label styling for the current theme. Re-applied on every
 *  style.load (a theme switch resets the stock label paint). */
function softenBasemapLabels(map: mapboxgl.Map, dark: boolean) {
  const styles = LABEL_STYLES[dark ? 'dark' : 'light']
  const layers = map.getStyle().layers || []
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    const layout = (layer as mapboxgl.SymbolLayer).layout
    if (!layout || layout['text-field'] === undefined) continue
    const s = styles[classifyLabelLayer(layer.id)]
    try {
      map.setPaintProperty(layer.id, 'text-halo-width', s.haloWidth)
      map.setPaintProperty(layer.id, 'text-halo-blur', s.haloBlur)
      map.setPaintProperty(layer.id, 'text-opacity', s.textOpacity)
      map.setPaintProperty(layer.id, 'text-color', s.textColor)
      if (s.haloColor) map.setPaintProperty(layer.id, 'text-halo-color', s.haloColor)
    } catch (_err) {
      // Some composite basemap layers reject paint edits — skip them.
    }
  }
}

export interface MapHandle {
  getMap: () => mapboxgl.Map | null
}

/** Optional per-view camera override. Any omitted field falls back to the
 *  global SF_DEFAULT_* / SF_CENTER, so views that don't pass `camera` render
 *  exactly as before. Read once at map construction — not reactive. */
export interface MapCamera {
  center?: { lat: number; lng: number }
  zoom?: number
  pitch?: number
  bearing?: number
}

interface MapViewProps {
  onMapReady?: (map: mapboxgl.Map) => void
  children?: React.ReactNode
  className?: string
  camera?: MapCamera
}

const MapView = forwardRef<MapHandle, MapViewProps>(({ onMapReady, children, className = '', camera }, ref) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const [isReady, setIsReady] = useState(false)
  const isDarkMode = useAppStore((s) => s.isDarkMode)
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
      // Per-field fallback to the global defaults — a view passing a partial
      // `camera` overrides only what it specifies. Captured at mount (the
      // camera is initial-only; users can pan/tilt freely afterward).
      center: camera?.center
        ? [camera.center.lng, camera.center.lat]
        : [SF_CENTER.lng, SF_CENTER.lat],
      zoom: camera?.zoom ?? SF_DEFAULT_ZOOM,
      pitch: camera?.pitch ?? SF_DEFAULT_PITCH,
      bearing: camera?.bearing ?? SF_DEFAULT_BEARING,
      antialias: true,
      preserveDrawingBuffer: true,
      attributionControl: false,
    })

    // Zoom on the LEFT (bottom-right is occupied by the underlay/anomaly legend,
    // which was hiding it); stacks above the compact attribution.
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left')

    // Apply terrain + fog every time the style loads. style.load fires once
    // on initial style load AND each time setStyle() is called (theme
    // switch), so a single binding covers both. We read the live dark-mode
    // state from the store at fire time so the fog tint matches the
    // current theme even mid-session.
    const handleStyleLoad = () => {
      applyTerrainAndFog(map, useAppStore.getState().isDarkMode)
      softenBasemapLabels(map, useAppStore.getState().isDarkMode)
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

  // Update style on theme change. CRITICAL: skip the no-op first run
  // when isReady transitions false → true with the same isDarkMode that
  // the constructor already used. setStyle is destructive — calling it
  // with the same URL still wipes terrain / fog / hillshade and triggers
  // a re-application race that briefly clears the elevation render.
  const lastStyleRef = useRef<'dark' | 'light' | null>(null)
  useEffect(() => {
    if (!mapRef.current || !isReady) return
    const target: 'dark' | 'light' = isDarkMode ? 'dark' : 'light'
    if (lastStyleRef.current === null) {
      // First time we see the map ready — record the style that was
      // baked into the constructor and skip the redundant setStyle.
      lastStyleRef.current = target
      return
    }
    if (lastStyleRef.current === target) return
    lastStyleRef.current = target
    const style = isDarkMode
      ? 'mapbox://styles/mapbox/dark-v11'
      : 'mapbox://styles/mapbox/light-v11'
    mapRef.current.setStyle(style)
  }, [isDarkMode, isReady])

  // Auto-resize map on any container geometry change — sidebar toggles
  // (left or right), window resize, layout shifts, theme transitions that
  // alter chrome height. Mapbox caches canvas dimensions at init and only
  // repaints to new dimensions when map.resize() is called explicitly, so
  // a CSS-driven width change leaves the canvas stretched to the old size
  // until we tell it otherwise. ResizeObserver fires per frame during a CSS
  // transition; we throttle to one call per RAF tick so we don't spam
  // resize during a 300ms animation.
  useEffect(() => {
    if (!mapRef.current || !isReady || !containerRef.current) return
    let rafId: number | null = null
    const onResize = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        mapRef.current?.resize()
        rafId = null
      })
    }
    const observer = new ResizeObserver(onResize)
    observer.observe(containerRef.current)
    return () => {
      observer.disconnect()
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [isReady])

  // Debug camera readout — gated by `?debug=map` URL param. When enabled,
  // shows live pitch/bearing/zoom/center as the user pans/rotates/tilts the
  // map. Useful for tuning SF_DEFAULT_PITCH / SF_DEFAULT_BEARING values
  // visually rather than by guesswork. Hidden in normal use.
  const [debugCam, setDebugCam] = useState<null | {
    pitch: number; bearing: number; zoom: number; center: [number, number]
  }>(null)
  const debugEnabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('debug') === 'map'
  // Dev-only basemap label tuner — opt-in via ?labeltune=1 (see MapLabelTuner).
  const labelTunerEnabled = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('labeltune')

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
      {/* Overlay gradient at top for stat cards readability. Matches the page
          register per theme — cream melting into the light basemap, espresso
          into dark-v11 — so the map's edge dissolves into the chrome instead
          of banding against it. */}
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-paper-100/70 via-paper-100/25 to-transparent dark:from-espresso-1000/60 dark:via-espresso-1000/20 pointer-events-none z-[1]" />
      {/* Overlay gradient at bottom */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-paper-100/50 to-transparent dark:from-espresso-1000/40 pointer-events-none z-[1]" />
      {/* Children (stat overlays, etc.) */}
      <div className="absolute inset-0 z-[2] pointer-events-none">
        <div className="pointer-events-auto">
          {children}
        </div>
      </div>
      {/* Debug camera readout — opt-in via ?debug=map */}
      {debugCam && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[5] px-3 py-2 rounded-lg
          bg-slate-900/85 backdrop-blur-sm border border-moss-500/30
          text-[10px] font-mono text-moss-400 leading-relaxed
          shadow-lg shadow-black/40 pointer-events-none">
          <div className="text-[8px] uppercase tracking-[0.2em] text-moss-500/70 mb-1">
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
          <div className="mt-2 pt-2 border-t border-moss-500/15 text-[9px] text-moss-400/70">
            paste-ready:<br />
            <span className="text-ochre-400">SF_DEFAULT_PITCH = {Math.round(debugCam.pitch * 10) / 10}</span><br />
            <span className="text-ochre-400">SF_DEFAULT_BEARING = {Math.round(debugCam.bearing * 10) / 10}</span><br />
            <span className="text-ochre-400">SF_DEFAULT_ZOOM = {Math.round(debugCam.zoom * 100) / 100}</span><br />
            <span className="text-ochre-400">{`SF_CENTER = { lat: ${debugCam.center[1].toFixed(4)}, lng: ${debugCam.center[0].toFixed(4)} }`}</span>
          </div>
        </div>
      )}
      {isReady && labelTunerEnabled && mapRef.current && (
        <MapLabelTuner map={mapRef.current} />
      )}
    </div>
  )
})

MapView.displayName = 'MapView'
export default MapView
