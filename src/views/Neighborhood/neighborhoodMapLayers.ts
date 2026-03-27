/** Mapbox layer configs for neighborhood choropleth + selection highlight */

import type mapboxgl from 'mapbox-gl'

export const NEIGHBORHOOD_CHOROPLETH_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'nh-choropleth-fill',
    type: 'fill',
    source: 'nh-boundaries',
    paint: {
      'fill-color': '#64748b', // set dynamically via buildZScoreColorExpression
      'fill-opacity': 0.3,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'nh-choropleth-outline',
    type: 'line',
    source: 'nh-boundaries',
    paint: {
      'line-color': 'rgba(255,255,255,0.12)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 14, 1.5],
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'nh-choropleth-labels',
    type: 'symbol',
    source: 'nh-boundaries',
    layout: {
      'text-field': ['get', 'nhood'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 7, 14, 11],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': 'rgba(255,255,255,0.6)',
      'text-halo-color': 'rgba(0,0,0,0.7)',
      'text-halo-width': 1.2,
    },
  } as mapboxgl.AnyLayer,
]

export const NEIGHBORHOOD_SELECTION_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'nh-selection-fill',
    type: 'fill',
    source: 'nh-boundaries',
    paint: {
      'fill-color': '#a855f7',
      'fill-opacity': 0.12,
    },
    filter: ['==', 'nhood', ''],
  } as mapboxgl.AnyLayer,
  {
    id: 'nh-selection-outline',
    type: 'line',
    source: 'nh-boundaries',
    paint: {
      'line-color': '#a855f7',
      'line-width': 2.5,
    },
    filter: ['==', 'nhood', ''],
  } as mapboxgl.AnyLayer,
]

/** Color expression: z-score → red (high) / blue (low) / slate (normal) */
export function buildZScoreColorExpression(
  profileMap: Map<string, { compositeZScore: number }>,
): mapboxgl.Expression {
  const stops: (string)[] = []
  for (const [name, profile] of profileMap) {
    const z = profile.compositeZScore
    let color: string
    if (z > 2) color = '#ef4444'
    else if (z > 1) color = '#f97316'
    else if (z > 0.5) color = '#fbbf24'
    else if (z < -2) color = '#3b82f6'
    else if (z < -1) color = '#60a5fa'
    else color = '#475569'
    stops.push(name, color)
  }
  return ['match', ['get', 'nhood'], ...stops, '#334155'] as unknown as mapboxgl.Expression
}
