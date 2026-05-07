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
      'line-color': 'rgba(255,255,255,0.2)',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2],
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'nh-choropleth-labels',
    type: 'symbol',
    source: 'nh-boundaries',
    layout: {
      'text-field': ['get', 'nhood'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 9, 14, 12],
      'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
      'text-anchor': 'center',
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': ['interpolate', ['linear'], ['zoom'], 10, 'rgba(255,255,255,0)', 12, 'rgba(255,255,255,0.5)', 14, 'rgba(255,255,255,0.7)'],
      'text-halo-color': 'rgba(0,0,0,0.7)',
      'text-halo-width': 1.2,
    },
  } as mapboxgl.AnyLayer,
]

export const NEIGHBORHOOD_SELECTION_LAYERS: mapboxgl.AnyLayer[] = [
  // Dim layer — darkens everything NOT selected
  {
    id: 'nh-dim-fill',
    type: 'fill',
    source: 'nh-boundaries',
    paint: {
      'fill-color': '#000000',
      'fill-opacity': 0,  // controlled dynamically: 0 when nothing selected, 0.45 otherwise
    },
    filter: ['!=', 'nhood', ''],  // dynamically set to exclude selected neighborhoods
  } as mapboxgl.AnyLayer,
  // Selection fill — subtle brightening on selected
  {
    id: 'nh-selection-fill',
    type: 'fill',
    source: 'nh-boundaries',
    paint: {
      'fill-color': '#8b6282',
      'fill-opacity': 0.08,
    },
    filter: ['==', 'nhood', ''],
  } as mapboxgl.AnyLayer,
  // Outer glow — wide soft line behind the crisp border
  {
    id: 'nh-selection-glow',
    type: 'line',
    source: 'nh-boundaries',
    paint: {
      'line-color': '#8b6282',
      'line-width': 8,
      'line-opacity': 0.2,
      'line-blur': 6,
    },
    filter: ['==', 'nhood', ''],
  } as mapboxgl.AnyLayer,
  // Crisp selection outline
  {
    id: 'nh-selection-outline',
    type: 'line',
    source: 'nh-boundaries',
    paint: {
      'line-color': '#8b6282',
      'line-width': 2,
      'line-opacity': 0.85,
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
    if (z > 2) color = '#b85545'
    else if (z > 1) color = '#d47149'
    else if (z > 0.5) color = '#e8c06b'
    else if (z < -2) color = '#3f7573'
    else if (z < -1) color = '#5c9693'
    else color = '#475569'
    stops.push(name, color)
  }
  return ['match', ['get', 'nhood'], ...stops, '#334155'] as unknown as mapboxgl.Expression
}

/** Generate fill + outline layers for a comparison slot */
export function makeSlotLayers(
  slotIndex: number,
  color: string,
): mapboxgl.AnyLayer[] {
  return [
    {
      id: `nh-compare-fill-${slotIndex}`,
      type: 'fill',
      source: 'nh-boundaries',
      paint: {
        'fill-color': color,
        'fill-opacity': 0.1,
      },
      filter: ['==', 'nhood', ''],
    } as mapboxgl.AnyLayer,
    // Soft outer glow
    {
      id: `nh-compare-glow-${slotIndex}`,
      type: 'line',
      source: 'nh-boundaries',
      paint: {
        'line-color': color,
        'line-width': 8,
        'line-opacity': 0.2,
        'line-blur': 6,
      },
      filter: ['==', 'nhood', ''],
    } as mapboxgl.AnyLayer,
    // Crisp border
    {
      id: `nh-compare-outline-${slotIndex}`,
      type: 'line',
      source: 'nh-boundaries',
      paint: {
        'line-color': color,
        'line-width': 2,
        'line-opacity': 0.85,
      },
      filter: ['==', 'nhood', ''],
    } as mapboxgl.AnyLayer,
  ]
}
