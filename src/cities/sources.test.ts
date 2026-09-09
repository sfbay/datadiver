// src/cities/sources.test.ts
// Manifest `sources`/`staticSources`/`citable` ⇔ the code. A view that
// fetches an undeclared dataset, or declares one it never fetches, fails
// here — the same allow-list-drift class as omniDatasetKeys (spec §4.1).
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
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

/** Per-(city, view) entry FILE, for the case where one directory holds two
 *  different top-level components. `src/views/Home` is both San Francisco's
 *  Home (Home.tsx) and Oakland's landing page (CityLanding.tsx); HomeRouter
 *  picks by city, so seeding the scan from the directory would charge each
 *  city with the other's fetches. */
const CITY_VIEW_ENTRY: Record<string, string> = {
  'sf/home': 'src/views/Home/Home.tsx',
  'oakland/home': 'src/views/Home/CityLanding.tsx',
}

/** Cross-cutting hooks whose datasets belong to no single view. Generic data
 *  hooks whose dataset key arrives as a caller-supplied parameter (useDataset
 *  itself, and the factories/hooks built on it) live here too — their
 *  internal fetch sites are nobody's `sources`; the literal key lives at
 *  each view's OWN call site instead, which the scan still sees. */
const CROSS_CUTTING = [
  'useCivicIndicators', 'useOaklandIndicators', 'usePreloadCache', 'useFunderTypeahead', 'useVendorTypeahead', 'useOmniSearch',
  'useDataset', 'useDataFreshness', 'useTrendBaseline', 'useComparisonDataFactory', 'useHourlyPatternFactory',
  // Not a hook — the fetchDataset DEFINITION itself. useCivicMetrics.ts (and
  // others) import '../api/client' by a relative path, which IMPORT_RE
  // matches; now that collectScanSet walks transitively, an un-excluded
  // client.ts would enter every view's scan set and its own
  // `export async function fetchDataset<T>(datasetKey, …` signature would
  // read as an unresolved variable-key fetch site everywhere.
  'client',
]

/** fetchDataset sites whose key is a variable — resolved by hand. Keyed by
 *  path relative to the repo root. An unlisted variable-key site fails. */
const RESOLVED_KEYS: Record<string, readonly string[]> = {
  'src/hooks/useLast48Window.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
  'src/hooks/useAnomalyBaseline.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
  // Six of CIVIC_METRICS' seven. The seventh ("Avg Response Time",
  // fireEMSDispatch) carries isClientSide: true — useCivicMetrics.ts returns
  // before the fetch on that flag, and Demographics.tsx filters those metrics
  // out of the scatter picker — so it is never fetched here.
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
  // Home's pulse teaser card (Last48Pulse.tsx → useLast48Pulse.ts) mirrors
  // useLast48Window's STREAM_QUERY table — same three keys.
  'src/hooks/useLast48Pulse.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
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
 *  otherwise claim sources it never reads. NOTE: this filters the FETCHED
 *  side, so it can only ever hide a false positive — it cannot detect a real
 *  new fetch of these same keys landing unnoticed; whoever lifts the gate
 *  must remember to delete the row rather than wait on a test failure.
 *  `purposes` is the same idea for the `cite` tagged ⇔ declared block below:
 *  a purpose literal that appears in a shared view file for a reason that
 *  doesn't apply to this city gets subtracted there too, on the SAME row —
 *  one exception, one reason, covering both tests. */
const NOT_FETCHED_HERE: Record<string, { keys: readonly string[]; purposes?: readonly string[]; why: string }> = {
  'oakland/demographics': {
    keys: ['policeIncidents', 'cases311', 'parkingCitations'],
    purposes: ['civic-metric'],
    why: "The civic-metric scatter is withheld off SF, so useCivicMetrics never fires here even though Demographics.tsx and the hook are shared with San Francisco. The 'civic-metric' cite tag lives on that same shared useCivicMetric call in Demographics.tsx, so a file scan sees it here too even though the tagged query never runs on this city — hence `purposes` alongside `keys`. The plausible trigger for deleting this row is Oakland stage 5b (the per-region neighborhood profile, CLAUDE.md → Oakland expansion) — whoever builds it and genuinely wires these three keys (and the civic-metric axis) into an Oakland fetch path deletes this row.",
  },
}

function scanSet(cityId: string, viewId: ViewId) {
  const seed = CITY_VIEW_ENTRY[`${cityId}/${viewId}`] ?? VIEW_DIRS[viewId]
  return collectScanSet(join(ROOT, seed), { root: ROOT, allow: CROSS_CUTTING })
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

  // Staleness pin for OMNI_ROUTING_ONLY, checked independently of the
  // per-entry loop above (which only ever visits a key that's still IN
  // omniDatasetKeys — it can't notice a row whose key was REMOVED from
  // there, which would otherwise leave dead excuse-text nobody notices went
  // obsolete). A row must describe a divergence that's still real on both
  // sides: the key is still an actual omni route, AND it's still actually
  // absent from sources.
  it('OMNI_ROUTING_ONLY exceptions describe a real, current divergence', () => {
    for (const routingOnlyId of Object.keys(OMNI_ROUTING_ONLY)) {
      const [cityId, viewId, key] = routingOnlyId.split('/')
      const city = Object.values(CITIES).find((c) => c.id === cityId)
      const entry = city?.manifest.find((e) => e.viewId === viewId)
      expect(entry, `${routingOnlyId}: no such manifest entry`).toBeDefined()
      expect(entry!.omniDatasetKeys ?? [], `${routingOnlyId}: key is no longer an omni route — delete this row`).toContain(key)
      expect(entry!.sources ?? [], `${routingOnlyId}: key is now in sources too — delete this row`).not.toContain(key)
    }
  })
})

