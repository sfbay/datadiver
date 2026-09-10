# Photoreal Last 48 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a photoreal 3D tour mode to The Last 48 (`/live`) — CesiumJS over Google Photorealistic 3D Tiles, the three streams as precision-honest marks, a slow orbit tour with a fill-in bubble — behind a persisted map-engine preference and a map picker, with Cesium kept off the entry bundle.

**Architecture:** A sibling renderer. `Last48.tsx` keeps owning the 48h data hook, URL params, and header; when the effective map engine is `photoreal` it mounts a lazy `Last48Photoreal` chunk instead of the Mapbox `Last48UnifiedView`. The tour's pure parts (`tour.ts`, `pace.ts`, `useAmbientTour`) are reused verbatim; only the camera driver, the marker layer, and the bubble are new. Pure leaves (`mapEngine`, `markerPrecision`, `tourChain`, `cameraPose`, `ageRamp`, `eventCardModel`, `grade`) carry the logic and the tests; the Cesium-bound files are thin.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind v4; CesiumJS 1.145 (npm `cesium`); Google Map Tiles API (Photorealistic 3D Tiles); Zustand; Vitest (node-only, `src/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-09-photoreal-last48-design.md` (approved 2026-09-09). The spec is the authority; this plan argues from it.

## Global Constraints

- Branch `feat/photoreal-last48`. Never commit to `main`.
- **Cesium must never reach the entry bundle.** Only the lazy `src/views/Last48/photoreal/**` modules may `import … from 'cesium'`; a build-time check fails `pnpm build` otherwise.
- **No key in the repo.** The Google key is `import.meta.env.VITE_GOOGLE_TILES_KEY`, read ONLY inside `src/views/Last48/photoreal/`. Local value lives in `.env.local` (gitignored). Production value is set in the Vercel dashboard only (never `vercel env add`).
- Vitest is node-only over `src/**/*.test.ts`. `.tsx` files have no tests; pure logic goes in `.ts` leaves so it is testable. Never import `cesium` or `appStore` in a test.
- `md:` is banned in app code; write `desk:`. Micro type uses the `text-nano` / `text-micro` / `text-label` tokens, never `text-[9px]`-style sizes.
- Reader-facing prose is body serif; mono is for labels, values, and eyebrows.
- Stream pigments are fixed: 911 `#616a96`, Fire/EMS `#b85a33`, 311 `#7a9954`.
- Marker precision classes are fixed: `'911-realtime'` → `intersection`, `'fire-ems-dispatch'` → `intersection`, `'311-cases'` → `address`.
- Cinema pace values: `orbitDegPerS 1`, `tweenMs 9000`, `dwellMs 30000`, `breathMs 14000`, `pitchMin 30`.
- Orbit geometry defaults: range 620 m, pitch −30°. Tile detail: `maximumScreenSpaceError` 40 in flight, 10 in orbit. Settle cap 12 000 ms. `resolutionScale` 0.65. Marker draw radius 1.5 km.
- Every geometry-size animation is forbidden (rebuilds geometry per frame); animate colour only via `CallbackProperty` on a material.
- Build through `~/dev/devman/tools/devman-build.mjs pnpm build`. Run `pnpm test` before every commit. Never run `pnpm dev` from a shell (Tarmac owns dev servers).
- Commit messages end with the attribution trailer given in the session.

---

## File structure

**Create**
- `src/stores/mapEngine.ts` (+ `.test.ts`) — preference leaf: type, parser, effective-engine coercion.
- `src/views/Last48/ageRamp.ts` (+ `.test.ts`) — `COLORS`, `PAPER_ANCHOR`, `AGE_BUCKETS`, `LATENCY_BASELINE_MS`, `ageBucket`, `ageColor` (extracted from FlowMapLayer).
- `src/views/Last48/detail/eventCardModel.ts` (+ `.test.ts`) — `DATASET_META`, `formatAge`, `formatApDate`, `formatApWeekday`, `compactFields`, `extractId`, `resolveExplore`, `locationLine` (extracted from Last48EventCard + the precision line).
- `src/views/Last48/photoreal/markerPrecision.ts` (+ `.test.ts`) — the precision table.
- `src/views/Last48/photoreal/tourChain.ts` (+ `.test.ts`) — newest-24 → nearest-neighbour order.
- `src/views/Last48/photoreal/cameraPose.ts` (+ `.test.ts`) — pure WGS84/ENU orbit pose (position + direction + up in ECEF).
- `src/views/Last48/photoreal/grade.ts` (+ `.test.ts`) — grade table + GLSL source; the Cesium `CustomShader` is built in the shell from it.
- `src/views/Last48/photoreal/Last48Photoreal.tsx` — the lazy chunk: viewer, tileset, key, fallback, credits, theme grade; mounts markers, conductor, bubble.
- `src/views/Last48/photoreal/PhotorealMarkers.ts` — imperative marker layer over `viewer.entities`.
- `src/views/Last48/photoreal/useCesiumDirector.ts` — flight + orbit hold + tiles-by-phase + settle gate.
- `src/views/Last48/photoreal/PhotorealConductor.tsx` — phase machine + exit-on-input + tour wiring (Cesium twin of `AmbientConductor`).
- `src/views/Last48/photoreal/PhotorealBubble.tsx` — the pinned fill-in card.
- `src/components/maps/MapPicker.tsx` — the picker control.
- `scripts/copy-cesium-assets.mjs` — copies Cesium static assets into `public/cesium/`.
- `scripts/check-entry-bundle.mjs` — fails the build if the entry chunk or `index.html` references Cesium.

**Modify**
- `src/stores/appStore.ts` — `mapEngine` field + `setMapEngine`.
- `src/views/Last48/modes/FlowMapLayer.tsx` — import the ramp from `ageRamp.ts`.
- `src/views/Last48/detail/Last48EventCard.tsx` — import the model from `eventCardModel.ts`; location row uses `locationLine`.
- `src/views/Last48/ambient/pace.ts` (+ test) — `cinema` preset with `photorealOnly: true`.
- `src/views/Last48/ambient/AmbientToggle.tsx` — hide `photorealOnly` presets unless `photoreal` prop.
- `src/views/Last48/Last48.tsx` — engine branch, MapPicker in the control row, withheld controls.
- `src/components/layout/AppShell.tsx` — MapPicker beside the dark-mode toggle (site-wide rows only).
- `vite.config.ts`, `package.json`, `.gitignore` — Cesium chunk, asset copy, entry-bundle check.
- `src/lib/provenance/nonSocrata.ts` — `google-3d-tiles` row.
- `src/views/About/sourceNotes.ts` — precision notes for the three streams + the Google row.
- `src/cities/sf/datasets.ts` — `dispatch911Realtime` gains `hasGeo: true, geoField: 'intersection_point'`.
- `docs/data-insights.md`, `CLAUDE.md`, the spec (as-built notes).

---

### Task 1: `mapEngine` preference leaf + store field

**Files:**
- Create: `src/stores/mapEngine.ts`
- Create: `src/stores/mapEngine.test.ts`
- Modify: `src/stores/appStore.ts` (interface ~line 20, hydration ~line 93, actions ~line 128)

**Interfaces:**
- Consumes: nothing (zero-import leaf).
- Produces: `type MapEngine`, `parseMapEngine(raw): MapEngine`, `effectiveMapEngine(pref, ctx): MapEngine`, `STANDARD_SHIPPED`, `MAP_ENGINE_STORAGE_KEY`; store `mapEngine: MapEngine`, `setMapEngine(engine: MapEngine): void`.

- [ ] **Step 1: Write the failing test**

```ts
// src/stores/mapEngine.test.ts
import { describe, it, expect } from 'vitest'
import { parseMapEngine, effectiveMapEngine, STANDARD_SHIPPED, MAP_ENGINE_STORAGE_KEY } from './mapEngine'

describe('parseMapEngine', () => {
  it('accepts the three engines', () => {
    expect(parseMapEngine('classic')).toBe('classic')
    expect(parseMapEngine('standard')).toBe('standard')
    expect(parseMapEngine('photoreal')).toBe('photoreal')
  })
  it('defaults to classic for null, empty, or stale values', () => {
    expect(parseMapEngine(null)).toBe('classic')
    expect(parseMapEngine('')).toBe('classic')
    expect(parseMapEngine('satellite')).toBe('classic')
  })
  it('storage key follows the dd- convention', () => {
    expect(MAP_ENGINE_STORAGE_KEY).toBe('dd-map-engine')
  })
})

describe('effectiveMapEngine', () => {
  const ok = { isMobile: false, viewId: 'live' as const, hasKey: true }
  it('photoreal survives only on /live, desktop, with a key', () => {
    expect(effectiveMapEngine('photoreal', ok)).toBe('photoreal')
    expect(effectiveMapEngine('photoreal', { ...ok, isMobile: true })).toBe('classic')
    expect(effectiveMapEngine('photoreal', { ...ok, viewId: 'crime-incidents' })).toBe('classic')
    expect(effectiveMapEngine('photoreal', { ...ok, viewId: null })).toBe('classic')
    expect(effectiveMapEngine('photoreal', { ...ok, hasKey: false })).toBe('classic')
  })
  it('standard is coerced to classic until Spec B ships', () => {
    expect(STANDARD_SHIPPED).toBe(false)
    expect(effectiveMapEngine('standard', ok)).toBe('classic')
  })
  it('classic passes through', () => {
    expect(effectiveMapEngine('classic', ok)).toBe('classic')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/stores/mapEngine.test.ts`
Expected: FAIL — cannot resolve `./mapEngine`.

- [ ] **Step 3: Write the leaf**

```ts
// src/stores/mapEngine.ts
//
// Pure hydration + coercion logic for the map-engine preference, split out
// of appStore.ts for the same reason as typeScale.ts: appStore touches
// window/localStorage at module eval and is unimportable under the
// node-only Vitest; this leaf has no DOM dependency, so it is testable.
//
// Three engines: 'classic' (today's Mapbox dark/light v11), 'standard'
// (Mapbox Standard 3D — Spec B, not shipped), 'photoreal' (Cesium + Google
// Photorealistic 3D Tiles — a mode of The Last 48 only). The PREFERENCE is
// what the reader picked; the EFFECTIVE engine is what this route, device
// and key can honour. Never render from the preference directly.
export type MapEngine = 'classic' | 'standard' | 'photoreal'

const VALID: MapEngine[] = ['classic', 'standard', 'photoreal']

export const MAP_ENGINE_STORAGE_KEY = 'dd-map-engine'

/** Flip to true when Spec B (Mapbox Standard site-wide) ships. Until then a
 *  stored 'standard' preference renders classic and the picker hides it. */
export const STANDARD_SHIPPED = false

/** Allow-list parse of the raw localStorage value; anything else → classic. */
export function parseMapEngine(raw: string | null): MapEngine {
  return VALID.includes(raw as MapEngine) ? (raw as MapEngine) : 'classic'
}

export interface EngineContext {
  /** Effective-width mobile (useIsMobile). Photoreal is desktop-only. */
  isMobile: boolean
  /** Route-derived view id (RouteIdentity.viewId is a plain string);
   *  photoreal exists only on The Last 48. */
  viewId: string | null
  /** VITE_GOOGLE_TILES_KEY present. No key → photoreal is never offered. */
  hasKey: boolean
}

/** The engine this route/device/key can actually honour. */
export function effectiveMapEngine(pref: MapEngine, ctx: EngineContext): MapEngine {
  if (pref === 'photoreal') {
    return ctx.viewId === 'live' && !ctx.isMobile && ctx.hasKey ? 'photoreal' : 'classic'
  }
  if (pref === 'standard') return STANDARD_SHIPPED ? 'standard' : 'classic'
  return 'classic'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/stores/mapEngine.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the store field and setter**

In `src/stores/appStore.ts`:

```ts
// imports (top)
import { parseMapEngine, MAP_ENGINE_STORAGE_KEY, type MapEngine } from '@/stores/mapEngine'

// interface AppState — after `typeScale: TypeScale`
  /** Map-engine PREFERENCE (classic | standard | photoreal). Render from
   *  effectiveMapEngine(), never from this field directly — photoreal is
   *  honoured only on /live, desktop, with a Google key. */
  mapEngine: MapEngine

// actions — after setTypeScale
  setMapEngine: (engine: MapEngine) => void

// hydration — after the typeScale line
  mapEngine: parseMapEngine(localStorage.getItem(MAP_ENGINE_STORAGE_KEY)),

// implementation — after setTypeScale's block
  setMapEngine: (engine) => set(() => {
    try {
      localStorage.setItem(MAP_ENGINE_STORAGE_KEY, engine)
    } catch {
      // Private-mode / quota failures must not block the in-session switch;
      // the preference just won't persist.
    }
    return { mapEngine: engine }
  }),
