/**
 * generate-census-static.ts
 *
 * One-time generation script that produces static Census JSON files for the build.
 * Can run in two modes:
 *
 *   1. Sample-only (default, no API key needed):
 *      npx tsx scripts/generate-census-static.ts --sample-only
 *      Uses pre-computed estimates seeded from the resonate project.
 *
 *   2. Live Census API fetch:
 *      VITE_CENSUS_API_KEY=xxx npx tsx scripts/generate-census-static.ts
 *      Fetches real ACS 5-year data, computes variables, aggregates to neighborhoods.
 *
 * Output files:
 *   src/data/census-neighborhoods.json  — ~41 neighborhoods
 *   src/data/census-tracts.json         — ~200 tracts (empty [] in sample-only mode)
 *   src/data/census-blockgroups.json    — ~580 block groups (empty [] in sample-only mode)
 */

import { writeFileSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Pure TS imports — no Vite dependencies
import type { CensusData, NeighborhoodCensusData } from '../src/types/census'
import { CENSUS_VARIABLES } from '../src/utils/censusVariables'
import { TRACT_MAPPINGS, getAllMappedNeighborhoods } from '../src/utils/tractMapping'
import { aggregateToNeighborhoods } from '../src/utils/censusAggregator'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_DIR = resolve(__dirname, '../src/data')

// ---------------------------------------------------------------------------
// Resonate sample data → NeighborhoodCensusData conversion
// ---------------------------------------------------------------------------

/**
 * Mapping from resonate snake_case keys to DataDiver neighborhood display names.
 * Some resonate neighborhoods are merged in DataDiver (see tractMapping.ts header).
 */
const RESONATE_TO_DATADIVER: Record<string, string> = {
  bayview_hunters_point: 'Bayview Hunters Point',
  bernal_heights: 'Bernal Heights',
  castro: 'Castro/Upper Market',
  chinatown: 'Chinatown',
  civic_center: 'Tenderloin',           // merged into Tenderloin
  cole_valley: 'Haight Ashbury',        // merged into Haight Ashbury
  diamond_heights: 'Twin Peaks',        // merged into Twin Peaks
  dogpatch: 'Potrero Hill',             // merged into Potrero Hill
  downtown: 'Financial District/South Beach',
  excelsior: 'Excelsior',
  financial_district: 'Financial District/South Beach',
  glen_park: 'Glen Park',
  haight_ashbury: 'Haight Ashbury',
  hayes_valley: 'Hayes Valley',
  ingleside: 'Oceanview/Merced/Ingleside',
  inner_richmond: 'Inner Richmond',
  inner_sunset: 'Inner Sunset',
  japantown: 'Japantown',
  lakeshore: 'Lakeshore',
  laurel_heights: 'Presidio Heights',   // merged into Presidio Heights
  marina: 'Marina',
  mission: 'Mission',
  mission_bay: 'Mission Bay',
  nob_hill: 'Nob Hill',
  noe_valley: 'Noe Valley',
  north_beach: 'North Beach',
  oceanview: 'Oceanview/Merced/Ingleside',
  outer_mission: 'Outer Mission',
  outer_richmond: 'Outer Richmond',
  outer_sunset: 'Sunset/Parkside',
  pacific_heights: 'Pacific Heights',
  parkside: 'Sunset/Parkside',
  portola: 'Portola',
  potrero_hill: 'Potrero Hill',
  presidio: 'Presidio',
  russian_hill: 'Russian Hill',
  sea_cliff: 'Seacliff',
  soma: 'South of Market',
  south_beach: 'Financial District/South Beach',
  stonestown: 'Lakeshore',
  tenderloin: 'Tenderloin',
  treasure_island: 'Treasure Island',
  twin_peaks: 'Twin Peaks',
  visitacion_valley: 'Visitacion Valley',
  west_portal: 'West of Twin Peaks',
  western_addition: 'Western Addition',
}

/** Resonate-format census data (matches sf-census-data.ts structure) */
interface ResonateNeighborhoodData {
  population: { total: number }
  economic: { medianHouseholdIncome: number }
  housing: { renterOccupied: number }
  language: {
    limitedEnglishProficiency: number
    languagesSpoken: {
      chinese: number; spanish: number; tagalog: number
      vietnamese: number; korean: number; russian: number
    }
  }
  ethnicity: {
    distribution: {
      white: number; asian: number; hispanic: number
      black: number; pacific: number; multiracial: number
    }
  }
  age: { under18: number; seniors: number }
}

// Resonate sample data — approximations based on ACS 5-year estimates.
// Copied from social/resonate/src/lib/census/sf-census-data.ts
const RESONATE_DATA: Record<string, ResonateNeighborhoodData> = {
  bayview_hunters_point: { population:{total:36580}, economic:{medianHouseholdIncome:52000}, housing:{renterOccupied:58}, language:{limitedEnglishProficiency:22, languagesSpoken:{chinese:12,spanish:14,tagalog:8,vietnamese:3,korean:1,russian:0}}, ethnicity:{distribution:{white:8,asian:35,hispanic:22,black:28,pacific:3,multiracial:4}}, age:{under18:22,seniors:14} },
  bernal_heights: { population:{total:26200}, economic:{medianHouseholdIncome:128000}, housing:{renterOccupied:42}, language:{limitedEnglishProficiency:12, languagesSpoken:{chinese:5,spanish:18,tagalog:2,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:52,asian:12,hispanic:28,black:3,pacific:1,multiracial:4}}, age:{under18:16,seniors:12} },
  castro: { population:{total:18500}, economic:{medianHouseholdIncome:145000}, housing:{renterOccupied:62}, language:{limitedEnglishProficiency:6, languagesSpoken:{chinese:3,spanish:8,tagalog:1,vietnamese:0,korean:1,russian:0}}, ethnicity:{distribution:{white:72,asian:10,hispanic:10,black:3,pacific:1,multiracial:4}}, age:{under18:4,seniors:14} },
  chinatown: { population:{total:15780}, economic:{medianHouseholdIncome:28000}, housing:{renterOccupied:92}, language:{limitedEnglishProficiency:72, languagesSpoken:{chinese:85,spanish:2,tagalog:0,vietnamese:2,korean:0,russian:0}}, ethnicity:{distribution:{white:4,asian:90,hispanic:3,black:1,pacific:0,multiracial:2}}, age:{under18:12,seniors:28} },
  civic_center: { population:{total:8200}, economic:{medianHouseholdIncome:45000}, housing:{renterOccupied:88}, language:{limitedEnglishProficiency:28, languagesSpoken:{chinese:12,spanish:15,tagalog:3,vietnamese:5,korean:2,russian:1}}, ethnicity:{distribution:{white:38,asian:28,hispanic:18,black:10,pacific:2,multiracial:4}}, age:{under18:6,seniors:18} },
  cole_valley: { population:{total:8900}, economic:{medianHouseholdIncome:158000}, housing:{renterOccupied:48}, language:{limitedEnglishProficiency:5, languagesSpoken:{chinese:4,spanish:5,tagalog:1,vietnamese:0,korean:1,russian:1}}, ethnicity:{distribution:{white:75,asian:12,hispanic:6,black:2,pacific:1,multiracial:4}}, age:{under18:12,seniors:10} },
  diamond_heights: { population:{total:6200}, economic:{medianHouseholdIncome:125000}, housing:{renterOccupied:35}, language:{limitedEnglishProficiency:10, languagesSpoken:{chinese:8,spanish:6,tagalog:2,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:55,asian:22,hispanic:12,black:5,pacific:1,multiracial:5}}, age:{under18:10,seniors:18} },
  dogpatch: { population:{total:4800}, economic:{medianHouseholdIncome:165000}, housing:{renterOccupied:55}, language:{limitedEnglishProficiency:6, languagesSpoken:{chinese:5,spanish:4,tagalog:1,vietnamese:0,korean:1,russian:0}}, ethnicity:{distribution:{white:62,asian:18,hispanic:10,black:4,pacific:1,multiracial:5}}, age:{under18:8,seniors:8} },
  downtown: { population:{total:12400}, economic:{medianHouseholdIncome:68000}, housing:{renterOccupied:85}, language:{limitedEnglishProficiency:25, languagesSpoken:{chinese:18,spanish:8,tagalog:2,vietnamese:3,korean:2,russian:1}}, ethnicity:{distribution:{white:42,asian:32,hispanic:12,black:8,pacific:2,multiracial:4}}, age:{under18:4,seniors:16} },
  excelsior: { population:{total:41500}, economic:{medianHouseholdIncome:72000}, housing:{renterOccupied:45}, language:{limitedEnglishProficiency:35, languagesSpoken:{chinese:22,spanish:18,tagalog:12,vietnamese:4,korean:1,russian:0}}, ethnicity:{distribution:{white:15,asian:42,hispanic:32,black:5,pacific:2,multiracial:4}}, age:{under18:20,seniors:16} },
  financial_district: { population:{total:4200}, economic:{medianHouseholdIncome:148000}, housing:{renterOccupied:78}, language:{limitedEnglishProficiency:12, languagesSpoken:{chinese:10,spanish:4,tagalog:1,vietnamese:1,korean:2,russian:0}}, ethnicity:{distribution:{white:52,asian:32,hispanic:8,black:3,pacific:1,multiracial:4}}, age:{under18:3,seniors:10} },
  glen_park: { population:{total:9800}, economic:{medianHouseholdIncome:152000}, housing:{renterOccupied:32}, language:{limitedEnglishProficiency:8, languagesSpoken:{chinese:6,spanish:8,tagalog:2,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:62,asian:16,hispanic:14,black:3,pacific:1,multiracial:4}}, age:{under18:14,seniors:14} },
  haight_ashbury: { population:{total:16200}, economic:{medianHouseholdIncome:118000}, housing:{renterOccupied:68}, language:{limitedEnglishProficiency:7, languagesSpoken:{chinese:4,spanish:6,tagalog:1,vietnamese:0,korean:1,russian:1}}, ethnicity:{distribution:{white:68,asian:12,hispanic:10,black:5,pacific:1,multiracial:4}}, age:{under18:8,seniors:10} },
  hayes_valley: { population:{total:10800}, economic:{medianHouseholdIncome:135000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:9, languagesSpoken:{chinese:5,spanish:7,tagalog:2,vietnamese:1,korean:1,russian:1}}, ethnicity:{distribution:{white:58,asian:16,hispanic:12,black:8,pacific:1,multiracial:5}}, age:{under18:6,seniors:10} },
  ingleside: { population:{total:28400}, economic:{medianHouseholdIncome:85000}, housing:{renterOccupied:38}, language:{limitedEnglishProficiency:28, languagesSpoken:{chinese:18,spanish:14,tagalog:10,vietnamese:3,korean:1,russian:0}}, ethnicity:{distribution:{white:18,asian:45,hispanic:22,black:8,pacific:3,multiracial:4}}, age:{under18:18,seniors:18} },
  inner_richmond: { population:{total:25600}, economic:{medianHouseholdIncome:108000}, housing:{renterOccupied:58}, language:{limitedEnglishProficiency:28, languagesSpoken:{chinese:32,spanish:5,tagalog:2,vietnamese:2,korean:3,russian:4}}, ethnicity:{distribution:{white:38,asian:48,hispanic:8,black:2,pacific:1,multiracial:3}}, age:{under18:12,seniors:18} },
  inner_sunset: { population:{total:28900}, economic:{medianHouseholdIncome:115000}, housing:{renterOccupied:52}, language:{limitedEnglishProficiency:22, languagesSpoken:{chinese:25,spanish:4,tagalog:2,vietnamese:2,korean:2,russian:2}}, ethnicity:{distribution:{white:42,asian:45,hispanic:7,black:2,pacific:1,multiracial:3}}, age:{under18:14,seniors:16} },
  japantown: { population:{total:4600}, economic:{medianHouseholdIncome:92000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:18, languagesSpoken:{chinese:8,spanish:5,tagalog:3,vietnamese:2,korean:4,russian:2}}, ethnicity:{distribution:{white:42,asian:38,hispanic:10,black:5,pacific:2,multiracial:3}}, age:{under18:6,seniors:22} },
  lakeshore: { population:{total:12800}, economic:{medianHouseholdIncome:95000}, housing:{renterOccupied:42}, language:{limitedEnglishProficiency:25, languagesSpoken:{chinese:22,spanish:8,tagalog:8,vietnamese:2,korean:2,russian:1}}, ethnicity:{distribution:{white:28,asian:48,hispanic:14,black:5,pacific:2,multiracial:3}}, age:{under18:14,seniors:20} },
  laurel_heights: { population:{total:8400}, economic:{medianHouseholdIncome:165000}, housing:{renterOccupied:45}, language:{limitedEnglishProficiency:12, languagesSpoken:{chinese:10,spanish:4,tagalog:2,vietnamese:1,korean:2,russian:2}}, ethnicity:{distribution:{white:62,asian:24,hispanic:6,black:3,pacific:1,multiracial:4}}, age:{under18:12,seniors:16} },
  marina: { population:{total:24200}, economic:{medianHouseholdIncome:175000}, housing:{renterOccupied:68}, language:{limitedEnglishProficiency:6, languagesSpoken:{chinese:4,spanish:5,tagalog:1,vietnamese:0,korean:1,russian:1}}, ethnicity:{distribution:{white:78,asian:12,hispanic:5,black:1,pacific:0,multiracial:4}}, age:{under18:6,seniors:12} },
  mission: { population:{total:58200}, economic:{medianHouseholdIncome:88000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:32, languagesSpoken:{chinese:6,spanish:42,tagalog:3,vietnamese:2,korean:1,russian:0}}, ethnicity:{distribution:{white:38,asian:12,hispanic:42,black:3,pacific:1,multiracial:4}}, age:{under18:14,seniors:10} },
  mission_bay: { population:{total:12600}, economic:{medianHouseholdIncome:185000}, housing:{renterOccupied:65}, language:{limitedEnglishProficiency:8, languagesSpoken:{chinese:8,spanish:4,tagalog:1,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:52,asian:32,hispanic:8,black:3,pacific:1,multiracial:4}}, age:{under18:8,seniors:6} },
  nob_hill: { population:{total:18900}, economic:{medianHouseholdIncome:125000}, housing:{renterOccupied:75}, language:{limitedEnglishProficiency:18, languagesSpoken:{chinese:15,spanish:6,tagalog:2,vietnamese:2,korean:2,russian:2}}, ethnicity:{distribution:{white:55,asian:28,hispanic:8,black:4,pacific:1,multiracial:4}}, age:{under18:5,seniors:18} },
  noe_valley: { population:{total:22400}, economic:{medianHouseholdIncome:195000}, housing:{renterOccupied:35}, language:{limitedEnglishProficiency:6, languagesSpoken:{chinese:5,spanish:6,tagalog:1,vietnamese:0,korean:1,russian:0}}, ethnicity:{distribution:{white:72,asian:12,hispanic:10,black:2,pacific:0,multiracial:4}}, age:{under18:18,seniors:10} },
  north_beach: { population:{total:14800}, economic:{medianHouseholdIncome:118000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:22, languagesSpoken:{chinese:25,spanish:6,tagalog:2,vietnamese:2,korean:1,russian:1}}, ethnicity:{distribution:{white:52,asian:32,hispanic:8,black:3,pacific:1,multiracial:4}}, age:{under18:6,seniors:18} },
  oceanview: { population:{total:15200}, economic:{medianHouseholdIncome:68000}, housing:{renterOccupied:42}, language:{limitedEnglishProficiency:38, languagesSpoken:{chinese:25,spanish:16,tagalog:14,vietnamese:4,korean:1,russian:0}}, ethnicity:{distribution:{white:10,asian:48,hispanic:25,black:10,pacific:3,multiracial:4}}, age:{under18:20,seniors:16} },
  outer_mission: { population:{total:22800}, economic:{medianHouseholdIncome:72000}, housing:{renterOccupied:45}, language:{limitedEnglishProficiency:35, languagesSpoken:{chinese:15,spanish:28,tagalog:10,vietnamese:3,korean:1,russian:0}}, ethnicity:{distribution:{white:15,asian:35,hispanic:40,black:4,pacific:2,multiracial:4}}, age:{under18:18,seniors:14} },
  outer_richmond: { population:{total:45200}, economic:{medianHouseholdIncome:95000}, housing:{renterOccupied:52}, language:{limitedEnglishProficiency:35, languagesSpoken:{chinese:42,spanish:4,tagalog:3,vietnamese:3,korean:3,russian:6}}, ethnicity:{distribution:{white:32,asian:55,hispanic:6,black:2,pacific:1,multiracial:4}}, age:{under18:14,seniors:22} },
  outer_sunset: { population:{total:72400}, economic:{medianHouseholdIncome:98000}, housing:{renterOccupied:42}, language:{limitedEnglishProficiency:32, languagesSpoken:{chinese:38,spanish:5,tagalog:4,vietnamese:3,korean:2,russian:2}}, ethnicity:{distribution:{white:32,asian:55,hispanic:7,black:2,pacific:1,multiracial:3}}, age:{under18:16,seniors:20} },
  pacific_heights: { population:{total:21800}, economic:{medianHouseholdIncome:210000}, housing:{renterOccupied:55}, language:{limitedEnglishProficiency:8, languagesSpoken:{chinese:6,spanish:5,tagalog:2,vietnamese:1,korean:1,russian:2}}, ethnicity:{distribution:{white:78,asian:12,hispanic:4,black:2,pacific:0,multiracial:4}}, age:{under18:10,seniors:16} },
  parkside: { population:{total:28600}, economic:{medianHouseholdIncome:105000}, housing:{renterOccupied:38}, language:{limitedEnglishProficiency:28, languagesSpoken:{chinese:32,spanish:5,tagalog:4,vietnamese:2,korean:2,russian:2}}, ethnicity:{distribution:{white:35,asian:52,hispanic:7,black:2,pacific:1,multiracial:3}}, age:{under18:16,seniors:20} },
  portola: { population:{total:15800}, economic:{medianHouseholdIncome:78000}, housing:{renterOccupied:42}, language:{limitedEnglishProficiency:32, languagesSpoken:{chinese:18,spanish:20,tagalog:12,vietnamese:4,korean:1,russian:0}}, ethnicity:{distribution:{white:15,asian:42,hispanic:32,black:5,pacific:2,multiracial:4}}, age:{under18:18,seniors:16} },
  potrero_hill: { population:{total:14200}, economic:{medianHouseholdIncome:155000}, housing:{renterOccupied:48}, language:{limitedEnglishProficiency:8, languagesSpoken:{chinese:5,spanish:8,tagalog:2,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:58,asian:18,hispanic:14,black:5,pacific:1,multiracial:4}}, age:{under18:10,seniors:10} },
  presidio: { population:{total:3800}, economic:{medianHouseholdIncome:145000}, housing:{renterOccupied:62}, language:{limitedEnglishProficiency:5, languagesSpoken:{chinese:4,spanish:4,tagalog:2,vietnamese:0,korean:1,russian:1}}, ethnicity:{distribution:{white:68,asian:16,hispanic:8,black:4,pacific:1,multiracial:3}}, age:{under18:14,seniors:8} },
  russian_hill: { population:{total:16400}, economic:{medianHouseholdIncome:155000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:10, languagesSpoken:{chinese:8,spanish:5,tagalog:1,vietnamese:1,korean:1,russian:3}}, ethnicity:{distribution:{white:72,asian:16,hispanic:6,black:2,pacific:0,multiracial:4}}, age:{under18:4,seniors:14} },
  sea_cliff: { population:{total:2800}, economic:{medianHouseholdIncome:250000}, housing:{renterOccupied:22}, language:{limitedEnglishProficiency:12, languagesSpoken:{chinese:12,spanish:3,tagalog:2,vietnamese:1,korean:1,russian:2}}, ethnicity:{distribution:{white:62,asian:28,hispanic:4,black:1,pacific:1,multiracial:4}}, age:{under18:16,seniors:18} },
  soma: { population:{total:32800}, economic:{medianHouseholdIncome:95000}, housing:{renterOccupied:78}, language:{limitedEnglishProficiency:18, languagesSpoken:{chinese:10,spanish:10,tagalog:5,vietnamese:3,korean:2,russian:1}}, ethnicity:{distribution:{white:45,asian:28,hispanic:14,black:8,pacific:2,multiracial:3}}, age:{under18:5,seniors:12} },
  south_beach: { population:{total:8600}, economic:{medianHouseholdIncome:175000}, housing:{renterOccupied:65}, language:{limitedEnglishProficiency:8, languagesSpoken:{chinese:8,spanish:4,tagalog:1,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:55,asian:30,hispanic:7,black:3,pacific:1,multiracial:4}}, age:{under18:6,seniors:8} },
  stonestown: { population:{total:8200}, economic:{medianHouseholdIncome:85000}, housing:{renterOccupied:55}, language:{limitedEnglishProficiency:22, languagesSpoken:{chinese:22,spanish:6,tagalog:6,vietnamese:2,korean:2,russian:1}}, ethnicity:{distribution:{white:32,asian:50,hispanic:10,black:3,pacific:2,multiracial:3}}, age:{under18:10,seniors:18} },
  tenderloin: { population:{total:27600}, economic:{medianHouseholdIncome:28000}, housing:{renterOccupied:94}, language:{limitedEnglishProficiency:42, languagesSpoken:{chinese:12,spanish:18,tagalog:5,vietnamese:15,korean:2,russian:2}}, ethnicity:{distribution:{white:28,asian:35,hispanic:20,black:12,pacific:2,multiracial:3}}, age:{under18:8,seniors:16} },
  treasure_island: { population:{total:3200}, economic:{medianHouseholdIncome:55000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:15, languagesSpoken:{chinese:8,spanish:10,tagalog:5,vietnamese:2,korean:1,russian:1}}, ethnicity:{distribution:{white:35,asian:25,hispanic:20,black:12,pacific:4,multiracial:4}}, age:{under18:18,seniors:8} },
  twin_peaks: { population:{total:5200}, economic:{medianHouseholdIncome:145000}, housing:{renterOccupied:32}, language:{limitedEnglishProficiency:10, languagesSpoken:{chinese:8,spanish:6,tagalog:2,vietnamese:1,korean:1,russian:0}}, ethnicity:{distribution:{white:58,asian:22,hispanic:12,black:3,pacific:1,multiracial:4}}, age:{under18:10,seniors:18} },
  visitacion_valley: { population:{total:18400}, economic:{medianHouseholdIncome:62000}, housing:{renterOccupied:48}, language:{limitedEnglishProficiency:42, languagesSpoken:{chinese:28,spanish:14,tagalog:16,vietnamese:5,korean:1,russian:0}}, ethnicity:{distribution:{white:8,asian:55,hispanic:22,black:8,pacific:4,multiracial:3}}, age:{under18:20,seniors:16} },
  west_portal: { population:{total:8800}, economic:{medianHouseholdIncome:145000}, housing:{renterOccupied:32}, language:{limitedEnglishProficiency:12, languagesSpoken:{chinese:12,spanish:5,tagalog:3,vietnamese:1,korean:1,russian:1}}, ethnicity:{distribution:{white:55,asian:28,hispanic:10,black:2,pacific:1,multiracial:4}}, age:{under18:16,seniors:16} },
  western_addition: { population:{total:24800}, economic:{medianHouseholdIncome:78000}, housing:{renterOccupied:72}, language:{limitedEnglishProficiency:14, languagesSpoken:{chinese:6,spanish:8,tagalog:3,vietnamese:2,korean:2,russian:2}}, ethnicity:{distribution:{white:42,asian:18,hispanic:12,black:22,pacific:2,multiracial:4}}, age:{under18:10,seniors:16} },
}

// ---------------------------------------------------------------------------
// Convert resonate data to NeighborhoodCensusData[]
// ---------------------------------------------------------------------------

function convertResonateSample(): NeighborhoodCensusData[] {
  // Group resonate entries by DataDiver neighborhood name
  // For merged neighborhoods, average the estimates weighted by population
  const grouped = new Map<string, { totalPop: number; entries: { data: ResonateNeighborhoodData; pop: number }[] }>()

  for (const [key, data] of Object.entries(RESONATE_DATA)) {
    const ddName = RESONATE_TO_DATADIVER[key]
    if (!ddName) {
      console.warn(`No DataDiver mapping for resonate key: ${key}`)
      continue
    }
    const pop = data.population.total
    if (!grouped.has(ddName)) {
      grouped.set(ddName, { totalPop: 0, entries: [] })
    }
    const g = grouped.get(ddName)!
    g.totalPop += pop
    g.entries.push({ data, pop })
  }

  // Get tract info for each neighborhood
  const allNeighborhoods = getAllMappedNeighborhoods()

  const results: NeighborhoodCensusData[] = []

  for (const name of allNeighborhoods) {
    const g = grouped.get(name)
    if (!g) {
      // Neighborhood exists in tract mapping but no resonate data — skip
      continue
    }

    // Population-weighted average helper
    const wavg = (fn: (d: ResonateNeighborhoodData) => number): number => {
      if (g.entries.length === 1) return fn(g.entries[0].data)
      let sum = 0
      for (const e of g.entries) sum += fn(e.data) * e.pop
      return Math.round((sum / g.totalPop) * 100) / 100
    }

    // Find tracts for this neighborhood from TRACT_MAPPINGS
    const tracts: string[] = []
    for (const m of TRACT_MAPPINGS) {
      if (m.neighborhoods.some(n => n.name === name)) {
        tracts.push(m.tractId)
      }
    }

    const entry: NeighborhoodCensusData = {
      geoId: `neighborhood_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
      geoType: 'neighborhood',
      name,
      population: g.totalPop,
      tractCount: tracts.length,
      tracts,
      // Income & Housing — from resonate/ACS seed data
      medianIncome: Math.round(wavg(d => d.economic.medianHouseholdIncome)),
      renterPct: wavg(d => d.housing.renterOccupied),
      // Race/Ethnicity — from resonate/ACS seed data
      pctWhite: wavg(d => d.ethnicity.distribution.white),
      pctBlack: wavg(d => d.ethnicity.distribution.black),
      pctAsian: wavg(d => d.ethnicity.distribution.asian),
      pctHispanic: wavg(d => d.ethnicity.distribution.hispanic),
      pctPacificIslander: wavg(d => d.ethnicity.distribution.pacific),
      pctMultiracial: wavg(d => d.ethnicity.distribution.multiracial),
      // Language — from resonate/ACS seed data
      lepRate: wavg(d => d.language.limitedEnglishProficiency),
      pctChinese: wavg(d => d.language.languagesSpoken.chinese),
      pctSpanish: wavg(d => d.language.languagesSpoken.spanish),
      pctTagalog: wavg(d => d.language.languagesSpoken.tagalog),
      pctVietnamese: wavg(d => d.language.languagesSpoken.vietnamese),
      pctKorean: wavg(d => d.language.languagesSpoken.korean),
      pctRussian: wavg(d => d.language.languagesSpoken.russian),
      // Age — from resonate/ACS seed data
      pctUnder18: wavg(d => d.age.under18),
      pctOver65: wavg(d => d.age.seniors),
      pctWorkingAge: Math.round((100 - wavg(d => d.age.under18) - wavg(d => d.age.seniors)) * 100) / 100,
      // Population
      totalPopulation: g.totalPop,
      // NOTE: povertyRate, rentBurden, pctBachelorsPlus, medianAge, unemploymentRate,
      // medianRent, medianHomeValue, populationDensity, pctNoHighSchool, pctWFH,
      // pctDriveAlone, pctTransit, pctBikeWalk are NOT in resonate seed data.
      // These require live Census API fetch (VITE_CENSUS_API_KEY).
    }

    results.push(entry)
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}

// ---------------------------------------------------------------------------
// Census API fetch (live mode)
// ---------------------------------------------------------------------------

const API_BASE = 'https://api.census.gov/data'
const SF_STATE = '06'
const SF_COUNTY = '075'
const MAX_VARS_PER_REQUEST = 48

async function fetchCensusLive(apiKey: string): Promise<{ tracts: CensusData[]; blockGroups: CensusData[] }> {
  console.log('Fetching live Census data with API key...')

  // Collect all ACS variable codes
  function collectVars(geoLevel: 'tract' | 'blockgroup'): string[] {
    const vars = new Set<string>()
    for (const config of CENSUS_VARIABLES) {
      if (!config.availableAt.includes(geoLevel)) continue
      for (const v of config.acsVariables) vars.add(v)
    }
    return Array.from(vars)
  }

  async function fetchGeoLevel(geoLevel: 'tract' | 'blockgroup'): Promise<Map<string, Record<string, string | null>>> {
    const variables = collectVars(geoLevel)
    const batches: string[][] = []
    for (let i = 0; i < variables.length; i += MAX_VARS_PER_REQUEST) {
      batches.push(variables.slice(i, i + MAX_VARS_PER_REQUEST))
    }

    const merged = new Map<string, Record<string, string | null>>()

    await Promise.all(batches.map(async (batch) => {
      const getParam = ['NAME', ...batch].join(',')
      let forClause: string
      let inClause: string
      if (geoLevel === 'tract') {
        forClause = 'tract:*'
        inClause = `state:${SF_STATE}+county:${SF_COUNTY}`
      } else {
        forClause = 'block group:*'
        inClause = `state:${SF_STATE}+county:${SF_COUNTY}+tract:*`
      }

      const params = new URLSearchParams({
        get: getParam,
        for: forClause,
        in: inClause,
        key: apiKey,
      })

      const url = `${API_BASE}/2023/acs/acs5?${params.toString()}`
      const response = await fetch(url)
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        console.error(`Census API ${response.status} for batch with vars: ${batch.slice(0, 5).join(', ')}...`)
        console.error(`  URL: ${url.slice(0, 200)}...`)
        console.error(`  Response: ${body.slice(0, 300)}`)
        throw new Error(`Census API ${response.status}: ${body.slice(0, 200)}`)
      }

      const data: (string | null)[][] = await response.json()
      if (!data || data.length < 2) return

      const headers = data[0] as string[]
      const stateIdx = headers.indexOf('state')
      const countyIdx = headers.indexOf('county')
      const tractIdx = headers.indexOf('tract')
      const blockGroupIdx = headers.indexOf('block group')

      for (let r = 1; r < data.length; r++) {
        const row = data[r]
        let geoId: string
        if (geoLevel === 'blockgroup') {
          geoId = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}${row[blockGroupIdx]}`
        } else {
          geoId = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}`
        }
        if (!merged.has(geoId)) merged.set(geoId, {})
        const existing = merged.get(geoId)!
        for (let c = 0; c < headers.length; c++) {
          existing[headers[c]] = row[c]
        }
      }
    }))

    return merged
  }

  // Fetch raw data from Census API
  const tractRows = await fetchGeoLevel('tract')
  console.log(`Fetched ${tractRows.size} tracts from Census API`)

  // Parse helpers (mirrored from censusClient.ts)
  function parseRawValue(raw: string | null | undefined): number | undefined {
    if (raw == null || raw === '-' || raw === '' || raw === '(X)' || raw === 'null') return undefined
    const n = Number(raw)
    return isNaN(n) || n < 0 ? undefined : n
  }

  function sumRawVals(row: Record<string, string | null>, codes: string[]): number | undefined {
    let total = 0; let anyValid = false
    for (const code of codes) {
      const v = parseRawValue(row[code])
      if (v !== undefined) { total += v; anyValid = true }
    }
    return anyValid ? total : undefined
  }

  function pctSafe(num: number | undefined, den: number | undefined): number | undefined {
    if (num === undefined || den === undefined || den === 0) return undefined
    return (num / den) * 100
  }

  // Compute all variables from a single row of raw ACS data (from censusClient.ts)
  function computeVars(row: Record<string, string | null>): Partial<Record<string, number>> {
    const result: Partial<Record<string, number>> = {}
    const val = (code: string) => parseRawValue(row[code])

    // Direct values
    const totalPop = val('B01003_001E')
    if (totalPop !== undefined) result.totalPopulation = totalPop
    const medIncome = val('B19013_001E')
    if (medIncome !== undefined) result.medianIncome = medIncome
    const medAge = val('B01002_001E')
    if (medAge !== undefined) result.medianAge = medAge
    const medRent = val('B25064_001E')
    if (medRent !== undefined) result.medianRent = medRent
    const medHome = val('B25077_001E')
    if (medHome !== undefined) result.medianHomeValue = medHome

    // Poverty rate (B17001)
    result.povertyRate = pctSafe(val('B17001_002E'), val('B17001_001E'))

    // Race/Ethnicity (B03002)
    const raceDenom = val('B03002_001E')
    result.pctWhite = pctSafe(val('B03002_003E'), raceDenom)
    result.pctBlack = pctSafe(val('B03002_004E'), raceDenom)
    result.pctAsian = pctSafe(val('B03002_006E'), raceDenom)
    result.pctHispanic = pctSafe(val('B03002_012E'), raceDenom)
    result.pctPacificIslander = pctSafe(val('B03002_007E'), raceDenom)
    result.pctMultiracial = pctSafe(val('B03002_009E'), raceDenom)
    result.pctOther = pctSafe(val('B03002_008E'), raceDenom)

    // Housing
    result.renterPct = pctSafe(val('B25003_003E'), val('B25003_001E'))
    const rentBurdenNum = sumRawVals(row, ['B25070_007E', 'B25070_008E', 'B25070_009E', 'B25070_010E'])
    result.rentBurden = pctSafe(rentBurdenNum, val('B25070_001E'))

    // Age (B01001)
    const ageDenom = val('B01001_001E')
    const under18Codes = ['B01001_003E','B01001_004E','B01001_005E','B01001_006E','B01001_027E','B01001_028E','B01001_029E','B01001_030E']
    const under18 = sumRawVals(row, under18Codes)
    result.pctUnder18 = pctSafe(under18, ageDenom)
    const over65Codes = ['B01001_020E','B01001_021E','B01001_022E','B01001_023E','B01001_024E','B01001_025E','B01001_044E','B01001_045E','B01001_046E','B01001_047E','B01001_048E','B01001_049E']
    const over65 = sumRawVals(row, over65Codes)
    result.pctOver65 = pctSafe(over65, ageDenom)
    if (result.pctUnder18 !== undefined && result.pctOver65 !== undefined) {
      result.pctWorkingAge = 100 - result.pctUnder18 - result.pctOver65
    }

    // Education (B15003)
    const eduDenom = val('B15003_001E')
    const noHsCodes = ['B15003_002E','B15003_003E','B15003_004E','B15003_005E','B15003_006E','B15003_007E','B15003_008E','B15003_009E','B15003_010E','B15003_011E','B15003_012E','B15003_013E','B15003_014E','B15003_015E','B15003_016E']
    result.pctNoHighSchool = pctSafe(sumRawVals(row, noHsCodes), eduDenom)
    const bachPlusCodes = ['B15003_022E','B15003_023E','B15003_024E','B15003_025E']
    result.pctBachelorsPlus = pctSafe(sumRawVals(row, bachPlusCodes), eduDenom)

    // Employment (B23025)
    result.unemploymentRate = pctSafe(val('B23025_005E'), val('B23025_003E'))

    // Commute (B08301)
    const commuteDenom = val('B08301_001E')
    result.pctDriveAlone = pctSafe(val('B08301_003E'), commuteDenom)
    result.pctTransit = pctSafe(val('B08301_010E'), commuteDenom)
    result.pctWFH = pctSafe(val('B08301_021E'), commuteDenom)
    result.pctBikeWalk = pctSafe(sumRawVals(row, ['B08301_018E','B08301_019E']), commuteDenom)

    // Language (B16001)
    const langDenom = val('B16001_001E')
    const lepCodes = ['B16001_005E','B16001_008E','B16001_011E','B16001_014E','B16001_017E','B16001_020E']
    result.lepRate = pctSafe(sumRawVals(row, lepCodes), langDenom)
    result.pctSpanish = pctSafe(val('B16001_003E'), langDenom)
    result.pctChinese = pctSafe(val('B16001_006E'), langDenom)
    result.pctVietnamese = pctSafe(val('B16001_009E'), langDenom)
    result.pctTagalog = pctSafe(val('B16001_012E'), langDenom)
    result.pctKorean = pctSafe(val('B16001_015E'), langDenom)
    result.pctRussian = pctSafe(val('B16001_018E'), langDenom)

    // Strip undefined
    for (const key of Object.keys(result)) {
      if ((result as any)[key] === undefined) delete (result as any)[key]
    }
    return result
  }

  // Convert raw rows to CensusData records
  const tracts: CensusData[] = []
  for (const [geoId, row] of tractRows) {
    const tractId = geoId.slice(-6) // last 6 chars = tract ID
    const computed = computeVars(row)
    tracts.push({
      geoId,
      geoType: 'tract',
      name: row['NAME'] || tractId,
      population: computed.totalPopulation ?? 0,
      ...computed,
    } as CensusData)
  }
  console.log(`Computed variables for ${tracts.length} tracts`)

  // Block groups — skip for now (heavy API load, tracts sufficient for neighborhood aggregation)
  return { tracts, blockGroups: [] }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const sampleOnly = args.includes('--sample-only') || !process.env.VITE_CENSUS_API_KEY

  mkdirSync(DATA_DIR, { recursive: true })

  if (sampleOnly) {
    console.log('Running in sample-only mode (no Census API key)')
    console.log('')

    // Generate neighborhoods from resonate sample data
    const neighborhoods = convertResonateSample()
    console.log(`Generated ${neighborhoods.length} neighborhoods from resonate sample data`)

    // Write files
    const nhPath = resolve(DATA_DIR, 'census-neighborhoods.json')
    writeFileSync(nhPath, JSON.stringify(neighborhoods, null, 2) + '\n')
    console.log(`  Wrote ${nhPath}`)

    const tractPath = resolve(DATA_DIR, 'census-tracts.json')
    writeFileSync(tractPath, '[]\n')
    console.log(`  Wrote ${tractPath} (empty — run with API key to populate)`)

    const bgPath = resolve(DATA_DIR, 'census-blockgroups.json')
    writeFileSync(bgPath, '[]\n')
    console.log(`  Wrote ${bgPath} (empty — run with API key to populate)`)
  } else {
    console.log('Running with Census API key')
    const apiKey = process.env.VITE_CENSUS_API_KEY!
    const { tracts, blockGroups } = await fetchCensusLive(apiKey)

    // Aggregate tracts to neighborhoods
    const neighborhoods = tracts.length > 0
      ? aggregateToNeighborhoods(tracts)
      : convertResonateSample()

    const nhPath = resolve(DATA_DIR, 'census-neighborhoods.json')
    writeFileSync(nhPath, JSON.stringify(neighborhoods, null, 2) + '\n')
    console.log(`  Wrote ${nhPath} (${neighborhoods.length} neighborhoods)`)

    const tractPath = resolve(DATA_DIR, 'census-tracts.json')
    writeFileSync(tractPath, JSON.stringify(tracts, null, 2) + '\n')
    console.log(`  Wrote ${tractPath} (${tracts.length} tracts)`)

    const bgPath = resolve(DATA_DIR, 'census-blockgroups.json')
    writeFileSync(bgPath, JSON.stringify(blockGroups, null, 2) + '\n')
    console.log(`  Wrote ${bgPath} (${blockGroups.length} block groups)`)
  }

  console.log('')
  console.log('Done!')
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
