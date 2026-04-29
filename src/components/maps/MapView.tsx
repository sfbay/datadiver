import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SF_CENTER, SF_DEFAULT_ZOOM, SF_DEFAULT_PITCH, SF_DEFAULT_BEARING } from '@/utils/geo'
import { useAppStore } from '@/stores/appStore'

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || ''

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
