import type mapboxgl from 'mapbox-gl'

/** Response-time heatmap + circle points (color by response time) */
export const RESPONSE_HEATMAP_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'response-heat',
    type: 'heatmap',
    source: 'response-data',
    maxzoom: 15,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'responseTime'], 0, 0, 5, 0.3, 10, 0.6, 20, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.1, 'rgba(45, 212, 168, 0.25)',
        0.25, 'rgba(45, 212, 168, 0.45)',
        0.4, 'rgba(255, 190, 11, 0.55)',
        0.6, 'rgba(255, 140, 66, 0.65)',
        0.8, 'rgba(255, 77, 77, 0.7)',
        1, 'rgba(220, 38, 38, 0.8)',
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'response-points',
    type: 'circle',
    source: 'response-data',
    minzoom: 13,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
      'circle-color': [
        'interpolate', ['linear'], ['get', 'responseTime'],
        0, '#2dd4a8', 5, '#ffbe0b', 10, '#ff8c42', 20, '#ff4d4d',
      ],
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.15)',
    },
  } as mapboxgl.AnyLayer,
]

/** APOT (alarm-processing-on-time) heatmap + circle points */
export const APOT_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'apot-heat',
    type: 'heatmap',
    source: 'apot-data',
    maxzoom: 15,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'apotMinutes'], 0, 0, 10, 0.3, 20, 0.7, 40, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.1, 'rgba(16, 185, 129, 0.25)',
        0.25, 'rgba(16, 185, 129, 0.4)',
        0.4, 'rgba(245, 158, 11, 0.55)',
        0.6, 'rgba(249, 115, 22, 0.65)',
        0.8, 'rgba(239, 68, 68, 0.75)',
        1, 'rgba(185, 28, 28, 0.85)',
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'apot-points',
    type: 'circle',
    source: 'apot-data',
    minzoom: 13,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 16, 6],
      'circle-color': [
        'interpolate', ['linear'], ['get', 'apotMinutes'],
        0, '#10b981', 10, '#f59e0b', 15, '#f97316', 20, '#ef4444',
      ],
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.15)',
    },
  } as mapboxgl.AnyLayer,
]

/** Fire severity overlay — large red circles for structure fires */
export const FIRE_SEVERITY_LAYER: mapboxgl.AnyLayer = {
  id: 'fire-severity-points',
  type: 'circle',
  source: 'fire-severity',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 10],
    'circle-color': '#ef4444',
    'circle-stroke-color': '#ef4444',
    'circle-stroke-width': 2,
    'circle-opacity': 0.7,
    'circle-stroke-opacity': 0.9,
  },
} as mapboxgl.AnyLayer

/** Fire battery overlay — amber circles for multi-unit responses */
export const FIRE_BATTERY_LAYER: mapboxgl.AnyLayer = {
  id: 'fire-battery-points',
  type: 'circle',
  source: 'fire-battery',
  paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 14, 8],
    'circle-color': '#f59e0b',
    'circle-stroke-color': '#f59e0b',
    'circle-stroke-width': 2,
    'circle-opacity': 0.6,
    'circle-stroke-opacity': 0.8,
  },
} as mapboxgl.AnyLayer