/** Staleness pins for the two hand-maintained exception tables above.
 *  OMNI_ROUTING_ONLY got one when it was written; these two did not, and an
 *  unpinned exception rots in the direction that HIDES things: a
 *  RESOLVED_KEYS row keeps a source declared but never read, and — because
 *  listing a file also suppresses that file's unresolved reporting — a NEW
 *  variable-key fetch inside a listed file is invisible. */
describe('exception tables — still describing a real, current exception', () => {
  it('every RESOLVED_KEYS row names a live file, a live variable-key site, and live registry keys', () => {
    const registryKeys = [...new Set(Object.values(CITIES).flatMap((c) => Object.keys(c.datasets)))]
    for (const [file, resolvedKeys] of Object.entries(RESOLVED_KEYS)) {
      expect(existsSync(join(ROOT, file)), `${file}: no such file — delete or repoint this row`).toBe(true)
      // Scanned with an EMPTY resolved map so the file reports its own
      // variable-key sites: with the real map it lists itself and reports
      // none, which is exactly the blindness this pin is about.
      const { unresolved } = scanFetchedKeys([{ file, text: readFileSync(join(ROOT, file), 'utf8') }], {})
      expect(unresolved.length, `${file}: every fetch here names its key literally now — delete this row`).toBeGreaterThan(0)
      for (const key of resolvedKeys) {
        expect(registryKeys, `${file}: '${key}' is no longer a dataset key in any city`).toContain(key)
      }
    }
  })

  it('every NOT_FETCHED_HERE row still subtracts something the scan would otherwise report', () => {
    for (const [rowId, row] of Object.entries(NOT_FETCHED_HERE)) {
      const [cityId, viewId] = rowId.split('/') as [string, ViewId]
      const city = Object.values(CITIES).find((c) => c.id === cityId)
      expect(city, `${rowId}: no such city`).toBeDefined()
      const entry = city!.manifest.find((e) => e.viewId === viewId)
      expect(entry, `${rowId}: no such manifest entry`).toBeDefined()
      const files = scanSet(cityId, viewId)
      const scanned = [...scanFetchedKeys(files, RESOLVED_KEYS).keys]
      for (const key of row.keys) {
        // Three ways the row could be dead, each a different kind of stale:
        // the key left this registry (the `k in city.datasets` filter
        // already drops it), the shared file stopped reaching it, or the
        // gate was lifted and the view now legitimately declares it — in
        // which case subtracting it would HIDE a real source.
        expect(city!.datasets[key], `${rowId}: '${key}' is not in this city's registry — the row subtracts nothing`).toBeDefined()
        expect(scanned, `${rowId}: '${key}' is no longer scanned as fetched here — delete it`).toContain(key)
        expect(entry!.sources ?? [], `${rowId}: '${key}' is DECLARED now — deleting the row is the fix`).not.toContain(key)
      }
      const own = files.filter((f) => f.file.startsWith(VIEW_DIRS[viewId]))
      const tagged = [...scanCitePurposes(own, QUERY_PURPOSES)]
      for (const purpose of row.purposes ?? []) {
        expect(tagged, `${rowId}: '${purpose}' is no longer tagged in this view's own files — delete it`).toContain(purpose)
        expect(entry!.citable ?? [], `${rowId}: '${purpose}' is DECLARED citable now — deleting the row is the fix`).not.toContain(purpose)
      }
    }
  })
})

describe('manifest sources — fetched ⇔ declared (per live view, per city)', () => {
  for (const city of Object.values(CITIES)) {
    for (const entry of liveManifest(city.manifest)) {
      it(`${city.id}/${entry.viewId}`, () => {
        const files = scanSet(city.id, entry.viewId)
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
        const own = scanSet(city.id, entry.viewId).filter((f) => f.file.startsWith(VIEW_DIRS[entry.viewId]))
        // A shared view file can carry a cite tag for a purpose this city's
        // runtime gate never exercises (see NOT_FETCHED_HERE's `purposes`) —
        // subtract those before comparing to what the manifest declares.
        const excludePurposes = new Set(NOT_FETCHED_HERE[`${city.id}/${entry.viewId}`]?.purposes ?? [])
        const tagged = [...scanCitePurposes(own, QUERY_PURPOSES)].filter((p) => !excludePurposes.has(p)).sort()
        expect(tagged).toEqual([...(entry.citable ?? [])].sort())
      })
    }
  }
})
