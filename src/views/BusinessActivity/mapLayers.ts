import type mapboxgl from 'mapbox-gl'

/** Business activity dual heatmap (green openings + red closures) + status-colored circles */
export const BUSINESS_HEATMAP_LAYERS = {
  openingsHeatLayers: [
    {
      id: 'business-heat-openings',
      type: 'heatmap',
      source: 'business-openings',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(122, 153, 84, 0.12)',
          0.25, 'rgba(122, 153, 84, 0.25)',
          0.5, 'rgba(122, 153, 84, 0.45)',
          0.8, 'rgba(92, 122, 61, 0.65)',
          1, 'rgba(68, 92, 43, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
  ],
  closuresHeatLayers: [
    {
      id: 'business-heat-closures',
      type: 'heatmap',
      source: 'business-closures',
      maxzoom: 15,
      paint: {
        'heatmap-weight': 1,
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.3, 13, 0.6, 15, 1],
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'],
          0, 'rgba(0,0,0,0)',
          0.1, 'rgba(184, 85, 69, 0.12)',
          0.25, 'rgba(184, 85, 69, 0.25)',
          0.5, 'rgba(184, 85, 69, 0.45)',
          0.8, 'rgba(150, 62, 48, 0.65)',
          1, 'rgba(111, 43, 32, 0.8)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8, 13, 16, 15, 25],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 15, 0.4, 16, 0.15],
      },
    } as mapboxgl.AnyLayer,
  ],
  pointsLayers: [
    {
      id: 'business-points',
      type: 'circle',
      source: 'business-all-points',
      minzoom: 13,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 16, 10],
        'circle-color': [
          'match', ['get', 'status'],
          'opened', '#7a9954',
          'closed', '#b85545',
          'active', '#7a5f42',
          '#7a5f42',
        ],
        'circle-opacity': 0.8,
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
      },
    } as mapboxgl.AnyLayer,
  ],
}

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
