// src/cities/sources.test.ts
// Manifest `sources`/`staticSources`/`citable` ⇔ the code. A view that
// fetches an undeclared dataset, or declares one it never fetches, fails
// here — the same allow-list-drift class as omniDatasetKeys (spec §4.1).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CITIES } from './registry'
import { liveManifest, type ViewId } from './manifest'
import { NON_SOCRATA } from '@/lib/provenance/nonSocrata'
import { QUERY_PURPOSES } from '@/lib/provenance/purposes'
import { collectScanSet, scanFetchedKeys, scanCitePurposes } from './sourceScan'

const ROOT = process.cwd()

/** Where each view's own files live. A live entry with no row here fails. */
const VIEW_DIRS: Record<ViewId, string> = {
  home: 'src/views/Home', alerts: 'src/views/Alerts', live: 'src/views/Last48', pulse: 'src/views/Pulse',
  'emergency-response': 'src/views/EmergencyResponse', 'crime-incidents': 'src/views/CrimeIncidents',
  'traffic-safety': 'src/views/TrafficSafety', housing: 'src/views/Housing', elections: 'src/views/Elections',
  'city-budget': 'src/views/CityBudget', 'parking-revenue': 'src/views/ParkingRevenue',
  'dispatch-911': 'src/views/Dispatch911', '311-cases': 'src/views/Cases311',
  'parking-citations': 'src/views/ParkingCitations', 'business-activity': 'src/views/BusinessActivity',
  business: 'src/views/BusinessSearch', 'campaign-finance': 'src/views/CampaignFinance',
  demographics: 'src/views/Demographics', neighborhood: 'src/views/Neighborhood', about: 'src/views/About',
}

/** Cross-cutting hooks whose datasets belong to no single view. Generic data
 *  hooks whose dataset key arrives as a caller-supplied parameter (useDataset
 *  itself, and the factories/hooks built on it) live here too — their
 *  internal fetch sites are nobody's `sources`; the literal key lives at
 *  each view's OWN call site instead, which the scan still sees. */
const CROSS_CUTTING = [
  'useCivicIndicators', 'useOaklandIndicators', 'usePreloadCache', 'useFunderTypeahead', 'useVendorTypeahead', 'useOmniSearch',
  'useDataset', 'useDataFreshness', 'useTrendBaseline', 'useComparisonDataFactory', 'useHourlyPatternFactory',
]

/** fetchDataset sites whose key is a variable — resolved by hand. Keyed by
 *  path relative to the repo root. An unlisted variable-key site fails. */
const RESOLVED_KEYS: Record<string, readonly string[]> = {
  'src/hooks/useLast48Window.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
  'src/hooks/useAnomalyBaseline.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
  'src/hooks/useCivicMetrics.ts': ['policeIncidents', 'cases311', 'fireIncidents', 'trafficCrashes', 'parkingCitations', 'businessLocations'],
  // CampaignFinance's own hooks route through fppcBuildersFor(cityId), a
  // per-city query-builder table (src/views/CampaignFinance/fppcDialect.ts):
  // SF's builders always resolve to 'campaignFinance'; Oakland's resolve to
  // the four fppc* extracts, per-method (some Oakland methods return null —
  // no fetch fires; e.g. entityDonorGeo/ballotNumberLookup/ieQueries).
  'src/hooks/useCampaignDetail.ts': ['campaignFinance', 'fppcSchA', 'fppcSchE'],
  'src/hooks/useCampaignFinance.ts': ['campaignFinance', 'fppcSchA'],
  // Funder card is SF-only (Oakland's FunderBuilders is null, never invoked).
  'src/hooks/useFunderProfile.ts': ['campaignFinance'],
  // SF's late-filing builders are all `() => null` (no view-level late
  // section there); only Oakland fires these three.
  'src/hooks/useLateFilings.ts': ['fppc496', 'fppc497', 'fppcSchE'],
  // Add rows here as the scan reports `unresolved` sites; never widen the regex.
}

/** Datasets a view ROUTES to from ⌘K but never fetches. `omniDatasetKeys` is
 *  a routing table (where a dataset search lands); `sources` is a fetching
 *  table. They usually coincide; where they do not, the reason is authored
 *  here, so a NEW divergence still fails this test. */
