// src/lib/trees/types.ts
import type { EquityCorrelations, EquityFlag } from './equity'

/** Columnar. One entry per inventory row (a SITE), mapped or not. */
export interface TreesSnapshot {
  asOf: string                 // 'YYYY-MM-DD', SF-local run date
  dataAsOf: string             // max(data_as_of) of the inventory
  species: string[]            // published strings verbatim; index = `sp`
  neighborhoods: string[]      // index = `nb`
  id: number[]
  /** round((longitude + 123) * 1e5); -1 = no coordinates published */
  x: number[]
  /** round((latitude - 37) * 1e5); -1 = no coordinates published */
  y: number[]
  sp: number[]                 // species index; -1 = NULL in the source
  kind: number[]               // 0 tree · 1 stump · 2 empty site · 3 shrub
  cls: number[]                // TRUNK_CLASSES index: 0 small · 1 medium · 2 large · 3 unmeasured
  yr: number[]                 // planting year; 0 = not recorded
  nb: number[]                 // neighborhood index; -1 = none
  nt: number[]                 // removal notices posted at this site
  fl: number[]                 // fall reports within 30 m, 2021–asOf, city duplicates out
}

export interface SpeciesAggregate {
  name: string                 // verbatim published string (the ranking key and ?species= value)
  latin: string | null
  common: string | null
  count: number
  rank: number                 // 1-based; ties share the lower rank
  trunk: [number, number, number, number]   // by TRUNK_CLASSES index
  plantedRecorded: number
  plantedYears: [number, number] | null     // min, max recorded planting year
  topNeighborhoods: [string, number][]      // up to 5
}

export interface NeighborhoodAggregate {
  name: string
  trees: number
  stumps: number
  largeTrunks: number
  population: number
  areaKm2: number
  medianIncome: number
  povertyRate: number
  perK: number
  perKm2: number
  flag: EquityFlag
  /** Placed, non-duplicate fall reports by year: [year, fallen, aboutToFall]. */
  falls: [number, number, number][]
}

export interface FallYear {
  year: number
  fallen: number               // non-duplicate
  aboutToFall: number          // non-duplicate
  duplicates: number           // closed by the city as duplicates (excluded above)
  unplaced: number             // of the non-duplicates, at 0,0 or outside SF
  partial: boolean             // the run's own year
}

export interface TreesAggregates {
  asOf: string
  dataAsOf: string
  totals: {
    rows: number; trees: number; stumps: number; emptySites: number; shrubs: number
    unmapped: number; speciesNotRecorded: number; distinctSpecies: number
    topFive: number; topFiveShare: number   // share of trees with a recorded species, 1 decimal, percent
    largeTrunks: number; unmeasuredTrunks: number; plantedRecorded: number
  }
  species: SpeciesAggregate[]  // recorded species only, by count desc
  neighborhoods: NeighborhoodAggregate[]
  equity: EquityCorrelations
  falls: { years: FallYear[]; busiestDay: { ymd: string; reports: number } }
  notices: {
    rows: number; sites: number; listed: number; absent: number; replantedAfter: number
    unjoinable: number
    byType: [string, number][]
    byYear: [number, number][]
  }
}

export interface DisappearedRun {
  from: string; to: string
  gone: number[]                                   // site ids present at `from`, absent at `to`
  changed: { id: number; was: string; now: string }[]  // same site, different species string
}
export interface DisappearedLog { trackingSince: string; runs: DisappearedRun[] }
