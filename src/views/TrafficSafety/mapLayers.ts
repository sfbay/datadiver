import type mapboxgl from 'mapbox-gl'

/** Crash heatmap + circle points + DUI overlay */
export const CRASH_HEATMAP_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'crash-heat',
    type: 'heatmap',
    source: 'crash-heatmap-data',
    maxzoom: 15,
    paint: {
      'heatmap-weight': 1,
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.1, 'rgba(220, 38, 38, 0.15)',
        0.25, 'rgba(220, 38, 38, 0.3)',
        0.4, 'rgba(239, 68, 68, 0.45)',
        0.6, 'rgba(245, 158, 11, 0.55)',
        0.8, 'rgba(220, 38, 38, 0.7)',
        1, 'rgba(127, 29, 29, 0.85)',
      ],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'crash-points',
    type: 'circle',
    source: 'crash-heatmap-data',
    minzoom: 13,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10],
      'circle-color': [
        'match', ['get', 'severity'],
        'Fatal', '#7f1d1d',
        'Injury (Severe)', '#dc2626',
        'Injury (Other Visible)', '#f59e0b',
        'Injury (Complaint of Pain)', '#fbbf24',
        '#64748b',
      ],
      'circle-opacity': 0.8,
      'circle-stroke-width': 1,
      'circle-stroke-color': 'rgba(255,255,255,0.2)',
    },
  } as mapboxgl.AnyLayer,
  {
    id: 'crash-dui-points',
    type: 'circle',
    source: 'crash-heatmap-data',
    filter: ['==', ['get', 'isDui'], 1],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 4, 13, 6, 16, 12],
      'circle-color': '#a855f7',
      'circle-opacity': 0.85,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': 'rgba(168, 85, 247, 0.4)',
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

/** Speed camera circles — radius scaled by citation count */
export const SPEED_CAM_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'speed-cam-circles',
    type: 'circle',
    source: 'speed-cam-data',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'citations'], 0, 5, 1000, 18],
      'circle-color': '#f59e0b',
      'circle-opacity': 0.6,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#f59e0b',
    },
  } as mapboxgl.AnyLayer,
]

/** Red light camera circles — radius scaled by violation count */
export const RED_LIGHT_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'redlight-circles',
    type: 'circle',
    source: 'redlight-data',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 0, 5, 500, 16],
      'circle-color': '#dc2626',
      'circle-opacity': 0.5,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#dc2626',
    },
  } as mapboxgl.AnyLayer,
]

/** Pavement condition index heatmap — inverse weight (low PCI = hot) */
export const PCI_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'pci-heat',
    type: 'heatmap',
    source: 'pci-data',
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'pci'], 0, 1, 100, 0],
      'heatmap-intensity': 0.6,
      'heatmap-color': [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.2, 'rgba(16,185,129,0.15)',
        0.4, 'rgba(245,158,11,0.25)',
        0.6, 'rgba(239,68,68,0.35)',
        1, 'rgba(127,29,29,0.45)',
      ],
      'heatmap-radius': 15,
      'heatmap-opacity': 0.4,
    },
  } as mapboxgl.AnyLayer,
]
