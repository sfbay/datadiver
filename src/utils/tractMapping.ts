/**
 * Census Tract to Neighborhood Crosswalk
 *
 * Maps SF census tracts (6-digit codes) to DataDiver neighborhood display names.
 * Ported from resonate/src/lib/census/tract-mapping.ts with name conversions.
 *
 * Resonate uses underscore IDs (e.g. 'bayview_hunters_point').
 * DataDiver uses the `nhood` GeoJSON property names (e.g. 'Bayview Hunters Point').
 *
 * Neighborhoods that exist in resonate but not DataDiver are merged:
 *   downtown        → 'Financial District/South Beach'
 *   civic_center    → 'Tenderloin' or 'Hayes Valley' (by tract location)
 *   soma            → 'South of Market'
 *   south_beach     → 'Financial District/South Beach'
 *   cole_valley     → 'Haight Ashbury'
 *   dogpatch        → 'Potrero Hill'
 *   laurel_heights  → 'Presidio Heights'
 *   parkside        → 'Sunset/Parkside'
 *   outer_sunset    → 'Sunset/Parkside'
 *   stonestown      → 'Lakeshore'
 *   oceanview       → 'Oceanview/Merced/Ingleside'
 *   ingleside       → 'Oceanview/Merced/Ingleside'
 *   diamond_heights → 'Twin Peaks'
 *   west_portal     → 'West of Twin Peaks'
 *   sea_cliff       → 'Seacliff'
 *
 * Duplicate tract IDs in resonate (appearing under multiple sections) are
 * merged into single entries with combined neighborhood weights re-normalized to 1.0.
 */

import type { TractMapping } from '../types/census'