```

- [ ] **Step 6: Typecheck and test**

Run: `npx tsc -b && pnpm test`
Expected: clean; the full suite passes.

- [ ] **Step 7: Commit**

```bash
git add src/stores/mapEngine.ts src/stores/mapEngine.test.ts src/stores/appStore.ts
git commit -m "feat(map-engine): persisted map-engine preference leaf + store field"
```

---

### Task 2: Extract the age ramp into `ageRamp.ts` (behaviour-neutral)

**Files:**
- Create: `src/views/Last48/ageRamp.ts`
- Create: `src/views/Last48/ageRamp.test.ts`
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx:52-120` (delete the block; import instead), line ~390 unchanged.

**Interfaces:**
- Consumes: `mixHex` from `@/utils/colorMix`, `DatasetId` from `@/types/last48`.
- Produces: `COLORS: Record<DatasetId,string>`, `PAPER_ANCHOR`, `AGE_BUCKETS`, `LATENCY_BASELINE_MS`, `ageBucket(datasetId, rawAgeMs)`, `ageColor(datasetId, rawAgeMs): string`.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/Last48/ageRamp.test.ts
import { describe, it, expect } from 'vitest'
import { COLORS, PAPER_ANCHOR, AGE_BUCKETS, LATENCY_BASELINE_MS, ageBucket, ageColor } from './ageRamp'
import { LAST48_DATASETS } from '@/types/last48'

const H = 60 * 60 * 1000

