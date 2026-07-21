import { useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useAppStore } from '@/stores/appStore'
import { buildPrecinctFeatures, type BuildPrecinctOptions, type PaintBundle, type PrecinctMapMode } from './precinctJoin'

interface PrecinctFillLayerProps {
  map: mapboxgl.Map | null
  bundle: PaintBundle | null
  geometry: GeoJSON.FeatureCollection | null
  mode: PrecinctMapMode
  colorMap: Map<string, string>
  raceIsProp: boolean
  raceIsRCV: boolean
  selectedNeighborhood: string | null
  /** Clean candidate name — when set, results mode paints a continuous
   *  single-hue support ramp for this candidate instead of the leader steps. */
  focusCandidate: string | null
  /** REPLAY lens — when set, the fill is lens-driven per-round paint
   *  (preempts mode/focus inside the join). Undefined → base mode, so the
   *  map keeps painting progressively while the CVR artifact loads. */
  replay?: BuildPrecinctOptions['replay']
  /** Era-transition multiplier, 0..1 — multiplies every feature's opacity. */
  fade: number
  /** Mapbox paint transition for the fade (0 under reduced motion). */
  fadeMs: number
}

/** The precinct choropleth. Always precinct grain; goes BELOW basemap labels
 *  (house rule for dense fills); hairline outline from the underlay idiom. */
export default function PrecinctFillLayer({
  map, bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV,
  selectedNeighborhood, focusCandidate, replay, fade, fadeMs,
}: PrecinctFillLayerProps) {
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!bundle || !geometry) return null
    return buildPrecinctFeatures({
      bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood, focusCandidate, replay,
    })
  }, [bundle, geometry, mode, colorMap, raceIsProp, raceIsRCV, selectedNeighborhood, focusCandidate, replay])

  const layers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'election-precinct-fill',
      type: 'fill',
      source: 'election-precincts',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': ['*', ['get', 'fillOpacity'], fade],
        'fill-opacity-transition': { duration: fadeMs },
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'election-precinct-outline',
      type: 'line',
      source: 'election-precincts',
      paint: {
        'line-color': isDarkMode ? 'rgba(255,255,255,0.12)' : 'rgba(42,29,19,0.15)',
        'line-width': 0.5,
      },
    } as mapboxgl.AnyLayer,
  ], [fade, fadeMs, isDarkMode])

  useMapLayer(map, 'election-precincts', geojson, layers, { belowLabels: true })
  return null
}
