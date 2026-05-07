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
        0.1, 'rgba(122, 153, 84, 0.25)',
        0.25, 'rgba(122, 153, 84, 0.45)',
        0.4, 'rgba(212, 164, 53, 0.55)',
        0.6, 'rgba(212, 113, 73, 0.65)',
        0.8, 'rgba(184, 85, 69, 0.7)',
        1, 'rgba(150, 62, 48, 0.8)',
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
        0, '#7a9954', 5, '#d4a435', 10, '#d47149', 20, '#b85545',
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
        0.1, 'rgba(122, 153, 84, 0.25)',
        0.25, 'rgba(122, 153, 84, 0.4)',
        0.4, 'rgba(212, 164, 53, 0.55)',
        0.6, 'rgba(212, 113, 73, 0.65)',
        0.8, 'rgba(184, 85, 69, 0.75)',
        1, 'rgba(111, 43, 32, 0.85)',
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
        0, '#7a9954', 10, '#d4a435', 15, '#d47149', 20, '#b85545',
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
    'circle-color': '#b85545',
    'circle-stroke-color': '#b85545',
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
    'circle-color': '#d4a435',
    'circle-stroke-color': '#d4a435',
    'circle-stroke-width': 2,
    'circle-opacity': 0.6,
    'circle-stroke-opacity': 0.8,
  },
} as mapboxgl.AnyLayer