describe('ageRamp — byte-pinned to the Flow layer values', () => {
  it('stream pigments', () => {
    expect(COLORS).toEqual({ '911-realtime': '#616a96', 'fire-ems-dispatch': '#b85a33', '311-cases': '#7a9954' })
    expect(PAPER_ANCHOR).toBe('#d4c8a8')
  })
  it('bucket stops and latency floors', () => {
    expect(AGE_BUCKETS).toEqual([
      { maxHours: 6, mix: 0 }, { maxHours: 18, mix: 0.45 }, { maxHours: 30, mix: 0.6 }, { maxHours: 48, mix: 0.7 },
    ])
    expect(LATENCY_BASELINE_MS).toEqual({ '911-realtime': 30 * 60 * 1000, 'fire-ems-dispatch': 12 * H, '311-cases': 15 * H })
  })
  it('an event at its stream floor is fresh (full pigment)', () => {
    for (const id of LAST48_DATASETS) {
      expect(ageBucket(id, LATENCY_BASELINE_MS[id]).mix).toBe(0)
      expect(ageColor(id, LATENCY_BASELINE_MS[id])).toBe(COLORS[id])
    }
  })
  it('ages past the last stop stay in the last bucket', () => {
    expect(ageBucket('311-cases', 200 * H).mix).toBe(0.7)
  })
  it('a mixed colour is a hex string that is not the base pigment', () => {
    const c = ageColor('911-realtime', 30 * 60 * 1000 + 10 * H)
    expect(c).toMatch(/^#[0-9a-f]{6}$/i)
    expect(c).not.toBe(COLORS['911-realtime'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/views/Last48/ageRamp.test.ts`
Expected: FAIL — cannot resolve `./ageRamp`.

- [ ] **Step 3: Create the leaf by MOVING the block**

Cut lines 52–120 of `src/views/Last48/modes/FlowMapLayer.tsx` (from `const COLORS` through the end of `ageColor`, including their comments) into the new file, prefixed with:

```ts
// src/views/Last48/ageRamp.ts
//
// The tonal age ramp, shared by the Mapbox FLOW layer and the photoreal
// marker layer. Pure: (datasetId, ageMs) → colour. Extracted verbatim from
// FlowMapLayer.tsx on 2026-09-09 so both renderers age events identically;
// ageRamp.test.ts byte-pins the pigments, bucket stops and latency floors.
import type { DatasetId } from '@/types/last48'
import { mixHex } from '@/utils/colorMix'

export const COLORS: Record<DatasetId, string> = { … }   // unchanged values
export const PAPER_ANCHOR = '#d4c8a8'
export const AGE_BUCKETS: Array<{ maxHours: number; mix: number }> = [ … ]
export const LATENCY_BASELINE_MS: Record<DatasetId, number> = { … }
export function ageBucket(datasetId: DatasetId, rawAgeMs: number) { … }
export function ageColor(datasetId: DatasetId, rawAgeMs: number): string { … }
```

(Keep every comment; only add `export`.) In `FlowMapLayer.tsx` replace the removed block with:

```ts
import { COLORS, ageColor } from '../ageRamp'
```

and delete the now-unused `import { mixHex } from '@/utils/colorMix'` if nothing else in the file uses it (check with `grep -n mixHex`).

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm vitest run src/views/Last48/ageRamp.test.ts && npx tsc -b`
Expected: PASS; tsc clean (no unused import).

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/ageRamp.ts src/views/Last48/ageRamp.test.ts src/views/Last48/modes/FlowMapLayer.tsx
git commit -m "refactor(last48): extract the tonal age ramp into a shared pure leaf (behaviour-neutral)"
```

---

### Task 3: Extract the event-card model into `eventCardModel.ts` (behaviour-neutral + the precision line)

**Files:**
- Create: `src/views/Last48/detail/eventCardModel.ts`
- Create: `src/views/Last48/detail/eventCardModel.test.ts`
- Create: `src/views/Last48/photoreal/markerPrecision.ts` (needed by `locationLine`; its own test lands in Task 4)
- Modify: `src/views/Last48/detail/Last48EventCard.tsx` — delete lines 18–210 (DATASET_META … resolveExplore) and import; location row uses `locationLine`.

**Interfaces:**
- Consumes: `NormalizedEvent`, `DatasetId`; `PRECISION` from `../photoreal/markerPrecision`.
- Produces: `DATASET_META`, `formatAge(receivedAt, now?)`, `formatApDate(ms)`, `formatApWeekday(ms)`, `compactFields(event)`, `populatedFields(event)`, `extractId(event)`, `resolveExplore(event)`, `locationLine(event): { label: string; place: string } | null`.

- [ ] **Step 1: Write the precision leaf (tiny, tested in Task 4)**

```ts
// src/views/Last48/photoreal/markerPrecision.ts
//
// ZERO-IMPORT leaf. What a published coordinate MEANS per Last 48 stream —
// probed 2026-09-09 against the live API (newest 2,000 rows each):
//   911 realtime   gnap-fj3t  intersection_point  60% distinct, intersection names
//   Fire/EMS       nuek-vuh3  case_location       35% distinct, "MISSION ST/PARK ST"
//   311            vw6y-z8j6  point               90% distinct, "831 FULTON ST"
// So 911 and Fire/EMS are snapped to the nearest intersection (~half a block
// of true uncertainty) and 311 is address-level. Marker SHAPE and the card's
// location label both read this table; a needle on a corner would be false
// precision for two of the three streams.
export type MarkerPrecision = 'intersection' | 'address'

export const PRECISION = {
  '911-realtime': 'intersection',
  'fire-ems-dispatch': 'intersection',
  '311-cases': 'address',
} as const satisfies Record<string, MarkerPrecision>

export const PRECISION_LABEL: Record<MarkerPrecision, string> = {
  intersection: 'Nearest intersection',
  address: 'Address',
}
```

- [ ] **Step 2: Write the failing model test**

```ts
// src/views/Last48/detail/eventCardModel.test.ts
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import {
  DATASET_META, formatAge, formatApDate, compactFields, populatedFields,
  extractId, resolveExplore, locationLine,
} from './eventCardModel'

const base = (over: Partial<NormalizedEvent>): NormalizedEvent => ({
  id: 'x', datasetId: '911-realtime', timestamp: '2026-09-09T15:49:00', receivedAt: 0, raw: {}, ...over,
})

describe('DATASET_META', () => {
  it('pins label + pigment per stream', () => {
    expect(DATASET_META['911-realtime']).toEqual({ label: '911 DISPATCH', color: '#616a96' })
    expect(DATASET_META['fire-ems-dispatch']).toEqual({ label: 'FIRE/EMS', color: '#b85a33' })
    expect(DATASET_META['311-cases']).toEqual({ label: '311 CASE', color: '#7a9954' })
  })
})

describe('formatAge', () => {
  it('seconds → minutes → hours → days with singular forms', () => {
    const now = 1_000_000_000_000
    expect(formatAge(now - 1_000, now)).toEqual({ magnitude: '1', unit: 'second ago' })
    expect(formatAge(now - 43 * 60_000, now)).toEqual({ magnitude: '43', unit: 'minutes ago' })
    expect(formatAge(now - 2 * 3_600_000, now)).toEqual({ magnitude: '2', unit: 'hours ago' })
    expect(formatAge(now - 3 * 86_400_000, now)).toEqual({ magnitude: '3', unit: 'days ago' })
  })
})

describe('formatApDate', () => {
  it('is AP style on the SF calendar', () => {
    // 2026-09-09T22:30:00-07:00 — a Wednesday in SF, already Thursday in UTC
    expect(formatApDate(Date.parse('2026-09-10T05:30:00Z'))).toBe('Wed. Sept. 9, 2026')
  })
})

describe('compactFields / populatedFields', () => {
  it('911: disposition + unit; empty values drop', () => {
    const ev = base({ raw: { disposition: 'ADV', unit_id: '' } })
    expect(compactFields(ev)).toEqual([['Disposition', 'ADV'], ['Unit', '—']])
    expect(populatedFields(ev)).toEqual([['Disposition', 'ADV']])
  })
  it('fire: unit + station; 311: status + agency', () => {
    expect(compactFields(base({ datasetId: 'fire-ems-dispatch', raw: { unit_id: 'E01', station_area: '01' } })))
      .toEqual([['Unit', 'E01'], ['Station', '01']])
    expect(compactFields(base({ datasetId: '311-cases', raw: { status: 'Open', agency_responsible: 'DPW' } })))
      .toEqual([['Status', 'Open'], ['Agency', 'DPW']])
  })
})

describe('extractId + resolveExplore', () => {
  it('fire deep-links its incident', () => {
    const ev = base({ datasetId: 'fire-ems-dispatch', raw: { call_number: '2611' } })
    expect(extractId(ev)).toBe('2611')
    expect(resolveExplore(ev)?.to).toBe('/emergency-response?incident=2611')
  })
  it('311 deep-links its case', () => {
    expect(resolveExplore(base({ datasetId: '311-cases', raw: { service_request_id: '99' } }))?.to).toBe('/cases-311?case=99')
  })
  it('911 routes by call type to a place, or to Dispatch when suppressed', () => {
    expect(resolveExplore(base({ neighborhood: 'Mission', callType: 'STABBING' }))?.to).toBe('/crime-incidents?neighborhood=Mission')
    expect(resolveExplore(base({ neighborhood: 'Mission', callType: 'TRAFFIC STOP' }))?.to).toBe('/emergency-response?neighborhood=Mission')
    expect(resolveExplore(base({ raw: { cad_number: '7' } }))?.to).toBe('/dispatch-911?incident=7')
  })
})

describe('locationLine — the precision word comes first', () => {
  it('911 and fire say nearest intersection', () => {
    expect(locationLine(base({ latitude: 37.7, longitude: -122.4, address: '19th St & Dolores St' })))
      .toEqual({ label: 'Nearest intersection', place: '19th St & Dolores St' })
    expect(locationLine(base({ datasetId: 'fire-ems-dispatch', latitude: 37.7, longitude: -122.4, neighborhood: 'Mission' })))
      .toEqual({ label: 'Nearest intersection', place: 'Mission' })
  })
  it('311 says address', () => {
    expect(locationLine(base({ datasetId: '311-cases', latitude: 37.7, longitude: -122.4, address: '831 Fulton St' })))
      .toEqual({ label: 'Address', place: '831 Fulton St' })
  })
  it('no coordinates → null (the card renders the suppressed line)', () => {
    expect(locationLine(base({}))).toBeNull()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/views/Last48/detail/eventCardModel.test.ts`
Expected: FAIL — cannot resolve `./eventCardModel`.

- [ ] **Step 4: Create the model by MOVING the helpers**

Move, verbatim with their comments, from `Last48EventCard.tsx` into `src/views/Last48/detail/eventCardModel.ts`: `DATASET_META`, `formatAge`, `AP_MONTH`, `SF_TZ`, `formatApDate`, `formatApWeekday`, `extractField`, `compactFields`, `extractId`, `VIOLENT_911`, `ExploreLink`, `resolveExplore`. Add `export` to each public one. Two additions:

```ts
// src/views/Last48/detail/eventCardModel.ts
//
// The event card's FIELD LOGIC — shared by the flat map's Last48EventCard
// and the photoreal PhotorealBubble so the two cards cannot drift. Pure;
// eventCardModel.test.ts runs one fixture per stream. Extracted verbatim
// from Last48EventCard.tsx on 2026-09-09; `formatAge` gained an injectable
// `now` for tests, `locationLine` is new (precision word first — see
// photoreal/markerPrecision.ts).
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import { PRECISION, PRECISION_LABEL } from '../photoreal/markerPrecision'

// … moved code …

export function formatAge(receivedAt: number, now: number = Date.now()): { magnitude: string; unit: string } {
  const ms = now - receivedAt
  // … body unchanged …
}

/** Rows with real values only — em-dash placeholders waste vertical space. */
export function populatedFields(event: NormalizedEvent): Array<[string, string]> {
  return compactFields(event).filter(([, v]) => v !== '—' && v.trim() !== '')
}

/** "Nearest intersection · 19th St & Dolores St" / "Address · 831 Fulton St".
 *  The precision word leads because the marker shape already implies it and
 *  the card must say the same thing. null when the event has no coordinates
 *  (the card renders its suppressed line instead). */
export function locationLine(event: NormalizedEvent): { label: string; place: string } | null {
  if (event.longitude == null || event.latitude == null) return null
  return {
    label: PRECISION_LABEL[PRECISION[event.datasetId]],
    place: event.address ?? event.neighborhood ?? 'SF',
  }
}
```

- [ ] **Step 5: Re-point `Last48EventCard.tsx`**

Replace the deleted block with:

```ts
import {
  DATASET_META, formatAge, formatApDate, formatApWeekday, populatedFields, resolveExplore, locationLine,
} from './eventCardModel'
```

Inside the render: replace `const fields = compactFields(event)` with `const populated = populatedFields(event)` and use `populated` where the IIFE previously filtered `fields`. Replace the LOCATION block's populated branch with:

```tsx
{(() => {
  const loc = locationLine(event)
  return loc ? (
    <div className="font-mono text-label text-paper-800 dark:text-paper-300 text-right desk:text-left desk:mt-0.5">
      <span className="text-paper-600 dark:text-paper-500">{loc.label} · </span>{loc.place}
      <span className="hidden desk:inline text-paper-600 dark:text-paper-700">
        {' · '}{event.latitude!.toFixed(4)}, {event.longitude!.toFixed(4)}
      </span>
    </div>
  ) : (
    <div className="font-mono text-label italic text-paper-500 dark:text-paper-600 text-right desk:text-left desk:mt-0.5">
      Suppressed; sensitive call
    </div>
  )
})()}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm vitest run src/views/Last48/detail/eventCardModel.test.ts && npx tsc -b`
Expected: PASS (all); tsc clean.

- [ ] **Step 7: Commit**

```bash
git add src/views/Last48/detail/eventCardModel.ts src/views/Last48/detail/eventCardModel.test.ts src/views/Last48/detail/Last48EventCard.tsx src/views/Last48/photoreal/markerPrecision.ts
git commit -m "refactor(last48): extract the event-card model; location row leads with its precision class"
```

---

### Task 4: Precision test, `tourChain`, and the `cinema` pace

**Files:**
- Create: `src/views/Last48/photoreal/markerPrecision.test.ts`
- Create: `src/views/Last48/photoreal/tourChain.ts`, `tourChain.test.ts`
- Modify: `src/views/Last48/ambient/pace.ts`, `pace.test.ts`, `AmbientToggle.tsx:139`

**Interfaces:**
- Consumes: `buildPass` from `../ambient/tour`, `NormalizedEvent`, `LAST48_DATASETS`.
- Produces: `chainTour(events: NormalizedEvent[], limit?: number): string[]`; `PaceId` gains `'cinema'`; `PacePreset.photorealOnly?: true`; `AmbientToggle` prop `photoreal?: boolean`.

- [ ] **Step 1: Precision test**

```ts
// src/views/Last48/photoreal/markerPrecision.test.ts
import { describe, it, expect } from 'vitest'
import { PRECISION, PRECISION_LABEL } from './markerPrecision'
import { LAST48_DATASETS } from '@/types/last48'

describe('markerPrecision', () => {
  it('every Last 48 stream declares its class (probe 2026-09-09)', () => {
    for (const id of LAST48_DATASETS) expect(PRECISION[id], id).toBeDefined()
    expect(PRECISION['911-realtime']).toBe('intersection')
    expect(PRECISION['fire-ems-dispatch']).toBe('intersection')
    expect(PRECISION['311-cases']).toBe('address')
  })
  it('labels are reader-facing words', () => {
    expect(PRECISION_LABEL.intersection).toBe('Nearest intersection')
    expect(PRECISION_LABEL.address).toBe('Address')
  })
})
```

Run: `pnpm vitest run src/views/Last48/photoreal/markerPrecision.test.ts` → PASS (the leaf exists from Task 3).

- [ ] **Step 2: Write the failing tourChain test**

```ts
// src/views/Last48/photoreal/tourChain.test.ts
import { describe, it, expect } from 'vitest'
import { chainTour } from './tourChain'
import type { NormalizedEvent } from '@/types/last48'

const ev = (id: string, receivedAt: number, lng: number, lat: number): NormalizedEvent =>
  ({ id, datasetId: '311-cases', timestamp: '', receivedAt, longitude: lng, latitude: lat, raw: {} })

describe('chainTour', () => {
  it('starts at the newest and walks nearest-neighbour, visiting each once', () => {
    const events = [
      ev('far-old', 1, -122.50, 37.70),
      ev('newest', 9, -122.40, 37.78),
      ev('near-newest', 5, -122.401, 37.781),
      ev('mid', 7, -122.45, 37.75),
    ]
    const order = chainTour(events)
    expect(order[0]).toBe('newest')
    expect(order[1]).toBe('near-newest')
    expect(order).toHaveLength(4)
    expect(new Set(order).size).toBe(4)
  })
  it('respects the pass limit and drops events without coordinates', () => {
    const events = [ev('a', 3, -122.4, 37.7), ev('b', 2, -122.41, 37.71), { ...ev('c', 9, 0, 0), longitude: undefined, latitude: undefined }]
    expect(chainTour(events, 1)).toEqual(['a'])
    expect(chainTour(events)).toEqual(['a', 'b'])
  })
  it('empty in, empty out', () => {
    expect(chainTour([])).toEqual([])
  })
})
```

Run: `pnpm vitest run src/views/Last48/photoreal/tourChain.test.ts` → FAIL (module missing).

- [ ] **Step 3: Write `tourChain.ts`**

```ts
// src/views/Last48/photoreal/tourChain.ts
//
// Stop ORDER for the photoreal tour. buildPass() already picks WHICH events
// (the newest PASS_SIZE with coordinates, newest first). Here they are
// re-ordered as a greedy nearest-neighbour chain from the newest, so each
// hop is short and the next stop's tiles are mostly already resident —
// tile streaming is the frame-rate ceiling (spike, 2026-09-09). The set is
// still "the freshest 24", so the tour's promise holds.
import { buildPass, PASS_SIZE } from '../ambient/tour'
import type { NormalizedEvent } from '@/types/last48'

export function chainTour(events: NormalizedEvent[], limit: number = PASS_SIZE): string[] {
  const ids = buildPass(events, limit)
  if (ids.length === 0) return []
  const byId = new Map(events.map((e) => [e.id, e]))
  const pool = ids.slice(1)
  const out = [ids[0]]
  while (pool.length) {
    const cur = byId.get(out[out.length - 1])!
    let best = 0
    let bestD = Number.POSITIVE_INFINITY
    pool.forEach((id, i) => {
      const e = byId.get(id)!
      // Equirectangular squared distance is enough at city scale.
      const d = ((e.longitude! - cur.longitude!) * 0.79) ** 2 + (e.latitude! - cur.latitude!) ** 2
      if (d < bestD) { bestD = d; best = i }
    })
    out.push(pool.splice(best, 1)[0])
  }
  return out
}
```

Run: `pnpm vitest run src/views/Last48/photoreal/tourChain.test.ts` → PASS.

- [ ] **Step 4: Add the `cinema` pace (test first)**

Append to `src/views/Last48/ambient/pace.test.ts`:

```ts
describe('cinema pace (photoreal only)', () => {
  it('has the approved values and is flagged photorealOnly', () => {
    expect(PACE_PRESETS.cinema).toMatchObject({
      id: 'cinema', orbitDegPerS: 1, tweenMs: 9000, dwellMs: 30000, breathMs: 14000, pitchMin: 30, photorealOnly: true,
    })
    expect(parsePaceId('cinema')).toBe('cinema')
  })
  it('the flat-map presets are not flagged', () => {
    for (const id of ['stroll', 'drift', 'sweep'] as const) expect(PACE_PRESETS[id].photorealOnly).toBeUndefined()
  })
})
```

Run: `pnpm vitest run src/views/Last48/ambient/pace.test.ts` → FAIL (no `cinema`).

- [ ] **Step 5: Implement in `pace.ts`**

```ts
export type PaceId = 'stroll' | 'drift' | 'sweep' | 'cinema'

export interface PacePreset extends PaceValues {
  id: PaceId
  label: string
  hint: string
  /** Offered only in photoreal mode (the AUTO pill hides it on the flat map). */
  photorealOnly?: true
}

// inside PACE_PRESETS, after sweep:
  cinema: {
    id: 'cinema',
    label: 'Cinema',
    hint: 'photoreal',
    // 1°/s is the orbit speed Jesse picked on the 2026-09-09 spike: slow
    // enough that Google's tile-streaming dips never read as stutter.
    orbitDegPerS: 1,
    dwellMs: 30000,
    breathMs: 14000,
    tweenMs: 9000,
    pitchMin: 30,
    photorealOnly: true,
  },

export function parsePaceId(s: string | null): PaceId | null {
  if (s === '1') return DEFAULT_PACE_ID
  if (s === 'stroll' || s === 'drift' || s === 'sweep' || s === 'cinema') return s
  return null
}
```

In `AmbientToggle.tsx`: add `photoreal?: boolean` to `Props` (default false) and change line 139 to
`{Object.values(PACE_PRESETS).filter((p) => !p.photorealOnly || photoreal).map((preset) => {`.

Run: `pnpm vitest run src/views/Last48/ambient && npx tsc -b` → PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add src/views/Last48/photoreal/markerPrecision.test.ts src/views/Last48/photoreal/tourChain.ts src/views/Last48/photoreal/tourChain.test.ts src/views/Last48/ambient/pace.ts src/views/Last48/ambient/pace.test.ts src/views/Last48/ambient/AmbientToggle.tsx
git commit -m "feat(photoreal): precision table pinned, nearest-neighbour tour chain, cinema pace"
```

---

### Task 5: Cesium dependency, asset copy, chunking, entry-bundle guard

**Files:**
- Modify: `package.json` (deps + scripts), `vite.config.ts`, `.gitignore`
- Create: `scripts/copy-cesium-assets.mjs`, `scripts/check-entry-bundle.mjs`

**Interfaces:**
- Produces: `public/cesium/{Workers,ThirdParty,Assets}` at build/dev time; a named `cesium` chunk; `pnpm build` fails if the entry references Cesium.

- [ ] **Step 1: Install**

Run: `pnpm add cesium@1.145.0`
Expected: `cesium` in `dependencies`.

- [ ] **Step 2: Asset copy script**

```js
// scripts/copy-cesium-assets.mjs
// Cesium loads Workers/ThirdParty/Assets at RUNTIME from CESIUM_BASE_URL.
// They are ~40 MB and only fetched when the photoreal chunk mounts, so they
// live in public/cesium/ (gitignored) and are copied here before build/dev.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules/cesium/Build/Cesium')
const dst = join(root, 'public/cesium')
if (!existsSync(src)) { console.error('cesium not installed'); process.exit(1) }
rmSync(dst, { recursive: true, force: true })
mkdirSync(dst, { recursive: true })
for (const dir of ['Workers', 'ThirdParty', 'Assets']) cpSync(join(src, dir), join(dst, dir), { recursive: true })
console.log('cesium assets → public/cesium')
```

- [ ] **Step 3: Entry-bundle guard**

```js
// scripts/check-entry-bundle.mjs
// Fails the build if the eager entry chunk (or index.html's preloads) drags
// Cesium in. Same class as the Mapbox split in vite.config.ts — a single
// eager import anywhere silently ships ~3 MB to every Home visitor.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = 'dist'
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const entry = html.match(/<script type="module"[^>]*src="\/(assets\/[^"]+\.js)"/)?.[1]
if (!entry) { console.error('entry script not found in dist/index.html'); process.exit(1) }
const bad = []
if (/cesium/i.test(html)) bad.push('index.html references a cesium chunk (modulepreload?)')
const entrySrc = readFileSync(join(dist, entry), 'utf8')
if (/CESIUM_BASE_URL|cesium/.test(entrySrc)) bad.push(`${entry} references cesium`)
const cesiumChunks = readdirSync(join(dist, 'assets')).filter((f) => /^cesium-.*\.js$/.test(f))
if (cesiumChunks.length === 0) bad.push('no cesium-*.js chunk was emitted (manualChunks rule missing?)')
if (bad.length) { console.error('entry-bundle check FAILED:\n - ' + bad.join('\n - ')); process.exit(1) }
console.log(`entry-bundle check ok (${entry}; cesium in ${cesiumChunks.join(', ')})`)
```

- [ ] **Step 4: Wire scripts, chunk, gitignore**

`package.json` scripts (pnpm does not run `pre*` hooks by default — call the copy explicitly):

```json
"dev": "node scripts/copy-cesium-assets.mjs && vite",
"build": "node scripts/copy-cesium-assets.mjs && tsc -b && tsc --noEmit -p api/tsconfig.json && vite build && node scripts/check-entry-bundle.mjs",
```

(Keep any other flags the existing `dev` script has — read it first; only prepend the copy.)

`vite.config.ts` — inside `manualChunks`, after the mapbox line:

```ts
          // Cesium (~3 MB) is imported only by the lazy photoreal chunk of
          // The Last 48; give it a named chunk so Rollup never hoists it into
          // the entry. scripts/check-entry-bundle.mjs enforces this at build.
          if (id.includes('/cesium/')) return 'cesium'
```

`.gitignore` — add:

```
# Cesium runtime assets, copied from node_modules at build/dev
public/cesium
```

- [ ] **Step 5: Prove the guard with a temporary lazy import**

Create `src/views/Last48/photoreal/Last48Photoreal.tsx` as a placeholder that imports Cesium (it is replaced in Task 7):

```tsx
// src/views/Last48/photoreal/Last48Photoreal.tsx — placeholder, replaced in Task 7
import * as Cesium from 'cesium'
export default function Last48Photoreal() {
  return <div data-cesium-version={Cesium.VERSION} />
}
```

and in `src/views/Last48/Last48.tsx` add (temporarily, top of file) `const Last48Photoreal = lazy(() => import('./photoreal/Last48Photoreal'))` plus a never-true render `{false && <Last48Photoreal />}` so Rollup emits the chunk. Run:

`~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: build passes and prints `entry-bundle check ok (...; cesium in cesium-XXXX.js)`.

Then break it on purpose: add `import 'cesium'` to `src/App.tsx`, rebuild, expect `entry-bundle check FAILED`. Remove that line. Keep the lazy declaration in `Last48.tsx` (Task 12 uses it); keep the placeholder file.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vite.config.ts .gitignore scripts/copy-cesium-assets.mjs scripts/check-entry-bundle.mjs src/views/Last48/photoreal/Last48Photoreal.tsx src/views/Last48/Last48.tsx
git commit -m "build(cesium): dependency, runtime asset copy, named chunk, entry-bundle guard"
```

---

### Task 6: `grade.ts`, the Google provenance row, and About notes

**Files:**
- Create: `src/views/Last48/photoreal/grade.ts`, `grade.test.ts`
- Modify: `src/lib/provenance/nonSocrata.ts` (union line 9, table after `'mapbox-basemap'`), `src/views/About/sourceNotes.ts`

**Interfaces:**
- Produces: `type Grade = 'day' | 'dusk' | 'night'`, `GRADES: Record<Grade, GradeValues>`, `gradeForTheme(isDark, override): Grade`, `GRADE_CLOCK_ISO: Record<Grade,string>`, `GRADE_FRAGMENT_GLSL: string`; `NonSocrataId` gains `'google-3d-tiles'`.
- Ruling (deviation from spec §6): the row is NOT added to the manifest's `staticSources`. `sourceLine.ts`/`SourcePanel.tsx` filter `kind: 'basemap'` rows out of the pill by design and no manifest lists `mapbox-basemap` either; About's generated table reads `nonSocrataFor(city)` and shows it. Parity with the Mapbox row.

- [ ] **Step 1: Write the failing grade test**

```ts
// src/views/Last48/photoreal/grade.test.ts
import { describe, it, expect } from 'vitest'
import { GRADES, gradeForTheme, GRADE_CLOCK_ISO, GRADE_FRAGMENT_GLSL } from './grade'

describe('grade', () => {
  it('spike values pinned', () => {
    expect(GRADES.day).toEqual({ tint: [1, 1, 1], mul: 1, win: 0 })
    expect(GRADES.dusk).toEqual({ tint: [1, 0.8, 0.62], mul: 0.82, win: 0.35 })
    expect(GRADES.night).toEqual({ tint: [0.42, 0.5, 0.78], mul: 0.3, win: 1.6 })
  })
  it('theme → day/dusk; ?tod= overrides; junk override ignored', () => {
    expect(gradeForTheme(false, null)).toBe('day')
    expect(gradeForTheme(true, null)).toBe('dusk')
    expect(gradeForTheme(false, 'night')).toBe('night')
    expect(gradeForTheme(true, 'day')).toBe('day')
    expect(gradeForTheme(true, 'noon')).toBe('dusk')
  })
  it('clock instants are SF 13:00 / 19:20 / 22:30 PDT', () => {
    expect(GRADE_CLOCK_ISO).toEqual({ day: '2026-09-09T20:00:00Z', dusk: '2026-09-10T02:20:00Z', night: '2026-09-10T05:30:00Z' })
  })
  it('the shader uses the three uniforms', () => {
    for (const u of ['u_tint', 'u_mul', 'u_win']) expect(GRADE_FRAGMENT_GLSL).toContain(u)
    expect(GRADE_FRAGMENT_GLSL).toContain('fragmentMain')
  })
})
```

Run: `pnpm vitest run src/views/Last48/photoreal/grade.test.ts` → FAIL.

- [ ] **Step 2: Write `grade.ts` (pure — no Cesium import)**

```ts
// src/views/Last48/photoreal/grade.ts
//
// Time-of-day GRADE for the photoreal tiles. Google's tiles are baked
// daylight photos — no provider can serve night — so dusk and night are a
// colour grade applied by a Cesium CustomShader (built in Last48Photoreal
// from these values), plus the real sun/sky from the matching clock time.
// Bright, warm-ish pixels are let through the grade as "lit windows".
// Values are the 2026-09-09 spike's; tune here, never inline.
export type Grade = 'day' | 'dusk' | 'night'

export interface GradeValues {
  tint: [number, number, number]
  mul: number
  win: number
}

export const GRADES: Record<Grade, GradeValues> = {
  day:   { tint: [1.0, 1.0, 1.0],    mul: 1.0,  win: 0 },
  dusk:  { tint: [1.0, 0.80, 0.62],  mul: 0.82, win: 0.35 },
  night: { tint: [0.42, 0.50, 0.78], mul: 0.30, win: 1.6 },
}

/** Sun position follows the grade: 13:00 / 19:20 / 22:30 SF (PDT = UTC−7). */
export const GRADE_CLOCK_ISO: Record<Grade, string> = {
  day: '2026-09-09T20:00:00Z',
  dusk: '2026-09-10T02:20:00Z',
  night: '2026-09-10T05:30:00Z',
}

/** Light theme = day, dark theme = dusk; `?tod=` (day|dusk|night) overrides. */
export function gradeForTheme(isDark: boolean, override: string | null): Grade {
  if (override === 'day' || override === 'dusk' || override === 'night') return override
  return isDark ? 'dusk' : 'day'
}

export const GRADE_FRAGMENT_GLSL = `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  vec3 c = material.diffuse;
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  float lit = smoothstep(0.62, 0.9, luma) * u_win;
  vec3 graded = c * u_tint * u_mul;
  material.diffuse = graded + c * vec3(1.0, 0.85, 0.55) * lit;
}`
```

Run the test → PASS.

- [ ] **Step 3: Provenance row + notes**

`src/lib/provenance/nonSocrata.ts`: add `| 'google-3d-tiles'` to `NonSocrataId`; after the `'mapbox-basemap'` row add:

```ts
  'google-3d-tiles': {
    id: 'google-3d-tiles', cities: ['sf'], kind: 'basemap',
    publisher: { short: 'Google', full: 'Google Maps Platform — Photorealistic 3D Tiles' },
    title: '3D city model (Google Photorealistic 3D Tiles, photoreal mode of The Last 48)',
    vintage: 'always-current tiles; imagery dates vary by block',
    upstreamUrl: 'https://developers.google.com/maps/documentation/tile/3d-tiles',
    landingUrl: 'https://developers.google.com/maps/documentation/tile/policies',
    license: { name: 'Google Maps Platform Terms of Service', url: 'https://cloud.google.com/maps-platform/terms' },
  },
```

`src/views/About/sourceNotes.ts`:

```ts
  'nuek-vuh3': 'Publishes with ~12h intrinsic lag; locations are the nearest intersection (~half-block precision)',
  'gnap-fj3t': 'Rolling 48h window; ~30min lag; locations are the nearest intersection (~half-block precision), suppressed on sensitive calls',
  'vw6y-z8j6': '~15h intrinsic lag; locations are address-level',
  'google-3d-tiles': 'Daylight photo tiles; the dusk look in dark mode is a colour grade, not a night photo',
```

Run: `pnpm test` → PASS (`sourceRows.test.ts` accepts the new key because the row exists).

- [ ] **Step 4: Commit**

```bash
git add src/views/Last48/photoreal/grade.ts src/views/Last48/photoreal/grade.test.ts src/lib/provenance/nonSocrata.ts src/views/About/sourceNotes.ts
git commit -m "feat(photoreal): grade table + shader source; Google 3D Tiles provenance row; precision notes in About"
```

---

### Task 7: `cameraPose.ts` — pure orbit pose in ECEF

**Files:**
- Create: `src/views/Last48/photoreal/cameraPose.ts`, `cameraPose.test.ts`

**Interfaces:**
- Produces: `geodeticToEcef(lngDeg, latDeg, heightM): Vec3`, `orbitPose(center: {lng,lat,height}, headingDeg, pitchDeg, rangeM): { position: Vec3; direction: Vec3; up: Vec3 }`, `ORBIT_RANGE_M = 620`, `ORBIT_PITCH_DEG = -30`, `type Vec3 = [number, number, number]`.
- Why pure: the flight's destination and the orbit's first frame are produced by the SAME function, so the hand-off cannot drift (the spike's "flew to the centre of the Earth" bug came from reading a camera-local position). No Cesium import, so the math is node-testable.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/Last48/photoreal/cameraPose.test.ts
import { describe, it, expect } from 'vitest'
import { geodeticToEcef, orbitPose, ORBIT_RANGE_M, ORBIT_PITCH_DEG } from './cameraPose'

const A = 6378137 // WGS84 semi-major axis
const close = (a: number[], b: number[], eps = 1e-3) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(eps))
const norm = (v: number[]) => Math.hypot(...v)

describe('geodeticToEcef', () => {
  it('equator/prime meridian sits on the +x axis; the north pole on +z', () => {
    close(geodeticToEcef(0, 0, 0), [A, 0, 0])
    const [x, y, z] = geodeticToEcef(0, 90, 0)
    expect(Math.abs(x)).toBeLessThan(1e-3); expect(Math.abs(y)).toBeLessThan(1e-3)
    expect(Math.abs(z - 6356752.314245)).toBeLessThan(1e-3)
  })
})

describe('orbitPose at (0°,0°)', () => {
  const c = { lng: 0, lat: 0, height: 0 }
  it('pitch −90 puts the camera straight above the target, looking down', () => {
    const p = orbitPose(c, 0, -90, 1000)
    close(p.position, [A + 1000, 0, 0])
    close(p.direction, [-1, 0, 0])
  })
  it('heading 0, pitch 0 puts the camera south, looking north, up = local up', () => {
    const p = orbitPose(c, 0, 0, 1000)
    close(p.position, [A, 0, -1000])
    close(p.direction, [0, 0, 1])
    close(p.up, [1, 0, 0])
  })
  it('heading 90, pitch 0 puts the camera west, looking east', () => {
    const p = orbitPose(c, 90, 0, 1000)
    close(p.position, [A, -1000, 0])
    close(p.direction, [0, 1, 0])
  })
  it('direction and up are unit and orthogonal; range is honoured', () => {
    const p = orbitPose({ lng: -122.41, lat: 37.78, height: 30 }, 35, ORBIT_PITCH_DEG, ORBIT_RANGE_M)
    expect(Math.abs(norm(p.direction) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(norm(p.up) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(p.direction[0] * p.up[0] + p.direction[1] * p.up[1] + p.direction[2] * p.up[2])).toBeLessThan(1e-9)
    const t = geodeticToEcef(-122.41, 37.78, 30)
    expect(Math.abs(norm([p.position[0] - t[0], p.position[1] - t[1], p.position[2] - t[2]]) - ORBIT_RANGE_M)).toBeLessThan(1e-6)
  })
  it('defaults are the spike values', () => {
    expect(ORBIT_RANGE_M).toBe(620); expect(ORBIT_PITCH_DEG).toBe(-30)
  })
})
```

Run: `pnpm vitest run src/views/Last48/photoreal/cameraPose.test.ts` → FAIL.

- [ ] **Step 2: Implement**

```ts
// src/views/Last48/photoreal/cameraPose.ts
//
// PURE camera-pose math for the orbit (no Cesium import, node-tested).
// One function produces BOTH the flight's destination and every orbit
// frame, so the fly→orbit hand-off is seamless by construction. The 2026-09-09
// spike read Cesium's camera-LOCAL position after lookAt() and flew to the
// centre of the Earth; this leaf exists so that class of bug is impossible.
//
// Conventions match Cesium's HeadingPitchRange: heading is degrees clockwise
// from local north, pitch is degrees above the local horizon (negative looks
// down), range is metres from the target to the camera. Output vectors are
// WGS84 ECEF (what Cesium.Cartesian3 holds).
export type Vec3 = [number, number, number]

export const ORBIT_RANGE_M = 620
export const ORBIT_PITCH_DEG = -30

const A = 6378137
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const D2R = Math.PI / 180

export function geodeticToEcef(lngDeg: number, latDeg: number, heightM: number): Vec3 {
  const lng = lngDeg * D2R, lat = latDeg * D2R
  const sLat = Math.sin(lat), cLat = Math.cos(lat)
  const N = A / Math.sqrt(1 - E2 * sLat * sLat)
  return [
    (N + heightM) * cLat * Math.cos(lng),
    (N + heightM) * cLat * Math.sin(lng),
    (N * (1 - E2) + heightM) * sLat,
  ]
}

/** Local east/north/up unit vectors at a geodetic point, in ECEF. */
function enuAxes(lngDeg: number, latDeg: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const lng = lngDeg * D2R, lat = latDeg * D2R
  const sLng = Math.sin(lng), cLng = Math.cos(lng), sLat = Math.sin(lat), cLat = Math.cos(lat)
  return {
    e: [-sLng, cLng, 0],
    n: [-sLat * cLng, -sLat * sLng, cLat],
    u: [cLat * cLng, cLat * sLng, sLat],
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n] }

export interface CameraPose { position: Vec3; direction: Vec3; up: Vec3 }

export function orbitPose(
  center: { lng: number; lat: number; height: number },
  headingDeg: number,
  pitchDeg: number,
  rangeM: number,
): CameraPose {
  const { e, n, u } = enuAxes(center.lng, center.lat)
  const h = headingDeg * D2R, p = pitchDeg * D2R
  // View direction in ENU: forward along heading, tilted by pitch.
  const dE = Math.cos(p) * Math.sin(h), dN = Math.cos(p) * Math.cos(h), dU = Math.sin(p)
  const direction = unit(add(add(scale(e, dE), scale(n, dN)), scale(u, dU)))
  const target = geodeticToEcef(center.lng, center.lat, center.height)
  const position = add(target, scale(direction, -rangeM))
  // Camera up: perpendicular to direction, in the plane of direction and local up.
  const right = unit(cross(direction, u))
  const up = unit(cross(right, direction))
  return { position, direction, up }
}
```

Run the test → PASS. (If the `heading 90 → west` case fails by sign, the ENU east axis is the culprit — do not "fix" the test; fix `enuAxes`.)

- [ ] **Step 3: Commit**

```bash
git add src/views/Last48/photoreal/cameraPose.ts src/views/Last48/photoreal/cameraPose.test.ts
git commit -m "feat(photoreal): pure orbit pose math — one authority for flight destination and orbit frames"
```

---

### Task 8: `Last48Photoreal` shell — viewer, tileset, key, fallback, credit, grade

**Files:**
- Replace: `src/views/Last48/photoreal/Last48Photoreal.tsx` (the Task 5 placeholder)
- Create: `src/views/Last48/photoreal/photoreal.css` (imported by the shell; Cesium widgets CSS + credit restyle)

**Interfaces:**
- Consumes: `GRADES`, `GRADE_CLOCK_ISO`, `GRADE_FRAGMENT_GLSL`, `gradeForTheme` (Task 6); `useAppStore` (`isDarkMode`, `setMapEngine`); `Last48WindowResult`, `DatasetId`, `PaceValues`.
- Produces: `export interface Last48PhotorealProps` (below) and `default Last48Photoreal`; internal context value `{ viewer, tileset }` passed to children via props (no React context needed — the children are mounted by this file).

```ts
export interface Last48PhotorealProps {
  window48: Last48WindowResult
  datasets: DatasetId[]
  pointsOn: boolean
  selectedEventId: string | null
  onSelectedEventIdChange: (id: string | null) => void
  ambientOn: boolean
  ambientReady: boolean
  ambientPace: PaceValues
  onAmbientExit: () => void
  /** ?tod= override (day|dusk|night) — hidden dev/editor knob. */
  todOverride: string | null
  /** ?tune=1 — show the tile-load gauge. */
  tuneOn: boolean
}
```

- [ ] **Step 1: Write the shell**

```tsx
// src/views/Last48/photoreal/Last48Photoreal.tsx
//
// The photoreal renderer for The Last 48 — a SIBLING of Last48UnifiedView,
// mounted lazily by Last48.tsx when the effective map engine is 'photoreal'.
// This file is the ONLY module allowed to import Cesium outside this
// directory's siblings; scripts/check-entry-bundle.mjs enforces that the
// entry chunk never references it.
//
// Owns: the Cesium viewer, the Google Photorealistic 3D tileset (+ key,
// + quota fallback), the credit bar, the theme grade, performance defaults.
// Delegates: markers (PhotorealMarkers), the tour (PhotorealConductor), the
// bubble (PhotorealBubble).
import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import './photoreal.css'
import { useAppStore } from '@/stores/appStore'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import type { PaceValues } from '../ambient/pace'
import { GRADES, GRADE_CLOCK_ISO, GRADE_FRAGMENT_GLSL, gradeForTheme } from './grade'
import { PhotorealMarkers } from './PhotorealMarkers'
import PhotorealConductor from './PhotorealConductor'
import PhotorealBubble from './PhotorealBubble'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'

export const RESOLUTION_SCALE = 0.65

export interface Last48PhotorealProps {
  window48: Last48WindowResult
  datasets: DatasetId[]
  pointsOn: boolean
  selectedEventId: string | null
  onSelectedEventIdChange: (id: string | null) => void
  ambientOn: boolean
  ambientReady: boolean
  ambientPace: PaceValues
  onAmbientExit: () => void
  /** ?tod= override (day|dusk|night) — hidden dev/editor knob. */
  todOverride: string | null
  /** ?tune=1 — show the tile-load gauge. */
  tuneOn: boolean
}

/** Whether Photoreal can be offered at all — read by the picker via the
 *  page, never by importing this chunk (that would defeat the lazy split). */
export const GOOGLE_TILES_KEY: string = import.meta.env.VITE_GOOGLE_TILES_KEY || ''

export default function Last48Photoreal(props: Last48PhotorealProps) {
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const setMapEngine = useAppStore((s) => s.setMapEngine)
  const hostRef = useRef<HTMLDivElement>(null)
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const [tileset, setTileset] = useState<Cesium.Cesium3DTileset | null>(null)
  const [markers, setMarkers] = useState<PhotorealMarkers | null>(null)
  const [resting, setResting] = useState(false)
  const [tileLoads, setTileLoads] = useState(0)

  // ── Viewer + tileset lifecycle ─────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return
    const v = new Cesium.Viewer(hostRef.current, {
      animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
      baseLayerPicker: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false,
      baseLayer: false, requestRenderMode: false,
    })
    v.resolutionScale = RESOLUTION_SCALE
    v.scene.globe.show = false
    v.scene.skyAtmosphere.show = true
    v.scene.fog.enabled = true
    v.scene.fog.density = 0.00025
    v.scene.postProcessStages.fxaa.enabled = true
    v.clock.shouldAnimate = false
    v.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(-122.42, 37.70, 7000),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
    })
    setViewer(v)
    const m = new PhotorealMarkers(v)
    setMarkers(m)

    let cancelled = false
    ;(async () => {
      try {
        const ts = await Cesium.createGooglePhotorealistic3DTileset({
          key: GOOGLE_TILES_KEY, maximumScreenSpaceError: 40, preloadFlightDestinations: true, skipLevelOfDetail: true,
        })
        if (cancelled) { ts.destroy(); return }
        // Quota/auth refusals surface here per tile; one is enough to rest.
        // tileFailed's payload is { url, message }; a quota/auth refusal
        // carries the HTTP status in the message text.
        ts.tileFailed.addEventListener((e: { url?: string; message?: string }) => {
          if (/\b(403|429)\b/.test(e?.message ?? '')) rest()
        })
        ts.tileLoad.addEventListener(() => setTileLoads((n) => n + 1))
        v.scene.primitives.add(ts)
        setTileset(ts)
      } catch (err) {
        console.error('[photoreal] tileset failed', err)
        rest()
      }
    })()

    function rest() {
      if (cancelled) return
      setResting(true)
      // Session-only: the STORE flips to classic so the page swaps renderers;
      // the persisted preference is left alone (Photoreal comes back tomorrow).
      // setMapEngine persists, so write the store field directly.
      useAppStore.setState({ mapEngine: 'classic' })
    }

    return () => {
      cancelled = true
      m.destroy()
      v.destroy()
    }
  }, [])

  // ── Theme grade + sun ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tileset || !viewer) return
    const grade = gradeForTheme(isDarkMode, props.todOverride)
    const g = GRADES[grade]
    tileset.customShader = new Cesium.CustomShader({
      uniforms: {
        u_tint: { type: Cesium.UniformType.VEC3, value: new Cesium.Cartesian3(...g.tint) },
        u_mul: { type: Cesium.UniformType.FLOAT, value: g.mul },
        u_win: { type: Cesium.UniformType.FLOAT, value: g.win },
      },
      fragmentShaderText: GRADE_FRAGMENT_GLSL,
    })
    viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(GRADE_CLOCK_ISO[grade])
  }, [tileset, viewer, isDarkMode, props.todOverride])

  // ── Events visible to markers + tour ──────────────────────────────────
  const events: NormalizedEvent[] = props.window48.events.filter(
    (e) => props.datasets.includes(e.datasetId) && e.longitude != null && e.latitude != null,
  )
  const selected = props.selectedEventId ? events.find((e) => e.id === props.selectedEventId) ?? null : null

  useEffect(() => { markers?.setVisible(props.pointsOn) }, [markers, props.pointsOn])
  useEffect(() => { markers?.setEvents(events) }, [markers, events])
  useEffect(() => { markers?.setHero(selected) }, [markers, selected])

  return (
    <div className="relative w-full h-full">
      <div ref={hostRef} className="w-full h-full" data-photoreal-host />
      {resting && (
        <p className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-paper-50/90 dark:bg-espresso-900/90 px-3 py-1 text-label font-mono text-paper-700 dark:text-paper-300">
          Photoreal is resting for today — showing the classic map.
        </p>
      )}
      {props.tuneOn && (
        <div className="absolute right-4 top-4 rounded-md bg-espresso-900/80 px-2 py-1 text-micro font-mono text-paper-200">
          tiles loaded {tileLoads}
        </div>
      )}
      {viewer && tileset && markers && (
        <PhotorealConductor
          viewer={viewer}
          tileset={tileset}
          markers={markers}
          events={events}
          ambientOn={props.ambientOn}
          ready={props.ambientReady}
          pace={props.ambientPace}
          pointsOn={props.pointsOn}
          onExit={props.onAmbientExit}
          onVisit={(ev) => props.onSelectedEventIdChange(ev.id)}
          onClearSelection={() => props.onSelectedEventIdChange(null)}
          selectedEvent={selected}
        />
      )}
      {viewer && (
        <PhotorealBubble viewer={viewer} tileset={tileset} event={selected} onClose={() => props.onSelectedEventIdChange(null)} />
      )}
    </div>
  )
}
```

`photoreal.css`:

```css
/* src/views/Last48/photoreal/photoreal.css */
@import 'cesium/Build/Cesium/Widgets/widgets.css';

/* Google requires its logo + data credits on screen; keep Cesium's credit
   bar, restyled to the same register as the Mapbox attribution. */
[data-photoreal-host] .cesium-viewer-bottom { opacity: 0.85; }
[data-photoreal-host] .cesium-credit-logoContainer img { height: 18px; }
[data-photoreal-host] .cesium-credit-expand-link,
[data-photoreal-host] .cesium-credit-textContainer { font: 10px "Space Mono", ui-monospace, monospace; color: #f5ecd9; }
[data-photoreal-host] .cesium-widget-credits { background: rgba(30, 20, 13, 0.55); border-radius: 6px; padding: 2px 6px; }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: errors ONLY about the three missing modules (`PhotorealMarkers`, `PhotorealConductor`, `PhotorealBubble`) — Tasks 9–11 supply them. If any other error appears, fix it here.

- [ ] **Step 3: Commit (WIP — typecheck completes in Task 11)**

```bash
git add src/views/Last48/photoreal/Last48Photoreal.tsx src/views/Last48/photoreal/photoreal.css
git commit -m "feat(photoreal): renderer shell — viewer, Google tileset, quota fallback, credit bar, theme grade"
```

---

### Task 9: `PhotorealMarkers` — two marker languages over `viewer.entities`

**Files:**
- Create: `src/views/Last48/photoreal/PhotorealMarkers.ts`

**Interfaces:**
- Consumes: `PRECISION` (Task 3), `COLORS`, `ageColor` (Task 2), `NormalizedEvent`.
- Produces: `class PhotorealMarkers { constructor(viewer); setEvents(events); setVisible(on); setHero(event|null); setFocus(lng,lat); destroy() }`, `DRAW_RADIUS_KM = 1.5`, `onPick?: (id: string) => void` (assignable field; the conductor/bubble wire click-to-open).

- [ ] **Step 1: Implement**

```ts
// src/views/Last48/photoreal/PhotorealMarkers.ts
//
// Imperative marker layer for the photoreal renderer. Two marker LANGUAGES,
// keyed by the stream's published precision (markerPrecision.ts):
//   intersection (911, Fire/EMS) — a soft ~40 m ground disc + a short wide
//                                  faded beam: "around this corner".
//   address (311)                — a slim 40 m column: "here".
// The hero (current stop / selected) is the same shape at ~1.6×, breathing in
// COLOUR only — a CallbackProperty on the material. Never animate a geometry
// dimension: rebuilding geometry per frame halved the spike's frame rate.
// Only events within DRAW_RADIUS_KM of the focus point are instantiated.
import * as Cesium from 'cesium'
import type { NormalizedEvent } from '@/types/last48'
import { PRECISION } from './markerPrecision'
import { COLORS, ageColor } from '../ageRamp'

export const DRAW_RADIUS_KM = 1.5

const DISC_M = 20          // radius → ~40 m across
const BEAM_M = 30
const COLUMN_M = 40
const HERO_SCALE = 1.6

function colorFor(e: NormalizedEvent, now: number): Cesium.Color {
  const isPriorityA = e.datasetId === '911-realtime' && e.priority === 'A'
  const hex = isPriorityA ? COLORS[e.datasetId] : ageColor(e.datasetId, now - e.receivedAt)
  return Cesium.Color.fromCssColorString(hex)
}

export class PhotorealMarkers {
  private ents = new Map<string, Cesium.Entity[]>()
  private events: NormalizedEvent[] = []
  private focus: { lng: number; lat: number } | null = null
  private visible = true
  private hero: Cesium.Entity[] = []
  private heroT0 = 0
  onPick?: (id: string) => void
  private handler: Cesium.ScreenSpaceEventHandler

  constructor(private viewer: Cesium.Viewer) {
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    this.handler.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      const picked = viewer.scene.pick(m.position)
      const id = picked?.id?.properties?.eventId?.getValue?.()
      if (typeof id === 'string') this.onPick?.(id)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  }

  setEvents(events: NormalizedEvent[]) { this.events = events; this.sync() }
  setVisible(on: boolean) { this.visible = on; this.sync() }
  setFocus(lng: number, lat: number) { this.focus = { lng, lat }; this.sync() }

  private near(e: NormalizedEvent): boolean {
    if (!this.focus) return false
    const dx = (e.longitude! - this.focus.lng) * 88, dy = (e.latitude! - this.focus.lat) * 111
    return Math.hypot(dx, dy) < DRAW_RADIUS_KM
  }

  private sync() {
    const now = Date.now()
    const want = new Set<string>()
    if (this.visible) for (const e of this.events) if (this.near(e)) want.add(e.id)
    for (const [id, ents] of this.ents) if (!want.has(id)) { ents.forEach((x) => this.viewer.entities.remove(x)); this.ents.delete(id) }
    for (const e of this.events) {
      if (!want.has(e.id) || this.ents.has(e.id)) continue
      this.ents.set(e.id, this.build(e, colorFor(e, now), 1))
    }
  }

  private build(e: NormalizedEvent, col: Cesium.Color, scale: number, material?: Cesium.MaterialProperty): Cesium.Entity[] {
    const props = new Cesium.PropertyBag({ eventId: e.id })
    const lng = e.longitude!, lat = e.latitude!
    const out: Cesium.Entity[] = []
    if (PRECISION[e.datasetId] === 'intersection') {
      out.push(this.viewer.entities.add({
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 1),
        ellipse: {
          semiMajorAxis: DISC_M * scale, semiMinorAxis: DISC_M * scale, height: 1,
          material: material ?? col.withAlpha(0.18), outline: true, outlineColor: col.withAlpha(0.8),
        },
      }))
      out.push(this.viewer.entities.add({
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, (BEAM_M * scale) / 2),
        cylinder: { length: BEAM_M * scale, bottomRadius: 5 * scale, topRadius: 0.6, material: material ?? col.withAlpha(0.25) },
      }))
    } else {
      out.push(this.viewer.entities.add({
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, (COLUMN_M * scale) / 2),
        cylinder: { length: COLUMN_M * scale, bottomRadius: 2.2 * scale, topRadius: 2.2 * scale, material: material ?? col.withAlpha(0.55) },
      }))
    }
    return out
  }

  /** The current stop / selected event: same shape, larger, breathing colour. */
  setHero(e: NormalizedEvent | null) {
    this.hero.forEach((x) => this.viewer.entities.remove(x)); this.hero = []
    if (!e || e.longitude == null || e.latitude == null) return
    const col = Cesium.Color.fromCssColorString(COLORS[e.datasetId])
    this.heroT0 = performance.now()
    const breathing = new Cesium.ColorMaterialProperty(
      new Cesium.CallbackProperty(() => col.withAlpha(0.35 + 0.25 * Math.sin((performance.now() - this.heroT0) / 900)), false),
    )
    this.hero = this.build(e, col, HERO_SCALE, breathing)
  }

  destroy() {
    this.handler.destroy()
    for (const ents of this.ents.values()) ents.forEach((x) => this.viewer.entities.remove(x))
    this.hero.forEach((x) => this.viewer.entities.remove(x))
    this.ents.clear()
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b` → remaining errors only for `PhotorealConductor` / `PhotorealBubble`.

- [ ] **Step 3: Commit**

```bash
git add src/views/Last48/photoreal/PhotorealMarkers.ts
git commit -m "feat(photoreal): marker layer — intersection discs vs address columns, colour-only hero breathing, 1.5 km draw budget"
```

---

### Task 10: `useCesiumDirector` + `PhotorealConductor` — flight, orbit, tiles-by-phase, settle gate

**Files:**
- Create: `src/views/Last48/photoreal/useCesiumDirector.ts`
- Create: `src/views/Last48/photoreal/PhotorealConductor.tsx`

**Interfaces:**
- Consumes: `orbitPose`, `ORBIT_RANGE_M`, `ORBIT_PITCH_DEG` (Task 7); `chainTour` (Task 4); `useAmbientTour` (verbatim); `nextTourId`, `dueWaitMs` are inside `useAmbientTour`; `AmbientPhase` type from `../ambient/useAmbientDirector`; `PaceValues`; `PhotorealMarkers`.
- Produces: `useCesiumDirector({ viewer, tileset, phase, target, pace, onRampInDone, onRampOutDone, onSettled })`, `type PhotorealTarget = { lng: number; lat: number } | null`; `default PhotorealConductor` with the props listed in Task 8's JSX.
- Ruling: `useAmbientTour` picks stops by `buildPass` (newest-first). To get the nearest-neighbour ORDER without forking the hook, the conductor passes it `events` pre-sorted by `chainTour` order with synthetic `receivedAt` ranks? — No: that would corrupt card ages. Instead the conductor computes `order = chainTour(events)` and passes `useAmbientTour` an `events` array filtered to the pass and RE-ORDERED, plus a `pickNext` override. Since `useAmbientTour` has no such override today, ADD an optional `order?: (events: NormalizedEvent[]) => string[]` option to `useAmbientTour` (default `buildPass`), threaded to where it calls `buildPass`. This is a one-line, default-preserving change; `tour.test.ts` stays green.

- [ ] **Step 1: Add the `order` option to `useAmbientTour`**

In `src/views/Last48/ambient/useAmbientTour.ts`: add to the options object

```ts
  /** Pass ORDER strategy; defaults to buildPass (newest first). The
   *  photoreal tour passes chainTour (nearest-neighbour from the newest). */
  order?: (events: NormalizedEvent[]) => string[]
```

and replace the call(s) `buildPass(eventsRef.current)` with `(orderRef.current ?? buildPass)(eventsRef.current)` where `orderRef` mirrors the other option refs (`const orderRef = useRef(opts.order); orderRef.current = opts.order` with the same eslint-disable comment the file already uses for refs). Run `pnpm vitest run src/views/Last48/ambient` → PASS.

- [ ] **Step 2: Write the director**

```ts
// src/views/Last48/photoreal/useCesiumDirector.ts
//
// Cesium twin of ambient/useAmbientDirector.ts. Same phase machine, same
// hybrid camera model: a LEG is one native camera.flyTo to the exact pose
// the orbit starts from; a HOLD is a per-frame setView along orbitPose()
// with the heading advancing at pace.orbitDegPerS. Both come from the same
// pure function (cameraPose.ts), so the hand-off is seamless by
// construction. Tile detail is coarse in flight and fine in orbit; the
// settle gate fires once the tileset reports tilesLoaded (12 s cap).
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type { AmbientPhase } from '../ambient/useAmbientDirector'
import type { PaceValues } from '../ambient/pace'
import { orbitPose, ORBIT_RANGE_M, ORBIT_PITCH_DEG } from './cameraPose'

export type PhotorealTarget = { lng: number; lat: number } | null

export const SSE_FLIGHT = 40
export const SSE_ORBIT = 10
export const SETTLE_CAP_MS = 12_000
const TARGET_HEIGHT_M = 30
const CITY_VIEW = { lng: -122.42, lat: 37.70, height: 7000 }

const toC3 = (v: [number, number, number]) => new Cesium.Cartesian3(v[0], v[1], v[2])

export function useCesiumDirector(opts: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  phase: AmbientPhase
  target: PhotorealTarget
  pace: PaceValues
  onRampInDone: () => void
  onRampOutDone: () => void
  /** Tiles at the current stop have settled (or the cap elapsed). */
  onSettled: () => void
}) {
  const { viewer, tileset, phase, target } = opts
  const headingRef = useRef(35)
  const cbRef = useRef(opts)
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = opts

  // Ramp-in: nothing to animate — the first leg IS the ramp. Ramp-out: hand
  // the camera back where it is (the default controller resumes) after a beat.
  useEffect(() => {
    if (phase === 'ramp-in') cbRef.current.onRampInDone()
    if (phase === 'ramp-out') {
      viewer.camera.cancelFlight()
      tileset.maximumScreenSpaceError = SSE_ORBIT
      const t = setTimeout(() => cbRef.current.onRampOutDone(), 300)
      return () => clearTimeout(t)
    }
  }, [phase, viewer, tileset])

  // Leg + hold per target.
  useEffect(() => {
    if (phase !== 'on') return
    let disposed = false
    let holdTick: (() => void) | null = null

    const stopHold = () => { if (holdTick) { viewer.scene.preRender.removeEventListener(holdTick); holdTick = null } }

    if (!target) {
      // Breath: pull back to the city.
      tileset.maximumScreenSpaceError = SSE_FLIGHT
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(CITY_VIEW.lng, CITY_VIEW.lat, CITY_VIEW.height),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
        duration: cbRef.current.pace.tweenMs / 1000,
      })
      return () => { viewer.camera.cancelFlight() }
    }

    const center = { lng: target.lng, lat: target.lat, height: TARGET_HEIGHT_M }
    const pitch = Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin)
    const start = orbitPose(center, headingRef.current, pitch, ORBIT_RANGE_M)
    tileset.maximumScreenSpaceError = SSE_FLIGHT
    viewer.camera.flyTo({
      destination: toC3(start.position),
      orientation: { direction: toC3(start.direction), up: toC3(start.up) },
      duration: cbRef.current.pace.tweenMs / 1000,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        if (disposed) return
        tileset.maximumScreenSpaceError = SSE_ORBIT
        // Settle gate.
        const t0 = Date.now()
        const poll = setInterval(() => {
          if (disposed) { clearInterval(poll); return }
          if (tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) { clearInterval(poll); cbRef.current.onSettled() }
        }, 150)
        // Hold: advance heading every frame from the SAME pose function.
        let last = performance.now()
        holdTick = () => {
          const now = performance.now()
          const dt = Math.min(64, now - last) / 1000
          last = now
          headingRef.current = (headingRef.current + cbRef.current.pace.orbitDegPerS * dt) % 360
          const p = orbitPose(center, headingRef.current, pitch, ORBIT_RANGE_M)
          viewer.camera.setView({ destination: toC3(p.position), orientation: { direction: toC3(p.direction), up: toC3(p.up) } })
        }
        viewer.scene.preRender.addEventListener(holdTick)
      },
    })
    return () => { disposed = true; viewer.camera.cancelFlight(); stopHold() }
  }, [phase, target, viewer, tileset])
}
```

- [ ] **Step 3: Write the conductor**

```tsx
// src/views/Last48/photoreal/PhotorealConductor.tsx
//
// Null-rendering orchestrator — the Cesium twin of ambient/AmbientConductor.
// Same phase machine, same exit-on-any-input (except inside
// [data-ambient-toggle]), same reduced-motion + boot-curtain gates. The tour
// hook is reused verbatim with chainTour as its ORDER strategy; the camera
// is driven by useCesiumDirector; the hero marker + bubble follow the visit.
import { useEffect, useRef, useState } from 'react'
import type * as Cesium from 'cesium'
import type { AmbientPhase } from '../ambient/useAmbientDirector'
import { useAmbientTour } from '../ambient/useAmbientTour'
import type { PaceValues } from '../ambient/pace'
import type { NormalizedEvent } from '@/types/last48'
import { chainTour } from './tourChain'
import { useCesiumDirector, type PhotorealTarget } from './useCesiumDirector'
import type { PhotorealMarkers } from './PhotorealMarkers'

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  markers: PhotorealMarkers
  events: NormalizedEvent[]
  ambientOn: boolean
  ready: boolean
  pace: PaceValues
  pointsOn: boolean
  onExit: () => void
  onVisit: (ev: NormalizedEvent) => void
  onClearSelection: () => void
  /** The open event (URL ?event= or a marker click). When the tour is OFF a
   *  change here flies to it once and orbits — the deep-link contract. */
  selectedEvent: NormalizedEvent | null
}

export default function PhotorealConductor({ viewer, tileset, markers, events, ambientOn, ready, pace, pointsOn, onExit, onVisit, onClearSelection, selectedEvent }: Props) {
  const [phase, setPhase] = useState<AmbientPhase>('off')
  const [target, setTarget] = useState<PhotorealTarget>(null)
  // Free-look / deep-link selection: a one-stop "tour" of the chosen event.
  // Mirrors Last48UnifiedView's DeepLinkLander, which bails while ambientOn.
  const [freeTarget, setFreeTarget] = useState<PhotorealTarget>(null)
  useEffect(() => {
    if (ambientOn) return
    if (selectedEvent?.longitude != null && selectedEvent.latitude != null) {
      markers.setFocus(selectedEvent.longitude, selectedEvent.latitude)
      setFreeTarget({ lng: selectedEvent.longitude, lat: selectedEvent.latitude })
    } else setFreeTarget(null)
  }, [ambientOn, selectedEvent, markers])
  const onExitRef = useRef(onExit)
  // eslint-disable-next-line react-hooks/refs
  onExitRef.current = onExit

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ambientOn && ready && !reduced && phase === 'off') setPhase('ramp-in')
    if (!ambientOn && (phase === 'ramp-in' || phase === 'on')) { setPhase('ramp-out'); setTarget(null) }
  }, [ambientOn, ready, phase])

  useEffect(() => {
    // Any input during the tour OR during a free-look leg hands the camera back.
    const legRunning = phase === 'ramp-in' || phase === 'on' || freeTarget !== null
    if (!legRunning) return
    const exit = (e: Event) => {
      if (!ambientOn) { setFreeTarget(null); return }
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-ambient-toggle]')) return
      onExitRef.current()
    }
    const opts = { capture: true } as const
    for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) window.addEventListener(ev, exit, opts)
    return () => { for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, exit, opts) }
  }, [phase, freeTarget, ambientOn])

  // Click-to-open in free look (and during the tour, which the click also stops).
  useEffect(() => {
    markers.onPick = (id) => { const ev = events.find((e) => e.id === id); if (ev) onVisit(ev) }
    return () => { markers.onPick = undefined }
  }, [markers, events, onVisit])

  useAmbientTour({
    active: phase === 'on' && pointsOn,
    events,
    dwellMs: pace.dwellMs,
    breathMs: pace.breathMs,
    order: chainTour,
    onVisit: (ev) => {
      onVisit(ev)
      markers.setFocus(ev.longitude!, ev.latitude!)
      setTarget({ lng: ev.longitude!, lat: ev.latitude! })
    },
    onBreath: () => { onClearSelection(); setTarget(null) },
  })

  // The director runs the tour when armed; otherwise it runs the free-look
  // one-stop leg (phase 'on' with the selected target) and yields on input.
  useCesiumDirector({
    viewer, tileset,
    phase: ambientOn ? phase : (freeTarget ? 'on' : 'off'),
    target: ambientOn ? target : freeTarget,
    pace,
    onRampInDone: () => setPhase('on'),
    onRampOutDone: () => { setPhase('off'); onExitRef.current() },
    onSettled: () => { /* the bubble polls tileset.tilesLoaded itself (Task 11) */ },
  })

  return null
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b` → remaining error only for `PhotorealBubble`.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/ambient/useAmbientTour.ts src/views/Last48/photoreal/useCesiumDirector.ts src/views/Last48/photoreal/PhotorealConductor.tsx
git commit -m "feat(photoreal): Cesium director (fly → orbit from one pose authority, tiles by phase, settle gate) + conductor"
```

---

### Task 11: `PhotorealBubble` — the pinned fill-in card

**Files:**
- Create: `src/views/Last48/photoreal/PhotorealBubble.tsx`
- Modify: `src/index.css` — add the `rowin` keyframes near the other Last 48 animations.

**Interfaces:**
- Consumes: `eventCardModel` (Task 3), `formatApTime`, `formatHeadline` from `@/utils/format`, `classifyCaseMedia`.
- Produces: `default PhotorealBubble({ viewer, tileset, event, onClose })`.

- [ ] **Step 1: Keyframes**

In `src/index.css` (beside the other Last 48 keyframes such as `datumPing`):

```css
/* Photoreal bubble rows fill in one at a time (PhotorealBubble.tsx). */
@keyframes rowin { to { opacity: 1; transform: none; } }
.bubble-row { opacity: 0; transform: translateY(4px); animation: rowin 0.5s ease-out forwards; }
@media (prefers-reduced-motion: reduce) { .bubble-row { opacity: 1; transform: none; animation: none; } }
```

- [ ] **Step 2: Component**

```tsx
// src/views/Last48/photoreal/PhotorealBubble.tsx
//
// The floating card in photoreal mode. Same FIELD LOGIC as the flat map's
// Last48EventCard (detail/eventCardModel.ts) so the two never drift; a
// different SKIN: an HTML card pinned above the hero marker every frame
// (scene.cartesianToCanvasCoordinates on postRender) with a stem down to
// it. It fades in once the tiles at the stop have settled (12 s cap) and
// its rows stagger ~1.1 s apart; reduced motion shows everything at once.
import { useEffect, useRef, useState } from 'react'
import * as Cesium from 'cesium'
import { Link } from 'react-router-dom'
import type { NormalizedEvent } from '@/types/last48'
import { formatApTime, formatHeadline } from '@/utils/format'
import { classifyCaseMedia } from '@/utils/caseMedia'
import { DATASET_META, formatAge, formatApDate, populatedFields, resolveExplore, locationLine } from '../detail/eventCardModel'
import { SETTLE_CAP_MS } from './useCesiumDirector'

const ANCHOR_HEIGHT_M = 110

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset | null
  event: NormalizedEvent | null
  onClose: () => void
}

export default function PhotorealBubble({ viewer, tileset, event, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)

  // Settle gate → show.
  useEffect(() => {
    setShown(false)
    if (!event) return
    const t0 = Date.now()
    const poll = setInterval(() => {
      if (!tileset || tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) { clearInterval(poll); setShown(true) }
    }, 150)
    return () => clearInterval(poll)
  }, [event, tileset])

  // Pin to the marker every frame.
  useEffect(() => {
    if (!event || event.longitude == null || event.latitude == null) return
    const anchor = Cesium.Cartesian3.fromDegrees(event.longitude, event.latitude, ANCHOR_HEIGHT_M)
    const tick = () => {
      const p = viewer.scene.cartesianToCanvasCoordinates(anchor)
      const el = ref.current
      if (!p || !el) return
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`
    }
    viewer.scene.postRender.addEventListener(tick)
    return () => { viewer.scene.postRender.removeEventListener(tick) }
  }, [viewer, event])

  useEffect(() => {
    if (!event) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [event, onClose])

  if (!event) return null
  const meta = DATASET_META[event.datasetId]
  const { magnitude, unit } = formatAge(event.receivedAt)
  const loc = locationLine(event)
  const explore = resolveExplore(event)
  const media = event.datasetId === '311-cases'
    ? classifyCaseMedia((event.raw as { media_url?: { url?: string } | null }).media_url?.url) : null
  const rows: Array<[string, string]> = [
    ...(event.datasetId === '911-realtime' && event.priority ? [['Priority', event.priority === 'A' ? 'A — life-threatening' : event.priority] as [string, string]] : []),
    ...(loc ? [[loc.label, loc.place] as [string, string]] : [['Location', 'Suppressed; sensitive call'] as [string, string]]),
    ...populatedFields(event),
  ]

  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute left-0 top-0 z-30 transition-opacity duration-700 ${shown ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-label={event.headline ?? 'Event'}
    >
      <div className="pointer-events-auto min-w-[260px] max-w-[340px] rounded-2xl bg-espresso-950/85 backdrop-blur-md ring-1 ring-paper-100/15 px-4 pt-3 pb-3 text-paper-100 shadow-2xl shadow-black/40">
        <div className="flex items-baseline gap-2">
          <span className="font-display italic text-[40px] leading-none tabular-nums">{magnitude}</span>
          <span className="font-display italic text-[15px] text-paper-400">{unit}</span>
        </div>
        <p className="font-mono text-label text-paper-500 mt-1 tabular-nums">{formatApDate(event.receivedAt)} · {formatApTime(event.receivedAt)} PT</p>
        <div className="mt-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} aria-hidden />
          <span className="font-mono text-nano tracking-[0.18em] uppercase" style={{ color: meta.color }}>{meta.label}</span>
          {event.state && <span className="font-mono text-nano tracking-wider uppercase text-paper-400">{event.state === 'open' ? 'open' : `closed · ${event.disposition ?? '—'}`}</span>}
        </div>
        <h3 className="font-display italic text-[22px] leading-tight mt-1 mb-2">{event.headline ? formatHeadline(event.headline) : 'Event'}</h3>
        {media?.kind === 'image' && (
          <img src={media.url} alt="311 case attachment" className="w-full max-h-40 object-cover rounded-md mb-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        )}
        <ul className="flex flex-col gap-1">
          {rows.map(([label, value], i) => (
            <li key={label} className="bubble-row flex justify-between gap-4 text-[12px]" style={{ animationDelay: shown ? `${1.2 + i * 1.1}s` : '0s' }}>
              <span className="font-mono text-nano uppercase tracking-[0.14em] text-paper-500 pt-0.5">{label}</span>
              <span className="text-right leading-tight">{value}</span>
            </li>
          ))}
        </ul>
        {explore && (
          <Link to={explore.to} onClick={onClose} className="bubble-row mt-3 block font-mono text-label tracking-wider text-ochre-400 hover:text-ochre-300" style={{ animationDelay: shown ? `${1.2 + rows.length * 1.1}s` : '0s' }}>
            {explore.label} →
          </Link>
        )}
      </div>
      <div className="mx-auto h-[70px] w-px bg-gradient-to-b from-paper-100/60 to-transparent" aria-hidden />
    </div>
  )
}
```

- [ ] **Step 3: Typecheck the whole photoreal directory**

Run: `npx tsc -b` → clean. If `classifyCaseMedia`'s return type differs from `{ kind: 'image' | 'link'; url: string } | null`, read `src/utils/caseMedia.ts` and adapt the two lines that use it — do not change the util.

- [ ] **Step 4: Commit**

```bash
git add src/views/Last48/photoreal/PhotorealBubble.tsx src/index.css
git commit -m "feat(photoreal): pinned bubble card sharing the flat card's model; rows fill in; reduced-motion safe"
```

---

### Task 12: `MapPicker`, the page branch, withheld controls, rail mount

**Files:**
- Create: `src/components/maps/MapPicker.tsx`
- Modify: `src/views/Last48/Last48.tsx` (imports; engine resolution; control row; capture block), `src/components/layout/AppShell.tsx` (~line 287, beside the dark-mode toggle)

**Interfaces:**
- Consumes: `effectiveMapEngine`, `parseMapEngine`, `STANDARD_SHIPPED`, `MapEngine` (Task 1); `useIsMobile`; `useRouteView`; `AmbientToggle`'s `photoreal` prop (Task 4); `Last48Photoreal` default export + `Last48PhotorealProps` (Task 8).
- Produces: `default MapPicker({ scope: 'rail' | 'live' })`; page-level `const HAS_GOOGLE_KEY = !!import.meta.env.VITE_GOOGLE_TILES_KEY` (in `Last48.tsx`, NOT in the chunk — the picker must not import the chunk).

- [ ] **Step 1: The picker**

```tsx
// src/components/maps/MapPicker.tsx
//
// "Which map?" — one menu, one vocabulary, two mounts. scope='rail' (AppShell,
// beside dark mode) offers the site-wide engines; scope='live' (The Last 48's
// control row) adds Photoreal when this route/device/key can honour it. A row
// that cannot be honoured is NOT rendered (never disabled-but-present — an
// empty affordance reads as broken, the UnderlayPicker rule). Standard stays
// hidden until Spec B flips STANDARD_SHIPPED.
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useRouteView } from '@/cities/useActiveCity'
import { effectiveMapEngine, STANDARD_SHIPPED, type MapEngine } from '@/stores/mapEngine'

const HAS_GOOGLE_KEY = !!import.meta.env.VITE_GOOGLE_TILES_KEY

const ROWS: Array<{ id: MapEngine; label: string; hint: string }> = [
  { id: 'classic', label: 'Classic', hint: 'today’s map' },
  { id: 'standard', label: 'Standard 3D', hint: 'buildings · light' },
  { id: 'photoreal', label: 'Photoreal', hint: 'Google 3D photos · slow and cinematic · desktop' },
]

export default function MapPicker({ scope }: { scope: 'rail' | 'live' }) {
  const mapEngine = useAppStore((s) => s.mapEngine)
  const setMapEngine = useAppStore((s) => s.setMapEngine)
  const isMobile = useIsMobile()
  const { viewId } = useRouteView()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const t = setTimeout(() => document.addEventListener('mousedown', h), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h) }
  }, [open])

  const ctx = { isMobile, viewId: viewId ?? null, hasKey: HAS_GOOGLE_KEY }
  const rows = ROWS.filter((r) => {
    if (r.id === 'standard') return STANDARD_SHIPPED
    if (r.id === 'photoreal') return scope === 'live' && effectiveMapEngine('photoreal', ctx) === 'photoreal'
    return true
  })
  if (rows.length < 2) return null
  const effective = effectiveMapEngine(mapEngine, ctx)
  const current = rows.find((r) => r.id === effective) ?? rows[0]

  return (
    <div ref={ref} className="relative" data-ambient-toggle>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open}
        title={`Map: ${current.label}`}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-mono uppercase tracking-wider bg-paper-100/40 dark:bg-espresso-900/40 text-paper-600 dark:text-paper-400 hover:text-paper-800 dark:hover:text-paper-200 transition-colors"
      >
        <span>map · {current.label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M2 4l3 3 3-3" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-50 min-w-[15rem] rounded-lg bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl shadow-black/20 p-2">
          {rows.map((r) => (
            <button key={r.id} role="menuitem" onClick={() => { setMapEngine(r.id); setOpen(false) }}
              className={`flex flex-col w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${r.id === effective ? 'bg-ochre-500/15 text-ink dark:text-paper-100' : 'text-paper-800 dark:text-paper-300 hover:bg-paper-100/60 dark:hover:bg-espresso-800/60'}`}>
              <span className="leading-tight">{r.label}</span>
              <span className="text-[8px] font-mono uppercase tracking-widest text-paper-500/70 dark:text-paper-600">{r.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: The page branch in `Last48.tsx`**

Imports (add): `import { lazy, Suspense } from 'react'` (merge with the existing react import), `import { useAppStore } from '@/stores/appStore'`, `import { useIsMobile } from '@/hooks/useIsMobile'`, `import { effectiveMapEngine } from '@/stores/mapEngine'`, `import MapPicker from '@/components/maps/MapPicker'`. Keep the Task 5 line `const Last48Photoreal = lazy(() => import('./photoreal/Last48Photoreal'))` and delete the `{false && …}` placeholder render.

Inside the component, after `tuneOn`:

```ts
  const mapEnginePref = useAppStore((s) => s.mapEngine)
  const isMobile = useIsMobile()
  const engine = effectiveMapEngine(mapEnginePref, { isMobile, viewId: 'live', hasKey: !!import.meta.env.VITE_GOOGLE_TILES_KEY })
  const photoreal = engine === 'photoreal'
  const todOverride = searchParams.get('tod')
```

Control row: insert `<MapPicker scope="live" />` BEFORE `<LayerControls …/>`; pass `photoreal={photoreal}` to `<AmbientToggle>`; in photoreal mode hide the underlay menu and the export button:

```tsx
            <MapPicker scope="live" />
            {!photoreal && (
              <LayerControls … />
            )}
            {photoreal && (
              <button onClick={() => setPointsOn(!pointsOn)} aria-pressed={pointsOn}
                className={`px-3 py-1.5 rounded-md text-label font-mono uppercase tracking-wider transition-all duration-200 ${pointsOn ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100' : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'}`}>
                {pointsOn ? '● dots' : '○ dots'}
              </button>
            )}
            <AmbientToggle … photoreal={photoreal} />
            {photoreal
              ? <span className="font-mono text-nano text-paper-500 dark:text-paper-600" title="PNG export is not available in photoreal mode yet">no export in photoreal</span>
              : <ExportButton targetSelector="#last48-capture" filename="last-48" />}
```

Capture block:

```tsx
      <div id="last48-capture" className="flex-1 relative">
        {photoreal ? (
          <Suspense fallback={<div className="w-full h-full bg-espresso-950" />}>
            <Last48Photoreal
              window48={window48}
              datasets={datasets}
              pointsOn={pointsOn}
              selectedEventId={selectedEventId}
              onSelectedEventIdChange={setSelectedEventId}
              ambientOn={ambientOn}
              ambientReady={ambientReady}
              ambientPace={ambientPace}
              onAmbientExit={() => setAmbientOn(false)}
              todOverride={todOverride}
              tuneOn={tuneOn}
            />
          </Suspense>
        ) : (
          <Last48UnifiedView … unchanged … />
        )}
        {tuneOn && ( <AmbientTunePanel … unchanged … /> )}
      </div>
```

Also: when `photoreal` becomes true and the current pace is not `cinema`, arm `cinema` as the preferred pace — add after the `preferredPaceRef` block:

```ts
  useEffect(() => {
    if (photoreal && preferredPaceRef.current !== 'cinema') preferredPaceRef.current = 'cinema'
    if (!photoreal && preferredPaceRef.current === 'cinema') preferredPaceRef.current = DEFAULT_PACE_ID
  }, [photoreal])
```

- [ ] **Step 3: Rail mount**

In `src/components/layout/AppShell.tsx`, next to the dark-mode toggle (~line 287) in the EXPANDED rail only, add `<MapPicker scope="rail" />` (import it). Because `STANDARD_SHIPPED` is false and photoreal is live-only, the rail picker renders `null` today (fewer than two rows) — that is intended; it lights up when Spec B ships.

- [ ] **Step 4: Typecheck, test, build**

Run: `npx tsc -b && pnpm test && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: clean; suite green; build prints `entry-bundle check ok`.

- [ ] **Step 5: Commit**

```bash
git add src/components/maps/MapPicker.tsx src/views/Last48/Last48.tsx src/components/layout/AppShell.tsx
git commit -m "feat(last48): map picker + photoreal branch; underlay/export withheld in photoreal; cinema pace preferred"
```

---

### Task 13: Riders — the 911 registry contradiction, data-insights, CLAUDE.md, spec as-built

**Files:**
- Modify: `src/cities/sf/datasets.ts:64-74` (`dispatch911Realtime`), `docs/data-insights.md`, `CLAUDE.md` (Last 48 bullet + a new photoreal bullet), `docs/superpowers/specs/2026-09-09-photoreal-last48-design.md` (append "As built").

- [ ] **Step 1: Registry**

```ts
  dispatch911Realtime: {
    id: 'gnap-fj3t',
    name: '911 Dispatch (Real-Time)',
    description: 'Live 911 dispatched calls, rolling 48-hour window',
    publisher: { short: 'SF DEM', full: 'San Francisco Department of Emergency Management' },
    category: 'public-safety',
    // Coordinates ARE published (intersection_point) — snapped to the nearest
    // intersection, suppressed on sensitive calls. Was wrongly hasGeo:false
    // ("no coordinates" in About) until 2026-09-09; the Last 48 had drawn
    // them all along. See photoreal/markerPrecision.ts for the probe.
    hasGeo: true,
    geoField: 'intersection_point',
    defaultSort: 'received_datetime DESC',
    cacheTTL: 60_000, // 1 min for real-time data
    dateField: 'received_datetime',
  },
```

Run `pnpm test` — if any test pinned `hasGeo: false` for this id, read why before changing it; the About sources table derives its "no coordinates" text from `sourceNotes.ts` (already updated in Task 6), not from `hasGeo`.

- [ ] **Step 2: data-insights section**

Append to `docs/data-insights.md` under the Last 48 findings:

```markdown
## Location precision on the three Last 48 streams (probed Sept. 9, 2026)

| Stream | Geo column | Address form | Distinct coordinates in the newest 2,000 rows |
|---|---|---|---|
| 911 realtime `gnap-fj3t` | `intersection_point` | intersection (`intersection_name`) | 1,200 (60%) |
| Fire/EMS dispatch `nuek-vuh3` | `case_location` | intersection, e.g. "MISSION ST/PARK ST" | 697 (35%) |
| 311 `vw6y-z8j6` | `point` | street address, e.g. "831 FULTON ST" | 1,802 (90%) |

911 and Fire/EMS coordinates are the nearest intersection — roughly half a block of true uncertainty — while 311 is address-level. Any marker finer than a corner is false precision for two of the three streams, so the photoreal mode draws intersection streams as a ~40 m ground disc and 311 as a column, and every card leads its location row with the precision word ("Nearest intersection · …" / "Address · …"). The probe: `$select=<geo>&$order=<date> DESC&$limit=2000`, count distinct rounded coordinates. The registry had carried `hasGeo: false` / "no coordinates" for `gnap-fj3t` since the view launched while the app drew its points the whole time — corrected the same day.
```

- [ ] **Step 3: CLAUDE.md**

Add to the Last 48 view bullet (after the ScannerStrip sentence): `**Photoreal mode (Sept. 2026, PR #TBD):** a map picker (\`MapPicker\`, preference \`appStore.mapEngine\` via the \`src/stores/mapEngine.ts\` leaf; render ONLY from \`effectiveMapEngine\`) swaps the Mapbox view for the lazy \`src/views/Last48/photoreal/\` chunk — Cesium + Google Photorealistic 3D Tiles, desktop + \`/live\` + key only. Cesium must NEVER reach the entry bundle (\`scripts/check-entry-bundle.mjs\` fails the build); the key is \`VITE_GOOGLE_TILES_KEY\` (Vercel dashboard only). Markers are two LANGUAGES keyed by \`markerPrecision.ts\` (911 + Fire/EMS = nearest intersection → ground disc; 311 = address → column) — never a needle on an intersection stream; animate marker COLOUR only, never a geometry size. Camera legs and orbit frames both come from the pure \`cameraPose.ts\` (one authority — the spike flew to the Earth's centre reading a camera-local position). Grade follows theme (light = day, dark = dusk; Google tiles are daylight photos, night is a shader grade). Quota refusal → session-only fallback to classic with a one-line note. Spec: \`docs/superpowers/specs/2026-09-09-photoreal-last48-design.md\`.`

Also update the Data Fetching bullet list: the `dispatch911Realtime` "no coordinates" belief is gone — nothing in CLAUDE.md states it today, so only verify with `grep -n "no coordinates" CLAUDE.md` (expect no hit).

- [ ] **Step 4: Spec as-built**

Append to the spec:

```markdown
## 11. As built (2026-09-xx)

- §6 deviation: `google-3d-tiles` is a `NON_SOCRATA` row only; NOT added to the manifest's `staticSources` — the pill filters `basemap` rows by design and no manifest lists `mapbox-basemap` either. About shows it via `nonSocrataFor('sf')`.
- §5: the orbit is driven by `camera.setView` along the pure `orbitPose()` every frame (not `lookAt`), so the flight target and frame 0 are literally the same function output.
- §5: `useAmbientTour` gained an optional `order` strategy (default `buildPass`); the photoreal conductor passes `chainTour`.
- `cinema` carries `photorealOnly: true`; the AUTO pill hides it on the flat map.
- The rail `MapPicker` renders null until Spec B (fewer than two offerable rows).
```

- [ ] **Step 5: Test, build, commit**

Run: `pnpm test && ~/dev/devman/tools/devman-build.mjs pnpm build`

```bash
git add src/cities/sf/datasets.ts docs/data-insights.md CLAUDE.md docs/superpowers/specs/2026-09-09-photoreal-last48-design.md
git commit -m "docs+data: 911 realtime has coordinates (nearest intersection); precision findings; photoreal conventions"
```

---

## Verification (end of plan — the walk is the gate)

1. `pnpm test` green; `~/dev/devman/tools/devman-build.mjs pnpm build` green and prints `entry-bundle check ok`.
2. `.env.local` carries `VITE_GOOGLE_TILES_KEY` (Jesse adds `http://localhost:5174/*` to the key's referrers). Dev server via Tarmac, never a shell.
3. Chrome walk, tab FOREGROUNDED (`document.hidden === false`), on `/live`:
   - Picker shows `Classic` and `Photoreal`; choose Photoreal → the Cesium chunk loads (Network tab), tiles appear, credit bar visible.
   - Dark mode → dusk grade; light mode → day. `?tod=night` → night.
   - AUTO on → `cinema` pace: 9 s flights, ~1°/s orbit, bubble fades in after tiles settle, rows fill one by one. Hero disc/column breathes in colour only.
   - Drag → tour stops; click a marker → its bubble; Escape closes; `?event=<id>` deep link opens and orbits it.
   - DOTS off → markers gone; on → back.
   - Set a bogus `VITE_GOOGLE_TILES_KEY` (or revoke referrer) → "Photoreal is resting for today" and the classic map.
   - Resize to ≤768 effective width → `Photoreal` row absent; stored preference `photoreal` renders classic.
   - `?tune=1` → tile-load gauge counts.
4. Cost: after one full tour on production, Jesse reads Google Cloud → Billing → Reports and records the Map Tiles figure in `docs/data-insights.md`.
5. Before merge: the PR body lists the walk results per item above.
