// src/components/maps/labelGroups.ts
//
// Shared classification of Mapbox basemap LABEL layers into styling groups.
// Used by BOTH softenBasemapLabels (MapView — the baked per-group, per-theme
// label paint) and MapLabelTuner (the ?labeltune=1 dev panel), so the two can
// never drift on which layer belongs to which group.

export type LabelGroup = 'place' | 'road' | 'other'

/** Classify a Mapbox label layer id into a styling group. */
export function classifyLabelLayer(id: string): LabelGroup {
  if (/settlement|place-label|neighbou?rhood|state-label|country-label/.test(id)) return 'place'
  if (/road|street|motorway|transit|junction/.test(id)) return 'road'
  return 'other'
}