const OMNI_ROUTING_ONLY: Record<string, string> = {
  'sf/dispatch-911/dispatch911Realtime':
    'The realtime 911 feed has no view of its own, so ⌘K lands a searcher on the 911 Dispatch view, which charts the historical extract. The route is pinned by useOmniSearch.test.ts.',
}

/** Registry keys a SHARED view component can reach in one city but not
 *  another, where the gate is a runtime condition no file scan can see.
 *  Delete a row the day its gate is lifted — until then the view would
 *  otherwise claim sources it never reads. */
const NOT_FETCHED_HERE: Record<string, { keys: readonly string[]; why: string }> = {
  'oakland/demographics': {
    keys: ['policeIncidents', 'cases311', 'parkingCitations'],
    why: 'The civic-metric scatter is withheld off SF, so useCivicMetrics never fires here even though Demographics.tsx and the hook are shared with San Francisco.',
  },
}

function scanSet(viewId: ViewId) {
  return collectScanSet(join(ROOT, VIEW_DIRS[viewId]), { root: ROOT, allow: CROSS_CUTTING })
    .map((file) => ({ file: file.slice(ROOT.length + 1), text: readFileSync(file, 'utf8') }))
}

describe('manifest sources — membership', () => {
  for (const city of Object.values(CITIES)) {
    for (const entry of city.manifest) {
      it(`${city.id}/${entry.viewId}: sources resolve, static ids exist, omni ⊆ sources, era ⊆ sources, citable ⊆ purposes`, () => {
        for (const key of entry.sources ?? []) expect(city.datasets[key], key).toBeDefined()
        for (const id of entry.staticSources ?? []) {
          expect(NON_SOCRATA[id], id).toBeDefined()
          expect(NON_SOCRATA[id].cities, `${id} lists ${city.id}`).toContain(city.id)
        }
        for (const key of entry.omniDatasetKeys ?? []) {
          if (OMNI_ROUTING_ONLY[`${city.id}/${entry.viewId}/${key}`]) continue
          expect(entry.sources ?? [], `omni ${key}`).toContain(key)
        }
        if (entry.eraSource) {
          expect(entry.sources ?? []).toContain(entry.eraSource.datasetKey)
          if (entry.eraSource.historical) expect(entry.sources ?? []).toContain(entry.eraSource.historical.datasetKey)
        }
        for (const p of entry.citable ?? []) expect(QUERY_PURPOSES as readonly string[]).toContain(p)
      })
    }
  }
})

describe('manifest sources — fetched ⇔ declared (per live view, per city)', () => {
  for (const city of Object.values(CITIES)) {
    for (const entry of liveManifest(city.manifest)) {
      it(`${city.id}/${entry.viewId}`, () => {
        const files = scanSet(entry.viewId)
        const { keys, unresolved } = scanFetchedKeys(files, RESOLVED_KEYS)
        expect(unresolved, 'variable-key fetchDataset sites need a RESOLVED_KEYS row').toEqual([])
        // Only keys this city's registry knows are this city's concern (a
        // shared component may fetch a key the other city lacks). A shared
        // component may also reach a key that DOES exist in this city's
        // registry but is never fetched here because a runtime gate (not
        // visible to a file scan) turns that fetch off — NOT_FETCHED_HERE.
        const exclude = new Set(NOT_FETCHED_HERE[`${city.id}/${entry.viewId}`]?.keys ?? [])
        const fetched = [...keys].filter((k) => k in city.datasets && !exclude.has(k)).sort()
        expect(fetched).toEqual([...(entry.sources ?? [])].sort())
      })
    }
  }
})

describe('manifest citable — tagged ⇔ declared (view files only)', () => {
  for (const city of Object.values(CITIES)) {
    for (const entry of liveManifest(city.manifest)) {
      it(`${city.id}/${entry.viewId}`, () => {
        const own = scanSet(entry.viewId).filter((f) => f.file.startsWith(VIEW_DIRS[entry.viewId]))
        const tagged = [...scanCitePurposes(own, QUERY_PURPOSES)].sort()
        expect(tagged).toEqual([...(entry.citable ?? [])].sort())
      })
    }
  }
})
