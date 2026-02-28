import { useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { SF_CENTER, SF_DEFAULT_ZOOM } from '@/utils/geo'
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
      pitch: 0,
      bearing: 0,
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
    </div>
  )
})

MapView.displayName = 'MapView'
export default MapView
