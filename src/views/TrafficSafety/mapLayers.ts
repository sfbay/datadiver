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
        0.1, 'rgba(150, 62, 48, 0.15)',
        0.25, 'rgba(150, 62, 48, 0.3)',
        0.4, 'rgba(184, 85, 69, 0.45)',
        0.6, 'rgba(212, 164, 53, 0.55)',
        0.8, 'rgba(150, 62, 48, 0.7)',
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
        'Fatal', '#6f2b20',
        'Injury (Severe)', '#963e30',
        'Injury (Other Visible)', '#d4a435',
        'Injury (Complaint of Pain)', '#e8c06b',
        '#7a5f42',
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
      'circle-color': '#8b6282',
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
        -2, '#3f7573',
        -1, '#8bb5b2',
        0, '#ddcba8',
        1, '#e8c06b',
        2, '#b85545',
        3, '#6f2b20',
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
      'circle-color': '#d4a435',
      'circle-opacity': 0.6,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#d4a435',
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
      'circle-color': '#963e30',
      'circle-opacity': 0.5,
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#963e30',
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
        0.2, 'rgba(122,153,84,0.15)',
        0.4, 'rgba(245,158,11,0.25)',
        0.6, 'rgba(184,85,69,0.35)',
        1, 'rgba(127,29,29,0.45)',
      ],
      'heatmap-radius': 15,
      'heatmap-opacity': 0.4,
    },
  } as mapboxgl.AnyLayer,
]

/** High Injury Network — Vision Zero street corridors (13% of streets, 75% of severe/fatal crashes) */
export const HIN_LAYERS: mapboxgl.AnyLayer[] = [
  {
    id: 'hin-lines',
    type: 'line',
    source: 'hin-data',
    paint: {
      'line-color': '#8b6282',
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 4, 17, 8],
      'line-opacity': 0.7,
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
  } as mapboxgl.AnyLayer,
]
