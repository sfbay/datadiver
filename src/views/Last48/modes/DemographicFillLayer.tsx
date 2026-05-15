// src/views/Last48/modes/DemographicFillLayer.tsx
//
// Composable layer: Census demographic choropleth underlay.
// Wraps useDemographicUnderlay so the fill can be mounted/unmounted
// as part of the composable-layer model without any additional wiring.
// Layer order is controlled by mount order in Last48UnifiedView's JSX.

import mapboxgl from 'mapbox-gl'
import { useDemographicUnderlay } from '@/components/maps/DemographicUnderlay'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useCensusData } from '@/hooks/useCensusData'
import type { CensusVariable } from '@/types/census'

interface Props {
  map: mapboxgl.Map | null
  variable: CensusVariable | null
}

export default function DemographicFillLayer({ map, variable }: Props) {
  const { boundaries } = useNeighborhoodBoundaries()
  const { neighborhoods } = useCensusData()

  useDemographicUnderlay({
    map,
    variable,
    censusData: neighborhoods,
    boundaries,
    geoIdProperty: 'nhood',
    opacity: 0.22,
  })

  return null
}
