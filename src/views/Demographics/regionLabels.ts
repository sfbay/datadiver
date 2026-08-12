// src/views/Demographics/regionLabels.ts
// The region-name symbol layer for a TWO-GEOGRAPHY city's demographic map.
//
// Why this layer exists at all. On San Francisco the choropleth is
// self-labelling by coincidence: the polygons it paints ARE the Analysis
// Neighborhoods, and Mapbox's own place labels name those same places. Oakland
// paints 10 planning regions that exist in no city document, while the basemap
// keeps captioning the same pixels at neighborhood scale — so a reader at the
// default frame sees a dark fill over the east side reading "Elmhurst" and
// concludes Elmhurst has the lowest median income, when the measured unit is
// Deep East Oakland, sixteen tracts wide. The region's real name was reachable
// only on hover, in the ranking list, and in the selection card.
//
// DEFERRED TO 5b (plan Task 11): labels for Oakland's 131 official
// neighborhoods. Those are the names a reader arrives with, and they are
// already searchable — typing "Rockridge" selects North Oakland — but drawing
// all 131 is a separate placement problem (they are finer than a census tract
// and would need their own collision + zoom-band treatment). This module ships
// the plan's stated MINIMUM: region names as map labels, neighborhood names as
// search.

import type mapboxgl from 'mapbox-gl'
import type { CityConfig } from '@/cities/types'
import { censusUnitLabel } from '@/cities/areaLabel'
import { scaleTextSizeValue } from '@/components/maps/labelTextSize'
import { buildBoundaryCenters } from './useDemographicsData'

/** Nothing to label. A module singleton for the same reason
 *  buildBoundaryCenters has one — a fresh object per render would churn the
 *  layer's data identity for no change. */
const NO_LABELS: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/**
 * One label Point per coarse census unit, positioned at the unit's centroid.
 *
 * Empty for a one-geography city: SF's basemap already names what SF paints,
 * so the layer would be redundant noise over a map that is already correct.
 * The gate is the CITY (`census.regions`), not the geometry.
 *
 * Positions come from `buildBoundaryCenters`, i.e. the same tested
 * `featureCentroid` the Dorling fallback uses — deliberately not a second
 * centroid implementation, and it inherits the largest-ring rule, so the
 * multipolygon region (SE) labels on its mainland rather than adrift.
 */
export function buildRegionLabelFeatures(
  boundaries: GeoJSON.FeatureCollection | null,
  city: CityConfig,
): GeoJSON.FeatureCollection {
  if (!city.census?.regions || !boundaries) return NO_LABELS

  const centers = buildBoundaryCenters(boundaries, true)
  if (centers.size === 0) return NO_LABELS

  const features: GeoJSON.Feature[] = []
  for (const [id, center] of centers) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
      // `nhood` stays the canonical code; `label` is the only thing rendered.
      properties: { nhood: id, label: censusUnitLabel(city, id) },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** Zoom band for the label size. Outputs are scaled by the Large Type factor —
 *  Mapbox `text-size` is px-only, the one text surface the root-% rem mechanism
 *  can't reach (Large Type Phase 3). Sized to sit at or above the basemap's
 *  own place labels at Oakland's default frame (zoom ~12), because the whole
 *  point is that the measured unit's name wins the reader's eye. */
const REGION_LABEL_TEXT_SIZE = ['interpolate', ['linear'], ['zoom'], 9, 10, 12, 13, 15, 16]

export const REGION_LABEL_LAYER_ID = 'demographics-region-labels'

/**
 * The symbol layer. Added with NO `belowLabels`, so it appends above the
 * choropleth fill (which is deliberately inserted beneath the basemap's first
 * symbol layer) and above the basemap text.
 *
 * Two placement choices are load-bearing:
 *
 * - `text-allow-overlap: true`. Mapbox resolves symbol collisions in layer
 *   order, and layers added LATER lose — so an ordinary collision-managed
 *   layer on top would be the one Mapbox drops exactly where basemap
 *   neighborhood text is densest, which is precisely where the reader is most
 *   likely to misread the fill. These 10 labels must always draw.
 * - `text-ignore-placement: false`. They still occupy collision space, so
 *   basemap labels sitting under a region name are suppressed rather than
 *   overprinted.
 *
 * Uppercase + tracking is editorial, not decoration: it puts the region name in
 * a visibly different register from the basemap's own place names, so the two
 * geographies do not read as one list of places.
 */
export function regionLabelLayers(
  textFactor: number,
  isDarkMode: boolean,
): mapboxgl.AnyLayer[] {
  return [
    {
      id: REGION_LABEL_LAYER_ID,
      type: 'symbol',
      source: REGION_LABEL_LAYER_ID,
      minzoom: 9,
      layout: {
        'text-field': ['get', 'label'],
        'text-size': scaleTextSizeValue(REGION_LABEL_TEXT_SIZE, textFactor),
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 8,
        'text-anchor': 'center',
        'text-allow-overlap': true,
        'text-ignore-placement': false,
        'text-padding': 4,
      },
      paint: {
        // Same cream-on-espresso / espresso-on-cream treatment MapView bakes
        // into the basemap labels (LABEL_STYLES), so the two read as one
        // system in both themes. Set explicitly rather than inherited:
        // softenBasemapLabels runs on style.load, before app layers mount.
        'text-color': isDarkMode ? '#f5ecd9' : '#2a1d13',
        'text-halo-color': isDarkMode ? '#2a1d13' : '#f5ecd9',
        'text-halo-width': 1.6,
        'text-halo-blur': 0.6,
        'text-opacity': 0.95,
      },
    } as mapboxgl.AnyLayer,
  ]
}
