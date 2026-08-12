// src/cities/oakland/regionNames.ts
//
// The 10 Oakland demographic REGIONS — authored display names, pinned 1:1 to
// the region codes (regions.test.ts). Oakland's 131 official neighborhoods
// (sb4q-6bkc) are tract-fine; they dissolve, by their `code` letter-prefix,
// into these 10 coarse planning regions (~42.7k people each — 426,920 over 10
// since the 404200 override; exact figure pinned in census-oakland.test.ts,
// which is where to look before quoting it) that census tracts
// nest into honestly. The letters are a FILING SCHEME, not compass directions
// (`NW` holds Montclair, an east hill), so names are editorial synthesis from
// the member neighborhoods — never auto-derive them. Approved by Jesse
// Aug 11 2026. Curated like the beat names ([[project_oakland_expansion]]).

export const OAKLAND_REGION_NAMES: Record<string, string> = {
  C: 'Downtown & Lake Merritt',
  W: 'West Oakland',
  N: 'North Oakland',
  F: 'Fruitvale & Dimond',
  L: 'Grand Lake & Glenview',
  S: 'San Antonio & Eastlake',
  CE: 'Central East Oakland',
  E: 'Deep East Oakland',
  NW: 'Montclair & the North Hills',
  SE: 'Skyline & the Southeast Hills',
}

/** The 10 canonical region codes. */
export const OAKLAND_REGION_CODES = Object.keys(OAKLAND_REGION_NAMES).sort()
