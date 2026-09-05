# Source Pill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every map view carries a credit pill beside the Mapbox wordmark that opens a panel with the publisher, the dataset's official title/ID, freshness, license, the exact queries behind the screen, publisher-file downloads, and a name-free citation — all generated from ONE authored registry, with drift tests.

**Architecture:** (1) The dataset registry gains a required `publisher` (+ Oakland `completeness`) and a new `NON_SOCRATA` leaf holds every non-portal source; both manifests declare `sources`/`staticSources`/`citable` and a node test pins declared ⇔ fetched ⇔ tagged. (2) `fetchDataset` gains an opt-in `cite` tag; tagged responses land in a purpose-keyed external store (`citations.ts`), never last-write-wins. (3) `MapView` mounts `SourcePill` when the route's manifest entry declares sources; the panel is pure-function prose (`sourceLine.ts`) over registry + records + live portal metadata. About's tables are generated from the same registry.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind v4, Zustand (untouched), Mapbox GL v3, Socrata SODA, Vitest (node). Python 3 + shapely for the boundary re-vendor.

**Spec:** `docs/superpowers/specs/2026-09-03-source-pill-design.md` (commit `0391e4d`). Research maps: `/private/tmp/claude-505/-Users-faculty-m-dev-datadiver/2d86fdc2-2178-4100-a1bd-ac496507fec3/scratchpad/d-map/*.md` (may be gone after the session; the spec carries every fact the plan needs).

## Global Constraints

- **Branch `feat/source-pill`.** Commit per task. Commit trailers: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_0156J7N7DNx98W5t754BB6Eh`.
- **Never run `pnpm dev` from a shell** — Tarmac owns dev servers. Builds: `~/dev/devman/tools/devman-build.mjs pnpm build`. Tests: `pnpm test` (Vitest, `environment: 'node'`; `src/**/*.test.ts` only — `.tsx` tests do not run). `tsc -b` type-checks every `src/**/*.test.ts`.
- **`md:` is banned — write `desk:`.** Micro type via `text-nano` / `text-micro` / `text-label`, never `text-[9px]`-style literals. No corner glow on pills, panels, popovers (Tier 3). Mono is for labels; prose meant to be read is body serif.
- **Copy rules:** the word "Live" never appears in any generated source string. Never fabricate absence — omit a line rather than invent it. A capped sample says so ("newest 5,000 of 12,438 rows"). AP dates via `apMonthDay`/`apDate`; `formatDate()` from `src/utils/time.ts` is NEVER used on a date-only string.
- **The citable URL is exactly `resolveQuery().url` — token-free.** No generated URL may contain `$$app_token`. No download link may use `/api/geospatial/<id>?method=export` (dead endpoint).
- **The manifest leaf (`src/cities/manifest.ts`) stays a pure data leaf:** `import type` only.
- **Corrections log is append-only**; the new entry must satisfy `corrections.test.ts` (`\bnow\b` in `change`, `/live/` in `window`, a digit and >80 chars in `before`, id prefixed by date, newest first).
- **`VITE_CENSUS_API_KEY` stays unset. Never run `scripts/generate-census-static.ts` on the SF path.** Task 12 edits a URL constant in that script but does not run it.
- **Every reader-facing figure must be true on the built page** — walk the page before calling a visual task done.

---

## File map

| Path | Responsibility |
|---|---|
| `src/lib/provenance/purposes.ts` (new, zero-import) | `QUERY_PURPOSES`, `QueryPurpose`, `PURPOSE_LABEL`, `isQueryPurpose` |
| `src/lib/provenance/nonSocrata.ts` (new, type-import only) | `NonSocrataId`, `NonSocrataSource`, `NON_SOCRATA`, `nonSocrataFor(cityId)` |
| `src/lib/provenance/citations.ts` (new) | `CitableQuery`, recorder store, `recordCitation`, `clearCitationScope`, `useCitableQueries`, `useCitationScope` |
| `src/lib/provenance/portalMeta.ts` (new) | live `/api/views/<id>.json` read: `parsePortalMeta`, `fetchPortalMeta`, `usePortalMeta` |
| `src/lib/provenance/downloads.ts` (new, zero-import) | `csvUrl`, `fullCsvUrl`, `geojsonUrl`, `portalPageUrl` |
| `src/lib/provenance/sourceLine.ts` (new) | pure prose: `SourceSummary`, `summarizeSources`, `pillFace`, `throughLine`, `citationLines`, `queryClause` |
| `src/utils/apDate.ts` (new) | `apDate` lifted from `oaklandIndicators.ts` |
| `src/cities/sourceScan.ts` (new, TEST-ONLY, node:fs) | `collectScanSet`, `scanFetchedKeys`, `scanCitePurposes` |
| `src/cities/sources.test.ts` (new) | membership + fetched⇔declared + tagged⇔declared pins |
| `src/cities/types.ts`, `src/cities/sf/datasets.ts`, `src/cities/oakland/datasets.ts` | `publisher`, `completeness` |
| `src/cities/manifest.ts`, `src/cities/sf/manifest.ts`, `src/cities/oakland/manifest.ts` | `sources`, `staticSources`, `citable` |
| `src/api/client.ts` | `resolveQuery`, `CiteTag`, `cite` option, recorder call |
| `src/hooks/useDataset.ts`, `useDataFreshness.ts`, `useCivicMetrics.ts`, `useLast48Window.ts` | thread `cite` |
| `src/components/maps/SourcePill.tsx`, `SourcePanel.tsx` (new) | the pill + panel |
| `src/components/maps/MapView.tsx`, `src/components/export/ExportButton.tsx`, `src/components/ui/ChartTray.tsx`, `src/index.css` | mount, PNG exclusion, overlay yield, attribution restyle |
| `src/views/About/sourceRows.ts`, `sourceNotes.ts` (new), `About.tsx` | generated tables + anchors |
| 12 view files (Task 9) | `cite` tags |
| riders (Task 11), re-vendor (Task 12), docs (Task 13), final walk + PR (Task 14) | |

---

### Task 1: The source-scan helper (test-only, pure over strings)

**Files:**
- Create: `src/cities/sourceScan.ts`
- Test: `src/cities/sourceScan.test.ts`

**Interfaces:**
- Produces: `collectScanSet(viewDir: string, opts: { root: string; allow: readonly string[] }): string[]` (absolute file paths); `scanFetchedKeys(sources: { file: string; text: string }[], resolved: Record<string, readonly string[]>): { keys: Set<string>; unresolved: { file: string; line: number }[] }`; `scanCitePurposes(sources: { file: string; text: string }[], known: readonly string[]): Set<string>`. Consumed by Task 5's and Task 9's `sources.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// src/cities/sourceScan.test.ts
import { describe, it, expect } from 'vitest'
import { scanFetchedKeys, scanCitePurposes } from './sourceScan'

const multiline = `
  const a = useDataset<Row>(
    'fireEMSDispatch',
    { $limit: 5 },
  )
  const b = useDataset<{ count: string }>('cases311', {})
  const c = await fetchDataset<Foo>('trafficCrashes', params)
  const d = fetchDataset(registryKey as Parameters<typeof fetchDataset>[0], q)
`

describe('scanFetchedKeys', () => {
  it('collects literal keys across the multiline generic form and reports variable keys', () => {
    const { keys, unresolved } = scanFetchedKeys([{ file: 'x.ts', text: multiline }], {})
    expect([...keys].sort()).toEqual(['cases311', 'fireEMSDispatch', 'trafficCrashes'])
    expect(unresolved).toEqual([{ file: 'x.ts', line: 8 }])
  })
  it('a variable-key site listed in `resolved` contributes its keys and is not unresolved', () => {
    const { keys, unresolved } = scanFetchedKeys(
      [{ file: 'x.ts', text: multiline }],
      { 'x.ts': ['dispatch911Realtime'] },
    )
    expect(keys.has('dispatch911Realtime')).toBe(true)
    expect(unresolved).toEqual([])
  })
})