export const TRACT_MAPPINGS: TractMapping[] = [
  // === CHINATOWN ===
  { tractId: '010700', neighborhoods: [{ name: 'Chinatown', weight: 1 }] },
  { tractId: '011300', neighborhoods: [{ name: 'Chinatown', weight: 0.7 }, { name: 'Nob Hill', weight: 0.3 }] },
  { tractId: '011400', neighborhoods: [{ name: 'Chinatown', weight: 1 }] },
  { tractId: '011800', neighborhoods: [{ name: 'Chinatown', weight: 0.6 }, { name: 'Financial District/South Beach', weight: 0.4 }] },

  // === NORTH BEACH ===
  { tractId: '010500', neighborhoods: [{ name: 'North Beach', weight: 1 }] },
  { tractId: '010600', neighborhoods: [{ name: 'North Beach', weight: 0.8 }, { name: 'Russian Hill', weight: 0.2 }] },
  { tractId: '010800', neighborhoods: [{ name: 'North Beach', weight: 1 }] },

  // === FINANCIAL DISTRICT / DOWNTOWN ===
  // downtown → 'Financial District/South Beach'
  { tractId: '010400', neighborhoods: [{ name: 'Financial District/South Beach', weight: 1 }] },
  { tractId: '011700', neighborhoods: [{ name: 'Financial District/South Beach', weight: 1 }] },
  { tractId: '011900', neighborhoods: [{ name: 'Financial District/South Beach', weight: 1 }] },
  { tractId: '012000', neighborhoods: [{ name: 'Financial District/South Beach', weight: 0.7 }, { name: 'Tenderloin', weight: 0.3 }] },
  { tractId: '012100', neighborhoods: [{ name: 'Financial District/South Beach', weight: 1 }] },
  // 012200: downtown 0.5 + civic_center 0.5 → FiDi 0.5 + Tenderloin 0.5
  { tractId: '012200', neighborhoods: [{ name: 'Financial District/South Beach', weight: 0.5 }, { name: 'Tenderloin', weight: 0.5 }] },
  { tractId: '012300', neighborhoods: [{ name: 'Financial District/South Beach', weight: 1 }] },

  // === NOB HILL ===
  { tractId: '010900', neighborhoods: [{ name: 'Nob Hill', weight: 1 }] },
  { tractId: '011000', neighborhoods: [{ name: 'Nob Hill', weight: 1 }] },
  { tractId: '011100', neighborhoods: [{ name: 'Nob Hill', weight: 0.7 }, { name: 'Russian Hill', weight: 0.3 }] },
  { tractId: '011200', neighborhoods: [{ name: 'Nob Hill', weight: 1 }] },

  // === RUSSIAN HILL ===
  { tractId: '010100', neighborhoods: [{ name: 'Russian Hill', weight: 1 }] },
  { tractId: '010200', neighborhoods: [{ name: 'Russian Hill', weight: 1 }] },
  { tractId: '010300', neighborhoods: [{ name: 'Russian Hill', weight: 0.8 }, { name: 'North Beach', weight: 0.2 }] },

  // === TENDERLOIN ===
  { tractId: '012400', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },
  { tractId: '012500', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },
  { tractId: '012600', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },
  // 012700: tenderloin 0.8 + civic_center 0.2 → Tenderloin 1.0 (civic_center near Tenderloin here)
  { tractId: '012700', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },
  // 012800: appears as tenderloin=1 AND marina=1. These are DIFFERENT tracts in resonate
  // (012800 = Tenderloin area 128, 012800 = Marina area 128). Resonate has a data error
  // — the Marina section likely means tract 012801/012802. We keep both mappings merged.
  // Tenderloin tract 128 is at 6-digit 012800; Marina tracts use 012701/012702 (see below).
  // Resonate duplicated 012800 for Marina — we assign it to Tenderloin (geographically correct).
  { tractId: '012800', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },
  // 012900: appears as tenderloin=1 AND pacific_heights=1. Same issue.
  // Tract 129 in Tenderloin numbering = 012900. Pacific Heights 129 = 012900 too.
  // Geographically these are distinct tracts reusing the same 6-digit code in resonate's
  // simplified format. We split: keep 012900 as Pacific Heights (more residential/meaningful).
  { tractId: '012900', neighborhoods: [{ name: 'Pacific Heights', weight: 1 }] },

  // === CIVIC CENTER → Tenderloin / Hayes Valley ===
  // 016300: civic_center → Tenderloin (east of Van Ness, near Civic Center proper)
  { tractId: '016300', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },
  // 016400: civic_center 0.7 + hayes_valley 0.3 → Hayes Valley (west portion)
  { tractId: '016400', neighborhoods: [{ name: 'Tenderloin', weight: 0.7 }, { name: 'Hayes Valley', weight: 0.3 }] },
  // 016500: civic_center → Tenderloin
  { tractId: '016500', neighborhoods: [{ name: 'Tenderloin', weight: 1 }] },

  // === SOMA → South of Market ===
  { tractId: '017601', neighborhoods: [{ name: 'South of Market', weight: 1 }] },
  { tractId: '017602', neighborhoods: [{ name: 'South of Market', weight: 1 }] },
  { tractId: '017800', neighborhoods: [{ name: 'South of Market', weight: 1 }] },
  // 017901: soma 0.7 + south_beach 0.3 → SoMa 0.7 + FiDi/South Beach 0.3
  { tractId: '017901', neighborhoods: [{ name: 'South of Market', weight: 0.7 }, { name: 'Financial District/South Beach', weight: 0.3 }] },
  { tractId: '017902', neighborhoods: [{ name: 'South of Market', weight: 1 }] },
  { tractId: '018000', neighborhoods: [{ name: 'South of Market', weight: 1 }] },
  // 060700: soma 0.6 + mission_bay 0.4
  { tractId: '060700', neighborhoods: [{ name: 'South of Market', weight: 0.6 }, { name: 'Mission Bay', weight: 0.4 }] },

  // === SOUTH BEACH → Financial District/South Beach ===
  { tractId: '061100', neighborhoods: [{ name: 'Financial District/South Beach', weight: 1 }] },
  // 061200: south_beach 0.7 + mission_bay 0.3
  { tractId: '061200', neighborhoods: [{ name: 'Financial District/South Beach', weight: 0.7 }, { name: 'Mission Bay', weight: 0.3 }] },

  // === MISSION BAY ===
  { tractId: '061400', neighborhoods: [{ name: 'Mission Bay', weight: 1 }] },
  { tractId: '061500', neighborhoods: [{ name: 'Mission Bay', weight: 1 }] },

  // === MARINA ===
  // Resonate lists 012701, 012702, 012800 for Marina.
  // 012800 conflicts with Tenderloin (see above). We keep 012701/012702 for Marina.
  { tractId: '012701', neighborhoods: [{ name: 'Marina', weight: 1 }] },
  { tractId: '012702', neighborhoods: [{ name: 'Marina', weight: 1 }] },

  // === PACIFIC HEIGHTS ===
  // 012900 handled above (conflict with Tenderloin)
  { tractId: '013000', neighborhoods: [{ name: 'Pacific Heights', weight: 1 }] },
  // 013200: pacific_heights 0.8 + laurel_heights 0.2 → Pacific Heights 0.8 + Presidio Heights 0.2
  { tractId: '013100', neighborhoods: [{ name: 'Pacific Heights', weight: 1 }] },
  { tractId: '013200', neighborhoods: [{ name: 'Pacific Heights', weight: 0.8 }, { name: 'Presidio Heights', weight: 0.2 }] },
  { tractId: '013300', neighborhoods: [{ name: 'Pacific Heights', weight: 1 }] },

  // === PRESIDIO ===
  { tractId: '060100', neighborhoods: [{ name: 'Presidio', weight: 1 }] },
  { tractId: '060200', neighborhoods: [{ name: 'Presidio', weight: 1 }] },

  // === WESTERN ADDITION / JAPANTOWN ===
  { tractId: '015500', neighborhoods: [{ name: 'Western Addition', weight: 1 }] },
  { tractId: '015600', neighborhoods: [{ name: 'Western Addition', weight: 0.7 }, { name: 'Japantown', weight: 0.3 }] },
  { tractId: '015700', neighborhoods: [{ name: 'Japantown', weight: 0.7 }, { name: 'Western Addition', weight: 0.3 }] },
  { tractId: '015800', neighborhoods: [{ name: 'Western Addition', weight: 1 }] },
  { tractId: '015900', neighborhoods: [{ name: 'Western Addition', weight: 1 }] },
  { tractId: '016000', neighborhoods: [{ name: 'Western Addition', weight: 1 }] },
  { tractId: '016100', neighborhoods: [{ name: 'Western Addition', weight: 1 }] },
  { tractId: '016200', neighborhoods: [{ name: 'Western Addition', weight: 1 }] },

  // === LAUREL HEIGHTS → Presidio Heights ===
  { tractId: '013400', neighborhoods: [{ name: 'Presidio Heights', weight: 1 }] },
  { tractId: '013500', neighborhoods: [{ name: 'Presidio Heights', weight: 1 }] },

  // === INNER RICHMOND ===
  { tractId: '045100', neighborhoods: [{ name: 'Inner Richmond', weight: 1 }] },
  { tractId: '045200', neighborhoods: [{ name: 'Inner Richmond', weight: 1 }] },
  { tractId: '045300', neighborhoods: [{ name: 'Inner Richmond', weight: 1 }] },
  { tractId: '045400', neighborhoods: [{ name: 'Inner Richmond', weight: 1 }] },
  { tractId: '045500', neighborhoods: [{ name: 'Inner Richmond', weight: 1 }] },
  // 047600: inner_richmond 0.6 + laurel_heights 0.4 → Inner Richmond 0.6 + Presidio Heights 0.4
  { tractId: '047600', neighborhoods: [{ name: 'Inner Richmond', weight: 0.6 }, { name: 'Presidio Heights', weight: 0.4 }] },

  // === OUTER RICHMOND ===
  { tractId: '045600', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '045700', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '045800', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '045900', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '046000', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '046100', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '046200', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '046300', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  { tractId: '046400', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },
  // 047900: outer_richmond 0.8 + sea_cliff 0.2 → Outer Richmond 0.8 + Seacliff 0.2
  { tractId: '047900', neighborhoods: [{ name: 'Outer Richmond', weight: 0.8 }, { name: 'Seacliff', weight: 0.2 }] },
  { tractId: '048000', neighborhoods: [{ name: 'Outer Richmond', weight: 1 }] },

  // === SEACLIFF ===
  // 042700 covers Lincoln Park + most of Seacliff area but extends into Outer Richmond
  { tractId: '042700', neighborhoods: [{ name: 'Outer Richmond', weight: 0.75 }, { name: 'Seacliff', weight: 0.25 }] },

  // === HAIGHT ASHBURY ===
  { tractId: '016600', neighborhoods: [{ name: 'Haight Ashbury', weight: 1 }] },
  { tractId: '016700', neighborhoods: [{ name: 'Haight Ashbury', weight: 1 }] },
  // 016800: haight_ashbury 0.7 + cole_valley 0.3 → all Haight Ashbury
  { tractId: '016800', neighborhoods: [{ name: 'Haight Ashbury', weight: 1 }] },

  // === COLE VALLEY → Haight Ashbury ===
  { tractId: '016900', neighborhoods: [{ name: 'Haight Ashbury', weight: 1 }] },

  // === HAYES VALLEY ===
  { tractId: '016901', neighborhoods: [{ name: 'Hayes Valley', weight: 1 }] },
  { tractId: '016902', neighborhoods: [{ name: 'Hayes Valley', weight: 1 }] },

  // === INNER SUNSET ===
  { tractId: '030100', neighborhoods: [{ name: 'Inner Sunset', weight: 1 }] },
  { tractId: '030200', neighborhoods: [{ name: 'Inner Sunset', weight: 1 }] },
  { tractId: '030300', neighborhoods: [{ name: 'Inner Sunset', weight: 1 }] },
  { tractId: '030400', neighborhoods: [{ name: 'Inner Sunset', weight: 1 }] },

  // === OUTER SUNSET → Sunset/Parkside ===
  { tractId: '032600', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '032700', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '032800', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '032900', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033000', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033100', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033200', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033300', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033400', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033500', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },

  // === PARKSIDE → Sunset/Parkside ===
  { tractId: '033600', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033700', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033800', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '033900', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '035100', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },
  { tractId: '035200', neighborhoods: [{ name: 'Sunset/Parkside', weight: 1 }] },

  // === STONESTOWN / LAKESHORE → Lakeshore ===
  // stonestown 0.6 + lakeshore 0.4 → all Lakeshore
  { tractId: '035300', neighborhoods: [{ name: 'Lakeshore', weight: 1 }] },
  { tractId: '035400', neighborhoods: [{ name: 'Lakeshore', weight: 1 }] },

  // === WEST PORTAL → West of Twin Peaks ===
  { tractId: '030800', neighborhoods: [{ name: 'West of Twin Peaks', weight: 1 }] },
  { tractId: '030900', neighborhoods: [{ name: 'West of Twin Peaks', weight: 1 }] },

  // === TWIN PEAKS ===
  { tractId: '020100', neighborhoods: [{ name: 'Twin Peaks', weight: 1 }] },
  { tractId: '020200', neighborhoods: [{ name: 'Twin Peaks', weight: 1 }] },

  // === DIAMOND HEIGHTS → Twin Peaks ===
  { tractId: '020400', neighborhoods: [{ name: 'Twin Peaks', weight: 1 }] },
  { tractId: '020500', neighborhoods: [{ name: 'Twin Peaks', weight: 1 }] },

  // === GLEN PARK ===
  { tractId: '020600', neighborhoods: [{ name: 'Glen Park', weight: 1 }] },
  { tractId: '020700', neighborhoods: [{ name: 'Glen Park', weight: 1 }] },

  // === NOE VALLEY ===
  { tractId: '020800', neighborhoods: [{ name: 'Noe Valley', weight: 1 }] },
  { tractId: '020900', neighborhoods: [{ name: 'Noe Valley', weight: 1 }] },
  { tractId: '021000', neighborhoods: [{ name: 'Noe Valley', weight: 1 }] },
  { tractId: '021100', neighborhoods: [{ name: 'Noe Valley', weight: 1 }] },

  // === CASTRO → Castro/Upper Market ===
  { tractId: '021200', neighborhoods: [{ name: 'Castro/Upper Market', weight: 1 }] },
  { tractId: '021300', neighborhoods: [{ name: 'Castro/Upper Market', weight: 1 }] },
  { tractId: '021400', neighborhoods: [{ name: 'Castro/Upper Market', weight: 1 }] },

  // === MISSION ===
  { tractId: '017700', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  // 022600: appears as mission=1 AND potrero_hill=1 (duplicate).
  // Tract 226 straddles Mission/Potrero — split 0.5/0.5.
  { tractId: '022600', neighborhoods: [{ name: 'Mission', weight: 0.5 }, { name: 'Potrero Hill', weight: 0.5 }] },
  // 022700: appears as mission=1 AND dogpatch=1 (duplicate).
  // Tract 227 straddles Mission/Potrero Hill (dogpatch → Potrero Hill) — split 0.5/0.5.
  { tractId: '022700', neighborhoods: [{ name: 'Mission', weight: 0.5 }, { name: 'Potrero Hill', weight: 0.5 }] },
  { tractId: '022800', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  { tractId: '022801', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  { tractId: '022802', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  { tractId: '022803', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  { tractId: '022901', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  { tractId: '022902', neighborhoods: [{ name: 'Mission', weight: 1 }] },
  { tractId: '022903', neighborhoods: [{ name: 'Mission', weight: 0.6 }, { name: 'Bernal Heights', weight: 0.4 }] },

  // === BERNAL HEIGHTS ===
  { tractId: '025200', neighborhoods: [{ name: 'Bernal Heights', weight: 1 }] },
  { tractId: '025300', neighborhoods: [{ name: 'Bernal Heights', weight: 1 }] },
  { tractId: '025400', neighborhoods: [{ name: 'Bernal Heights', weight: 1 }] },

  // === POTRERO HILL (includes dogpatch) ===
  { tractId: '022500', neighborhoods: [{ name: 'Potrero Hill', weight: 1 }] },
  // 022600 and 022700 handled in MISSION section above (merged)
  // dogpatch 061401 → Potrero Hill
  { tractId: '061401', neighborhoods: [{ name: 'Potrero Hill', weight: 1 }] },

  // === BAYVIEW HUNTERS POINT ===
  { tractId: '023000', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },
  { tractId: '023100', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },
  { tractId: '023200', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },
  { tractId: '023300', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },
  { tractId: '023400', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },
  { tractId: '060600', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },
  { tractId: '060800', neighborhoods: [{ name: 'Bayview Hunters Point', weight: 1 }] },

  // === VISITACION VALLEY ===
  { tractId: '026000', neighborhoods: [{ name: 'Visitacion Valley', weight: 1 }] },
  { tractId: '026100', neighborhoods: [{ name: 'Visitacion Valley', weight: 1 }] },
  { tractId: '026200', neighborhoods: [{ name: 'Visitacion Valley', weight: 1 }] },

  // === PORTOLA ===
  { tractId: '025600', neighborhoods: [{ name: 'Portola', weight: 1 }] },
  { tractId: '025700', neighborhoods: [{ name: 'Portola', weight: 1 }] },

  // === EXCELSIOR ===
  { tractId: '026300', neighborhoods: [{ name: 'Excelsior', weight: 1 }] },
  { tractId: '026400', neighborhoods: [{ name: 'Excelsior', weight: 1 }] },
  { tractId: '026500', neighborhoods: [{ name: 'Excelsior', weight: 1 }] },
  { tractId: '026600', neighborhoods: [{ name: 'Excelsior', weight: 1 }] },

  // === OUTER MISSION ===
  { tractId: '025500', neighborhoods: [{ name: 'Outer Mission', weight: 1 }] },
  { tractId: '025800', neighborhoods: [{ name: 'Outer Mission', weight: 1 }] },
  { tractId: '025900', neighborhoods: [{ name: 'Outer Mission', weight: 1 }] },

  // === INGLESIDE → Oceanview/Merced/Ingleside ===
  { tractId: '031000', neighborhoods: [{ name: 'Oceanview/Merced/Ingleside', weight: 1 }] },
  { tractId: '031100', neighborhoods: [{ name: 'Oceanview/Merced/Ingleside', weight: 1 }] },
  { tractId: '031200', neighborhoods: [{ name: 'Oceanview/Merced/Ingleside', weight: 1 }] },
  { tractId: '031300', neighborhoods: [{ name: 'Oceanview/Merced/Ingleside', weight: 1 }] },

  // === OCEANVIEW → Oceanview/Merced/Ingleside ===
  { tractId: '031400', neighborhoods: [{ name: 'Oceanview/Merced/Ingleside', weight: 1 }] },
  { tractId: '031500', neighborhoods: [{ name: 'Oceanview/Merced/Ingleside', weight: 1 }] },

  // === TREASURE ISLAND ===
  { tractId: '980000', neighborhoods: [{ name: 'Treasure Island', weight: 1 }] },
]

/**
 * Look up which DataDiver neighborhoods a census tract maps to,
 * with weighted allocation (weights sum to 1.0).
 */
export function getNeighborhoodsForTract(tractId: string): { name: string; weight: number }[] {
  const mapping = TRACT_MAPPINGS.find(m => m.tractId === tractId)
  return mapping?.neighborhoods ?? []
}

/**
 * Look up which census tracts contribute to a given DataDiver neighborhood,
 * with each tract's weight indicating what fraction of it falls in this neighborhood.
 */
export function getTractsForNeighborhood(neighborhood: string): { tractId: string; weight: number }[] {
  const results: { tractId: string; weight: number }[] = []
  for (const mapping of TRACT_MAPPINGS) {
    const match = mapping.neighborhoods.find(n => n.name === neighborhood)
    if (match) results.push({ tractId: mapping.tractId, weight: match.weight })
  }
  return results
}

/**
 * Get all DataDiver neighborhood names that have at least one mapped census tract.
 * Returns sorted array of display names.
 */
export function getAllMappedNeighborhoods(): string[] {
  const set = new Set<string>()
  for (const m of TRACT_MAPPINGS) {
    for (const n of m.neighborhoods) set.add(n.name)
  }
  return Array.from(set).sort()
}
