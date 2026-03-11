import type mapboxgl from 'mapbox-gl'

/** Business activity heatmap + status-colored circle points */
export const BUSINESS_HEATMAP_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'business-heat',
    type: 'heatmap',
    source: 'business-heatmap-data',
    maxzoom: 15,
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.1, 'rgba(16, 185, 129, 0.15)',
        0.25, 'rgba(16, 185, 129, 0.3)',
        0.5, 'rgba(16, 185, 129, 0.5)',
        0.8, 'rgba(5, 150, 105, 0.7)',
        1, 'rgba(4, 120, 87, 0.85)',
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'business-points',
    type: 'circle',
    source: 'business-heatmap-data',
    minzoom: 13,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10],
      'circle-color': [
        'match', ['get', 'status'],
        'opened', '#10b981',
        'closed', '#ef4444',
        'active', '#64748b',
        '#64748b',
      ],
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.2)',
    },
  } as mapboxgl.AnyLayer,
]

/** Neighborhood anomaly choropleth (fill + outline) */
export const ANOMALY_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhood-anomaly',
    paint: {
      'fill-color': [
        'interpolate', ['linear'], ['get', 'zScore'],
        -2, '#3b82f6',
        -1, '#93c5fd',
        0, '#e2e8f0',
        1, '#fbbf24',
        2, '#ef4444',
        3, '#7f1d1d',
      ],
      'fill-opacity': 0.55,
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'neighborhood-outline',
    type: 'line',
    source: 'neighborhood-anomaly',
    paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.4 },
  } as mapboxgl.AnyLayer,
]