describe('scanCitePurposes', () => {
  it('collects every known purpose literal inside cite objects, ignoring viewIds and facets', () => {
    const text = `
      useDataset('k', p, [], { cite: { viewId: 'housing', purpose: 'map-sample' } })
      useDataFreshness('k', 'f', r, { cite: { viewId: 'housing', purpose: 'freshness', facet: 'with coordinates' } })
      useLast48Window({ datasets, cite: { viewId: 'live', sample: 'window-sample', count: 'window-count' } })
      const notACite = { purpose: 'ranking' }
    `
    const known = ['map-sample', 'freshness', 'window-sample', 'window-count', 'ranking']
    expect([...scanCitePurposes([{ file: 'x.ts', text }], known)].sort())
      .toEqual(['freshness', 'map-sample', 'window-count', 'window-sample'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/cities/sourceScan.test.ts`
Expected: FAIL — `Cannot find module './sourceScan'`.

- [ ] **Step 3: Write the helper**

```ts
// src/cities/sourceScan.ts
// TEST-ONLY. Imports node:fs — never import this from app code.
// Scans view source files for the dataset keys they fetch and the cite
// purposes they tag, so sources.test.ts can pin manifest ⇔ code.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'

const FETCH_RE = /\b(?:useDataset|fetchDataset)(?:<[^>]*>)?\(\s*('([A-Za-z0-9]+)'|[^'\s)])/g
const IMPORT_RE = /from\s+'((?:\.{1,2}\/|@\/(?:hooks|views|components)\/)[^']+)'/g
const CITE_RE = /cite:\s*\{([^}]*)\}/g

function listFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...listFiles(p))
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

function resolveImport(fromFile: string, spec: string, root: string): string | null {
  const base = spec.startsWith('@/') ? join(root, 'src', spec.slice(2)) : resolve(dirname(fromFile), spec)
  for (const cand of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    try { if (statSync(cand).isFile() && extname(cand)) return cand } catch { /* next */ }
  }
  return null
}

/** Every non-test .ts/.tsx under viewDir, plus every module those files
 *  import (one level) by a relative path or from @/hooks, @/views,
 *  @/components — minus the cross-cutting allow-list (basenames). */
export function collectScanSet(viewDir: string, opts: { root: string; allow: readonly string[] }): string[] {
  const own = listFiles(viewDir)
  const set = new Set(own)
  for (const file of own) {
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveImport(file, m[1], opts.root)
      if (target && !opts.allow.some((a) => target.endsWith(`/${a}.ts`) || target.endsWith(`/${a}.tsx`))) set.add(target)
    }
  }
  return [...set].sort()
}

export function scanFetchedKeys(
  sources: { file: string; text: string }[],
  resolved: Record<string, readonly string[]>,
): { keys: Set<string>; unresolved: { file: string; line: number }[] } {
  const keys = new Set<string>()
  const unresolved: { file: string; line: number }[] = []
  for (const { file, text } of sources) {
    for (const k of resolved[file] ?? []) keys.add(k)
    for (const m of text.matchAll(FETCH_RE)) {
      if (m[2]) keys.add(m[2])
      else if (!(file in resolved)) unresolved.push({ file, line: text.slice(0, m.index).split('\n').length })
    }
  }
  return { keys, unresolved }
}

export function scanCitePurposes(sources: { file: string; text: string }[], known: readonly string[]): Set<string> {
  const out = new Set<string>()
  const knownSet = new Set(known)
  for (const { text } of sources) {
    for (const m of text.matchAll(CITE_RE)) {
      for (const lit of m[1].matchAll(/'([a-z0-9-]+)'/g)) if (knownSet.has(lit[1])) out.add(lit[1])
    }
  }
  return out
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/cities/sourceScan.test.ts`
Expected: PASS (3 tests). If the `line` expectation is off by one, fix the test's number to the helper's 1-indexed count — the contract is "1-indexed line of the match".

- [ ] **Step 5: Commit**

```bash
git add src/cities/sourceScan.ts src/cities/sourceScan.test.ts
git commit -m "test(sources): scan helper — fetched keys + cite purposes from view sources"
```

---

### Task 2: Measure the Mapbox stack in a browser (numbers for Task 8)

**Files:**
- Modify: `docs/superpowers/specs/2026-09-03-source-pill-design.md` (append a "§14 results" block)

**Interfaces:**
- Produces: four constants Task 8 bakes: `PILL_LEFT_PX`, `PILL_BOTTOM_PX`, `CHARTTRAY_PB` (desk), and a yes/no on "html2canvas renders the Mapbox logo + 'i' into the PNG".

- [ ] **Step 1: Bring up the preview build**

Build: `~/dev/devman/tools/devman-build.mjs pnpm build`. Then start the preview through Tarmac (`get_overview` → `start_server` for `datadiver-preview`, port 4173). Never `pnpm dev`/`vite preview` from a shell.

- [ ] **Step 2: Measure with the Chrome tools**

Load tools with ONE ToolSearch (`tabs_context_mcp, navigate, computer, javascript_tool, resize_window, tabs_create_mcp`). `tabs_context_mcp` first; navigate in one turn, read in the next; foreground the tab and assert `document.hidden === false`. On `http://localhost:4173/crime-incidents` run (bare top-level await):

```js
const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); const m = document.querySelector('.mapboxgl-map').getBoundingClientRect(); return { left: r.left - m.left, bottomFromMapBottom: m.bottom - r.bottom, w: r.width, h: r.height } }
;({ hidden: document.hidden, scale: document.documentElement.dataset.typeScale,
   logo: box('.mapboxgl-ctrl-logo'), zoom: box('.mapboxgl-ctrl-group'), attrib: box('.mapboxgl-ctrl-attrib'),
   chartBar: box('.flex.flex-col-reverse > div:first-child') })
```

Repeat with `localStorage['dd-type-scale']='large'` then `'xl'` + reload, and with the theme toggled. Record `logo.left + logo.w + 8` → `PILL_LEFT_PX` (expected 106) and `logo.bottomFromMapBottom` → `PILL_BOTTOM_PX` (expected 10). `CHARTTRAY_PB` = the smallest Tailwind spacing whose px ≥ `logo.bottomFromMapBottom + logo.h + 6` (expected `pb-10` = 40).

- [ ] **Step 3: Check the PNG carries the credit**

Patch `HTMLCanvasElement.prototype.toBlob` to stash the composite on `window.__png` as a data URL, click the header Export button, render `window.__png` into an `<img>`, screenshot. Record whether the wordmark and the "i" are visible.

- [ ] **Step 4: Write the numbers down**

Append to the spec under `## 14. Plan Task 1 — measure first`:

```
### Results (measured YYYY-MM-DD, Chrome, 1440×900)
| scale | theme | logo left/bottom/w/h | zoom | attrib | PILL_LEFT_PX | PILL_BOTTOM_PX |
| default | light | … | … | … | 106 | 10 |
…
PNG: logo rendered = yes/no · "i" rendered = yes/no
```

If the browser is unreachable after the CLAUDE.md recovery ladder, write `derived, not measured` with the expected values and continue — Task 8 uses the expected values either way.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-03-source-pill-design.md
git commit -m "docs(spec): source pill — measured Mapbox stack geometry"
```

---

### Task 3: The two zero-import leaves — purposes + NON_SOCRATA

**Files:**
- Create: `src/lib/provenance/purposes.ts`, `src/lib/provenance/nonSocrata.ts`
- Test: `src/lib/provenance/purposes.test.ts`, `src/lib/provenance/nonSocrata.test.ts`

**Interfaces:**
- Produces: `QUERY_PURPOSES`, `type QueryPurpose`, `PURPOSE_LABEL`, `isQueryPurpose(s: string): s is QueryPurpose`; `type NonSocrataId`, `interface NonSocrataSource`, `NON_SOCRATA: Record<NonSocrataId, NonSocrataSource>`, `nonSocrataFor(cityId: CityId): NonSocrataSource[]`, `NON_SOCRATA_IDS`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/provenance/purposes.test.ts
import { describe, it, expect } from 'vitest'
import { QUERY_PURPOSES, PURPOSE_LABEL, isQueryPurpose } from './purposes'

describe('query purposes', () => {
  it('is the closed eleven-member vocabulary from spec §5.1', () => {
    expect([...QUERY_PURPOSES]).toEqual([
      'map-sample', 'scope-count', 'stat-totals', 'ranking', 'breakdown', 'histogram',
      'overlay', 'freshness', 'window-sample', 'window-count', 'civic-metric',
    ])
  })
  it('every purpose has a reader label that avoids jargon', () => {
    for (const p of QUERY_PURPOSES) {
      expect(PURPOSE_LABEL[p].length).toBeGreaterThan(3)
      expect(PURPOSE_LABEL[p]).not.toMatch(/soql|query|purpose/i)
    }
  })
  it('isQueryPurpose guards strings', () => {
    expect(isQueryPurpose('ranking')).toBe(true)
    expect(isQueryPurpose('trend')).toBe(false)
  })
})
```

```ts
// src/lib/provenance/nonSocrata.test.ts
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { NON_SOCRATA, NON_SOCRATA_IDS, nonSocrataFor } from './nonSocrata'

describe('NON_SOCRATA', () => {
  it('has the ten authored ids', () => {
    expect([...NON_SOCRATA_IDS].sort()).toEqual([
      'acs-2023-5yr', 'mapbox-basemap', 'oak-beats', 'oak-neighborhoods',
      'sf-analysis-neighborhoods', 'sf-cvr-20241105', 'sf-elections-results',
      'sf-precincts-2012', 'sf-precincts-2022', 'sf-tract-assignment',
    ])
  })
  it('every row carries publisher, title, vintage, upstream + landing URLs, and a city', () => {
    for (const row of Object.values(NON_SOCRATA)) {
      expect(row.publisher.short.length, row.id).toBeGreaterThan(0)
      expect(row.publisher.full.length, row.id).toBeGreaterThan(0)
      expect(row.title.length, row.id).toBeGreaterThan(0)
      expect(row.vintage.length, row.id).toBeGreaterThan(0)
      expect(row.upstreamUrl, row.id).toMatch(/^https:\/\//)
      expect(row.landingUrl, row.id).toMatch(/^https:\/\//)
      expect(row.cities.length, row.id).toBeGreaterThan(0)
    }
  })
  it('no URL uses the dead geospatial export endpoint', () => {
    for (const row of Object.values(NON_SOCRATA)) {
      expect(row.upstreamUrl).not.toMatch(/api\/geospatial/)
      expect(row.landingUrl).not.toMatch(/api\/geospatial/)
    }
  })
  it('served paths exist on disk', () => {
    for (const row of Object.values(NON_SOCRATA)) {
      if (!row.servedPath) continue
      expect(existsSync(`public${row.servedPath}`), `${row.id} → ${row.servedPath}`).toBe(true)
    }
  })
  it('the elections row lists exactly the reachable elections in index.json', () => {
    // index.json shape: { generated, elections: [{ date, dateCode, type, label, races }] }
    const idx = JSON.parse(readFileSync('public/data/elections/index.json', 'utf8')) as { elections: { dateCode: string }[] }
    const listed = idx.elections.map((e) => e.dateCode).sort()
    expect(NON_SOCRATA['sf-elections-results'].elections!.map((e) => e.dateCode).sort()).toEqual(listed)
  })
  it('nonSocrataFor filters by city', () => {
    expect(nonSocrataFor('oakland').map((r) => r.id).sort()).toEqual(['acs-2023-5yr', 'mapbox-basemap', 'oak-beats', 'oak-neighborhoods'])
    expect(nonSocrataFor('sf').map((r) => r.id)).toContain('sf-analysis-neighborhoods')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/lib/provenance`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `purposes.ts`**

```ts
// src/lib/provenance/purposes.ts
// ZERO-IMPORT LEAF. The closed vocabulary of citable query purposes
// (spec §5.1). Adding a member is a code change: it needs a reader label
// here, a manifest `citable` declaration on a view, and a `cite` tag at the
// call site — sources.test.ts pins all three together.
export const QUERY_PURPOSES = [
  'map-sample',     // the capped rows drawn on the map
  'scope-count',    // count(*) behind "N of M"
  'stat-totals',    // server-side aggregates on stat cards
  'ranking',        // GROUP BY area feeding the sidebar ranking / choropleth
  'breakdown',      // GROUP BY a category column feeding a sidebar list
  'histogram',      // bucketed distribution
  'overlay',        // a secondary layer (cameras, pavement, meter inventory, HIN)
  'freshness',      // MAX(dateField)
  'window-sample',  // The Last 48: the drawn 48h rows, per stream
  'window-count',   // The Last 48: the server count, per stream
  'civic-metric',   // Demographics: the SF civic scatter Y
] as const

export type QueryPurpose = (typeof QUERY_PURPOSES)[number]

export const PURPOSE_LABEL: Record<QueryPurpose, string> = {
  'map-sample': "What's drawn on the map",
  'scope-count': 'Rows in this scope',
  'stat-totals': 'Totals',
  ranking: 'Ranking',
  breakdown: 'Breakdown',
  histogram: 'Distribution',
  overlay: 'Overlay layer',
  freshness: 'Newest date',
  'window-sample': '48-hour window (drawn)',
  'window-count': '48-hour window (count)',
  'civic-metric': 'Civic metric',
}

export function isQueryPurpose(s: string): s is QueryPurpose {
  return (QUERY_PURPOSES as readonly string[]).includes(s)
}
```

- [ ] **Step 4: Write `nonSocrata.ts`**

```ts
// src/lib/provenance/nonSocrata.ts
// The authored table of every source DataDiver reads that is NOT a Socrata
// dataset in a city registry (spec §3.2). Type-import only — this module
// rides the entry bundle via the manifest.
import type { CityId } from '@/cities/routing'

export type NonSocrataId =
  | 'sf-analysis-neighborhoods' | 'sf-precincts-2012' | 'sf-precincts-2022'
  | 'sf-elections-results' | 'sf-cvr-20241105' | 'sf-tract-assignment'
  | 'acs-2023-5yr' | 'oak-beats' | 'oak-neighborhoods' | 'mapbox-basemap'

export interface NonSocrataElection {
  dateCode: string
  label: string
  sovUrl: string
  dsovUrl: string
  certifiedDrop: string
}

export interface NonSocrataSource {
  id: NonSocrataId
  cities: readonly CityId[]
  kind: 'boundary' | 'results' | 'ballots' | 'census' | 'crosswalk' | 'basemap'
  publisher: { short: string; full: string }
  title: string
  vintage: string
  upstreamUrl: string
  landingUrl: string
  license: { name: string; url?: string } | 'not stated'
  /** Same-origin file DataDiver serves (download link). */
  servedPath?: string
  generator?: string
  derivedLicense?: 'CC BY 4.0'
  /** Socrata 4×4 when the upstream is a portal layer (live metadata + /d/ link). */
  socrataId?: string
  socrataHost?: string
  elections?: readonly NonSocrataElection[]
}

const PDDL = { name: 'Open Data Commons Public Domain Dedication and License (PDDL)', url: 'http://opendatacommons.org/licenses/pddl/1.0/' }

export const NON_SOCRATA: Record<NonSocrataId, NonSocrataSource> = {
  'sf-analysis-neighborhoods': {
    id: 'sf-analysis-neighborhoods', cities: ['sf'], kind: 'boundary',
    publisher: { short: 'SF Planning', full: 'San Francisco Planning Department' },
    title: 'Analysis Neighborhoods', vintage: '2010 census tracts, dissolved to 41 neighborhoods',
    upstreamUrl: 'https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100',
    landingUrl: 'https://data.sfgov.org/d/j2bu-swwd',
    license: PDDL, servedPath: '/data/geo/sf-analysis-neighborhoods.geojson',
    generator: 'scripts/build-neighborhood-boundaries.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'j2bu-swwd', socrataHost: 'data.sfgov.org',
  },
  'sf-precincts-2012': {
    id: 'sf-precincts-2012', cities: ['sf'], kind: 'boundary',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Election Precincts - Historical, Defined 2012', vintage: 'precincts used through June 2022',
    upstreamUrl: 'https://data.sfgov.org/resource/bsfq-aeyw.geojson?$limit=1000',
    landingUrl: 'https://data.sfgov.org/d/bsfq-aeyw',
    license: PDDL, servedPath: '/data/elections/geo/prec-2012.geojson',
    generator: 'scripts/build-precinct-geometry.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'bsfq-aeyw', socrataHost: 'data.sfgov.org',
  },
  'sf-precincts-2022': {
    id: 'sf-precincts-2022', cities: ['sf'], kind: 'boundary',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Election Precincts - Current, Defined 2022', vintage: 'precincts used from November 2022',
    upstreamUrl: 'https://data.sfgov.org/resource/d6x4-hefw.geojson?$limit=1000',
    landingUrl: 'https://data.sfgov.org/d/d6x4-hefw',
    license: 'not stated', servedPath: '/data/elections/geo/prec-2022.geojson',
    generator: 'scripts/build-precinct-geometry.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'd6x4-hefw', socrataHost: 'data.sfgov.org',
  },
  'sf-elections-results': {
    id: 'sf-elections-results', cities: ['sf'], kind: 'results',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Statement of the Vote (certified results)', vintage: 'five elections, Nov. 2020 – Nov. 2024',
    upstreamUrl: 'https://sfelections.org/results/', landingUrl: 'https://sfelections.org/results/',
    license: 'not stated', servedPath: '/data/elections/index.json',
    generator: 'scripts/build-election-results.mjs', derivedLicense: 'CC BY 4.0',
    // The certification DROP date is not derivable from the election date —
    // authored here (the only other copy is the gitignored
    // data/elections-src/manifest.json). 2020 prefixes its finals with the date.
    elections: [
      { dateCode: '20201103', label: 'Nov. 3, 2020', sovUrl: 'https://www.sfelections.org/results/20201103/data/20201201/20201201_sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20201103/data/20201201/20201201_dsov.xlsx', certifiedDrop: '2020-12-01' },
      { dateCode: '20220607', label: 'June 7, 2022', sovUrl: 'https://www.sfelections.org/results/20220607/data/20220621/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20220607/data/20220621/dsov.xlsx', certifiedDrop: '2022-06-21' },
      { dateCode: '20221108', label: 'Nov. 8, 2022', sovUrl: 'https://www.sfelections.org/results/20221108/data/20221201/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20221108/data/20221201/dsov.xlsx', certifiedDrop: '2022-12-01' },
      { dateCode: '20240305', label: 'March 5, 2024', sovUrl: 'https://www.sfelections.org/results/20240305/data/20240322/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20240305/data/20240322/dsov.xlsx', certifiedDrop: '2024-03-22' },
      { dateCode: '20241105', label: 'Nov. 5, 2024', sovUrl: 'https://www.sfelections.org/results/20241105/data/20241203/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20241105/data/20241203/dsov.xlsx', certifiedDrop: '2024-12-03' },
    ],
  },
  'sf-cvr-20241105': {
    id: 'sf-cvr-20241105', cities: ['sf'], kind: 'ballots',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Cast Vote Record, November 5, 2024', vintage: 'Nov. 5, 2024 (certified)',
    // Byte-identical to scripts/fetch-cvr-sources.mjs CVR_SOURCES['20241105'].zip
    upstreamUrl: 'https://www.sfelections.org/results/20241105/data/20241203/CVR_Export_20241202143051.zip',
    landingUrl: 'https://sfelections.org/results/20241105w/detail.html',
    license: 'not stated', servedPath: '/data/elections/results/20241105/cvr/_manifest.json',
    generator: 'scripts/build-cvr-ballots.ts', derivedLicense: 'CC BY 4.0',
  },
  'sf-tract-assignment': {
    id: 'sf-tract-assignment', cities: ['sf'], kind: 'crosswalk',
    publisher: { short: 'SF Planning', full: 'San Francisco Planning Department' },
    title: 'Analysis Neighborhoods - 2020 census tracts assigned to neighborhoods', vintage: '2020 census tracts',
    upstreamUrl: 'https://data.sfgov.org/resource/sevw-6tgi.json?$limit=1000',
    landingUrl: 'https://data.sfgov.org/d/sevw-6tgi',
    license: PDDL, generator: 'scripts/patch-renter-households.py',
    socrataId: 'sevw-6tgi', socrataHost: 'data.sfgov.org',
  },
  'acs-2023-5yr': {
    id: 'acs-2023-5yr', cities: ['sf', 'oakland'], kind: 'census',
    publisher: { short: 'U.S. Census Bureau', full: 'U.S. Census Bureau' },
    title: 'American Community Survey 5-Year Estimates', vintage: 'ACS 2019–2023 5-year estimates',
    upstreamUrl: 'https://api.census.gov/data/2023/acs/acs5',
    landingUrl: 'https://www.census.gov/programs-surveys/acs/',
    license: { name: 'Public domain (U.S. federal government work)', url: 'https://www.census.gov/data/developers/about/terms-of-service.html' },
    generator: 'scripts/generate-census-static.ts', derivedLicense: 'CC BY 4.0',
  },
  'oak-beats': {
    id: 'oak-beats', cities: ['oakland'], kind: 'boundary',
    publisher: { short: 'OPD', full: 'Oakland Police Department' },
    title: 'Police Beats', vintage: '59 beats, layer updated July 2024',
    upstreamUrl: 'https://data.oaklandca.gov/resource/78s7-673i.geojson?$limit=100',
    landingUrl: 'https://data.oaklandca.gov/d/78s7-673i',
    license: 'not stated', servedPath: '/data/geo/oakland-beats.geojson',
    generator: 'scripts/build-oakland-beats.py', derivedLicense: 'CC BY 4.0',
    socrataId: '78s7-673i', socrataHost: 'data.oaklandca.gov',
  },
  'oak-neighborhoods': {
    id: 'oak-neighborhoods', cities: ['oakland'], kind: 'boundary',
    publisher: { short: 'City of Oakland', full: 'City of Oakland' },
    title: 'Neighborhoods (131 polygons, dissolved to 10 regions)', vintage: 'layer updated July 2024',
    upstreamUrl: 'https://data.oaklandca.gov/resource/sb4q-6bkc.geojson?$limit=200',
    landingUrl: 'https://data.oaklandca.gov/d/sb4q-6bkc',
    license: 'not stated', servedPath: '/data/geo/oakland-regions.geojson',
    generator: 'scripts/build-oakland-regions.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'sb4q-6bkc', socrataHost: 'data.oaklandca.gov',
  },
  'mapbox-basemap': {
    id: 'mapbox-basemap', cities: ['sf', 'oakland'], kind: 'basemap',
    publisher: { short: 'Mapbox · OpenStreetMap', full: 'Mapbox and OpenStreetMap contributors' },
    title: 'Basemap (Mapbox Light / Dark v11)', vintage: 'live tiles',
    upstreamUrl: 'https://www.mapbox.com/about/maps/', landingUrl: 'https://www.openstreetmap.org/copyright',
    license: { name: 'Mapbox Terms of Service; OpenStreetMap data under ODbL', url: 'https://www.openstreetmap.org/copyright' },
  },
}

export const NON_SOCRATA_IDS = Object.keys(NON_SOCRATA) as NonSocrataId[]

export function nonSocrataFor(cityId: CityId): NonSocrataSource[] {
  return NON_SOCRATA_IDS.map((id) => NON_SOCRATA[id]).filter((r) => r.cities.includes(cityId))
}
```

Add to the test file one more pin so the authored URLs cannot rot silently: `for (const e of NON_SOCRATA['sf-elections-results'].elections!) { expect(e.sovUrl).toMatch(/sov\.xlsx$/); expect(e.dsovUrl).toMatch(/dsov\.xlsx$/); expect(e.certifiedDrop).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(e.sovUrl).toContain(`/results/${e.dateCode}/data/${e.certifiedDrop.replace(/-/g, '')}/`) }` and `expect(NON_SOCRATA['sf-cvr-20241105'].upstreamUrl).toBe(CVR_SOURCES['20241105'].zip)` with `import { CVR_SOURCES } from '../../../scripts/fetch-cvr-sources.mjs'` (the script exports it; if the `.mjs` import fails under Vitest, read the file with `readFileSync` and `toContain` the URL instead).

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run src/lib/provenance`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/provenance/purposes.ts src/lib/provenance/purposes.test.ts src/lib/provenance/nonSocrata.ts src/lib/provenance/nonSocrata.test.ts
git commit -m "feat(provenance): closed query-purpose vocabulary + the NON_SOCRATA source table"
```

---

### Task 4: Registry `publisher` + `completeness`; ticker edges derive from the registry

**Files:**
- Modify: `src/cities/types.ts:5-20`, `src/cities/sf/datasets.ts` (23 entries), `src/cities/oakland/datasets.ts` (19 entries), `src/views/Home/oaklandIndicators.ts:28-34`
- Test: `src/cities/registry.test.ts`

**Interfaces:**
- Produces: `DatasetConfig.publisher: { short: string; full: string }` (required), `DatasetConfig.completeness?: { edgeDays: number }`. `OAK_TICKER_EDGES` keeps its exported shape and values.

- [ ] **Step 1: Write the failing test** — append to `src/cities/registry.test.ts` inside `describe('city registry')`:

```ts
  it('every entry in BOTH cities names its publisher (short + full)', () => {
    for (const city of Object.values(CITIES)) {
      for (const [key, cfg] of Object.entries(city.datasets)) {
        expect(cfg.publisher?.short.length, `${city.id}/${key}`).toBeGreaterThan(0)
        expect(cfg.publisher?.full.length, `${city.id}/${key}`).toBeGreaterThan(0)
        expect(cfg.publisher?.full, `${city.id}/${key}`).not.toMatch(/TransBASE/)
      }
    }
  })
  it('completeness edges exist on exactly the three measured Oakland streams', () => {
    const withEdge = Object.entries(CITIES.oakland.datasets).filter(([, c]) => c.completeness).map(([k, c]) => `${k}:${c.completeness!.edgeDays}`)
    expect(withEdge.sort()).toEqual(['cases311:1', 'parkingCitations:1', 'policeIncidents:8'])
    expect(Object.values(CITIES.sf.datasets).some((c) => c.completeness)).toBe(false)
  })
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/cities/registry.test.ts`
Expected: FAIL on `publisher` undefined.

- [ ] **Step 3: Extend the type** in `src/cities/types.ts` after `ext?: 'geojson'`:

```ts
  /** Who publishes this dataset. `short` is the house form used on chips and
   *  eyebrows; `full` is the legal name used in citations and the About table.
   *  Authored — Socrata `attribution` is null on 20 of 52 ids and inconsistent
   *  where present (probe 2026-09-03; spec §3.1). */
  publisher: { short: string; full: string }
  /** Oakland only: the measured completeness edge in days (the ticker's
   *  OAK_TICKER_EDGES, authored here and derived there). A stream without an
   *  edge omits the field and the source line omits "complete through". */
  completeness?: { edgeDays: number }
```

- [ ] **Step 4: Author the 42 publishers.** Add `publisher: { … }` after `description` on every entry. SF (`src/cities/sf/datasets.ts`):

| keys | value |
|---|---|
| fireIncidents, fireEMSDispatch | `{ short: 'SFFD', full: 'San Francisco Fire Department' }` |
| policeIncidents, policeIncidentsHistorical | `{ short: 'SFPD', full: 'San Francisco Police Department' }` |
| dispatch911Realtime, dispatch911Historical | `{ short: 'SF DEM', full: 'San Francisco Department of Emergency Management' }` |
| parkingRevenue, parkingMeters, parkingCitations, speedCameras, redLightCameras | `{ short: 'SFMTA', full: 'San Francisco Municipal Transportation Agency' }` |
| cases311 | `{ short: 'SF 311', full: 'San Francisco 311' }` |
| trafficCrashes | `{ short: 'SFDPH/SFPD', full: 'San Francisco Department of Public Health and San Francisco Police Department' }` |
| highInjuryNetwork | `{ short: 'SFDPH', full: 'San Francisco Department of Public Health (Vision Zero)' }` |
| pavementCondition | `{ short: 'SF Public Works', full: 'San Francisco Public Works' }` |
| businessLocations | `{ short: 'SF Treasurer & Tax Collector', full: 'Office of the Treasurer & Tax Collector, City and County of San Francisco' }` |
| campaignFinance | `{ short: 'SF Ethics Commission', full: 'San Francisco Ethics Commission' }` |
| budget, spendingRevenue, vendorPayments, supplierContracts | `{ short: 'SF Controller', full: 'Office of the Controller, City and County of San Francisco' }` |
| evictionNotices, buyoutAgreements | `{ short: 'SF Rent Board', full: 'San Francisco Residential Rent Stabilization and Arbitration Board' }` |

Oakland (`src/cities/oakland/datasets.ts`): policeIncidents `{ short: 'OPD', full: 'Oakland Police Department' }` + `completeness: { edgeDays: 8 }`; cases311 `{ short: 'OAK 311', full: 'City of Oakland Public Works and Department of Transportation (OAK 311)' }` + `completeness: { edgeDays: 1 }`; parkingCitations `{ short: 'OakDOT', full: 'City of Oakland Department of Transportation' }` + `completeness: { edgeDays: 1 }`; all sixteen `fppc*` entries `{ short: 'Oakland PEC', full: 'City of Oakland Public Ethics Commission' }`. Define `const PEC = { short: 'Oakland PEC', full: 'City of Oakland Public Ethics Commission' }` at the top of the file and reference it.

Also correct three comments in `sf/datasets.ts`: `wr8u-xric` "updated continuously" → `updated daily`; `ab4h-6ztd` "updates infrequently" → `updated daily (per the portal)`; `enwt-3u8m` "updated annually" → `not updated (historical only)`. Values of `cacheTTL` unchanged.

- [ ] **Step 5: Derive the ticker edges.** In `src/views/Home/oaklandIndicators.ts` replace the literal block at lines 28–34 with:

```ts
import { CITIES } from '@/cities/registry'

const oakEdge = (key: string) => CITIES.oakland.datasets[key].completeness!.edgeDays

export const OAK_TICKER_EDGES = {
  crimeEdgeDays: oakEdge('policeIncidents'),
  crimeSuppressMaxAgeDays: 14,
  threeOneOneEdgeDays: oakEdge('cases311'),
  threeOneOneSuppressMaxAgeDays: 3,
  citationsEdgeDays: oakEdge('parkingCitations'),
} as const
```

(`oaklandIndicators.test.ts` pins the values 8/1/1 — it must stay green; the comment block above the constant stays, with one added line: "Edges are authored on the registry entries (`completeness.edgeDays`); this constant derives them.")

- [ ] **Step 6: Run the suite + typecheck**

Run: `pnpm vitest run src/cities src/views/Home/oaklandIndicators.test.ts && npx tsc -b`
Expected: PASS; tsc clean (a missing `publisher` on any entry is a type error).

- [ ] **Step 7: Commit**

```bash
git add src/cities/types.ts src/cities/sf/datasets.ts src/cities/oakland/datasets.ts src/cities/registry.test.ts src/views/Home/oaklandIndicators.ts
git commit -m "feat(registry): authored publisher on all 42 datasets; Oakland completeness edges on the registry"
```

---

### Task 5: Manifest `sources` / `staticSources` + the fetched ⇔ declared test

**Files:**
- Modify: `src/cities/manifest.ts:60-88`, `src/cities/sf/manifest.ts`, `src/cities/oakland/manifest.ts`
- Create: `src/cities/sources.test.ts`

**Interfaces:**
- Consumes: Task 1 (`collectScanSet`, `scanFetchedKeys`), Task 3 (`NonSocrataId`, `NON_SOCRATA`).
- Produces: `ViewManifestEntry.sources?: readonly string[]`, `staticSources?: readonly NonSocrataId[]`, `citable?: readonly QueryPurpose[]` (declared now, populated in Task 9).

- [ ] **Step 1: Add the fields** to `ViewManifestEntry` in `src/cities/manifest.ts` (after `omniDatasetKeys`), with type-only imports at the top:

```ts
import type { NonSocrataId } from '@/lib/provenance/nonSocrata'
import type { QueryPurpose } from '@/lib/provenance/purposes'
```
```ts
  /** Registry keys this view FETCHES — every useDataset/fetchDataset key in
   *  its own files and the hooks it imports, cross-cutting hooks excluded
   *  (sources.test.ts pins declared ⇔ fetched). Superset of omniDatasetKeys
   *  and of eraSource's keys. */
  sources?: readonly string[]
  /** Non-Socrata sources the view paints or reads (NON_SOCRATA ids). */
  staticSources?: readonly NonSocrataId[]
  /** Query purposes the view registers for the source panel, in display
   *  order. Every member must be tagged (`cite: { purpose }`) in the view's
   *  OWN files and every tag declared here — sources.test.ts pins both ways.
   *  Absent = the panel lists sources with no query block. */
  citable?: readonly QueryPurpose[]
```

- [ ] **Step 2: Write the failing test**

```ts
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

/** Cross-cutting hooks whose datasets belong to no single view. */
const CROSS_CUTTING = ['useCivicIndicators', 'useOaklandIndicators', 'usePreloadCache', 'useFunderTypeahead', 'useVendorTypeahead', 'useOmniSearch']

/** fetchDataset sites whose key is a variable — resolved by hand. Keyed by
 *  path relative to the repo root. An unlisted variable-key site fails. */
const RESOLVED_KEYS: Record<string, readonly string[]> = {
  'src/hooks/useLast48Window.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
  'src/hooks/useAnomalyBaseline.ts': ['dispatch911Realtime', 'fireEMSDispatch', 'cases311'],
  'src/hooks/useCivicMetrics.ts': ['policeIncidents', 'cases311', 'fireIncidents', 'trafficCrashes', 'parkingCitations', 'businessLocations'],
  // Add rows here as the scan reports `unresolved` sites; never widen the regex.
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
        for (const key of entry.omniDatasetKeys ?? []) expect(entry.sources ?? [], `omni ${key}`).toContain(key)
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
        // shared component may fetch a key the other city lacks).
        const fetched = [...keys].filter((k) => k in city.datasets).sort()
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
```

- [ ] **Step 3: Run it and READ the failures** — `pnpm vitest run src/cities/sources.test.ts`. The `fetched ⇔ declared` block prints, per view, the real fetched set. That output is the authority for Step 4: transcribe it into the manifests (do not transcribe the spec's table blindly — the spec says the scan corrects it). The `tagged ⇔ declared` block passes trivially now (no tags, no `citable`).

- [ ] **Step 4: Author `sources` / `staticSources`** on every SF entry and every Oakland entry from the Step 3 output, starting from the spec §4 table. SF `staticSources`: every map view except Elections and Demographics gets `['sf-analysis-neighborhoods', 'acs-2023-5yr']`; **Demographics** gets `['acs-2023-5yr', 'sf-analysis-neighborhoods', 'sf-tract-assignment']` — ACS FIRST, because the panel and the pill face lead with the first static source on a static-led view (Task 7: a view whose `citable` has neither `map-sample` nor `window-sample` is static-led); Elections gets `['sf-elections-results', 'sf-precincts-2012', 'sf-precincts-2022', 'sf-cvr-20241105', 'sf-analysis-neighborhoods']`; live/pulse/alerts get `['sf-analysis-neighborhoods']`; home gets `['sf-analysis-neighborhoods', 'acs-2023-5yr']`. Oakland: the three event views `['oak-beats']`; demographics `['acs-2023-5yr', 'oak-neighborhoods']`; home omitted. `staticSources` ORDER IS DISPLAY ORDER — the first entry of a static-led view is its primary source (About link target, pill face). If a scan reports an `unresolved` site, add a `RESOLVED_KEYS` row for that file with the keys its code resolves to (read the file).

- [ ] **Step 5: Run the suite**

Run: `pnpm vitest run src/cities && npx tsc -b`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/cities/manifest.ts src/cities/sf/manifest.ts src/cities/oakland/manifest.ts src/cities/sources.test.ts
git commit -m "feat(manifest): sources/staticSources per view, pinned fetched<=>declared by a source scan"
```

---

### Task 6: `resolveQuery`, the `cite` option, the recorder store, and hook threading

**Files:**
- Modify: `src/api/client.ts`, `src/hooks/useDataset.ts`, `src/hooks/useDataFreshness.ts`, `src/hooks/useCivicMetrics.ts:24-95`, `src/hooks/useLast48Window.ts:239-243, 369-380, 502-506`, `src/components/layout/AppShell.tsx`
- Create: `src/lib/provenance/citations.ts`
- Test: `src/api/client.test.ts`, `src/lib/provenance/citations.test.ts`

**Interfaces:**
- Produces (client.ts): `export interface CiteTag { viewId: ViewId; purpose: QueryPurpose; facet?: string }`; `export interface ResolvedQuery { queryParams: SoQLParams; queryString: string; url: string }`; `export function resolveQuery(config: Pick<DatasetConfig, 'endpoint' | 'defaultSort'>, params: SoQLParams): ResolvedQuery`; `fetchDataset` options gain `cite?: CiteTag`.
- Produces (citations.ts): `export interface CitableQuery { cityId: CityId; viewId: ViewId; purpose: QueryPurpose; facet?: string; datasetKey: string; datasetId: string; host: string; params: SoQLParams; url: string; fetchedAt: number; fromCache: boolean; rowCount: number; hitLimit: boolean; head: Record<string, unknown>[] }`; `slotKey(purpose, datasetKey, facet?)`; `recordCitation(rec)`; `clearCitationScope(cityId, viewId)`; `useCitableQueries(cityId, viewId): CitableQuery[]`; `useCitationScope(): void`; `_resetCitations()` (tests).
- Produces (hooks): `UseDatasetOptions.cite?: CiteTag`; `useDataFreshness(key, field, range, { geoField?, cityId?, cite? })` — the geo probe records with `facet: 'with coordinates'`; `useCivicMetric(metricKey, opts?: { cite?: CiteTag })`; `useLast48Window({ datasets, cite?: { viewId: ViewId; sample: 'window-sample'; count: 'window-count' } })`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/api/client.test.ts
import { describe, it, expect } from 'vitest'
import { resolveQuery } from './client'

const cfg = { endpoint: 'https://data.sfgov.org/resource/wg3w-h783.json', defaultSort: 'incident_datetime DESC' }

describe('resolveQuery', () => {
  it('injects the default sort and limit for a row query', () => {
    const r = resolveQuery(cfg, { $where: "a = 'b'", $limit: 5000 })
    expect(r.queryParams).toEqual({ $order: 'incident_datetime DESC', $limit: 5000, $where: "a = 'b'" })
    expect(r.url).toBe("https://data.sfgov.org/resource/wg3w-h783.json?%24order=incident_datetime+DESC&%24limit=5000&%24where=a+%3D+%27b%27")
  })
  it('skips the default sort for an aggregate', () => {
    const r = resolveQuery(cfg, { $select: 'count(*) as n' })
    expect(r.queryParams.$order).toBeUndefined()
    expect(r.queryParams.$limit).toBe(1000)
  })
  it('never carries a token', () => {
    expect(resolveQuery(cfg, { $q: 'x' }).url).not.toMatch(/app_token/i)
  })
})
```

```ts
// src/lib/provenance/citations.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { recordCitation, clearCitationScope, slotKey, _resetCitations, _snapshot, type CitableQuery } from './citations'

const base: CitableQuery = {
  cityId: 'sf', viewId: 'crime-incidents', purpose: 'map-sample', datasetKey: 'policeIncidents', datasetId: 'wg3w-h783',
  host: 'data.sfgov.org', params: { $limit: 5000 }, url: 'https://x/?a', fetchedAt: 1, fromCache: false, rowCount: 5000, hitLimit: true, head: [],
}

describe('citation recorder', () => {
  beforeEach(() => _resetCitations())
  it('keys slots by purpose|datasetKey|facet and replaces only its own slot', () => {
    recordCitation(base)
    recordCitation({ ...base, purpose: 'stat-totals', params: { $select: 'count(*)' }, url: 'https://x/?b', rowCount: 1, hitLimit: false })
    recordCitation({ ...base, url: 'https://x/?a2', fetchedAt: 2 })
    const recs = _snapshot('sf', 'crime-incidents')
    expect(recs.map((r) => r.url).sort()).toEqual(['https://x/?a2', 'https://x/?b'])
  })
  it('scopes by city — the same view in two cities never shares slots', () => {
    recordCitation(base)
    recordCitation({ ...base, cityId: 'oakland', datasetId: 'ppgh-7dqv', host: 'data.oaklandca.gov' })
    expect(_snapshot('sf', 'crime-incidents')).toHaveLength(1)
    expect(_snapshot('oakland', 'crime-incidents')).toHaveLength(1)
  })
  it('clearCitationScope empties one scope only', () => {
    recordCitation(base)
    recordCitation({ ...base, viewId: 'housing', datasetKey: 'evictionNotices' })
    clearCitationScope('sf', 'crime-incidents')
    expect(_snapshot('sf', 'crime-incidents')).toEqual([])
    expect(_snapshot('sf', 'housing')).toHaveLength(1)
  })
  it('slotKey includes the facet', () => {
    expect(slotKey('stat-totals', 'evictionNotices', 'No-fault share')).toBe('stat-totals|evictionNotices|No-fault share')
    expect(slotKey('map-sample', 'evictionNotices')).toBe('map-sample|evictionNotices|')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm vitest run src/api/client.test.ts src/lib/provenance/citations.test.ts` → FAIL (no exports).

- [ ] **Step 3: Write `citations.ts`**

```ts
// src/lib/provenance/citations.ts
// The citable-query recorder (spec §5.2). An external store in the
// useLoadingProgress.ts mould — NOT appStore (browser-only at module eval).
// A write replaces ONLY its own slot (purpose|datasetKey|facet) inside its
// (city/view) scope; untagged fetches never write. That is what makes
// "last-write-wins" impossible rather than merely discouraged.
import { useEffect, useSyncExternalStore } from 'react'
import type { SoQLParams } from '@/api/client'
import type { CityId } from '@/cities/routing'
import type { ViewId } from '@/cities/manifest'
import type { QueryPurpose } from './purposes'
import { useRouteView } from '@/cities/useActiveCity'

export interface CitableQuery {
  cityId: CityId
  viewId: ViewId
  purpose: QueryPurpose
  /** Reader label when one purpose fires more than once on one dataset. Part of the slot key. */
  facet?: string
  datasetKey: string
  datasetId: string
  host: string
  /** RESOLVED params — the injected $order/$limit included. */
  params: SoQLParams
  /** Exactly resolveQuery().url — token-free by construction. */
  url: string
  fetchedAt: number
  fromCache: boolean
  rowCount: number
  hitLimit: boolean
  /** rows.slice(0, 5): aggregates travel whole; samples show their newest rows. */
  head: Record<string, unknown>[]
}

type Scope = Map<string, CitableQuery>
const scopes = new Map<string, Scope>()
const snapshots = new Map<string, CitableQuery[]>()
const listeners = new Set<() => void>()
const EMPTY: CitableQuery[] = []

const scopeKey = (cityId: CityId, viewId: ViewId) => `${cityId}/${viewId}`

export function slotKey(purpose: QueryPurpose, datasetKey: string, facet?: string): string {
  return `${purpose}|${datasetKey}|${facet ?? ''}`
}

function notify(key: string) {
  snapshots.set(key, [...(scopes.get(key)?.values() ?? [])])
  listeners.forEach((l) => l())
}

export function recordCitation(rec: CitableQuery): void {
  const key = scopeKey(rec.cityId, rec.viewId)
  const scope = scopes.get(key) ?? new Map<string, CitableQuery>()
  const slot = slotKey(rec.purpose, rec.datasetKey, rec.facet)
  if (import.meta.env.DEV) {
    const prev = scope.get(slot)
    if (prev && prev.datasetId !== rec.datasetId) {
      console.error(`[datadiver] citation slot '${slot}' rewritten for a different dataset (${prev.datasetId} → ${rec.datasetId}) — two call sites share a purpose`)
    }
  }
  scope.set(slot, rec)
  scopes.set(key, scope)
  notify(key)
}

export function clearCitationScope(cityId: CityId, viewId: ViewId): void {
  const key = scopeKey(cityId, viewId)
  if (!scopes.has(key) && !snapshots.has(key)) return
  scopes.delete(key)
  snapshots.delete(key)
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb) }

export function useCitableQueries(cityId: CityId, viewId: ViewId): CitableQuery[] {
  const key = scopeKey(cityId, viewId)
  return useSyncExternalStore(subscribe, () => snapshots.get(key) ?? EMPTY)
}

/** Mount ONCE (AppShell). Clears a scope when the route leaves it. A param
 *  change inside a view does not clear — the new query replaces its slot. */
export function useCitationScope(): void {
  const { cityId, viewId } = useRouteView()
  useEffect(() => () => clearCitationScope(cityId, viewId), [cityId, viewId])
}

/** Tests only. */
export function _resetCitations(): void { scopes.clear(); snapshots.clear() }
export function _snapshot(cityId: CityId, viewId: ViewId): CitableQuery[] { return snapshots.get(scopeKey(cityId, viewId)) ?? EMPTY }
```

(`import.meta.env.DEV` is fine under Vitest; the `useRouteView` import pulls `react-router-dom`, which is node-safe at module eval — `useOmniSearch.test.ts` already proves it.)

- [ ] **Step 4: Refactor `client.ts`** — add exports and the option:

```ts
import type { DatasetConfig } from '@/cities/types'
import type { ViewId } from '@/cities/manifest'
import type { QueryPurpose } from '@/lib/provenance/purposes'
import { recordCitation } from '@/lib/provenance/citations'

export interface CiteTag { viewId: ViewId; purpose: QueryPurpose; facet?: string }
export interface ResolvedQuery { queryParams: SoQLParams; queryString: string; url: string }

/** The ONE place a request URL is built. Pure, so the citable URL can be
 *  pinned by test. Token-free by construction — the app token travels only
 *  as the X-App-Token header. */
export function resolveQuery(config: Pick<DatasetConfig, 'endpoint' | 'defaultSort'>, params: SoQLParams): ResolvedQuery {
  const useDefaultSort = !params.$group && !params.$select?.match(/\b(SUM|COUNT|AVG|MIN|MAX|MEDIAN)\s*\(/i)
  const queryParams: SoQLParams = {
    ...(useDefaultSort && config.defaultSort ? { $order: config.defaultSort } : {}),
    $limit: DEFAULT_LIMIT,
    ...params,
  }
  const queryString = buildQueryString(queryParams)
  return { queryParams, queryString, url: `${config.endpoint}?${queryString}` }
}
```

Change `getFromCache` to return the entry (`CacheEntry<T> | null`) and use `cached.data` at the call site. In `fetchDataset`: options type gains `cite?: CiteTag`; replace lines 88–97 with `const { queryParams, url } = resolveQuery(config, params)`; add a local

```ts
  const cityId = options.cityId ?? 'sf'
  const cite = (rows: unknown[], fetchedAt: number, fromCache: boolean) => {
    if (!options.cite) return
    recordCitation({
      cityId, viewId: options.cite.viewId, purpose: options.cite.purpose, facet: options.cite.facet,
      datasetKey, datasetId: config.id, host: new URL(config.endpoint).host,
      params: queryParams, url, fetchedAt, fromCache,
      rowCount: rows.length, hitLimit: rows.length > 0 && rows.length === queryParams.$limit,
      head: rows.slice(0, 5) as Record<string, unknown>[],
    })
  }
```

The cache-hit branch becomes `const cached = getFromCache<T[]>(cacheKey); if (cached) { cite(cached.data, cached.timestamp, true); return cached.data }`. After the response parses, normalise GeoJSON — a `/resource/<id>.geojson` endpoint answers with a FeatureCollection OBJECT, not an array, and every consumer (cache, `hitLimit`, the recorder's `rows.slice`) assumes an array:

```ts
      const json = await response.json()
      const data = (config.ext === 'geojson' && json && !Array.isArray(json) && Array.isArray(json.features)
        ? json.features   // FeatureCollection → its features (the rows)
        : json) as T[]
```

then `setCache`, `cite(data, Date.now(), false)`, `return data`. Keep the existing DEV wrong-city tripwire and the retry loop byte-identical otherwise.

- [ ] **Step 5: Thread through the hooks.**

`useDataset.ts`: `UseDatasetOptions` gains `cite?: CiteTag` (import type from `@/api/client`); pass `cite: options.cite` in the `fetchDataset` call; replace `(params.$limit ?? 1000)` with `(params.$limit ?? DEFAULT_LIMIT)` where `export const DEFAULT_LIMIT = 1000` is now exported from `client.ts`. Add `JSON.stringify(options.cite)` to the effect deps? No — `cite` is identity metadata, not a query input; leave deps alone.

`useDataFreshness.ts`: options gain `cite?: CiteTag`; Query 1 passes `{ cityId: options?.cityId, cite: options?.cite }`; Query 2 passes `{ cityId: options?.cityId, cite: options?.cite ? { ...options.cite, facet: 'with coordinates' } : undefined }`.

`useCivicMetrics.ts`: signature `useCivicMetric(metricKey: string | null, opts?: { cite?: CiteTag })`; pass `{ cite: opts?.cite }` as the third argument to `fetchDataset`. Also fix `CIVIC_METRICS.crimeCount.selectClause` in `src/utils/censusVariables.ts:576` to `'analysis_neighborhood, count(distinct incident_number) as value'` (the rule from `crimeCount.ts`; the panel would otherwise expose the charge-row count).

`useLast48Window.ts`: `opts` gains `cite?: { viewId: ViewId; sample: 'window-sample'; count: 'window-count' }`; the row fetch (line ~369) passes `cite: opts.cite ? { viewId: opts.cite.viewId, purpose: opts.cite.sample, facet: datasetId } : undefined`; the count fetch (line ~502) passes `purpose: opts.cite.count` likewise. (`facet: datasetId` keeps the three streams in three slots even though `datasetKey` already differs — harmless and self-describing.)

`AppShell.tsx`: import `useCitationScope` from `@/lib/provenance/citations` and call it once inside the component body next to `useUrlSync()`.

- [ ] **Step 6: Run everything**

Run: `pnpm test && npx tsc -b`
Expected: PASS (the crime `count(*)` change may touch `crimeCount.test.ts` — if that test scans `censusVariables.ts` it will now pass a stricter check; if it does not, add `expect(readFileSync('src/utils/censusVariables.ts','utf8')).not.toMatch(/analysis_neighborhood, COUNT\(\*\)/)` there).

- [ ] **Step 7: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts src/lib/provenance/citations.ts src/lib/provenance/citations.test.ts src/hooks/useDataset.ts src/hooks/useDataFreshness.ts src/hooks/useCivicMetrics.ts src/hooks/useLast48Window.ts src/components/layout/AppShell.tsx src/utils/censusVariables.ts
git commit -m "feat(provenance): resolveQuery + opt-in cite tag on fetchDataset; purpose-keyed citation recorder"
```

---

### Task 7: The pure prose modules — `sourceLine.ts`, `downloads.ts`, `portalMeta.ts`, `apDate.ts`

**Files:**
- Create: `src/utils/apDate.ts`, `src/lib/provenance/downloads.ts`, `src/lib/provenance/portalMeta.ts`, `src/lib/provenance/sourceLine.ts`
- Modify: `src/views/Home/oaklandIndicators.ts` (re-export `apDate`)
- Test: `src/lib/provenance/downloads.test.ts`, `src/lib/provenance/portalMeta.test.ts`, `src/lib/provenance/sourceLine.test.ts`

**Interfaces:**
- Produces: `apDate(isoDate: string, nowYear: number): string` (moved); `csvUrl(host, id, queryString)`, `fullCsvUrl(host, id)`, `geojsonUrl(host, id, limit)`, `portalPageUrl(host, id)`; `PortalMeta`, `parsePortalMeta(json: unknown): PortalMeta`, `fetchPortalMeta(host, id, opts?: { timeoutMs?: number }): Promise<PortalMeta>`, `usePortalMeta(host: string | undefined, id: string | undefined, enabled: boolean): { meta: PortalMeta | null; failed: boolean }`; `SourceSummary`, `summarizeSources(cityId, entry)`, `pillFace(summaries)`, `throughLine(args)`, `queryClause(rec)`, `citationLines(args)`.

- [ ] **Step 1: Lift `apDate`.** Create `src/utils/apDate.ts`:

```ts
// src/utils/apDate.ts
import { apMonthDay } from './comparisonMode'

/** AP-style date; year appended only when it differs from nowYear.
 *  Month styling delegates to comparisonMode's apMonthDay — the repo's ONE
 *  AP-month authority. Takes a date-only or SF-local ISO string; never
 *  parses through Date (a date-only string read as UTC renders a day early
 *  on Pacific hosts — see spec §11.5). */
export function apDate(isoDate: string, nowYear: number): string {
  const y = Number(isoDate.slice(0, 4))
  const base = apMonthDay(isoDate.slice(0, 10))
  return y === nowYear ? base : `${base}, ${y}`
}
```

In `oaklandIndicators.ts` delete the local `apDate` function and add `export { apDate } from '@/utils/apDate'` plus `import { apDate } from '@/utils/apDate'` for its own uses (keep the docblock as a one-line pointer).

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/provenance/downloads.test.ts
import { describe, it, expect } from 'vitest'
import { csvUrl, fullCsvUrl, geojsonUrl, portalPageUrl } from './downloads'

describe('download URLs', () => {
  it('builds the CSV export from host + id + the same query string', () => {
    expect(csvUrl('data.sfgov.org', 'wg3w-h783', '%24limit=5')).toBe('https://data.sfgov.org/resource/wg3w-h783.csv?%24limit=5')
  })
  it('builds the whole-dataset export', () => {
    expect(fullCsvUrl('data.oaklandca.gov', 'ppgh-7dqv')).toBe('https://data.oaklandca.gov/api/views/ppgh-7dqv/rows.csv?accessType=DOWNLOAD')
  })
  it('builds a resource geojson, never the dead geospatial export', () => {
    expect(geojsonUrl('data.sfgov.org', 'j2bu-swwd', 100)).toBe('https://data.sfgov.org/resource/j2bu-swwd.geojson?%24limit=100')
  })
  it('portal page uses the /d/ form', () => {
    expect(portalPageUrl('data.sfgov.org', 'wg3w-h783')).toBe('https://data.sfgov.org/d/wg3w-h783')
  })
})
```

```ts
// src/lib/provenance/portalMeta.test.ts
import { describe, it, expect } from 'vitest'
import { parsePortalMeta } from './portalMeta'

describe('parsePortalMeta', () => {
  it('reads title, attribution, license and rowsUpdatedAt (epoch seconds → ms)', () => {
    const m = parsePortalMeta({ name: 'Fire Incidents', attribution: null, licenseId: 'PDDL', license: { name: 'Open Data Commons PDDL', termsLink: 'http://opendatacommons.org/licenses/pddl/1.0/' }, rowsUpdatedAt: 1788342327 })
    expect(m).toEqual({ title: 'Fire Incidents', attribution: null, licenseId: 'PDDL', licenseName: 'Open Data Commons PDDL', licenseUrl: 'http://opendatacommons.org/licenses/pddl/1.0/', rowsUpdatedAt: 1788342327000 })
  })
  it('absent keys become null, never invented', () => {
    const m = parsePortalMeta({ name: 'CrimeWatch Data' })
    expect(m.licenseId).toBeNull(); expect(m.rowsUpdatedAt).toBeNull(); expect(m.attribution).toBeNull()
  })
  it('never keeps the description (it carries HTML)', () => {
    expect(Object.keys(parsePortalMeta({ name: 'x', description: '<p>y</p>' }))).not.toContain('description')
  })
})
```

```ts
// src/lib/provenance/sourceLine.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { CITIES } from '@/cities/registry'
import { summarizeSources, pillFace, throughLine, queryClause, citationLines } from './sourceLine'
import type { CitableQuery } from './citations'

const sfCrime = CITIES.sf.manifest.find((e) => e.viewId === 'crime-incidents')!
const sfHousing = CITIES.sf.manifest.find((e) => e.viewId === 'housing')!
const sfTraffic = CITIES.sf.manifest.find((e) => e.viewId === 'traffic-safety')!
const oakCrime = CITIES.oakland.manifest.find((e) => e.viewId === 'crime-incidents')!
const sfElections = CITIES.sf.manifest.find((e) => e.viewId === 'elections')!

const rec = (over: Partial<CitableQuery>): CitableQuery => ({
  cityId: 'sf', viewId: 'crime-incidents', purpose: 'map-sample', datasetKey: 'policeIncidents', datasetId: 'wg3w-h783', host: 'data.sfgov.org',
  params: { $where: "incident_datetime >= '2026-08-04T00:00:00'", $limit: 5000, $order: 'incident_datetime DESC' }, url: 'https://data.sfgov.org/resource/wg3w-h783.json?x',
  fetchedAt: 0, fromCache: false, rowCount: 5000, hitLimit: true, head: [], ...over,
})

describe('pillFace', () => {
  it('single publisher: short · portal · via DataDiver', () => {
    expect(pillFace(summarizeSources('sf', sfHousing))).toBe('SF Rent Board · DataSF · via DataDiver')
  })
  it('many publishers: N sources · via DataDiver', () => {
    expect(pillFace(summarizeSources('sf', sfTraffic))).toMatch(/^\d sources · via DataDiver$/)
  })
  it('static-led views lead with their first static source', () => {
    // Elections: results + two precinct layers + CVR share one publisher; the
    // neighborhood frame (SF Planning) is a second publisher, so the lead
    // group is 5 statics with 2 publishers → the count form.
    expect(pillFace(summarizeSources('sf', sfElections))).toBe('5 sources · via DataDiver')
    const demo = CITIES.sf.manifest.find((e) => e.viewId === 'demographics')!
    expect(summarizeSources('sf', demo)[0].id).toBe('acs-2023-5yr')
  })
  it('the Socrata sources lead on a dataset-led view and the boundary/census rows follow', () => {
    const s = summarizeSources('sf', sfCrime)
    expect(s[0].kind).toBe('dataset'); expect(s.at(-1)!.kind).toBe('static')
  })
})

describe('throughLine', () => {
  it('SF: published through the freshness MAX, AP style, no Date parsing', () => {
    const f = rec({ purpose: 'freshness', params: { $select: 'MAX(incident_datetime) as latest', $limit: 1 }, rowCount: 1, hitLimit: false, head: [{ latest: '2026-09-01T23:10:00.000' }] })
    expect(throughLine({ cityId: 'sf', datasetKey: 'policeIncidents', freshness: f, nowYear: 2026 })).toBe('Published through Sept. 1')
  })
  it('Oakland: complete through max − edge, newest row named', () => {
    const f = rec({ cityId: 'oakland', purpose: 'freshness', datasetId: 'ppgh-7dqv', host: 'data.oaklandca.gov', params: {}, rowCount: 1, hitLimit: false, head: [{ latest: '2026-09-03T04:00:00.000' }] })
    expect(throughLine({ cityId: 'oakland', datasetKey: 'policeIncidents', freshness: f, nowYear: 2026 })).toBe('Complete through Aug. 26 · newest row Sept. 3')
  })
  it('no freshness record → null (never fabricated)', () => {
    expect(throughLine({ cityId: 'sf', datasetKey: 'policeIncidents', freshness: undefined, nowYear: 2026 })).toBeNull()
  })
})

describe('queryClause', () => {
  it('shows $where/$select/$group only', () => {
    expect(queryClause(rec({}))).toBe("WHERE incident_datetime >= '2026-08-04T00:00:00'")
    expect(queryClause(rec({ params: { $select: 'count(*) as n', $where: 'a = 1', $group: 'b' } }))).toBe('SELECT count(*) as n WHERE a = 1 GROUP BY b')
  })
})

describe('citationLines', () => {
  it('SF dataset line is name-free and carries the filter + page URL', () => {
    const lines = citationLines({ cityId: 'sf', entry: sfCrime, records: [rec({})], portalTitles: { 'wg3w-h783': 'Police Department Incident Reports: 2018 to Present' }, pageUrl: 'https://datadiver.jlabsf.org/crime-incidents?start=2026-08-04', accessed: '2026-09-03' })
    expect(lines[0]).toBe("San Francisco Police Department. \"Police Department Incident Reports: 2018 to Present\" (wg3w-h783). DataSF, data.sfgov.org. Filtered: incident_datetime >= '2026-08-04T00:00:00'. Accessed Sept. 3, 2026, via DataDiver, https://datadiver.jlabsf.org/crime-incidents?start=2026-08-04.")
    expect(lines.join('\n')).not.toMatch(/Garnier|Claude/)
  })
  it('Oakland line uses the Oakland portal', () => {
    const lines = citationLines({ cityId: 'oakland', entry: oakCrime, records: [], portalTitles: {}, pageUrl: 'https://datadiver.jlabsf.org/oakland/crime-incidents', accessed: '2026-09-03' })
    expect(lines[0]).toMatch(/^Oakland Police Department\. "OPD Incident Reports" \(ppgh-7dqv\)\. Oakland Open Data, data\.oaklandca\.gov\. Accessed Sept\. 3, 2026, via DataDiver/)
  })
  it('a static row cites the upstream document', () => {
    const lines = citationLines({ cityId: 'sf', entry: sfElections, records: [], portalTitles: {}, pageUrl: 'https://datadiver.jlabsf.org/elections', accessed: '2026-09-03' })
    expect(lines[0]).toMatch(/^San Francisco Department of Elections\. "Statement of the Vote \(certified results\)"/)
  })
})

describe('the module never says Live', () => {
  it('no reader-facing "Live" in sourceLine.ts', () => {
    expect(readFileSync('src/lib/provenance/sourceLine.ts', 'utf8')).not.toMatch(/'[^']*\bLive\b[^']*'|`[^`]*\bLive\b[^`]*`/)
  })
})
```

- [ ] **Step 3: Run to verify failure** — `pnpm vitest run src/lib/provenance` → FAIL.

- [ ] **Step 4: Write `downloads.ts`**

```ts
// src/lib/provenance/downloads.ts
// ZERO-IMPORT LEAF. The publisher's own files, built from host + id — never
// by string-replacing '.json?' (highInjuryNetwork is .geojson). Never
// /api/geospatial/<id>?method=export (dead: returns a truncated 200).
export const csvUrl = (host: string, id: string, queryString: string) => `https://${host}/resource/${id}.csv?${queryString}`
export const fullCsvUrl = (host: string, id: string) => `https://${host}/api/views/${id}/rows.csv?accessType=DOWNLOAD`
export const geojsonUrl = (host: string, id: string, limit: number) => `https://${host}/resource/${id}.geojson?%24limit=${limit}`
export const portalPageUrl = (host: string, id: string) => `https://${host}/d/${id}`
```

- [ ] **Step 5: Write `portalMeta.ts`**

```ts
// src/lib/provenance/portalMeta.ts
// Live portal facts (spec §8): one GET per Socrata id when a panel opens.
// Both hosts answer Access-Control-Allow-Origin: *; no token needed.
import { useEffect, useState } from 'react'

export interface PortalMeta {
  title: string
  attribution: string | null
  licenseId: string | null
  licenseName: string | null
  licenseUrl: string | null
  /** ms epoch — the publisher's push time, NOT "data through". */
  rowsUpdatedAt: number | null
}

export function parsePortalMeta(json: unknown): PortalMeta {
  const j = (json ?? {}) as Record<string, unknown>
  const lic = (j.license ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null)
  return {
    title: str(j.name) ?? '',
    attribution: str(j.attribution),
    licenseId: str(j.licenseId),
    licenseName: str(lic.name),
    licenseUrl: str(lic.termsLink),
    rowsUpdatedAt: typeof j.rowsUpdatedAt === 'number' ? j.rowsUpdatedAt * 1000 : null,
  }
}

const cache = new Map<string, Promise<PortalMeta>>()

export function fetchPortalMeta(host: string, id: string, opts: { timeoutMs?: number } = {}): Promise<PortalMeta> {
  const key = `${host}/${id}`
  const hit = cache.get(key)
  if (hit) return hit
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 6_000)
  const p = fetch(`https://${host}/api/views/${id}.json`, { signal: controller.signal })
    .then((r) => { if (!r.ok) throw new Error(`portal metadata ${r.status}`); return r.json() })
    .then(parsePortalMeta)
    .finally(() => clearTimeout(timer))
  p.catch(() => cache.delete(key))
  cache.set(key, p)
  return p
}

export function usePortalMeta(host: string | undefined, id: string | undefined, enabled: boolean): { meta: PortalMeta | null; failed: boolean } {
  const [state, setState] = useState<{ meta: PortalMeta | null; failed: boolean }>({ meta: null, failed: false })
  useEffect(() => {
    if (!enabled || !host || !id) return
    let cancelled = false
    fetchPortalMeta(host, id)
      .then((meta) => { if (!cancelled) setState({ meta, failed: false }) })
      .catch(() => { if (!cancelled) setState({ meta: null, failed: true }) })
    return () => { cancelled = true }
  }, [host, id, enabled])
  return state
}
```

- [ ] **Step 6: Write `sourceLine.ts`**

```ts
// src/lib/provenance/sourceLine.ts
// Every reader-facing source sentence is a pure function of the registry,
// the NON_SOCRATA table, the view's citation records, live portal metadata,
// the page URL and a clock (spec §7). No component assembles source prose.
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import type { ViewManifestEntry } from '@/cities/manifest'
import { NON_SOCRATA, type NonSocrataSource } from './nonSocrata'
import type { CitableQuery } from './citations'
import { completeWindow } from '@/views/Home/oaklandIndicators'
import { apDate } from '@/utils/apDate'

export interface SourceSummary {
  kind: 'dataset' | 'static'
  id: string                       // Socrata 4×4 or NonSocrataId
  key: string                      // registry key or NonSocrataId
  cityId: CityId
  publisher: { short: string; full: string }
  /** Registry `name` (short label) or the static title. */
  title: string
  portalName: string
  host?: string
  dateField?: string
  socrataId?: string
  static?: NonSocrataSource
}

/** A view is DATASET-LED when it draws rows from a Socrata dataset (its
 *  citable set carries map-sample or window-sample, or declares nothing)
 *  and STATIC-LED otherwise (Elections: results files; Demographics: ACS).
 *  The lead group comes first — it is the primary source for the pill
 *  face and the About link. */
export function summarizeSources(cityId: CityId, entry: ViewManifestEntry): SourceSummary[] {
  const city = getCity(cityId)
  const datasets = (entry.sources ?? []).map((key): SourceSummary => {
    const c = city.datasets[key]
    return { kind: 'dataset', id: c.id, key, cityId, publisher: c.publisher, title: c.name, portalName: city.portal.name, host: city.portal.host, dateField: c.dateField, socrataId: c.id }
  })
  const statics = (entry.staticSources ?? []).map((id): SourceSummary => {
    const s = NON_SOCRATA[id]
    return { kind: 'static', id, key: id, cityId, publisher: s.publisher, title: s.title, portalName: s.socrataHost ? city.portal.name : s.publisher.short, host: s.socrataHost, socrataId: s.socrataId, static: s }
  })
  const citable = entry.citable ?? []
  const datasetLed = datasets.length > 0 && (citable.length === 0 || citable.some((p) => p === 'map-sample' || p === 'window-sample'))
  return datasetLed ? [...datasets, ...statics] : [...statics, ...datasets]
}

/** The closed pill's text. The LEAD group is every source of the primary
 *  kind (sources[0].kind); one shared publisher → the single form, else a
 *  count. The basemap row never counts. */
export function pillFace(sources: SourceSummary[]): string {
  const visible = sources.filter((s) => s.static?.kind !== 'basemap')
  if (visible.length === 0) return 'via DataDiver'
  const leadKind = visible[0].kind
  const lead = visible.filter((s) => s.kind === leadKind)
  const shorts = [...new Set(lead.map((s) => s.publisher.short))]
  if (shorts.length === 1) {
    const s = lead[0]
    return s.kind === 'dataset' ? `${shorts[0]} · ${s.portalName} · via DataDiver` : `${shorts[0]} · via DataDiver`
  }
  return `${lead.length} sources · via DataDiver`
}

const latestOf = (f: CitableQuery | undefined) => {
  const v = f?.head[0]?.latest
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null
}

/** "Through" per city — null when no fact exists (spec §7.2). */
export function throughLine(args: { cityId: CityId; datasetKey: string; freshness: CitableQuery | undefined; nowYear: number }): string | null {
  const latest = latestOf(args.freshness)
  if (!latest) return null
  const edge = getCity(args.cityId).datasets[args.datasetKey]?.completeness?.edgeDays
  if (args.cityId === 'oakland' && edge !== undefined) {
    const { end } = completeWindow(latest, edge, 1)
    return `Complete through ${apDate(end, args.nowYear)} · newest row ${apDate(latest, args.nowYear)}`
  }
  return `Published through ${apDate(latest, args.nowYear)}`
}

/** The human-readable core of a query: SELECT … WHERE … GROUP BY …  */
export function queryClause(rec: CitableQuery): string {
  const p = rec.params
  const parts: string[] = []
  if (p.$select) parts.push(`SELECT ${p.$select}`)
  if (p.$where) parts.push(`WHERE ${p.$where}`)
  if (p.$group) parts.push(`GROUP BY ${p.$group}`)
  return parts.join(' ')
}

export function citationLines(args: {
  cityId: CityId; entry: ViewManifestEntry; records: CitableQuery[]
  portalTitles: Record<string, string>; pageUrl: string; accessed: string
}): string[] {
  const accessed = `${apDate(args.accessed, 0)}` // year always shown (nowYear 0 never matches)
  return summarizeSources(args.cityId, args.entry)
    .filter((s) => s.static?.kind !== 'basemap')
    .map((s) => {
      const title = (s.socrataId && args.portalTitles[s.socrataId]) || s.title
      const idPart = s.socrataId ? ` (${s.socrataId})` : ''
      const where = s.kind === 'dataset'
        ? (args.records.find((r) => r.datasetKey === s.key && r.purpose === 'map-sample') ?? args.records.find((r) => r.datasetKey === s.key))?.params.$where
        : undefined
      const origin = s.kind === 'dataset' ? `${s.portalName}, ${s.host}` : new URL(s.static!.landingUrl).host
      const filtered = where ? ` Filtered: ${where}.` : ''
      return `${s.publisher.full}. "${title}"${idPart}. ${origin}.${filtered} Accessed ${accessed}, via DataDiver, ${args.pageUrl}.`
    })
}
```

(`completeWindow` is imported from a Home view module — acceptable because that module is a pure leaf with a node test; if the plan's reviewer objects, lift it beside `apDate` into `src/utils/completeWindow.ts` with a re-export, the same move as Step 1.)

- [ ] **Step 7: Run the tests and fix the citation byte-pin** to whatever `apDate('2026-09-03', 0)` renders (`Sept. 3, 2026`) — the assertion strings above assume that.

Run: `pnpm vitest run src/lib/provenance src/views/Home/oaklandIndicators.test.ts && npx tsc -b`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/utils/apDate.ts src/views/Home/oaklandIndicators.ts src/lib/provenance/downloads.ts src/lib/provenance/downloads.test.ts src/lib/provenance/portalMeta.ts src/lib/provenance/portalMeta.test.ts src/lib/provenance/sourceLine.ts src/lib/provenance/sourceLine.test.ts
git commit -m "feat(provenance): generated source prose, download URL builders, live portal metadata; apDate lifts to utils"
```

---

### Task 8: `SourcePill` + `SourcePanel`; MapView mount; PNG exclusion; overlays yield; attribution restyle

**Files:**
- Create: `src/components/maps/SourcePill.tsx`, `src/components/maps/SourcePanel.tsx`
- Modify: `src/components/maps/MapView.tsx:364-378, 235-238`, `src/components/export/ExportButton.tsx:87`, `src/components/ui/ChartTray.tsx:128`, `src/index.css:210-216, 415-418`, `src/views/Elections/Elections.tsx:1222`, `src/views/Neighborhood/Neighborhood.tsx:433`, `src/views/EmergencyResponse/EmergencyResponse.tsx:918`, `src/views/Demographics/Demographics.tsx:641-660`

**Interfaces:**
- Consumes: Task 6 `useCitableQueries`, Task 7 `summarizeSources`/`pillFace`/`throughLine`/`queryClause`/`citationLines`/`usePortalMeta`/`csvUrl`/`fullCsvUrl`/`geojsonUrl`/`portalPageUrl`, Task 3 `PURPOSE_LABEL`.
- Produces: `export default function SourcePill({ inline = false }: { inline?: boolean })` — renders nothing when the route's entry declares no sources.

- [ ] **Step 1: CSS.** In `src/index.css` replace the attribution block (lines 210–216) with:

```css
/* The Mapbox compact attribution "i" — legible in both themes (Mapbox:
   "attribution must be legible"); the wordmark is never restyled. */
.mapboxgl-ctrl-attrib {
  font-size: 0.5625rem !important;
  opacity: 0.85;
}
.mapboxgl-ctrl-attrib a {
  color: inherit !important;
}
.dark .mapboxgl-ctrl-attrib.mapboxgl-compact {
  background-color: rgba(30, 20, 13, 0.85) !important;
  color: #e8dcc4;
}
.dark .mapboxgl-ctrl-attrib-button {
  filter: invert(1) brightness(0.85);
}
```

Append after the existing `fadeSlideIn` keyframes:

```css
/* Source panel entrance — opens upward from the credit row. */
@keyframes panelRise {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
.panel-rise { animation: panelRise 200ms var(--ease-snap) both; }
@media (prefers-reduced-motion: reduce) {
  .panel-rise { animation: none; }
}
```

- [ ] **Step 2: `SourcePanel.tsx`**

```tsx
// src/components/maps/SourcePanel.tsx
// The open panel of the source pill (spec §6.3). Pure prose comes from
// sourceLine.ts; this file only lays it out. Tier 3 — no glow.
import { useMemo, useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { CityId } from '@/cities/routing'
import type { ViewManifestEntry } from '@/cities/manifest'
import { PURPOSE_LABEL } from '@/lib/provenance/purposes'
import type { CitableQuery } from '@/lib/provenance/citations'
import { summarizeSources, throughLine, queryClause, citationLines, type SourceSummary } from '@/lib/provenance/sourceLine'
import { usePortalMeta } from '@/lib/provenance/portalMeta'
import { csvUrl, fullCsvUrl, geojsonUrl, portalPageUrl } from '@/lib/provenance/downloads'
import { apDate } from '@/utils/apDate'
import { formatApTime } from '@/utils/format'
import { sfLocalCutoff } from '@/utils/sfTime'

const LINK = 'underline decoration-paper-400/40 underline-offset-2 hover:text-ink dark:hover:text-paper-100 transition-colors'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })
  }, [text])
  return (
    <button onClick={copy} className={`text-micro font-mono px-1.5 py-0.5 rounded ${done ? 'bg-moss-500/15 text-moss-500' : 'text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-100'}`}>
      {done ? 'Copied' : label}
    </button>
  )
}

function QueryBlock({ rec, unitNote }: { rec: CitableQuery; unitNote?: string }) {
  const [full, setFull] = useState(false)
  const label = `${PURPOSE_LABEL[rec.purpose]}${rec.facet ? ` — ${rec.facet}` : ''}`
  const count = rec.hitLimit ? `newest ${rec.rowCount.toLocaleString('en-US')} rows (capped)` : `${rec.rowCount.toLocaleString('en-US')} row${rec.rowCount === 1 ? '' : 's'}`
  return (
    <div className="mt-2">
      <p className="text-label text-ink dark:text-paper-100">
        {label} <span className="text-paper-600 dark:text-paper-400">— {count} · fetched {formatApTime(rec.fetchedAt)}{rec.fromCache ? ' (cached)' : ''}</span>
      </p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-micro text-paper-700 dark:text-paper-300 bg-paper-100/60 dark:bg-espresso-800/60 rounded px-2 py-1.5">
        {full ? JSON.stringify(rec.params, null, 1) : queryClause(rec)}
      </pre>
      {unitNote && <p className="text-micro text-paper-600 dark:text-paper-400 mt-0.5">{unitNote}</p>}
      <div className="flex items-center gap-2 mt-1 text-micro font-mono">
        <a className={LINK} href={rec.url} target="_blank" rel="noopener noreferrer">JSON ↗</a>
        <a className={LINK} href={csvUrl(rec.host, rec.datasetId, rec.url.split('?')[1] ?? '')} target="_blank" rel="noopener noreferrer">CSV ↗</a>
        <CopyButton text={rec.url} label="Copy" />
        <button onClick={() => setFull((v) => !v)} className="text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-100">{full ? 'Short query' : 'Full query'}</button>
      </div>
    </div>
  )
}

function DatasetBlock({ s, records, citable, nowYear, open, onTitle }: { s: SourceSummary; records: CitableQuery[]; citable: readonly string[]; nowYear: number; open: boolean; onTitle: (id: string, title: string) => void }) {
  const { meta } = usePortalMeta(s.host, s.socrataId, open)
  // Lift the live portal title so the citation can use it (spec §7.3).
  useEffect(() => { if (meta?.title && s.socrataId) onTitle(s.socrataId, meta.title) }, [meta?.title, s.socrataId, onTitle])
  const mine = records.filter((r) => r.datasetKey === s.key)
  const freshness = mine.find((r) => r.purpose === 'freshness' && !r.facet)
  const through = throughLine({ cityId: s.cityId, datasetKey: s.key, freshness, nowYear })
  const updated = meta?.rowsUpdatedAt ? ` · publisher updated ${apDate(sfLocalCutoff(meta.rowsUpdatedAt), nowYear)}` : ''
  const license = meta ? (meta.licenseName ? <>License: {meta.licenseUrl ? <a className={LINK} href={meta.licenseUrl} target="_blank" rel="noopener noreferrer">{meta.licenseName}</a> : meta.licenseName}</> : <>License: not stated by the publisher</>) : null
  const ordered = citable.flatMap((p) => mine.filter((r) => r.purpose === p && r.purpose !== 'freshness'))
  const unitNote = /count\(distinct (incident_number|casenumber|call_number)\)/.test(mine.map((r) => r.params.$select ?? '').join(' '))
    ? 'Counts are distinct cases or calls, not rows — the publisher files one row per charge or per unit dispatched.' : undefined
  return (
    <section className="pb-3 mb-3 border-b border-paper-200/60 dark:border-espresso-800 last:border-0">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-paper-600 dark:text-paper-400">── {s.publisher.short}</p>
      <p className="text-label text-ink dark:text-paper-100 mt-0.5">{s.publisher.full}</p>
      <p className="text-micro text-paper-700 dark:text-paper-300">
        {meta?.title || s.title} · <a className={`font-mono ${LINK}`} href={portalPageUrl(s.host!, s.socrataId!)} target="_blank" rel="noopener noreferrer">{s.socrataId} ↗</a>
      </p>
      {(through || updated) && <p className="text-micro text-paper-600 dark:text-paper-400">{through ?? ''}{updated}</p>}
      {license && <p className="text-micro text-paper-600 dark:text-paper-400">{license}</p>}
      {ordered.map((r) => <QueryBlock key={`${r.purpose}|${r.facet ?? ''}`} rec={r} unitNote={unitNote} />)}
      {citable.length > 0 && ordered.length === 0 && <p className="text-micro text-paper-500 mt-1">— queries not registered yet</p>}
      <p className="text-micro font-mono mt-2"><a className={LINK} href={fullCsvUrl(s.host!, s.socrataId!)} target="_blank" rel="noopener noreferrer">Full dataset (CSV) ↗</a></p>
    </section>
  )
}

function StaticBlock({ s }: { s: SourceSummary }) {
  const st = s.static!
  const lic = st.license === 'not stated' ? 'not stated by the publisher' : st.license.name
  return (
    <section className="pb-3 mb-3 border-b border-paper-200/60 dark:border-espresso-800 last:border-0">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-paper-600 dark:text-paper-400">── {s.publisher.short}</p>
      <p className="text-label text-ink dark:text-paper-100 mt-0.5">{s.publisher.full}</p>
      <p className="text-micro text-paper-700 dark:text-paper-300">{st.title} · {st.vintage}</p>
      <p className="text-micro text-paper-600 dark:text-paper-400">License: {lic}{st.derivedLicense ? ` · DataDiver's transformation ${st.derivedLicense}` : ''}</p>
      <p className="text-micro font-mono mt-1 flex flex-wrap gap-2">
        <a className={LINK} href={st.socrataId && st.socrataHost ? geojsonUrl(st.socrataHost, st.socrataId, 1000) : st.upstreamUrl} target="_blank" rel="noopener noreferrer">Publisher's file ↗</a>
        {st.servedPath && <a className={LINK} href={st.servedPath} target="_blank" rel="noopener noreferrer">File we serve ↗</a>}
        <a className={LINK} href={st.landingUrl} target="_blank" rel="noopener noreferrer">About the source ↗</a>
      </p>
    </section>
  )
}

export default function SourcePanel({ cityId, entry, records, labelledBy }: { cityId: CityId; entry: ViewManifestEntry; records: CitableQuery[]; labelledBy: string }) {
  const sources = useMemo(() => summarizeSources(cityId, entry).filter((s) => s.static?.kind !== 'basemap'), [cityId, entry])
  const nowYear = new Date().getFullYear()
  const primary = sources[0]
  const aboutHref = primary ? `/about#source-${cityId}-${primary.id}` : '/about#sources'
  const [titles, setTitles] = useState<Record<string, string>>({})
  const onTitle = useCallback((id: string, title: string) => setTitles((t) => (t[id] === title ? t : { ...t, [id]: title })), [])
  const citation = useMemo(() => citationLines({
    cityId, entry, records, portalTitles: titles,
    pageUrl: window.location.href, accessed: sfLocalCutoff(Date.now()).slice(0, 10),
  }).join('\n'), [cityId, entry, records, titles])
  return (
    <div role="dialog" aria-labelledby={labelledBy} className="panel-rise w-[26rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-lg bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl shadow-black/20 p-3">
      {sources.map((s) => s.kind === 'dataset'
        ? <DatasetBlock key={s.key} s={s} records={records} citable={entry.citable ?? []} nowYear={nowYear} open onTitle={onTitle} />
        : <StaticBlock key={s.key} s={s} />)}
      <footer className="flex items-center justify-between gap-2 pt-1">
        <p className="text-micro font-mono text-paper-600 dark:text-paper-400">via DataDiver · <Link className={LINK} to={aboutHref}>About this data →</Link></p>
        <CopyButton text={citation} label="Copy citation" />
      </footer>
    </div>
  )
}
```

- [ ] **Step 3: `SourcePill.tsx`**

```tsx
// src/components/maps/SourcePill.tsx
// The credit pill beside the Mapbox wordmark (spec §6). Mounted by MapView
// when the route's manifest entry declares sources; Demographics mounts it
// `inline` inside its cartogram legend. Tier 3 — no glow.
import { useEffect, useId, useRef, useState, useMemo, type KeyboardEvent } from 'react'
import { useRouteView, useViewEntry } from '@/cities/useActiveCity'
import { useCitableQueries } from '@/lib/provenance/citations'
import { summarizeSources, pillFace } from '@/lib/provenance/sourceLine'
import SourcePanel from './SourcePanel'

// Measured in plan Task 2 (spec §14): 10px margin + 88px wordmark + 8px gap.
const PILL_LEFT_PX = 106
const PILL_BOTTOM_PX = 10

export default function SourcePill({ inline = false }: { inline?: boolean }) {
  const { cityId } = useRouteView()
  const entry = useViewEntry()
  const records = useCitableQueries(cityId, entry?.viewId ?? 'home')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation(); setOpen(false); triggerRef.current?.focus()
  }

  const face = useMemo(() => (entry ? pillFace(summarizeSources(cityId, entry)) : ''), [cityId, entry])
  if (!entry || (!entry.sources?.length && !entry.staticSources?.length)) return null

  const wrapper = inline
    ? 'relative inline-block'
    : 'absolute z-20 bottom-11 left-3 desk:bottom-[var(--pill-bottom)] desk:left-[var(--pill-left)]'

  return (
    <div ref={ref} onKeyDown={onKeyDown} className={wrapper} style={{ ['--pill-left' as string]: `${PILL_LEFT_PX}px`, ['--pill-bottom' as string]: `${PILL_BOTTOM_PX}px` }}>
      <button
        ref={triggerRef}
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Where this data comes from — cite it or download the publisher's file"
        className="flex items-center gap-1.5 max-w-[14rem] h-[23px] px-2.5 rounded-full text-micro font-mono whitespace-nowrap
          bg-paper-50/90 dark:bg-espresso-900/90 text-ink dark:text-paper-200 ring-1 ring-paper-300/60 dark:ring-white/10
          hover:bg-paper-100 dark:hover:bg-espresso-800 transition-colors cursor-pointer"
      >
        <span className="truncate">{face}</span>
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M2 5l2-2 2 2" /></svg>
      </button>
      {open && (
        <div data-export-ignore className="absolute bottom-full left-0 mb-1.5 z-50">
          <SourcePanel cityId={cityId} entry={entry} records={records} labelledBy={id} />
        </div>
      )}
    </div>
  )
}
```

(The chevron points UP when closed because the panel opens upward.) Tailwind must see the arbitrary classes `desk:bottom-[var(--pill-bottom)]` / `desk:left-[var(--pill-left)]` literally — they are; if the build strips them, replace with the literal `desk:bottom-[10px] desk:left-[106px]` and delete the style prop.

- [ ] **Step 4: Mount in `MapView.tsx`.** Import `SourcePill` and render it as the LAST child of the `z-[2]` children container, after `{children}`'s wrapper:

```tsx
      <div className="absolute inset-0 z-[2] pointer-events-none">
        <div className="pointer-events-auto">
          {children}
        </div>
        <div className="pointer-events-auto">
          <SourcePill />
        </div>
      </div>
```

Fix the comment at lines 235–236 to: `// Zoom on the LEFT (bottom-right is occupied by the underlay/anomaly legend). Mapbox PREPENDS bottom-* controls, so the column reads top→bottom: attribution "i" · zoom · wordmark. The SourcePill sits right of the wordmark.`

- [ ] **Step 5: PNG exclusion.** `ExportButton.tsx:87`: `ignoreElements: (el: Element) => el.classList?.contains('mapboxgl-canvas') || el.hasAttribute?.('data-export-ignore'),`.

- [ ] **Step 6: Overlays yield.** `ChartTray.tsx:128`: `px-4 py-2` → `px-4 pt-2 pb-[4.75rem] desk:pb-10` (the bar's lowest row clears the credit row on desktop and the raised mobile pill). `Elections.tsx:1222`, `Neighborhood.tsx:433`, `EmergencyResponse.tsx:918`: `bottom-6` → `bottom-11`.

- [ ] **Step 7: Demographics cartogram.** Replace lines 658–660 (`<p className="text-[8px] …">Source: U.S. Census Bureau via DataDiver</p>`) with `<div className="mt-1.5"><SourcePill inline /></div>` and import it. Remove the header `DataSourceLine` at lines 482–486 (the pill carries it now); keep the `<p>` subtitle at 465.

- [ ] **Step 8: Build + walk**

Run: `npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`. Start/restart the Tarmac preview and walk `http://localhost:4173/crime-incidents`, `/housing`, `/elections`, `/demographics` (both modes), `/live`, `/oakland/crime-incidents`, both themes: the pill sits right of the wordmark; the panel opens upward; Escape closes and returns focus; the PNG export (panel closed) shows the pill, and (panel open) does not show the panel. Nothing in the panel says "Live". Screenshot each.

- [ ] **Step 9: Commit**

```bash
git add src/components/maps/SourcePill.tsx src/components/maps/SourcePanel.tsx src/components/maps/MapView.tsx src/components/export/ExportButton.tsx src/components/ui/ChartTray.tsx src/index.css src/views/Elections/Elections.tsx src/views/Neighborhood/Neighborhood.tsx src/views/EmergencyResponse/EmergencyResponse.tsx src/views/Demographics/Demographics.tsx
git commit -m "feat(maps): source pill beside the Mapbox wordmark — cite + download panel; overlays yield; PNG keeps the pill, drops the panel"
```

---

### Task 9: Tag the twelve views' citable queries; declare `citable`; HIN through `fetchDataset`

**Files:**
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx`, `src/views/CrimeIncidents/useCrimeEraData.ts` + `CrimeIncidents.tsx`, `src/views/TrafficSafety/TrafficSafety.tsx`, `src/views/Housing/Housing.tsx`, `src/views/ParkingRevenue/ParkingRevenue.tsx`, `src/views/Cases311/Cases311.tsx`, `src/views/ParkingCitations/ParkingCitations.tsx`, `src/views/BusinessActivity/BusinessActivity.tsx`, `src/views/Demographics/Demographics.tsx`, `src/views/Last48/Last48.tsx:128`, `src/cities/sf/manifest.ts`, `src/cities/oakland/manifest.ts`
- Test: `src/cities/sources.test.ts` (already written — the `tagged ⇔ declared` block now bites)

**Interfaces:**
- Consumes: Task 6 `cite` option shape `{ viewId, purpose, facet? }`.

- [ ] **Step 1: Declare `citable` on the manifests** (spec §4 table): SF emergency-response `['map-sample','scope-count','stat-totals','ranking','histogram','freshness']`; crime-incidents `['map-sample','stat-totals','ranking','freshness']`; traffic-safety `['map-sample','stat-totals','ranking','overlay','freshness']`; housing `['map-sample','stat-totals','ranking','freshness']`; parking-revenue `['map-sample','stat-totals','overlay','freshness']`; 311-cases `['map-sample','stat-totals','ranking','histogram','freshness']`; parking-citations `['map-sample','stat-totals','breakdown','freshness']`; business-activity `['map-sample','stat-totals','breakdown','freshness']`; demographics `['civic-metric']`; live `['window-sample','window-count']`. Oakland crime-incidents / 311-cases / parking-citations: same lists as their SF twins.

- [ ] **Step 2: Run the test to see it fail** — `pnpm vitest run src/cities/sources.test.ts` → the `tagged ⇔ declared` block fails for every declaring view (declared > tagged).

- [ ] **Step 3: Tag EmergencyResponse** (`viewId: 'emergency-response'`): add a 4th argument to each `useDataset` call — map sample (line ~194) `{ cite: { viewId: 'emergency-response', purpose: 'map-sample' } }`; count (~208) `'scope-count'`; city stats (~222) `'stat-totals'`; nh stats (~232) `'ranking'`; histogram (~244) `'histogram'`; and `useDataFreshness('fireEMSDispatch', 'received_dttm', dateRange, { cite: { viewId: 'emergency-response', purpose: 'freshness' } })`.

- [ ] **Step 4: Tag CrimeIncidents.** In `useCrimeEraData.ts` the hook receives `isSF`; derive `const viewId = 'crime-incidents' as const` and add `cite` to the existing options objects: `modern`/`hist`/`oak` row queries → `{ enabled: …, cite: { viewId, purpose: 'map-sample' } }`; `modernCount`/`histCount`/`oakCount` → `'stat-totals'`; `modernNhoods`/`histNhoods`/`oakNhoods` → `'ranking'`. (Three tags per purpose are fine: different `datasetKey`/city → different slots; the SF modern + historical pair share a purpose across two datasets, which the panel lists under each dataset.) In `CrimeIncidents.tsx:224-229` add `cite: { viewId: 'crime-incidents', purpose: 'freshness' }` to the freshness options. `useCrimeEraData.ts` is in the view's own directory, so its literals count.

- [ ] **Step 5: Tag TrafficSafety** (`'traffic-safety'`): rawData → `'map-sample'`; countRows → `'stat-totals'` with `facet: 'Crashes'`; the DUI count → `'stat-totals'`, `facet: 'DUI crashes'`; neighborhoodRows → `'ranking'`; speedCameras/redLightCameras/pavementCondition → `'overlay'` (facets `'Speed cameras'`, `'Red-light cameras'`, `'Pavement condition'`); freshness → `'freshness'`. Replace the raw HIN fetch (lines 317–325) with:

```ts
  const { data: hinRows } = useDataset<GeoJSON.Feature>(
    'highInjuryNetwork',
    { $limit: 10000 },
    [activeOverlays.has('hin')],
    { enabled: activeOverlays.has('hin'), cite: { viewId: 'traffic-safety', purpose: 'overlay', facet: 'High Injury Network' } },
  )
  const hinGeojson = useMemo<GeoJSON.FeatureCollection | null>(
    () => (hinRows.length ? { type: 'FeatureCollection', features: hinRows } : null),
    [hinRows],
  )
```

(`fetchDataset` already unwraps a GeoJSON FeatureCollection into its `features` array for `ext: 'geojson'` datasets — Task 6 Step 4.) Remove the now-unused `useState` import only if nothing else uses it.

- [ ] **Step 6: Tag Housing** (`'housing'`): evictionRows / buyoutRows → `'map-sample'`; evictionCountRows / buyoutCountRows → `'stat-totals'` (facet `'Notices'` / `'Buyouts'`); noFaultRows → `'stat-totals'`, `facet: 'No-fault notices'`; evictionScopeTotalRows → `'stat-totals'`, `facet: 'Notices in scope'`; medianBuyoutRows → `'stat-totals'`, `facet: 'Median buyout'`; declarationRows → `'stat-totals'`, `facet: 'Declarations'`; evictionNeighborhoodRows / buyoutNeighborhoodRows → `'ranking'`; freshness → `{ geoField: 'shape', cite: { viewId: 'housing', purpose: 'freshness' } }`.

- [ ] **Step 7: Tag ParkingRevenue** (`'parking-revenue'`): meters → `'overlay'`, `facet: 'Meter inventory'`; meterAgg → `'map-sample'`; statsAgg → `'stat-totals'`; freshness → `'freshness'`.

- [ ] **Step 8: Tag Cases311** (`'311-cases'`): rawData → `'map-sample'`; countRows → `'stat-totals'`, facet `'Cases'`; openCountRows → `'stat-totals'`, facet `'Open cases'`; resolutionStatsRows → `'stat-totals'`, facet `'Resolution time'`; resolutionHistogramRows → `'histogram'`; neighborhoodRows → `'ranking'`; freshness → add `cite` beside `cityId`.

- [ ] **Step 9: Tag ParkingCitations** (`'parking-citations'`): rawData → `'map-sample'`; countRows → `'stat-totals'`, facet `'Citations'`; revenueRows → `'stat-totals'`, facet `'Fines'`; avgFineRows → `'stat-totals'`, facet `'Average fine'`; oosCountRows → `'stat-totals'`, facet `'Out-of-state plates'` (keep `enabled: isSF`); violationRows → `'breakdown'`; freshness → add `cite` to both branches of the ternary.

- [ ] **Step 10: Tag BusinessActivity** (`'business-activity'`): openingsRaw → `'map-sample'`, facet `'Openings'`; closuresRaw → `'map-sample'`, facet `'Closures'`; the five count queries → `'stat-totals'` with facets `'Openings'`, `'Closures'`, `'Administrative closures'`, `'Active'`, `'All in range'`; the sector aggregation (line ~296) → `'breakdown'`; freshness → `'freshness'`.

- [ ] **Step 11: Tag Demographics + Last 48.** `Demographics.tsx:191`: `useCivicMetric(civicMetricKey, { cite: { viewId: 'demographics', purpose: 'civic-metric' } })`. `Last48.tsx:128`: `useLast48Window({ datasets, cite: { viewId: 'live', sample: 'window-sample', count: 'window-count' } })`.

- [ ] **Step 12: Run everything**

Run: `pnpm test && npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: PASS. Walk `/emergency-response`, `/traffic-safety` (toggle overlays), `/housing`, `/business-activity`, `/live`, `/demographics` (pick a civic Y) in the preview and open the panel on each: every declared purpose shows a block with a real query, counts match the cards ("newest 5,000 rows (capped)" when the map is capped), and the freshness line matches the header alert's date.

- [ ] **Step 13: Commit**

```bash
git add src/views src/cities/sf/manifest.ts src/cities/oakland/manifest.ts src/api/client.ts
git commit -m "feat(views): cite tags on the twelve map views' headline queries; citable declared and pinned; HIN through fetchDataset"
```

---

### Task 10: About — generated source tables, notes overlay, anchors

**Files:**
- Create: `src/views/About/sourceNotes.ts`, `src/views/About/sourceRows.ts`
- Modify: `src/views/About/About.tsx:51-150, 253-293`, `src/api/eraSources.test.ts:116-147`
- Test: `src/views/About/sourceRows.test.ts`

**Interfaces:**
- Produces: `SOURCE_NOTES: Readonly<Record<string, string>>` (keyed by Socrata id or NonSocrataId); `interface SourceTableRow { anchorId: string; name: string; publisher: string; id: string; href: string; dateField?: string; note?: string }`; `buildSourceRows(cityId: CityId): SourceTableRow[]`.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/About/sourceRows.test.ts
import { describe, it, expect } from 'vitest'
import { buildSourceRows } from './sourceRows'
import { SOURCE_NOTES } from './sourceNotes'
import { CITIES } from '@/cities/registry'
import { NON_SOCRATA, nonSocrataFor } from '@/lib/provenance/nonSocrata'

describe('About source rows', () => {
  it('SF: every registry entry + every SF static source, in that order', () => {
    const rows = buildSourceRows('sf')
    expect(rows).toHaveLength(Object.keys(CITIES.sf.datasets).length + nonSocrataFor('sf').length)
    expect(rows[0].id).toBe(Object.values(CITIES.sf.datasets)[0].id)
    expect(rows.at(-1)!.id).toBe(nonSocrataFor('sf').at(-1)!.id)
  })
  it('Oakland: 19 datasets + 4 static rows', () => {
    expect(buildSourceRows('oakland')).toHaveLength(23)
  })
  it('anchors are unique across both tables and prefixed by city', () => {
    const all = [...buildSourceRows('sf'), ...buildSourceRows('oakland')].map((r) => r.anchorId)
    expect(new Set(all).size).toBe(all.length)
    for (const a of all) expect(a).toMatch(/^source-(sf|oakland)-/)
  })
  it('every note key resolves to a source', () => {
    const ids = new Set([...Object.values(CITIES.sf.datasets), ...Object.values(CITIES.oakland.datasets)].map((c) => c.id).concat(Object.keys(NON_SOCRATA)))
    for (const key of Object.keys(SOURCE_NOTES)) expect(ids.has(key), key).toBe(true)
  })
  it('the two era clamps stay disclosed in the notes (Jesse, Sept. 2 2026)', () => {
    expect(SOURCE_NOTES['ab4h-6ztd']).toMatch(/2044/); expect(SOURCE_NOTES['ab4h-6ztd']).toMatch(/clamp/i)
    expect(SOURCE_NOTES['ppgh-7dqv']).toMatch(/2004/)
  })
  it('publisher column is the registry short form', () => {
    expect(buildSourceRows('sf').find((r) => r.id === 'wg3w-h783')!.publisher).toBe('SFPD')
  })
})
```

- [ ] **Step 2: Run to verify failure** — FAIL (modules missing).

- [ ] **Step 3: `sourceNotes.ts`** — move EVERY `note:` string from `SF_SOURCES`/`OAKLAND_SOURCES` verbatim, keyed by id:

```ts
// src/views/About/sourceNotes.ts
// The authored "Known limitations" overlay for the generated sources tables.
// Keys are Socrata 4×4 ids or NON_SOCRATA ids; sourceRows.test.ts fails on a
// key that resolves to no source. Text is reader-facing — keep it in the
// About voice. Two notes are test-pinned (the era clamps).
export const SOURCE_NOTES: Readonly<Record<string, string>> = {
  'nuek-vuh3': 'Publishes with ~12h intrinsic lag',
  'gnap-fj3t': 'Rolling 48h window; ~30min lag; no coordinates',
  '2zdj-bwza': 'Closed law-enforcement calls; no coordinates',
  'wg3w-h783': '~39h publish lag; rows are charge-level and cases carry supplemental reports — counts are distinct cases (see findings)',
  'tmnf-yvry': 'The 2003–May 2018 extract: a different schema and category vocabulary, read only for ranges before 2018 (see findings)',
  'vw6y-z8j6': '~15h intrinsic lag',
  'ubvf-ztfx': 'Double lag: ~4–6wk publish + longer fatality coding (see findings)',
  'enwt-3u8m': 'Vision Zero street segments; not updated (historical only)',
  'ab4h-6ztd': 'No coordinates after ~Oct 2025 (see findings); published dates run 1951–2044 at both ends and are data-entry errors, so charts and queries are clamped to 2012–2026',
  'g8m3-pdis': 'DataSF dropped industry labels (Jul 2026) — sectors derived from the raw NAICS code; ~96% of new registrations have no code (see findings)',
  '5cei-gny5': 'Notices filed with the SF Rent Board since 1997 — not completed evictions (see findings)',
  'wmam-7g8d': 'Disclosed tenant buyout agreements since March 2015; declarations excluded, amounts ~96% covered (see findings)',
  'pitq-e56w': 'SF filings only — excludes state FPPC/CAL-ACCESS',
  'n9pm-xkyq': '7.9M rows, FY2007+; basis of the ad-spend compliance work',
  'cqi5-hm2d': 'FY2018+',
  'sf-elections-results': 'NOT on DataSF — the Department of Elections publishes no results to the open data portal. Certified spreadsheets, read from the Department’s own archive (see findings)',
  'sf-precincts-2022': 'Precinct geometry, Nov 2022 onward',
  'sf-precincts-2012': 'Precinct geometry through Jun 2022 — precinct numbers are NOT comparable across the 2022 renumbering (see findings)',
  'sf-analysis-neighborhoods': 'The City’s 41 Analysis Neighborhoods, drawn from 2010 census tracts; DataDiver dissolves the tract fragments and drops alignment slivers (0.002% of area). Not codified in the Planning or Administrative Code',
  'acs-2023-5yr': 'NOT on either portal — U.S. Census Bureau estimates, published by block group (San Francisco) and census tract (Oakland) and summed here to the neighborhoods and regions each map is drawn on. Six SF measures (poverty, unemployment and the four commute shares) are averaged up from census tracts using the city’s official tract-to-neighborhood assignment',
  'ppgh-7dqv': 'Charge-level rows — every count dedupes by case number; the HOMICIDE code (mostly coroner death investigations) is split so it does not read as a murder count; ~3.4% carry no-location beat codes (77X/99X); clamped to 2004+ (earlier rows are a junk trickle)',
  'quth-gb8e': 'Coordinates from the srx/sry fields — the dataset’s own address point is junk; publishes next-day',
  '58em-y96b': 'Publishes ~11 weeks behind; violation descriptions carry a 10-character truncation era, so codes are grouped instead',
  'oak-beats': 'Vendored as the 59-beat spine; the layer names only 2 of its 59 polygons',
  'oak-neighborhoods': 'The official 131-polygon layer — it names DataDiver’s beat labels and, dissolved by its own code prefixes, defines the 10 demographic regions (see findings)',
  '3xq4-ermg': 'FPPC filings arrive in semiannual lumps — recent months are structurally incomplete until the next deadline',
  'bvfu-nq99': '1,553 rows carry no date ($3.39M) — disclosed in the view',
  'jkj3-8yq3': 'Its date field differs from every sibling schedule (exp_date, not expn_date)',
  'rsxe-vvuw': 'Registered, not yet read by a view; deliberately never summed (its cumulative-ish figures fabricate money)',
  '4fu2-d832': 'Registered, not yet read by a view; published empty',
}
```

Then, for each of the other ten `fppc*` ids that no view reads (`qaa7-q29f`, `ba44-jqtm`, `x5eg-xkea`, `9gcg-vghr`, `xuui-k2nt`, `qunm-zyau`, `jft9-u9bd`, `ub5g-m92u`, `6ejr-39gh`, `eted-3m9d`), add `'<id>': 'Registered, not yet read by a view'`.

- [ ] **Step 4: `sourceRows.ts`**

```ts
// src/views/About/sourceRows.ts
// The sources tables, GENERATED from the registry + NON_SOCRATA (spec §9).
// Pure and node-testable; About.tsx only renders it.
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import { nonSocrataFor } from '@/lib/provenance/nonSocrata'
import { portalPageUrl } from '@/lib/provenance/downloads'
import { SOURCE_NOTES } from './sourceNotes'

export interface SourceTableRow {
  anchorId: string
  name: string
  publisher: string
  id: string
  href: string
  dateField?: string
  note?: string
}

export function buildSourceRows(cityId: CityId): SourceTableRow[] {
  const city = getCity(cityId)
  const datasets = Object.values(city.datasets).map((c): SourceTableRow => ({
    anchorId: `source-${cityId}-${c.id}`, name: c.name, publisher: c.publisher.short, id: c.id,
    href: portalPageUrl(city.portal.host, c.id), dateField: c.dateField, note: SOURCE_NOTES[c.id],
  }))
  const statics = nonSocrataFor(cityId).map((s): SourceTableRow => ({
    anchorId: `source-${cityId}-${s.id}`, name: `${s.title} · ${s.vintage}`, publisher: s.publisher.short,
    id: s.socrataId ?? new URL(s.landingUrl).host.replace(/^www\./, ''), href: s.landingUrl, note: SOURCE_NOTES[s.id],
  }))
  return [...datasets, ...statics]
}
```

- [ ] **Step 5: Rewrite `About.tsx`'s table.** Delete `interface SourceRow`, `SF_SOURCES`, `OAKLAND_SOURCES` and the mirror comment (lines 84–150). Change `SourcesTable` to take `rows: SourceTableRow[]` (import from `./sourceRows`), add a `Publisher` column header after `Dataset`, render `<tr key={r.anchorId} id={r.anchorId} className="… scroll-mt-4">`, the link as `<a href={r.href} …>{r.id}</a>`, and a `<td>` for `r.publisher` (same classes as the Source ID cell). Give the section `id="sources"` and `className="mb-12 scroll-mt-4"`. Replace the two mounts with `<SourcesTable rows={buildSourceRows('sf')} />` and `<SourcesTable rows={buildSourceRows('oakland')} />`; the eyebrows read `{'──'} San Francisco · {CITIES.sf.portal.host}` and the Oakland twin (import `CITIES`).

- [ ] **Step 6: Re-point `eraSources.test.ts:116-147`.** Replace the `readFileSync`/`noteFor` regex with `import { SOURCE_NOTES } from '@/views/About/sourceNotes'` and `const noteFor = (id: string) => SOURCE_NOTES[id] ?? ''`. Delete the now-unused `readFileSync` import if nothing else in the file uses it. Keep the three assertions and the comment about Jesse's ruling.

- [ ] **Step 7: Run + walk**

Run: `pnpm test && npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`. Walk `/about#source-sf-wg3w-h783` in the preview: the page scrolls to the row; both tables render with the Publisher column; `tmnf-yvry` and the boundary row are present; the twelve unread FPPC rows say so.

- [ ] **Step 8: Commit**

```bash
git add src/views/About src/api/eraSources.test.ts
git commit -m "feat(about): sources tables generated from the registry + NON_SOCRATA; authored notes overlay; per-source anchors"
```

---

### Task 11: Riders — ACS vintage + corrections entry, Home host, dead hook, date formatter, license file, stream pins, comment drift

**Files:**
- Modify: `src/components/ui/NeighborhoodCensusContext.tsx:239-245`, `src/components/charts/DemographicCard.tsx:205`, `src/views/About/corrections.ts:43`, `src/views/About/corrections.test.ts:7-11`, `src/views/Home/Home.tsx:197,204`, `src/components/ui/DataFreshnessAlert.tsx`, `src/views/TrafficSafety/TrafficSafety.tsx:24,392`, `LICENSE-CONTENT.md:31-36`, `src/lib/alerts/streams.test.ts`, `src/utils/mapDefaults.ts:411`, `src/components/investigations/VisionZeroCounter.tsx:39`
- Delete: `src/hooks/useDistrictBoundaries.ts`

- [ ] **Step 1: The corrections entry (test first).** Add `'2026-09-04-acs-vintage-label'` to `PUBLISHED_IDS` in `corrections.test.ts` (top of the list). Run `pnpm vitest run src/views/About/corrections.test.ts` → FAIL. Then prepend to `CORRECTIONS`:

```ts
  {
    id: '2026-09-04-acs-vintage-label',
    date: '2026-09-04',
    dateLabel: 'Sept. 4, 2026',
    views: 'Census sidebar on Emergency Response · Crime Incidents · Traffic Safety · 311 Cases · Parking Revenue · Parking Citations · Business Activity',
    window: 'live from March 17, 2026 to Sept. 4, 2026',
    change:
      'The neighborhood census sidebar now names its source as the American Community Survey 2019–2023 5-year estimates.',
    before:
      'It read "ACS 2020-2024". No 2020–2024 vintage exists in the data DataDiver serves; every figure on those seven sidebars was and is from the 2019–2023 5-year estimates, the same vintage the Demographics view and the About page already named.',
  },
```

(`id`/`date` use the day the fix ships — if that is not Sept. 4, change both together; the test pins `id.startsWith(date)`. The spec's §11.1 drafted the id as `2026-09-03-…`; Task 13 updates the spec to the shipped id.)

- [ ] **Step 2: One vintage.** `NeighborhoodCensusContext.tsx:241-245`: replace the `DataSourceLine` with `<DataSourceLine dataset={NON_SOCRATA['acs-2023-5yr'].title} source={NON_SOCRATA['acs-2023-5yr'].publisher.short} vintage={NON_SOCRATA['acs-2023-5yr'].vintage} />` (import `NON_SOCRATA`). `DemographicCard.tsx:205`: derive the `ACS 2019–2023` literal from the same row (`NON_SOCRATA['acs-2023-5yr'].vintage.replace(' 5-year estimates', '')`). Add a test in `src/lib/provenance/nonSocrata.test.ts`: `expect(NON_SOCRATA['acs-2023-5yr'].vintage).toBe('ACS 2019–2023 5-year estimates')` and a file-scan assertion that `src/components/ui/NeighborhoodCensusContext.tsx` no longer contains `2020-2024`.

- [ ] **Step 3: Home host.** `Home.tsx:197` and `:204`: replace `datasf.sfgov.org` with `${city.portal.host}` (the component already has `city` from `useActiveCity()`; if not, add it).

- [ ] **Step 4: Dead hook.** `git rm src/hooks/useDistrictBoundaries.ts` (zero importers — confirm with `grep -rn useDistrictBoundaries src` → only the file itself).

- [ ] **Step 5: Date-only formatter.** `DataFreshnessAlert.tsx`: replace every `formatDate(x)` / `formatDate(x, 'long')` on `latestDate`, `latestGeoDate`, `suggestedRange.*` with `apDate(x, new Date().getFullYear())` (import from `@/utils/apDate`); drop the `formatDate` import. `TrafficSafety.tsx:392`: `formatDate(trend.effectiveEnd)` → `apDate(trend.effectiveEnd, new Date().getFullYear())`; remove `formatDate` from the import at line 24 if unused.

- [ ] **Step 6: LICENSE-CONTENT.md:31-36.** Replace "Caltrans" with "the U.S. Census Bureau" and append to the derived-datasets bullet (line ~24): "(the San Francisco neighborhood polygons are DataSF's Analysis Neighborhoods layer, `j2bu-swwd`, PDDL)".

- [ ] **Step 7: Stream + ticker pins.** Append to `streams.test.ts`:

```ts
  it('socrataId + dateField match the SF registry (the ONE authored truth)', () => {
    const byId = Object.fromEntries(Object.values(CITIES.sf.datasets).map((c) => [c.id, c]))
    for (const [id, cfg] of Object.entries(ALERT_STREAMS)) {
      expect(byId[cfg.socrataId], `${id} → ${cfg.socrataId}`).toBeDefined()
      if (id !== 'business-openings') expect(byId[cfg.socrataId].dateField, id).toBe(cfg.dateField)
    }
  })
```

(import `CITIES` from `../../cities/registry.js` — mind the `.js` suffix the file already uses for relative imports; `business-openings` deliberately uses `location_start_date` where the registry's `dateField` is `dba_start_date` — leave it and say so in a comment.) Also add to `crimeCount.test.ts`'s scan block: every `datasetId: '<4x4>'` literal in `src/hooks/useCivicIndicators.ts` and `useOaklandIndicators.ts` must be an id in the matching registry.

- [ ] **Step 8: Comment drift + the last hand-typed publishers.** `mapDefaults.ts:411`: `essential: true, // NOT reduced-motion aware: essential animations run even under prefers-reduced-motion (Mapbox semantics)`. The six Home investigation cards' `sourceName` literals read the registry: `VisionZeroCounter.tsx:39` → `` `${CITIES.sf.datasets.trafficCrashes.publisher.short} · Traffic Crashes` `` (drops "TransBASE"); `DispatchUnanswered.tsx:25` and `ResponseEquity.tsx:23` → `` `${CITIES.sf.datasets.fireEMSDispatch.publisher.short} · Fire/EMS dispatch` ``; `DeficitCounter.tsx:119` → `` `${CITIES.sf.datasets.spendingRevenue.publisher.short} · Spending & Revenue` ``; `ComplianceTracker.tsx:62` → `` `${CITIES.sf.datasets.vendorPayments.publisher.short} · Vendor Payments` ``; `Last48Pulse.tsx:32` stays `DataSF · Live streams` (SF Home may say Live). `ParkingCitations.tsx:845`: `{isSF ? 'SFMTA' : 'OakDOT'}` → `{city.datasets.parkingCitations.publisher.short}` (the component already reads `city`/`cityId`; if only `cityId` is in scope use `getCity(cityId)`).

- [ ] **Step 9: Run + build + walk**

Run: `pnpm test && npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`. Walk `/about#correction-2026-09-04-acs-vintage-label`, `/crime-incidents` (sidebar census vintage reads 2019–2023), `/` (health pill title names data.sfgov.org), `/traffic-safety` (clamp subtitle date is not a day early — compare with the freshness alert).

- [ ] **Step 10: Commit**

```bash
git add -A src LICENSE-CONTENT.md
git commit -m "fix(provenance riders): ACS vintage + corrections entry; Home host from the registry; dead district hook; AP dates on freshness; license file names Census, not Caltrans; stream/ticker id pins"
```

---

### Task 12: Re-vendor the SF neighborhood polygons from DataSF `j2bu-swwd`

**Files:**
- Modify: `scripts/build-neighborhood-boundaries.py:1-60`, `scripts/generate-census-static.ts:500`, `public/data/geo/sf-analysis-neighborhoods.geojson` (regenerated)

- [ ] **Step 1: Re-point the script.** Replace the docblock's "WHY THIS EXISTS" first paragraph and `SOURCE`:

```python
"""
Build public/data/geo/sf-analysis-neighborhoods.geojson.

WHY THIS EXISTS
---------------
The polygons are DataSF's official "Analysis Neighborhoods" layer (j2bu-swwd,
PDDL, Publishing Department: Planning). Until Sept. 2026 DataDiver fetched a
2016 export of the same geometry mirrored on a volunteer GitHub repo
(sfbrigade/data-science-wg) — byte-identical to DataSF's tract layer
m46u-xzix on all 195 features, but unlicensed and unpinned. Re-pointing here
changed nothing measurable: the 41 names equal SF_NEIGHBORHOODS exactly and
the census block-group crosswalk re-ran 677/677 identical (spec
2026-09-03-source-pill-design.md §3.3).
…(keep the rest of the docblock)
"""
SOURCE = 'https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100'
```

The feature loop stays (the layer is already 41 MultiPolygons; `unary_union` over one geometry is the identity, the sliver drop and rounding still apply). Update the final print to say `41 neighborhoods` either way.

- [ ] **Step 2: `generate-census-static.ts:500`**: `NEIGHBORHOOD_GEOJSON_URL = 'https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100'` (edit only — do NOT run the script).

- [ ] **Step 3: Regenerate**

Run: `python3 -c "import shapely" || pip install shapely` then `python3 scripts/build-neighborhood-boundaries.py`.
Expected: `41 tract fragments → 41 neighborhoods` (or similar), area drift ≤ 0.01%.

- [ ] **Step 4: Prove behavior-neutral**

Run: `git diff --stat public/data/geo/ && python3 - <<'EOF'
import json; f=json.load(open('public/data/geo/sf-analysis-neighborhoods.geojson'))
print(len(f['features']), sorted(x['properties']['nhood'] for x in f['features'])[:3])
EOF` then `pnpm test`.
Expected: 41 features; `precinctJoin.test.ts`, `census-sf.test.ts`, and every boundary consumer's test stay green. If the diff is large in bytes but the tests pass, it is coordinate ordering — fine. If any name differs, STOP and report (the spec's premise would be false).

- [ ] **Step 5: Commit**

```bash
git add scripts/build-neighborhood-boundaries.py scripts/generate-census-static.ts public/data/geo/sf-analysis-neighborhoods.geojson
git commit -m "chore(geo): SF Analysis Neighborhoods re-vendored from DataSF j2bu-swwd (PDDL) — behavior-neutral"
```

---

### Task 13: Docs — CLAUDE.md, data-insights, spec as-built note

**Files:**
- Modify: `CLAUDE.md` (Maps section + Views inventory Home/About bullets + Z-index note), `docs/data-insights.md`, `docs/superpowers/specs/2026-09-03-source-pill-design.md`

- [ ] **Step 1: CLAUDE.md.** Add a `### Source pill + provenance registry (PR #TBD, Sept. 2026)` block under Key Conventions with these rules, each one line: registry `publisher` is required and authored (no TransBASE, no "Live"); `NON_SOCRATA` is the table for non-portal sources; manifest `sources`/`staticSources`/`citable` are pinned by `sources.test.ts` (fetched ⇔ declared ⇔ tagged — a new `useDataset` key needs a manifest edit; a new `cite` needs a `citable` entry); `cite` is opt-in on `fetchDataset` and hooks take it from callers (never hardcode a purpose in a shared hook); the pill is MapView-owned and mounts wherever the entry declares sources; the open panel carries `data-export-ignore`; overlays yield to the credit row (`bottom-11`, ChartTray `pb-10`); the SF polygons are DataSF `j2bu-swwd`; About's tables are generated (notes in `sourceNotes.ts`, anchors `#source-<city>-<id>`); `apDate` lives in `src/utils/apDate.ts`; `formatDate()` is banned on date-only strings. Update the About bullet ("26 rows / 11 rows" → generated) and the Maps bullet (the attribution "i" is restyled per theme).

- [ ] **Step 2: data-insights.md.** Under a new `## Provenance` (or the nearest existing methodology section) add: the Socrata metadata probe facts (attribution null on 20/52; license set PDDL/CC0/PUBLIC_DOMAIN/absent; SF cadence under `Publishing Details`, Oakland only on FPPC; `rowsUpdatedAt` is a push time, never "data through"); the sfbrigade finding (verbatim DataSF export; j2bu-swwd identical; crosswalk 677/677); the dead `/api/geospatial` export endpoint; the `/resource/<id>.csv` download form honouring SoQL with no 50k cap on these hosts.

- [ ] **Step 3: Spec as-built.** Append `## 15. As built` to the spec: the real `sources` table the scan produced (paste from the manifests), the measured constants, the shipped corrections id (update §11.1's drafted `2026-09-03-…` id), and any ruling made during execution.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/data-insights.md docs/superpowers/specs/2026-09-03-source-pill-design.md
git commit -m "docs: source pill conventions in CLAUDE.md; provenance findings in data-insights; spec as-built"
```

---

### Task 14: Final walk + PR

- [ ] **Step 1:** `pnpm test && npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build` — all green.
- [ ] **Step 2:** Preview walk (Tarmac `datadiver-preview`): all twelve map views × light/dark; `data-type-scale` default/large/xl on `/crime-incidents`; phone width 390 (resize) on `/311-cases` — pill hidden at glimpse, visible after dragging the sheet to peek; PNG export closed/open on `/housing`; `/oakland/crime-incidents` panel says "Complete through … · newest row …" and never "Live"; `/elections` with the RCV panel open does not cover the pill; `/demographics` cartogram pill inline; `/about#sources`.
- [ ] **Step 3:** `unset GITHUB_TOKEN && git push -u origin feat/source-pill`, then `gh pr create` with a body that lists: the rulings honoured, the corrections entry, the re-vendor proof, the follow-ups (chart-only header pill, trend/comparison purposes, Elections 20251104, the two remaining crime `COUNT(*)` sites), ending with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` and the session link. Jesse merges.
