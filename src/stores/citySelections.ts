/**
 * Store selection fields whose vocabulary is city-specific AND whose views
 * are live in MORE THAN ONE city — each is nulled on a cross-city
 * navigation (CityChangeReset in App.tsx builds an exhaustive
 * Record<CitySelectionField, setter> from this list, so adding a field
 * here without wiring its setter is a compile error). A pure leaf because
 * appStore itself is unimportable under the node-only Vitest.
 * The other selected* fields (meter/crash/business/housing/incident)
 * belong to SF-only views — they join this list when those views gain a
 * second city, not before.
 */
export const CITY_SELECTION_FIELDS = [
  'selectedNeighborhood',
  'selectedCrimeIncident',
  'selected311Case',
  'selectedCitation',
] as const

export type CitySelectionField = (typeof CITY_SELECTION_FIELDS)[number]
