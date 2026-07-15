import { useMemo } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { ACCENT } from '@/utils/electionColors'
import { nhoodKey } from '@/utils/electionData'

interface NeighborhoodFrameLayerProps {
  map: mapboxgl.Map | null
  /** 41-feature modern FC or 26-feature legacy FC — era decided by the caller. */
  boundaries: GeoJSON.FeatureCollection | null
  selectedNeighborhood: string | null
}

/** Boundary lines only — NOT belowLabels (they sit above the fill), and not
 *  a click target: neighborhood selection happens via the sidebar and the
 *  precinct panel's parent-neighborhood link, so the finer precinct target
 *  always wins map clicks (spec: "precinct wins"). */
export default function NeighborhoodFrameLayer({
  map, boundaries, selectedNeighborhood,
}: NeighborhoodFrameLayerProps) {
  const geojson = useMemo((): GeoJSON.FeatureCollection | null => {
    if (!boundaries) return null
    const selectedKey = selectedNeighborhood ? nhoodKey(selectedNeighborhood) : null
    return {
      type: 'FeatureCollection',
      features: boundaries.features.map((f) => ({
        ...f,
        properties: {
          ...f.properties,
          selected: selectedKey !== null && nhoodKey(String(f.properties?.nhood ?? '')) === selectedKey,
        },
      })),
    }
  }, [boundaries, selectedNeighborhood])

  const layers = useMemo((): mapboxgl.AnyLayer[] => [
    {
      id: 'election-nhood-frame',
      type: 'line',
      source: 'election-nhood-frame',
      paint: {
        'line-color': ACCENT,
        'line-width': ['case', ['boolean', ['get', 'selected'], false], 2, 1],
        'line-opacity': ['case', ['boolean', ['get', 'selected'], false], 0.9, 0.35],
      },
    } as mapboxgl.AnyLayer,
  ], [])

  useMapLayer(map, 'election-nhood-frame', geojson, layers)
  return null
}
