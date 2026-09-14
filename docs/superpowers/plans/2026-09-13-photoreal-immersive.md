# Photoreal Immersive Mode (Spec A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/live/immersive` — a chrome-less, lower-third Last 48 over Google Photorealistic 3D Tiles that shows ONE incident at a time at a dream pace, preloads the next stop's tiles during the current dwell, renders on demand, and doubles as a b-roll plate — after dark-launching the existing Spec A photoreal mode on `main`.

**Architecture:** Spec A's Cesium chunk (`src/views/Last48/photoreal/`) is reused: its pure leaves (`cameraPose`, `quality`, `pace`, `tourChain`, `markerPrecision`, `eventCardModel`) gain the immersive values; its viewer/tileset/grade lifecycle is extracted into `viewerHost.ts` so two scenes share it; `PhotorealMarkers` gains `setQueue`. Everything new lives in `src/views/Last48/photoreal/immersive/`: a pure `carousel.ts`, a still-camera director whose "drift" is one slow LINEAR `flyTo` (the preload hook), a play clock, the lower-third band, and the route page. `/live/immersive` is a DETAIL ROUTE of the `live` family (like `/business/chain/:ban`), so `parseRoute` still reports `viewId: 'live'`, `useUrlSync` keeps it dateless, and the manifest's `sources`/`citable` carry over untouched; the app shell reads a new pure `routeChrome()` to drop its rail.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind v4; CesiumJS 1.145 (`cesium`); Google Map Tiles API; Zustand; React Router 6; Vitest (node-only, `src/**/*.test.ts`).

**Spec:** `docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md` (Spec A2, written 2026-09-13). Builds on `docs/superpowers/specs/2026-09-09-photoreal-last48-design.md` (Spec A, built on `feat/photoreal-last48`). The spec is the authority; this plan argues from it. Two places where the plan departs from the spec's WORDING are rulings recorded in "Plan rulings" below.

## Global Constraints

- **Branching.** Task 1 lands on `feat/photoreal-last48` (the Spec A branch) and is the dark launch of Spec A. **The controller STOPS after Task 1** so Jesse can merge that branch to `main` (a PR merge is a shared-branch side effect — never done by an agent). Tasks 2–11 run on a NEW branch `feat/photoreal-immersive` cut from `main` after the merge. Never commit to `main`.
- **Cesium must never reach the entry bundle.** Only modules under `src/views/Last48/photoreal/**` may `import … from 'cesium'`; `scripts/check-entry-bundle.mjs` fails `pnpm build` otherwise. The immersive page is reached through a LAZY import; the gate component that decides mobile/key coercion imports no Cesium.
- **No key in the repo.** `import.meta.env.VITE_GOOGLE_TILES_KEY` is read only inside `src/views/Last48/photoreal/` (plus the two `!!import.meta.env.VITE_GOOGLE_TILES_KEY` presence checks in `MapPicker.tsx` and the new gate). `.env.local` locally; Vercel dashboard only in prod (never `vercel env add`).
- Vitest is node-only over `src/**/*.test.ts`. `.tsx` files have no tests; put logic in `.ts` leaves. Never import `cesium` or `appStore` in a test.
- `md:` is banned in app code — write `desk:`. Micro type uses `text-nano` / `text-micro` / `text-label`, never `text-[9px]`-style sizes.
- Reader-facing prose is body serif; mono is for labels, values, eyebrows.
- Stream pigments are fixed (`COLORS` in `src/views/Last48/ageRamp.ts`): 911 `#616a96`, Fire/EMS `#b85a33`, 311 `#7a9954`.
- **Dream pace (spec §3):** `tweenMs 18000`, `dwellMs 75000`, `breathMs 0`, `orbitDegPerS 0.05`, `pitchMin 30`, label `Dream`, hint `immersive`, `photorealOnly: true`.
- **Immersive quality defaults (spec §3):** `resolution 1.0`, `sseOrbit 12`, `fpsCap 30`, `foveation 4`, `dynamicSse true`; MSAA 4 (`msaaSamples: 4`, the Cesium default, set explicitly); `requestRenderMode: true` with `maximumRenderTimeChange = Infinity`.
- **Range (spec §3):** 620 m for Spec A's orbit, 900 m immersive; pitch −30° unchanged. Flight tile detail `SSE_FLIGHT` (40) stays; rest detail is `quality.sseOrbit`; settle cap `SETTLE_CAP_MS` (12 000).
- **Lower third (spec §2):** fixed bottom band, height `clamp(220px, 30vh, 340px)`, id `immersive-lower-third`, `data-export-ignore`; columns controls ~15% · carousel ~60% · queue ~25%; queue shows the next 6 stops; the first 2 are dim discs on the map.
- **Keys (spec §2, §6):** `←`/`→` step, `O` overlay toggle, `H` hold 10 s, `Escape` shows the overlay if hidden else leaves to `/live` with the same `?event=`. `?play=1` = auto-advance on (opt-in; default explore).
- **B-roll (spec §6):** DataDiver never renders, stores, or serves video; the Cesium credit bar stays visible; the 16:9 tick set shows only while the overlay is hidden.
- **Hero animation is colour-only** (never a geometry dimension); the hero's breathing timer calls `scene.requestRender()` at most 20×/s.
- Every Cesium-touching cleanup gates on `viewer.isDestroyed()`; the host defers `viewer.destroy()` one microtask (React runs passive cleanups parent-first).
- Build through `~/dev/devman/tools/devman-build.mjs pnpm build`. Run `pnpm test` and `npx tsc -b` before every commit. Never run `pnpm dev` from a shell (Tarmac owns dev servers).
- Commit messages end with the attribution trailer given in the session.

## Plan rulings (spec wording → plan)

1. **Route identity.** Spec §2/§8 say "the route manifest entry (`chrome: 'none'`)" and "`sources.test.ts` learns the new manifest entry". The code's ONE pathname authority (`parseRoute`) collapses deeper segments to their view family, and a manifest entry would mean a new `ViewId`, a nav row, a route row and a `VIEW_COMPONENTS` slot for what is a mode of The Last 48. Ruling: `/live/immersive` is a hand-written detail route of `live`; chrome-off comes from a pure `routeChrome(pathname)` in `routing.ts`; no manifest change; `sources.test.ts` needs nothing because the immersive files sit under `src/views/Last48` and fetch through the same `useLast48Window` with the same `cite` purposes. Task 11 records this in the spec's "As built" section.
2. **Band register.** Spec §2 says both "espresso glass in both themes" and "the light theme still renders the band in the light register". Ruling: the band follows the THEME (light register in light mode); only the TILES are always dusk.
3. **Play key.** Spec names a play button, no key. Ruling: `Space` also toggles play (harmless, expected of a carousel).

---

## File structure

**Create**
- `src/views/Last48/photoreal/viewerHost.ts` — `createViewer`, `loadGoogleTileset`, `applyGrade`, `GOOGLE_TILES_KEY` (extracted from `Last48Photoreal.tsx`; both scenes use it).
- `src/views/Last48/photoreal/immersive/carousel.ts` (+ `.test.ts`) — active index, step, peek, queue.
- `src/views/Last48/photoreal/immersive/frame.ts` (+ `.test.ts`) — the 16:9 inner frame.
- `src/views/Last48/photoreal/immersive/useDreamDirector.ts` — flight → settle → drift-as-flight → next-stop preload; hold.
- `src/views/Last48/photoreal/immersive/useAutoAdvance.ts` — the play clock (dwell from arrival, hold keeps the remainder).
- `src/views/Last48/photoreal/immersive/ImmersiveCard.tsx` — the card face (same field model as the bubble).
- `src/views/Last48/photoreal/immersive/LowerThird.tsx` — controls · carousel · queue.
- `src/views/Last48/photoreal/immersive/FrameTicks.tsx` — the 16:9 corner ticks.
- `src/views/Last48/photoreal/immersive/ImmersiveScene.tsx` — the Cesium host for immersive (viewer, tileset, dusk grade, hero + queue discs, director, breath render, input cancel).
- `src/views/Last48/photoreal/immersive/Last48Immersive.tsx` — the route page: data, URL, carousel state, keyboard, hold, overlay, play.
- `src/views/Last48/ImmersiveGate.tsx` — Cesium-free route element: mobile / no-key / resting → `/live`, else the lazy page.

**Modify**
- `src/stores/mapEngine.ts` (+ test) — `PHOTOREAL_OFFERED`.
- `src/components/maps/MapPicker.tsx` — row gated on `PHOTOREAL_OFFERED`; later navigates to `/live/immersive`.
- `src/views/Last48/Last48.tsx:136-147` — `?engine=photoreal` session override.
- `src/views/Last48/ambient/pace.ts` (+ test) — `dream` preset, `hidden` flag; `AmbientToggle.tsx` filter.
- `src/views/Last48/photoreal/quality.ts` (+ test) — `QUALITY_IMMERSIVE`, `resetQuality`.
- `src/views/Last48/photoreal/cameraPose.ts` (+ test) — `RANGE_M`.
- `src/cities/routing.ts` (+ test), `src/cities/useActiveCity.ts` — `routeChrome`, `useRouteChrome`.
- `src/hooks/useUrlSync.ts` — skipSync on chrome-less routes.
- `src/views/Last48/photoreal/Last48Photoreal.tsx` — use `viewerHost.ts`; `resetQuality(QUALITY_DEFAULT)` at mount.
- `src/views/Last48/photoreal/PhotorealMarkers.ts` — `setQueue`.
- `src/components/layout/AppShell.tsx` — chrome-off branch.
- `src/App.tsx` — the `/live/immersive` route row.
- `src/views/About/About.tsx` — the b-roll paragraph.
- `CLAUDE.md`, the A2 spec (§10 "As built").

---

### Task 1: Dark-launch Spec A — `PHOTOREAL_OFFERED` + `?engine=photoreal`

Runs on `feat/photoreal-last48`. After this task the controller stops for Jesse's merge.

**Files:**
- Modify: `src/stores/mapEngine.ts`
- Modify: `src/stores/mapEngine.test.ts`
- Modify: `src/components/maps/MapPicker.tsx:5,44-48`
- Modify: `src/views/Last48/Last48.tsx:136-147`
- Modify: `CLAUDE.md` (the Photoreal sentence inside the "The Last 48" bullet)

**Interfaces:**
- Produces: `export const PHOTOREAL_OFFERED: boolean` in `src/stores/mapEngine.ts` (false now; Task 11 flips it).

- [ ] **Step 1: Write the failing test**

Append to `src/stores/mapEngine.test.ts` (add `PHOTOREAL_OFFERED` to the existing import line):

```ts
describe('dark launch (Spec A2 §7)', () => {
  it('the picker hides Photoreal until the immersive route ships', () => {
    expect(PHOTOREAL_OFFERED).toBe(false)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/stores/mapEngine.test.ts`
Expected: FAIL — `PHOTOREAL_OFFERED` is not exported (TypeScript/undefined).

- [ ] **Step 3: Add the constant**

In `src/stores/mapEngine.ts`, after `STANDARD_SHIPPED`:

```ts
/** Spec A2 §7 DARK LAUNCH: the MapPicker hides the Photoreal row until the
 *  immersive route (/live/immersive) ships. `?engine=photoreal` on /live
 *  still mounts the renderer — parsed by Last48.tsx, session-only, never
 *  persisted — so it can be tested on production hardware behind the real
 *  key and quota. effectiveMapEngine is unchanged; only the picker reads this. */
export const PHOTOREAL_OFFERED = false
```

- [ ] **Step 4: Gate the picker row**

In `src/components/maps/MapPicker.tsx` change the import on line 5 to:

```ts
import { effectiveMapEngine, PHOTOREAL_OFFERED, STANDARD_SHIPPED, type MapEngine } from '@/stores/mapEngine'
```

and the photoreal filter line to:

```ts
    if (r.id === 'photoreal') return PHOTOREAL_OFFERED && scope === 'live' && !photorealResting && effectiveMapEngine('photoreal', ctx) === 'photoreal'
```

- [ ] **Step 5: The session-only `?engine=photoreal` override**

Replace `src/views/Last48/Last48.tsx` lines 136–147 (from the "Which map engine" comment through `const photoreal = …`) with:

```ts
  // Which map engine this page actually renders — the PREFERENCE (store)
  // resolved against this route/device/key via effectiveMapEngine. This
  // route is /live, so viewId is the literal 'live'.
  const storedEngine = useAppStore((s) => s.mapEngine)
  // Set (session-only) when the photoreal renderer stood down on a Google
  // quota/auth refusal — it flips the engine to classic in the same write, so
  // the note it wants to show has to be rendered from HERE, over the classic
  // map that replaced it.
  const photorealResting = useAppStore((s) => s.photorealResting)
  // Spec A2 §7 dark launch: `?engine=photoreal` overrides the stored
  // preference for THIS render only — never written to the store — so the
  // renderer stays reachable while the picker hides its row. The resting flag
  // wins over it: a quota refusal sets the store to classic, and an override
  // that ignored it would re-mount photoreal on the next render and loop.
  const engineParam = searchParams.get('engine')
  const mapEnginePref = engineParam === 'photoreal' && !photorealResting ? 'photoreal' : storedEngine
  const isMobile = useIsMobile()
  const engine = effectiveMapEngine(mapEnginePref, { isMobile, viewId: 'live', hasKey: !!import.meta.env.VITE_GOOGLE_TILES_KEY })
  const photoreal = engine === 'photoreal'
```

- [ ] **Step 6: CLAUDE.md**

In `CLAUDE.md`, inside the "The Last 48" bullet, find the sentence beginning `**Photoreal mode (Sept. 2026, PR #TBD):**` and append, after `Spec: \`docs/superpowers/specs/2026-09-09-photoreal-last48-design.md\`.`:

```
**Dark-launched (Spec A2 §7):** `PHOTOREAL_OFFERED` in `src/stores/mapEngine.ts` hides the picker row; `?engine=photoreal` on `/live` mounts the renderer session-only (parsed in `Last48.tsx`, never stored). The immersive route is Spec A2: `docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md`.
```

- [ ] **Step 7: Verify**

Run: `pnpm vitest run src/stores/mapEngine.test.ts && npx tsc -b && pnpm test`
Expected: all green. Then `~/dev/devman/tools/devman-build.mjs pnpm build` → ends with `entry-bundle check ok`.

- [ ] **Step 8: Commit**

```bash
git add src/stores/mapEngine.ts src/stores/mapEngine.test.ts src/components/maps/MapPicker.tsx src/views/Last48/Last48.tsx CLAUDE.md
git commit -m "feat(photoreal): dark launch — picker row hidden behind PHOTOREAL_OFFERED, ?engine=photoreal session override"
```

- [ ] **Step 9: STOP — hand the merge to Jesse**

Push `feat/photoreal-last48`. The controller reports: "Task 1 done; Spec A is ready to merge dark. Open the PR and merge; then I cut `feat/photoreal-immersive` from `main` for Tasks 2–11." Do NOT continue until the merge has landed and `git checkout -b feat/photoreal-immersive main` (after `git pull`) succeeds.

---

### Task 2: Pure leaves — `dream` pace, immersive quality, per-mode range, `routeChrome`

**Files:**
- Modify: `src/views/Last48/ambient/pace.ts`, `src/views/Last48/ambient/pace.test.ts`, `src/views/Last48/ambient/AmbientToggle.tsx:141`
- Modify: `src/views/Last48/photoreal/quality.ts`, `src/views/Last48/photoreal/quality.test.ts`
- Modify: `src/views/Last48/photoreal/cameraPose.ts`, `src/views/Last48/photoreal/cameraPose.test.ts`
- Modify: `src/cities/routing.ts`, `src/cities/routing.test.ts`, `src/cities/useActiveCity.ts`, `src/hooks/useUrlSync.ts:31-32`

**Interfaces:**
- Produces: `PACE_PRESETS.dream: PacePreset` (`PaceId` gains `'dream'`; `PacePreset.hidden?: true`); `QUALITY_IMMERSIVE: Quality`; `resetQuality(base: Quality): Quality`; `RANGE_M: { orbit: 620; immersive: 900 }` (`ORBIT_RANGE_M` kept as `RANGE_M.orbit`); `IMMERSIVE_PATH = '/live/immersive'`; `type RouteChrome = 'shell' | 'none'`; `routeChrome(pathname: string): RouteChrome`; `useRouteChrome(): RouteChrome`.

- [ ] **Step 1: Write the failing tests**

`src/views/Last48/ambient/pace.test.ts` — change the "accepts each preset id" test and add a dream block:

```ts
  it('accepts each OFFERED preset id (hidden presets are not URL-armable)', () => {
    for (const p of Object.values(PACE_PRESETS)) {
      expect(parsePaceId(p.id)).toBe(p.hidden ? null : p.id)
    }
  })
```

```ts
describe('dream pace (immersive only)', () => {
  it('has the Spec A2 §3 values, is photorealOnly and hidden from the AUTO pill', () => {
    expect(PACE_PRESETS.dream).toMatchObject({
      id: 'dream', label: 'Dream', hint: 'immersive',
      orbitDegPerS: 0.05, dwellMs: 75000, breathMs: 0, tweenMs: 18000, pitchMin: 30,
      photorealOnly: true, hidden: true,
    })
    expect(parsePaceId('dream')).toBeNull()
  })
  it('drifts about four degrees across one dwell', () => {
    const d = PACE_PRESETS.dream
    expect(d.orbitDegPerS * (d.dwellMs / 1000)).toBeCloseTo(3.75, 5)
  })
})
```

`src/views/Last48/photoreal/quality.test.ts` — extend the import to `{ QUALITY_DEFAULT, QUALITY_IMMERSIVE, QUALITY_RANGE, normalizeQuality, resetQuality, setQuality, quality }` and add:

```ts
describe('immersive quality (Spec A2 §3)', () => {
  it('defaults are full resolution, finer rest detail, gentler foveation', () => {
    expect(QUALITY_IMMERSIVE).toEqual({ fpsCap: 30, sseOrbit: 12, resolution: 1, foveation: 4, dynamicSse: true })
  })
  it('immersive defaults sit inside the slider ranges', () => {
    for (const k of ['fpsCap', 'sseOrbit', 'resolution', 'foveation'] as const) {
      expect(QUALITY_IMMERSIVE[k]).toBeGreaterThanOrEqual(QUALITY_RANGE[k].min)
      expect(QUALITY_IMMERSIVE[k]).toBeLessThanOrEqual(QUALITY_RANGE[k].max)
    }
  })
  it('resetQuality loads a mode into the live object and returns it', () => {
    setQuality({ sseOrbit: 25 })
    expect(resetQuality(QUALITY_IMMERSIVE)).toBe(quality)
    expect(quality).toEqual(QUALITY_IMMERSIVE)
    resetQuality(QUALITY_DEFAULT)
    expect(quality).toEqual(QUALITY_DEFAULT)
  })
})
```

`src/views/Last48/photoreal/cameraPose.test.ts` — extend the import with `RANGE_M` and replace the "defaults are the spike values" test:

```ts
  it('ranges: 620 m orbit (the spike), 900 m immersive (Spec A2 §3); pitch −30', () => {
    expect(RANGE_M).toEqual({ orbit: 620, immersive: 900 })
    expect(ORBIT_RANGE_M).toBe(RANGE_M.orbit)
    expect(ORBIT_PITCH_DEG).toBe(-30)
  })
```

`src/cities/routing.test.ts` — extend the import to `{ parseRoute, viewPath, routeChrome, IMMERSIVE_PATH }` and add:

```ts
describe('routeChrome', () => {
  it('only the immersive Last 48 drops the shell', () => {
    expect(IMMERSIVE_PATH).toBe('/live/immersive')
    expect(routeChrome('/live/immersive')).toBe('none')
    expect(routeChrome('/live/immersive/')).toBe('none')
    expect(routeChrome('/Live/Immersive')).toBe('none')
  })
  it('everything else keeps the shell', () => {
    for (const p of ['/', '/live', '/live-feeds', '/live/x', '/oakland/live/immersive', '/business/chain/abc']) {
      expect(routeChrome(p), p).toBe('shell')
    }
  })
  it('the immersive path is still the live family to parseRoute', () => {
    expect(parseRoute('/live/immersive')).toEqual({ cityId: 'sf', viewId: 'live' })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/views/Last48/ambient/pace.test.ts src/views/Last48/photoreal/quality.test.ts src/views/Last48/photoreal/cameraPose.test.ts src/cities/routing.test.ts`
Expected: FAIL on missing exports (`dream`, `QUALITY_IMMERSIVE`, `resetQuality`, `RANGE_M`, `routeChrome`).

- [ ] **Step 3: `pace.ts`**

Change the id union and the preset type:

```ts
export type PaceId = 'stroll' | 'drift' | 'sweep' | 'cinema' | 'dream'
```

```ts
export interface PacePreset extends PaceValues {
  id: PaceId
  label: string
  hint: string
  /** Offered only in photoreal mode (the AUTO pill hides it on the flat map). */
  photorealOnly?: true
  /** Never offered by the AUTO pill and never armable via ?ambient= — read
   *  directly by the surface that owns it (the immersive route reads `dream`). */
  hidden?: true
}
```

Add the preset after `cinema`:

```ts
  dream: {
    id: 'dream',
    label: 'Dream',
    hint: 'immersive',
    // Spec A2 §3: a stop is ONE slow LINEAR flight across the whole dwell.
    // 0.05°/s over 75 s is ≈3.75° — a barely-moving camera that Cesium still
    // treats as a flight, which is what unlocks the next-stop tile preload.
    // breathMs 0: the carousel IS the pass and the queue never empties.
    orbitDegPerS: 0.05,
    dwellMs: 75000,
    breathMs: 0,
    tweenMs: 18000,
    pitchMin: 30,
    photorealOnly: true,
    hidden: true,
  },
```

`parsePaceId` is unchanged (it does not list `dream`, so `?ambient=dream` → null). In `src/views/Last48/ambient/AmbientToggle.tsx` line 141 change the filter to:

```ts
          {Object.values(PACE_PRESETS).filter((p) => !p.hidden && (!p.photorealOnly || photoreal)).map((preset) => {
```

- [ ] **Step 4: `quality.ts`**

After `QUALITY_DEFAULT`:

```ts
/** Spec A2 §3 — the immersive route: full resolution in a smaller viewport,
 *  finer rest detail (the camera barely moves, so tiles get the whole dwell
 *  to refine), gentler edge relaxation. fps cap unchanged. */
export const QUALITY_IMMERSIVE: Quality = {
  fpsCap: 30,
  sseOrbit: 12,
  resolution: 1,
  foveation: 4,
  dynamicSse: true,
}
```

After `setQuality`:

```ts
/** Load a MODE's defaults into the live object at mount. `quality` is
 *  module-level on purpose (see above), so without this a ?tune=1 edit — or
 *  the other renderer's defaults — would leak from one mount into the next. */
export function resetQuality(base: Quality): Quality {
  Object.assign(quality, normalizeQuality({}, base))
  return quality
}
```

- [ ] **Step 5: `cameraPose.ts`**

Replace `export const ORBIT_RANGE_M = 620` with:

```ts
/** Camera distance from the stop, metres, per mode. 620 was the 2026-09-09
 *  spike's orbit range; the immersive route pulls back to 900 because
 *  Google's mesh reads right when its detail level matches the pixels
 *  (Spec A2 §5). */
export const RANGE_M = { orbit: 620, immersive: 900 } as const
export const ORBIT_RANGE_M: number = RANGE_M.orbit
```

- [ ] **Step 6: `routing.ts` + `useActiveCity.ts` + `useUrlSync.ts`**

Append to `src/cities/routing.ts`:

```ts
/** Spec A2 §2: the immersive Last 48 renders WITHOUT the app shell (no rail,
 *  no mobile top bar). It is a DETAIL route of the `live` family — parseRoute
 *  still reports viewId 'live', so useUrlSync's dateless rule and the
 *  manifest's sources carry over — and this is the one extra fact the shell
 *  needs. Case-insensitive to agree with the router's matching. */
export const IMMERSIVE_PATH = '/live/immersive'
export type RouteChrome = 'shell' | 'none'

export function routeChrome(pathname: string): RouteChrome {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 2 &&
    segments[0].toLowerCase() === 'live' &&
    segments[1].toLowerCase() === 'immersive'
    ? 'none'
    : 'shell'
}
```

In `src/cities/useActiveCity.ts` change the routing import to `import { parseRoute, routeChrome, type RouteIdentity, type RouteChrome } from './routing'` and append:

```ts
/** 'none' on chrome-less routes (the immersive Last 48). */
export function useRouteChrome(): RouteChrome {
  return routeChrome(useLocation().pathname)
}
```

In `src/hooks/useUrlSync.ts` add `routeChrome` to the routing import and change the `skipSync` expression to:

```ts
  // …and CHROME-LESS routes: the immersive gate renders <Navigate to="/live">
  // on mobile / no key / resting, and the dateless write below would re-commit
  // /live/immersive over it (the redirect-clobber class). Immersive carries no
  // date params by contract, so nothing is lost by standing down.
  const skipSync =
    city.redirects.some((r) => r.from === viewId) || entry === undefined || entry.dormant === true ||
    routeChrome(pathname) === 'none'
```

- [ ] **Step 7: Verify**

Run: `pnpm vitest run src/views/Last48/ambient/pace.test.ts src/views/Last48/photoreal/quality.test.ts src/views/Last48/photoreal/cameraPose.test.ts src/cities/routing.test.ts && npx tsc -b && pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/views/Last48/ambient/pace.ts src/views/Last48/ambient/pace.test.ts src/views/Last48/ambient/AmbientToggle.tsx src/views/Last48/photoreal/quality.ts src/views/Last48/photoreal/quality.test.ts src/views/Last48/photoreal/cameraPose.ts src/views/Last48/photoreal/cameraPose.test.ts src/cities/routing.ts src/cities/routing.test.ts src/cities/useActiveCity.ts src/hooks/useUrlSync.ts
git commit -m "feat(immersive): dream pace, immersive quality defaults, per-mode range, routeChrome"
```

---

### Task 3: `carousel.ts` + `frame.ts` — the pure immersive state

**Files:**
- Create: `src/views/Last48/photoreal/immersive/carousel.ts`, `src/views/Last48/photoreal/immersive/carousel.test.ts`
- Create: `src/views/Last48/photoreal/immersive/frame.ts`, `src/views/Last48/photoreal/immersive/frame.test.ts`

**Interfaces:**
- Produces: `QUEUE_LEN = 6`, `QUEUE_DISCS = 2`, `carouselIndex(order, activeId): number`, `stepIndex(order, index, delta): number`, `peekIds(order, index): { prev: string | null; next: string | null }`, `queueIds(order, index, n?): string[]`, `queueDiscIds(order, index): string[]`; `frame169(w, h): { x, y, w, h }`.

- [ ] **Step 1: Write the failing tests**

`src/views/Last48/photoreal/immersive/carousel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { carouselIndex, stepIndex, peekIds, queueIds, queueDiscIds, QUEUE_LEN, QUEUE_DISCS } from './carousel'

const order = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']

describe('carouselIndex', () => {
  it('resolves ?event= against the order; unknown or absent → the newest (0)', () => {
    expect(carouselIndex(order, 'c')).toBe(2)
    expect(carouselIndex(order, null)).toBe(0)
    expect(carouselIndex(order, 'zzz')).toBe(0)
  })
  it('empty order → -1', () => {
    expect(carouselIndex([], 'a')).toBe(-1)
    expect(carouselIndex([], null)).toBe(-1)
  })
})

describe('stepIndex', () => {
  it('wraps both ways', () => {
    expect(stepIndex(order, 0, -1)).toBe(8)
    expect(stepIndex(order, 8, 1)).toBe(0)
    expect(stepIndex(order, 3, 1)).toBe(4)
  })
  it('empty order → -1', () => {
    expect(stepIndex([], 0, 1)).toBe(-1)
  })
})

describe('peekIds', () => {
  it('previous and next around the active, wrapping', () => {
    expect(peekIds(order, 0)).toEqual({ prev: 'i', next: 'b' })
    expect(peekIds(order, 8)).toEqual({ prev: 'h', next: 'a' })
  })
  it('one stop: nothing to peek; two stops: next only (the same card must not appear twice)', () => {
    expect(peekIds(['a'], 0)).toEqual({ prev: null, next: null })
    expect(peekIds(['a', 'b'], 0)).toEqual({ prev: null, next: 'b' })
  })
})

describe('queueIds', () => {
  it('the next QUEUE_LEN stops after the active, wrapping, never the active itself', () => {
    expect(QUEUE_LEN).toBe(6)
    expect(queueIds(order, 6)).toEqual(['h', 'i', 'a', 'b', 'c', 'd'])
  })
  it('caps at order length − 1', () => {
    expect(queueIds(['a', 'b', 'c'], 1)).toEqual(['c', 'a'])
    expect(queueIds(['a'], 0)).toEqual([])
  })
  it('the first two are the map discs', () => {
    expect(QUEUE_DISCS).toBe(2)
    expect(queueDiscIds(order, 0)).toEqual(['b', 'c'])
  })
})
```

`src/views/Last48/photoreal/immersive/frame.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { frame169 } from './frame'

describe('frame169', () => {
  it('a wide box is letterboxed left/right', () => {
    expect(frame169(2000, 900)).toEqual({ x: 200, y: 0, w: 1600, h: 900 })
  })
  it('a tall box is letterboxed top/bottom', () => {
    expect(frame169(1600, 1200)).toEqual({ x: 0, y: 150, w: 1600, h: 900 })
  })
  it('an exact 16:9 box fills itself', () => {
    expect(frame169(1920, 1080)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 })
  })
  it('degenerate boxes give an empty frame', () => {
    expect(frame169(0, 100)).toEqual({ x: 0, y: 0, w: 0, h: 0 })
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`src/views/Last48/photoreal/immersive/carousel.ts`:

```ts
// src/views/Last48/photoreal/immersive/carousel.ts
//
// PURE state math for the immersive lower third (Spec A2 §2). The ORDER is
// chainTour's nearest-neighbour chain (the tour's pass); the ACTIVE stop is
// the URL's ?event=. Everything here is index arithmetic over that order so
// the page, the band and the map agree on prev / next / queue by construction.
export const QUEUE_LEN = 6
/** The first QUEUE_DISCS of the queue are drawn on the map as dim discs. */
export const QUEUE_DISCS = 2

/** The active index for the URL's ?event=. Unknown or absent → 0 (the
 *  newest stop — chainTour starts there); empty order → -1. */
export function carouselIndex(order: readonly string[], activeId: string | null): number {
  if (order.length === 0) return -1
  const i = activeId ? order.indexOf(activeId) : -1
  return i < 0 ? 0 : i
}

export function stepIndex(order: readonly string[], index: number, delta: number): number {
  const n = order.length
  if (n === 0) return -1
  return (((index + delta) % n) + n) % n
}

/** The cards peeking either side of the active one. A two-stop order peeks
 *  next only — the same card must never appear twice in the band. */
export function peekIds(order: readonly string[], index: number): { prev: string | null; next: string | null } {
  const n = order.length
  return {
    prev: n >= 3 ? order[stepIndex(order, index, -1)] : null,
    next: n >= 2 ? order[stepIndex(order, index, 1)] : null,
  }
}

/** The next `n` stops after the active one, wrapping, never the active. */
export function queueIds(order: readonly string[], index: number, n: number = QUEUE_LEN): string[] {
  const count = Math.min(n, Math.max(0, order.length - 1))
  const out: string[] = []
  for (let k = 1; k <= count; k++) out.push(order[stepIndex(order, index, k)])
  return out
}

export function queueDiscIds(order: readonly string[], index: number): string[] {
  return queueIds(order, index, QUEUE_DISCS)
}
```

`src/views/Last48/photoreal/immersive/frame.ts`:

```ts
// src/views/Last48/photoreal/immersive/frame.ts
//
// The largest 16:9 rectangle centred in a w×h box — the b-roll framing ticks
// (Spec A2 §6). Pure; the ticks component measures the host and draws this.
export interface Frame { x: number; y: number; w: number; h: number }

export function frame169(w: number, h: number): Frame {
  if (w <= 0 || h <= 0) return { x: 0, y: 0, w: 0, h: 0 }
  const fw = Math.min(w, (h * 16) / 9)
  const fh = (fw * 9) / 16
  return { x: (w - fw) / 2, y: (h - fh) / 2, w: fw, h: fh }
}
```

- [ ] **Step 4: Verify**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/ && npx tsc -b`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/photoreal/immersive/carousel.ts src/views/Last48/photoreal/immersive/carousel.test.ts src/views/Last48/photoreal/immersive/frame.ts src/views/Last48/photoreal/immersive/frame.test.ts
git commit -m "feat(immersive): pure carousel + 16:9 frame leaves"
```

---

### Task 4: Extract `viewerHost.ts` from `Last48Photoreal.tsx` (behaviour-neutral)

The immersive scene needs the same viewer, tileset and grade lifecycle. Lift it into one module both scenes call. Spec A's behaviour must not change: same widget flags, same fog/sky, same quota fallback, same grade.

**Files:**
- Create: `src/views/Last48/photoreal/viewerHost.ts`
- Modify: `src/views/Last48/photoreal/Last48Photoreal.tsx` (imports, the viewer effect, the grade effect)

**Interfaces:**
- Produces:
  - `GOOGLE_TILES_KEY: string` (moved here; `Last48Photoreal.tsx` re-exports it so nothing else moves).
  - `createViewer(host: HTMLDivElement, o: { requestRenderMode: boolean; msaaSamples: number }): Cesium.Viewer`
  - `loadGoogleTileset(v: Cesium.Viewer, isCancelled: () => boolean, h: { onRest: () => void; onTileLoad: () => void }): Promise<Cesium.Cesium3DTileset | null>` — adds the tileset to `scene.primitives`; resolves `null` when cancelled or after calling `onRest` on failure.
  - `applyGrade(viewer: Cesium.Viewer, tileset: Cesium.Cesium3DTileset, isDark: boolean, todOverride: string | null): void`
  - `applyQuality(v: Cesium.Viewer, ts: Cesium.Cesium3DTileset | null, q: Quality): void` (moved here from `Last48Photoreal.tsx`, which re-exports it for `PhotorealTunePanel`'s existing import path).
- Consumes: `resetQuality`, `QUALITY_DEFAULT` from Task 2.

- [ ] **Step 1: Create `viewerHost.ts`**

```ts
// src/views/Last48/photoreal/viewerHost.ts
//
// The Cesium viewer / Google tileset / theme-grade lifecycle, shared by the
// two photoreal scenes (Last48Photoreal — Spec A's in-page mode — and the
// immersive route's ImmersiveScene). Lifted verbatim from Last48Photoreal so
// the two cannot drift on widget flags, fog, the quota fallback or the grade.
// Every function here imports Cesium, so this file stays inside the lazy
// photoreal chunk (scripts/check-entry-bundle.mjs).
import * as Cesium from 'cesium'
import { GRADES, GRADE_CLOCK_ISO, GRADE_FRAGMENT_GLSL, gradeForTheme } from './grade'
import type { Quality } from './quality'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'

/** Whether Photoreal can be offered at all — read by the picker via the
 *  page, never by importing this chunk (that would defeat the lazy split). */
export const GOOGLE_TILES_KEY: string = import.meta.env.VITE_GOOGLE_TILES_KEY || ''

const CITY = { lng: -122.42, lat: 37.70, height: 7000 }

export interface ViewerOptions {
  /** Spec A: false (the orbit moves every frame). Spec A2: true — Cesium
   *  draws only on camera change, tile arrival, or an explicit requestRender. */
  requestRenderMode: boolean
  /** 4 = Cesium's default; set explicitly so the two scenes state it. */
  msaaSamples: number
}

export function createViewer(host: HTMLDivElement, o: ViewerOptions): Cesium.Viewer {
  const v = new Cesium.Viewer(host, {
    animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
    baseLayerPicker: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false,
    baseLayer: false, requestRenderMode: o.requestRenderMode, msaaSamples: o.msaaSamples,
  })
  // In render-on-demand mode the simulation clock must never force a frame
  // (we never animate the clock; the grade pins it to one instant).
  if (o.requestRenderMode) v.scene.maximumRenderTimeChange = Infinity
  v.scene.globe.show = false
  if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true
  v.scene.fog.enabled = true
  v.scene.fog.density = 0.00025
  v.scene.postProcessStages.fxaa.enabled = true
  v.clock.shouldAnimate = false
  v.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(CITY.lng, CITY.lat, CITY.height),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
  })
  return v
}

export interface TilesetHandlers {
  /** A quota/auth refusal (403/429 on a tile, or the root request failing). */
  onRest: () => void
  onTileLoad: () => void
}

/** Create the Google tileset and add it to the scene. Resolves null when
 *  `isCancelled()` turned true while the root request was in flight (the
 *  tileset is destroyed) or on failure (after onRest). */
export async function loadGoogleTileset(
  v: Cesium.Viewer,
  isCancelled: () => boolean,
  h: TilesetHandlers,
): Promise<Cesium.Cesium3DTileset | null> {
  try {
    const ts = await Cesium.createGooglePhotorealistic3DTileset(
      { key: GOOGLE_TILES_KEY },
      { maximumScreenSpaceError: 40, preloadFlightDestinations: true, skipLevelOfDetail: true },
    )
    if (isCancelled() || v.isDestroyed()) { ts.destroy(); return null }
    // Quota/auth refusals surface here per tile; one is enough to rest.
    // tileFailed's payload is { url, message }; a quota/auth refusal carries
    // the HTTP status in the message text.
    ts.tileFailed.addEventListener((e: { url?: string; message?: string }) => {
      if (/\b(403|429)\b/.test(e?.message ?? '')) h.onRest()
    })
    ts.tileLoad.addEventListener(() => h.onTileLoad())
    v.scene.primitives.add(ts)
    return ts
  } catch (err) {
    console.error('[photoreal] tileset failed', err)
    if (!isCancelled()) h.onRest()
    return null
  }
}

/** Theme grade + sun: light = day, dark = dusk (Google tiles are daylight
 *  photos; night is a shader grade). `todOverride` is the hidden ?tod= knob. */
export function applyGrade(viewer: Cesium.Viewer, tileset: Cesium.Cesium3DTileset, isDark: boolean, todOverride: string | null): void {
  if (viewer.isDestroyed() || tileset.isDestroyed()) return
  const grade = gradeForTheme(isDark, todOverride)
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
  viewer.scene.requestRender()
}

/** Push the live quality knobs onto the viewer and (once it exists) the
 *  tileset. Called at mount, when the tileset lands, and from the ?tune=1
 *  sliders. Rest tile detail is applied by the directors at each phase
 *  change (they read quality.sseOrbit), not here. */
export function applyQuality(v: Cesium.Viewer, ts: Cesium.Cesium3DTileset | null, q: Quality): void {
  if (v.isDestroyed()) return
  v.targetFrameRate = q.fpsCap
  v.resolutionScale = q.resolution
  if (ts && !ts.isDestroyed()) {
    ts.foveatedScreenSpaceError = q.foveation > 0
    ts.foveatedMinimumScreenSpaceErrorRelaxation = q.foveation
    ts.dynamicScreenSpaceError = q.dynamicSse
  }
  v.scene.requestRender()
}
```

- [ ] **Step 2: Rewire `Last48Photoreal.tsx`**

Replace its imports so they read:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
import type * as Cesium from 'cesium'
import './photoreal.css'
import { useAppStore } from '@/stores/appStore'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId, NormalizedEvent } from '@/types/last48'
import type { PaceValues } from '../ambient/pace'
import { PhotorealMarkers } from './PhotorealMarkers'
import PhotorealConductor from './PhotorealConductor'
import PhotorealBubble from './PhotorealBubble'
import PhotorealTunePanel from './PhotorealTunePanel'
import { quality, resetQuality, QUALITY_DEFAULT } from './quality'
import { createViewer, loadGoogleTileset, applyGrade, applyQuality } from './viewerHost'
import Last48EventCard from '../detail/Last48EventCard'

export { GOOGLE_TILES_KEY, applyQuality } from './viewerHost'
```

Delete the `CESIUM_BASE_URL` line, the old `GOOGLE_TILES_KEY` declaration and the old `applyQuality` function (it now lives in `viewerHost.ts`; the re-export keeps `PhotorealTunePanel`'s `onApply={applyQuality}` in this file working unchanged). Replace the whole "Viewer + tileset lifecycle" effect with:

```ts
  // ── Viewer + tileset lifecycle ─────────────────────────────────────────
  useEffect(() => {
    if (!hostRef.current) return
    const v = createViewer(hostRef.current, { requestRenderMode: false, msaaSamples: 4 })
    // This renderer's defaults, every mount — the live object is module-level
    // and the immersive route loads ITS defaults into the same object.
    resetQuality(QUALITY_DEFAULT)
    applyQuality(v, null, quality)
    setViewer(v)
    const m = new PhotorealMarkers(v)
    setMarkers(m)

    let cancelled = false
    void loadGoogleTileset(v, () => cancelled, { onRest: rest, onTileLoad: () => setTileLoads((n) => n + 1) })
      .then((ts) => {
        if (!ts) return
        applyQuality(v, ts, quality)
        setTileset(ts)
      })

    function rest() {
      if (cancelled) return
      // Session-only: the STORE flips to classic so the page swaps renderers;
      // the persisted preference is left alone (Photoreal comes back tomorrow).
      // setMapEngine persists, so write the store field directly. The note
      // itself CANNOT live here — this same write unmounts this component
      // before it could paint — so it rides the store as photorealResting and
      // Last48.tsx renders it over the classic map.
      useAppStore.setState({ mapEngine: 'classic', photorealResting: true })
    }

    return () => {
      // `cancelled` must flip SYNCHRONOUSLY — the in-flight tileset promise
      // above reads it to decide whether to attach to a viewer that is going
      // away. The DESTROY, though, is deferred one microtask: React runs
      // passive-effect cleanups PARENT-first on a deleted subtree, so the
      // bubble's postRender listener and the director's cancelFlight/preRender
      // cleanups all run AFTER this one, and viewer.scene/camera are undefined
      // the instant destroy() returns. A microtask scheduled during the commit
      // pass runs after the whole pass, so the children unhook from a live
      // viewer first. (Belt two: each of those cleanups also gates on
      // viewer.isDestroyed().)
      cancelled = true
      queueMicrotask(() => { m.destroy(); v.destroy() })
    }
  }, [])
```

Replace the "Theme grade + sun" effect with:

```ts
  // ── Theme grade + sun ─────────────────────────────────────────────────
  useEffect(() => {
    if (!tileset || !viewer) return
    applyGrade(viewer, tileset, isDarkMode, props.todOverride)
  }, [tileset, viewer, isDarkMode, props.todOverride])
```

This file now needs only the Cesium TYPES, hence `import type * as Cesium`.

- [ ] **Step 3: Verify**

Run: `npx tsc -b && pnpm test && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: clean; `entry-bundle check ok`. Then confirm nothing outside the photoreal directory imports `GOOGLE_TILES_KEY`: `grep -rn "GOOGLE_TILES_KEY" src | grep -v "src/views/Last48/photoreal/"` → only the two `import.meta.env` presence checks (`Last48.tsx`, `MapPicker.tsx`).

- [ ] **Step 4: Commit**

```bash
git add src/views/Last48/photoreal/viewerHost.ts src/views/Last48/photoreal/Last48Photoreal.tsx
git commit -m "refactor(photoreal): lift viewer/tileset/grade lifecycle into viewerHost.ts (behaviour-neutral)"
```

---

### Task 5: `PhotorealMarkers.setQueue` — the two dim discs

**Files:**
- Modify: `src/views/Last48/photoreal/PhotorealMarkers.ts`

**Interfaces:**
- Produces: `PhotorealMarkers#setQueue(events: NormalizedEvent[]): void` — replaces the queue discs; a queued event's ordinary marker is never drawn; `destroy()` removes them.

- [ ] **Step 1: Fields**

After `private heroEvent: NormalizedEvent | null = null` add:

```ts
  /** Spec A2 §4: the next stops as plain dim discs (no tube, no ring). */
  private queue: Cesium.Entity[] = []
  private queueIds = new Set<string>()
```

- [ ] **Step 2: Exclude queued ids from the ordinary field**

In `sync()` change the `want` line to:

```ts
    if (this.visible) for (const e of this.events) if (this.near(e) && e.id !== this.heroEvent?.id && !this.queueIds.has(e.id)) want.add(e.id)
```

- [ ] **Step 3: The method** (after `setHero`)

```ts
  /** The next stops as plain dim discs in their stream pigment — the same
   *  ground disc idiom as the hero, no tube, no ring, 0.35 alpha. Clamped
   *  like everything else; click = jump (the pick handler reads eventId).
   *  Precision-honesty holds: an intersection stream gets the ~40 m disc,
   *  an address stream a 10 m one. */
  setQueue(events: NormalizedEvent[]) {
    this.queue.forEach((x) => this.viewer.entities.remove(x))
    this.queue = []
    this.queueIds = new Set()
    for (const e of events) {
      if (e.longitude == null || e.latitude == null) continue
      const col = Cesium.Color.fromCssColorString(COLORS[e.datasetId])
      const r = PRECISION[e.datasetId] === 'intersection' ? DISC_M : DISC_M * 0.5
      this.queue.push(this.viewer.entities.add({
        properties: new Cesium.PropertyBag({ eventId: e.id }),
        position: Cesium.Cartesian3.fromDegrees(e.longitude, e.latitude, 0),
        ellipse: {
          semiMajorAxis: r, semiMinorAxis: r,
          height: DISC_LIFT_M, heightReference: ABOVE_TILE,
          material: col.withAlpha(0.35),
          outline: true, outlineColor: col.withAlpha(0.5),
        },
      }))
      this.queueIds.add(e.id)
    }
    this.sync()
  }
```

- [ ] **Step 4: Destroy**

In `destroy()`, in the destroyed-viewer early return add `this.queue = []; this.queueIds = new Set()`; in the live path, after the hero removal line add:

```ts
    this.queue.forEach((x) => this.viewer.entities.remove(x))
    this.queue = []
    this.queueIds = new Set()
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc -b && pnpm test`
Expected: clean.

```bash
git add src/views/Last48/photoreal/PhotorealMarkers.ts
git commit -m "feat(photoreal): PhotorealMarkers.setQueue — the next stops as dim ground discs"
```

---

### Task 6: `useDreamDirector` — flight, settle, drift-as-flight, next-stop preload, hold

**Files:**
- Create: `src/views/Last48/photoreal/immersive/useDreamDirector.ts`

**Interfaces:**
- Consumes: `orbitPose`, `RANGE_M`, `ORBIT_PITCH_DEG` (`../cameraPose`); `quality` (`../quality`); `SSE_FLIGHT`, `SETTLE_CAP_MS`, `PhotorealTarget` (`../useCesiumDirector`); `PaceValues` (`../../ambient/pace`).
- Produces: `useDreamDirector(opts): { cancel: () => void }` with `opts = { viewer, tileset, target: PhotorealTarget, next: PhotorealTarget, pace: PaceValues, hold: boolean, reducedMotion: boolean, onArrived: () => void }`. `cancel()` is what the scene calls on user camera input (drops the running flight or drift; the next target change re-flies).

- [ ] **Step 1: Write the hook**

```ts
// src/views/Last48/photoreal/immersive/useDreamDirector.ts
//
// The immersive camera (Spec A2 §3). Unlike useCesiumDirector there is no
// per-frame orbit. A stop is:
//   1. ONE flight (pace.tweenMs, eased) to the arrival pose;
//   2. the settle gate (tiles loaded, or SETTLE_CAP_MS) → onArrived;
//   3. ONE slow LINEAR flight across the whole dwell — a few degrees of
//      heading. To the eye it is a barely-moving camera; to Cesium it is a
//      flight, and a flight is the ONLY time the tileset runs its
//      PRELOAD_FLIGHT pass (Camera.canPreloadFlight, 1.145). That pass reads
//      scene.preloadFlightCamera + scene.preloadFlightCullingVolume, which
//      flyTo sets to ITS destination. Right after the drift starts, this hook
//      overwrites both with the NEXT stop's pose, so the next stop's tiles
//      stream during this dwell. Neither field is in Cesium's d.ts — hence
//      the one cast below. If a Cesium upgrade removes them, the cast finds
//      `undefined` and the preload silently does nothing (the fallback the
//      spec names — a second hidden Viewer — is a separate, disclosed change).
// Every pose comes from the pure cameraPose.ts, as before.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type { PaceValues } from '../../ambient/pace'
import { orbitPose, RANGE_M, ORBIT_PITCH_DEG } from '../cameraPose'
import { quality } from '../quality'
import { SSE_FLIGHT, SETTLE_CAP_MS, type PhotorealTarget } from '../useCesiumDirector'

const TARGET_HEIGHT_M = 30
const toC3 = (v: [number, number, number]) => new Cesium.Cartesian3(v[0], v[1], v[2])
type Center = { lng: number; lat: number; height: number }

/** The two undocumented scene fields the preload pass reads. */
interface PreloadScene {
  preloadFlightCamera?: Cesium.Camera
  preloadFlightCullingVolume?: Cesium.CullingVolume
}

/** A running drift: enough to stop it mid-way and resume from that heading. */
interface Drift { from: number; to: number; t0: number; ms: number; center: Center }

export function useDreamDirector(opts: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  /** The active stop. null = nothing selected; the camera stays where it is. */
  target: PhotorealTarget
  /** The stop after it — its tiles are preloaded during this dwell. */
  next: PhotorealTarget
  pace: PaceValues
  /** `H` hold: freeze the drift; release resumes it from where it stopped. */
  hold: boolean
  /** prefers-reduced-motion: instant legs, no drift. */
  reducedMotion: boolean
  /** Flight done + tiles settled (or the cap). The page starts the dwell on it. */
  onArrived: () => void
}): { cancel: () => void } {
  const { viewer, tileset, target, hold } = opts
  const headingRef = useRef(35)
  const cbRef = useRef(opts)
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = opts
  const driftRef = useRef<Drift | null>(null)
  const arrivedRef = useRef(false)
  const centerRef = useRef<Center | null>(null)
  /** Set by cancel() (user camera input). The arrival flight's `complete`
   *  can fire synchronously from cancelFlight, and without this flag it
   *  would start the settle gate and then the drift on top of the reader's
   *  own camera. Cleared when a new target starts a new leg. */
  const cancelledRef = useRef(false)

  // Stable helpers in a ref so the effects below never re-run for them.
  const api = useRef({
    alive: () => !viewer.isDestroyed(),
    pitch: () => Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin),
    preloadNext() {
      const nxt = cbRef.current.next
      if (!nxt || viewer.isDestroyed()) return
      const s = viewer.scene as unknown as PreloadScene
      const cam = s.preloadFlightCamera
      if (!cam) return
      const p = orbitPose({ lng: nxt.lng, lat: nxt.lat, height: TARGET_HEIGHT_M }, headingRef.current, this.pitch(), RANGE_M.immersive)
      cam.setView({ destination: toC3(p.position), orientation: { direction: toC3(p.direction), up: toC3(p.up) } })
      // Camera.frustum is a union in the d.ts; every member has computeCullingVolume.
      s.preloadFlightCullingVolume = (cam.frustum as Cesium.PerspectiveFrustum)
        .computeCullingVolume(cam.positionWC, cam.directionWC, cam.upWC)
    },
    startDrift(center: Center) {
      if (viewer.isDestroyed()) return
      const { pace, reducedMotion } = cbRef.current
      if (reducedMotion) return
      const from = headingRef.current
      const to = from + pace.orbitDegPerS * (pace.dwellMs / 1000)
      const end = orbitPose(center, to, this.pitch(), RANGE_M.immersive)
      const me: Drift = { from, to, t0: performance.now(), ms: pace.dwellMs, center }
      driftRef.current = me
      viewer.camera.flyTo({
        destination: toC3(end.position),
        orientation: { direction: toC3(end.direction), up: toC3(end.up) },
        duration: pace.dwellMs / 1000,
        easingFunction: Cesium.EasingFunction.LINEAR_NONE,
        // `complete` can fire synchronously from cancelFlight (observed on
        // Spec A) — only a drift that is still the current one may commit
        // its end heading.
        complete: () => { if (driftRef.current === me) { headingRef.current = to % 360; driftRef.current = null } },
        cancel: () => { if (driftRef.current === me) driftRef.current = null },
      })
      // flyTo just pointed the preload camera at the drift's own end —
      // overwrite it with the NEXT stop for the whole dwell.
      this.preloadNext()
    },
    /** Stop the drift where it is and record the heading reached. */
    stopDrift() {
      const d = driftRef.current
      if (!d) return
      const f = Math.min(1, (performance.now() - d.t0) / d.ms)
      headingRef.current = (d.from + (d.to - d.from) * f) % 360
      driftRef.current = null
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight()
    },
  })

  // One leg per target.
  useEffect(() => {
    if (!target) return
    const a = api.current
    let disposed = false
    let settle: ReturnType<typeof setInterval> | undefined
    arrivedRef.current = false
    cancelledRef.current = false
    a.stopDrift()
    const center: Center = { lng: target.lng, lat: target.lat, height: TARGET_HEIGHT_M }
    centerRef.current = center
    const arrival = orbitPose(center, headingRef.current, a.pitch(), RANGE_M.immersive)
    const { pace, reducedMotion } = cbRef.current
    tileset.maximumScreenSpaceError = SSE_FLIGHT
    viewer.camera.flyTo({
      destination: toC3(arrival.position),
      orientation: { direction: toC3(arrival.direction), up: toC3(arrival.up) },
      duration: reducedMotion ? 0 : pace.tweenMs / 1000,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        if (disposed || cancelledRef.current || !a.alive()) return
        tileset.maximumScreenSpaceError = quality.sseOrbit
        const t0 = Date.now()
        settle = setInterval(() => {
          if (disposed || !a.alive()) { clearInterval(settle); return }
          if (tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) {
            clearInterval(settle)
            arrivedRef.current = true
            cbRef.current.onArrived()
            if (!cbRef.current.hold) a.startDrift(center)
          }
        }, 150)
      },
    })
    return () => {
      disposed = true
      if (settle) clearInterval(settle)
      a.stopDrift()
      if (a.alive()) viewer.camera.cancelFlight()
    }
  }, [target, viewer, tileset])

  // Hold / release. Release resumes the drift only once the stop has arrived
  // (a hold pressed mid-flight lets the flight finish; the settle gate then
  // sees `hold` and does not start the drift).
  useEffect(() => {
    const a = api.current
    if (hold) { a.stopDrift(); return }
    const c = centerRef.current
    if (arrivedRef.current && c && !driftRef.current) a.startDrift(c)
  }, [hold])

  return {
    cancel: () => {
      const a = api.current
      cancelledRef.current = true
      a.stopDrift()
      if (a.alive()) { viewer.camera.cancelFlight(); tileset.maximumScreenSpaceError = quality.sseOrbit }
    },
  }
}
```

- [ ] **Step 2: Verify the cast compiles and the d.ts names exist**

Run: `npx tsc -b`
Expected: clean. If `cancel` is rejected on `flyTo`'s options, remove that one line (the `complete` token guard already covers the synchronous-fire case). Confirm the internals in the shipped build: `grep -c "preloadFlightCamera" node_modules/cesium/Build/CesiumUnminified/index.js` → ≥ 4 and `grep -n "canPreloadFlight = function" node_modules/cesium/Build/CesiumUnminified/index.js` → one hit. Put both outputs in the report.

- [ ] **Step 3: Commit**

```bash
git add src/views/Last48/photoreal/immersive/useDreamDirector.ts
git commit -m "feat(immersive): useDreamDirector — one flight, settle, drift-as-flight, next-stop preload, hold"
```

---

### Task 7: `useAutoAdvance` — the play clock

**Files:**
- Create: `src/views/Last48/photoreal/immersive/useAutoAdvance.ts`

**Interfaces:**
- Consumes: `dueWaitMs` (`../../ambient/tour`).
- Produces: `useAutoAdvance(opts: { playing: boolean; arrived: boolean; hold: boolean; dwellMs: number; stopKey: string | null; onAdvance: () => void }): void`. Fires `onAdvance` once, `dwellMs` after `arrived` turned true for the current `stopKey`; a hold keeps the remainder; a new `stopKey` discards it.

- [ ] **Step 1: Write the hook**

```ts
// src/views/Last48/photoreal/immersive/useAutoAdvance.ts
//
// The immersive PLAY clock (Spec A2 §1: auto-advance is opt-in; explore is
// the default). Counts the dwell from ARRIVAL — the page flips `arrived`
// when the director's settle gate fires — then calls onAdvance once. Hold
// pauses the clock and keeps the remainder; a new stop (stopKey) discards
// it. Same wall-clock gate as the flat tour (dueWaitMs), so a backgrounded
// tab's coalesced timers cannot fire a burst of advances on refocus.
import { useEffect, useRef } from 'react'
import { dueWaitMs } from '../../ambient/tour'

export function useAutoAdvance(opts: {
  playing: boolean
  arrived: boolean
  hold: boolean
  dwellMs: number
  /** The active stop's id. Changing it resets the clock. */
  stopKey: string | null
  onAdvance: () => void
}): void {
  const cb = useRef(opts.onAdvance)
  // eslint-disable-next-line react-hooks/refs
  cb.current = opts.onAdvance
  /** Milliseconds left when the clock was last paused, for THIS stop. */
  const remainingRef = useRef<number | null>(null)

  // A new stop discards any remainder. Declared BEFORE the timer effect so
  // React runs it first on the same commit.
  useEffect(() => { remainingRef.current = null }, [opts.stopKey])

  useEffect(() => {
    if (!opts.playing || !opts.arrived || opts.hold) return
    const delay = remainingRef.current ?? opts.dwellMs
    const dueAt = Date.now() + delay
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const wait = dueWaitMs(dueAt, Date.now())
      if (wait > 0) { timer = setTimeout(tick, wait); return }
      remainingRef.current = null
      cb.current()
    }
    timer = setTimeout(tick, delay)
    return () => {
      clearTimeout(timer)
      remainingRef.current = Math.max(0, dueAt - Date.now())
    }
  }, [opts.playing, opts.arrived, opts.hold, opts.dwellMs, opts.stopKey])
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc -b`
Expected: clean.

```bash
git add src/views/Last48/photoreal/immersive/useAutoAdvance.ts
git commit -m "feat(immersive): useAutoAdvance — dwell from arrival, hold keeps the remainder"
```

---

### Task 8: The lower third — `ImmersiveCard`, `LowerThird`, `FrameTicks`

**Files:**
- Create: `src/views/Last48/photoreal/immersive/ImmersiveCard.tsx`
- Create: `src/views/Last48/photoreal/immersive/LowerThird.tsx`
- Create: `src/views/Last48/photoreal/immersive/FrameTicks.tsx`

**Interfaces:**
- Consumes: `DATASET_META`, `formatAge`, `formatApDate`, `populatedFields`, `resolveExplore`, `locationLine` (`../../detail/eventCardModel`); `formatApTime`, `formatHeadline` (`@/utils/format`); `classifyCaseMedia` (`@/utils/caseMedia`); `frame169` (`./frame`); `QUEUE_LEN` (`./carousel`).
- Produces:
  - `ImmersiveCard({ event, role: 'active' | 'peek', onClick?, onExplore? })`
  - `LowerThird({ active, prev, next, queue, playing, holdLeftMs, onStep, onJump, onPlayToggle, onHold, onOverlayToggle, onExit })` — the parent unmounts it while the overlay is hidden.
  - `FrameTicks({ hostRef })` — draws the 16:9 ticks over the map host.

- [ ] **Step 1: `ImmersiveCard.tsx`**

The same field model as `PhotorealBubble` (rows, media, explore), a different skin: sits in the band, follows the theme (Plan ruling 2).

```tsx
// src/views/Last48/photoreal/immersive/ImmersiveCard.tsx
//
// The card face in the immersive lower third — Spec A2 §2. Same FIELD LOGIC
// as PhotorealBubble and Last48EventCard (detail/eventCardModel.ts) so the
// three never drift; this skin sits in the band (no pin, no stem) and
// follows the theme. role='peek' renders the neighbours at 40% opacity,
// slightly smaller, as a click target that jumps the carousel.
import { Link } from 'react-router-dom'
import type { NormalizedEvent } from '@/types/last48'
import { formatApTime, formatHeadline } from '@/utils/format'
import { classifyCaseMedia } from '@/utils/caseMedia'
import { DATASET_META, formatAge, formatApDate, populatedFields, resolveExplore, locationLine } from '../../detail/eventCardModel'

interface Props {
  event: NormalizedEvent
  role: 'active' | 'peek'
  /** Peek cards: jump here. */
  onClick?: () => void
}

export default function ImmersiveCard({ event, role, onClick }: Props) {
  const meta = DATASET_META[event.datasetId]
  const { magnitude, unit } = formatAge(event.receivedAt)
  const loc = locationLine(event)
  const explore = role === 'active' ? resolveExplore(event) : null
  const media = event.datasetId === '311-cases'
    ? classifyCaseMedia((event.raw as { media_url?: { url?: string } | null }).media_url?.url) : null
  const rows: Array<[string, string]> = [
    ...(event.datasetId === '911-realtime' && event.priority ? [['Priority', event.priority === 'A' ? 'A — life-threatening' : event.priority] as [string, string]] : []),
    ...(loc ? [[loc.label, loc.place] as [string, string]] : []),
    ...populatedFields(event),
  ]
  const peek = role === 'peek'
  const face = `text-left w-[min(340px,100%)] rounded-2xl px-4 pt-3 pb-3 shadow-2xl shadow-black/30 ring-1
    bg-paper-50/90 ring-paper-300/40 text-ink dark:bg-espresso-950/85 dark:ring-paper-100/15 dark:text-paper-100
    transition-[opacity,transform] duration-500
    ${peek ? 'opacity-40 scale-90 hover:opacity-70 cursor-pointer' : 'opacity-100'}`

  const body = (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-display italic text-[40px] leading-none tabular-nums">{magnitude}</span>
        <span className="font-display italic text-[15px] text-paper-500 dark:text-paper-400">{unit}</span>
      </div>
      <p className="font-mono text-label text-paper-500 mt-1 tabular-nums">{formatApDate(event.receivedAt)} · {formatApTime(event.receivedAt)} PT</p>
      <div className="mt-2 flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: meta.color, boxShadow: `0 0 10px ${meta.color}` }} aria-hidden />
        <span className="font-mono text-nano tracking-[0.18em] uppercase" style={{ color: meta.color }}>{meta.label}</span>
        {event.state && <span className="font-mono text-nano tracking-wider uppercase text-paper-500 dark:text-paper-400">{event.state === 'open' ? 'open' : `closed · ${event.disposition ?? '—'}`}</span>}
      </div>
      <h3 className="font-display italic text-[22px] leading-tight mt-1 mb-2">{event.headline ? formatHeadline(event.headline) : 'Event'}</h3>
      {!peek && media?.kind === 'image' && (
        <img src={media.url} alt="311 case attachment" className="w-full max-h-32 object-cover rounded-md mb-2" onError={(e) => { e.currentTarget.style.display = 'none' }} />
      )}
      {!peek && (
        <ul className="flex flex-col gap-1">
          {rows.map(([label, value], i) => (
            <li key={label} className="bubble-row flex justify-between gap-4 text-[12px]" style={{ animationDelay: `${0.6 + i * 0.9}s` }}>
              <span className="font-mono text-nano uppercase tracking-[0.14em] text-paper-500 pt-0.5">{label}</span>
              <span className="text-right leading-tight">{value}</span>
            </li>
          ))}
        </ul>
      )}
      {explore && (
        <Link to={explore.to} className="bubble-row mt-3 block font-mono text-label tracking-wider text-ochre-600 hover:text-ochre-500 dark:text-ochre-400 dark:hover:text-ochre-300" style={{ animationDelay: `${0.6 + rows.length * 0.9}s` }}>
          {explore.label} →
        </Link>
      )}
    </>
  )

  // Two explicit elements, not a dynamic tag: `type` is not a <div> prop.
  return peek
    ? <button type="button" onClick={onClick} aria-label={`Go to: ${event.headline ?? 'event'}`} className={face}>{body}</button>
    : <div className={face}>{body}</div>
}
```

(`bubble-row` is the existing entrance animation in `src/index.css`; reduced motion already disables it there. The active card must be keyed by `event.id` by its parent so the stagger replays per stop.)

- [ ] **Step 2: `LowerThird.tsx`**

```tsx
// src/views/Last48/photoreal/immersive/LowerThird.tsx
//
// The fixed band under the map — Spec A2 §2: controls (~15%) · carousel
// (~60%) · queue (~25%). Height clamp(220px, 30vh, 340px); the band SHRINKS
// the map viewport above it (fewer pixels, cheaper). Follows the theme (Plan
// ruling 2); the tiles above it are always dusk. Mono for labels, serif for
// anything read as prose. The parent UNMOUNTS it for the `O` overlay
// toggle — this component never hides itself.
import type { NormalizedEvent } from '@/types/last48'
import { DATASET_META, formatAge, locationLine } from '../../detail/eventCardModel'
import { formatHeadline } from '@/utils/format'
import ImmersiveCard from './ImmersiveCard'

export const HOLD_MS = 10_000

interface Props {
  active: NormalizedEvent | null
  prev: NormalizedEvent | null
  next: NormalizedEvent | null
  queue: NormalizedEvent[]
  playing: boolean
  /** > 0 while a hold is running (drives the countdown ring). */
  holdLeftMs: number
  onStep: (delta: 1 | -1) => void
  onJump: (id: string) => void
  onPlayToggle: () => void
  onHold: () => void
  onOverlayToggle: () => void
  onExit: () => void
}

const BTN = 'flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-label uppercase tracking-wider transition-colors text-paper-600 hover:text-ink hover:bg-paper-200/60 dark:text-paper-400 dark:hover:text-paper-100 dark:hover:bg-espresso-800/60'
const BTN_ON = 'bg-ochre-500/15 text-ink dark:text-paper-100'

export default function LowerThird({ active, prev, next, queue, playing, holdLeftMs, onStep, onJump, onPlayToggle, onHold, onOverlayToggle, onExit }: Props) {
  const holding = holdLeftMs > 0
  // Countdown ring: r=9 → circumference ≈ 56.5.
  const ringLen = 2 * Math.PI * 9
  const ringOff = ringLen * (1 - holdLeftMs / HOLD_MS)
  return (
    <div
      id="immersive-lower-third"
      data-export-ignore
      className="relative z-20 flex-shrink-0 grid grid-cols-[minmax(9rem,15%)_1fr_minmax(14rem,25%)] gap-6 px-[clamp(16px,3vw,64px)] py-4 h-[clamp(220px,30vh,340px)]
        bg-paper-50/90 dark:bg-espresso-950/85 backdrop-blur-xl border-t border-paper-200/40 dark:border-espresso-800"
    >
      {/* Controls */}
      <div className="flex flex-col gap-1.5 justify-center">
        <div className="font-mono text-nano tracking-widest text-paper-500 dark:text-paper-600 mb-1">IMMERSIVE</div>
        <button type="button" onClick={onPlayToggle} aria-pressed={playing} className={`${BTN} ${playing ? BTN_ON : ''}`} title="Auto-advance (Space)">
          <span aria-hidden>{playing ? '❚❚' : '▶'}</span><span>{playing ? 'playing' : 'play'}</span>
        </button>
        <button type="button" onClick={onHold} aria-pressed={holding} className={`${BTN} ${holding ? BTN_ON : ''}`} title="Hold 10 s (H)">
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden className="-ml-0.5">
            <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
            {holding && <circle cx="11" cy="11" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={ringLen} strokeDashoffset={ringOff} transform="rotate(-90 11 11)" />}
          </svg>
          <span>{holding ? `hold · ${Math.ceil(holdLeftMs / 1000)}s` : 'hold'}</span>
        </button>
        <button type="button" onClick={onOverlayToggle} className={BTN} title="Hide the lower third (O)">
          <span aria-hidden>▭</span><span>overlay off</span>
        </button>
        <button type="button" onClick={onExit} className={BTN} title="Back to The Last 48 (Escape)">
          <span aria-hidden>✕</span><span>leave</span>
        </button>
      </div>

      {/* Carousel */}
      <div className="relative flex items-center justify-center gap-4 min-w-0 overflow-hidden">
        <button type="button" onClick={() => onStep(-1)} aria-label="Previous stop" className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-paper-100/70 dark:bg-espresso-900/70 text-paper-700 dark:text-paper-300 hover:text-ink dark:hover:text-paper-100 font-display text-xl">‹</button>
        <div className="hidden desk:block shrink-0">{prev && <ImmersiveCard key={prev.id} event={prev} role="peek" onClick={() => onJump(prev.id)} />}</div>
        <div className="shrink-0">
          {active
            ? <ImmersiveCard key={active.id} event={active} role="active" />
            : <p className="font-display italic text-paper-500">Waiting for the first events…</p>}
        </div>
        <div className="hidden desk:block shrink-0">{next && <ImmersiveCard key={next.id} event={next} role="peek" onClick={() => onJump(next.id)} />}</div>
        <button type="button" onClick={() => onStep(1)} aria-label="Next stop" className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-10 w-10 rounded-full bg-paper-100/70 dark:bg-espresso-900/70 text-paper-700 dark:text-paper-300 hover:text-ink dark:hover:text-paper-100 font-display text-xl">›</button>
      </div>

      {/* Queue */}
      <div className="flex flex-col min-w-0">
        <div className="font-mono text-nano tracking-widest text-paper-500 dark:text-paper-600 mb-1.5">NEXT</div>
        <ol className="flex flex-col gap-0.5 overflow-hidden">
          {queue.map((e, i) => {
            const meta = DATASET_META[e.datasetId]
            const age = formatAge(e.receivedAt)
            const loc = locationLine(e)
            return (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => onJump(e.id)}
                  className={`flex w-full items-baseline gap-2 rounded px-1.5 py-1 text-left hover:bg-paper-200/60 dark:hover:bg-espresso-800/60 ${i < 2 ? '' : 'opacity-70'}`}
                  title={i < 2 ? 'On the map now' : undefined}
                >
                  <span className="font-mono text-nano tabular-nums text-paper-500 w-9 shrink-0">{age.magnitude}{age.unit.slice(0, 1)}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 self-center" style={{ background: meta.color }} aria-hidden />
                  <span className="truncate text-[12px] text-ink dark:text-paper-200">{e.headline ? formatHeadline(e.headline) : 'Event'}</span>
                  {loc && <span className="ml-auto truncate font-mono text-nano text-paper-500 max-w-[40%]">{loc.place}</span>}
                </button>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `FrameTicks.tsx`**

```tsx
// src/views/Last48/photoreal/immersive/FrameTicks.tsx
//
// Faint 1 px corner ticks marking the largest centred 16:9 frame in the map
// host — the b-roll plate (Spec A2 §6). Rendered only while the overlay is
// hidden (the page decides); measures the host with a ResizeObserver.
import { useEffect, useState, type RefObject } from 'react'
import { frame169, type Frame } from './frame'

const TICK = 24

export default function FrameTicks({ hostRef }: { hostRef: RefObject<HTMLDivElement | null> }) {
  const [f, setF] = useState<Frame>({ x: 0, y: 0, w: 0, h: 0 })
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const measure = () => setF(frame169(el.clientWidth, el.clientHeight))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [hostRef])
  if (f.w === 0) return null
  const corners: Array<[number, number, 1 | -1, 1 | -1]> = [
    [f.x, f.y, 1, 1], [f.x + f.w, f.y, -1, 1], [f.x, f.y + f.h, 1, -1], [f.x + f.w, f.y + f.h, -1, -1],
  ]
  return (
    <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      {corners.map(([x, y, sx, sy], i) => (
        <path key={i} d={`M ${x + sx * TICK} ${y} H ${x} V ${y + sy * TICK}`} fill="none" stroke="#f5ecd9" strokeOpacity="0.55" strokeWidth="1" />
      ))}
    </svg>
  )
}
```

- [ ] **Step 4: Verify + commit**

Run: `npx tsc -b`
Expected: clean (these files are not yet mounted; the next task mounts them).

```bash
git add src/views/Last48/photoreal/immersive/ImmersiveCard.tsx src/views/Last48/photoreal/immersive/LowerThird.tsx src/views/Last48/photoreal/immersive/FrameTicks.tsx
git commit -m "feat(immersive): lower third — card face, controls, carousel, queue, 16:9 ticks"
```

---

### Task 9: `ImmersiveScene.tsx` — the Cesium host for immersive

**Files:**
- Create: `src/views/Last48/photoreal/immersive/ImmersiveScene.tsx`

**Interfaces:**
- Consumes: `createViewer`, `loadGoogleTileset`, `applyGrade`, `applyQuality` (`../viewerHost`, Task 4); `quality`, `resetQuality`, `QUALITY_IMMERSIVE` (`../quality`, Task 2); `PhotorealMarkers` + `setQueue` (Task 5); `useDreamDirector` (Task 6); `PhotorealTunePanel`; `PaceValues`.
- Produces: `ImmersiveScene({ active, next, queue, pace, hold, reducedMotion, todOverride, tuneOn, onArrived, onPick, onUserInput, onRest, hostRef })` — `hostRef` is the page's ref to the map host `<div>` (FrameTicks measures it).

- [ ] **Step 1: Write the scene**

```tsx
// src/views/Last48/photoreal/immersive/ImmersiveScene.tsx
//
// The Cesium side of /live/immersive (Spec A2 §3–§5). Owns the viewer, the
// Google tileset, the dusk grade, the hero + the two queue discs, the dream
// director, the render-on-demand "breath" and the tune panel. Draws NOTHING
// else: no marker field, no bubble, no stem — the card lives in the band.
// Same lifecycle rules as Last48Photoreal: viewer.destroy() deferred one
// microtask (children clean up parent-first), isDestroyed() on every touch.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import type * as Cesium from 'cesium'
import '../photoreal.css'
import type { NormalizedEvent } from '@/types/last48'
import type { PaceValues } from '../../ambient/pace'
import { createViewer, loadGoogleTileset, applyGrade, applyQuality } from '../viewerHost'
import { quality, resetQuality, QUALITY_IMMERSIVE } from '../quality'
import { PhotorealMarkers } from '../PhotorealMarkers'
import PhotorealTunePanel from '../PhotorealTunePanel'
import { useDreamDirector } from './useDreamDirector'
import type { PhotorealTarget } from '../useCesiumDirector'

/** Spec A2 §3: MSAA on. 4 is Cesium's default; stated, not assumed. */
export const IMMERSIVE_MSAA = 4
/** The hero breathes in colour only; in render-on-demand mode someone has to
 *  ask for the frames. 50 ms = the spec's "at most 20×/s". */
const BREATH_MS = 50

interface Props {
  active: NormalizedEvent | null
  next: NormalizedEvent | null
  queue: NormalizedEvent[]
  pace: PaceValues
  hold: boolean
  reducedMotion: boolean
  todOverride: string | null
  tuneOn: boolean
  onArrived: () => void
  onPick: (id: string) => void
  /** Pointer/wheel on the canvas: the page pauses play; the director yields. */
  onUserInput: () => void
  /** Google quota/auth refusal — the page leaves to /live (the resting note). */
  onRest: () => void
  hostRef: RefObject<HTMLDivElement | null>
}

const toTarget = (e: NormalizedEvent | null): PhotorealTarget =>
  e && e.longitude != null && e.latitude != null ? { lng: e.longitude, lat: e.latitude } : null

export default function ImmersiveScene(props: Props) {
  const [viewer, setViewer] = useState<Cesium.Viewer | null>(null)
  const [tileset, setTileset] = useState<Cesium.Cesium3DTileset | null>(null)
  const [markers, setMarkers] = useState<PhotorealMarkers | null>(null)
  const [tileLoads, setTileLoads] = useState(0)
  const cb = useRef(props)
  // eslint-disable-next-line react-hooks/refs
  cb.current = props

  // ── Viewer + tileset ──────────────────────────────────────────────────
  useEffect(() => {
    const host = props.hostRef.current
    if (!host) return
    const v = createViewer(host, { requestRenderMode: true, msaaSamples: IMMERSIVE_MSAA })
    // This renderer's defaults, every mount — the live object is module-level
    // and Spec A's scene loads ITS defaults into the same object.
    resetQuality(QUALITY_IMMERSIVE)
    applyQuality(v, null, quality)
    setViewer(v)
    const m = new PhotorealMarkers(v)
    setMarkers(m)
    let cancelled = false
    void loadGoogleTileset(v, () => cancelled, {
      onRest: () => { if (!cancelled) cb.current.onRest() },
      onTileLoad: () => setTileLoads((n) => n + 1),
    }).then((ts) => {
      if (!ts) return
      applyQuality(v, ts, quality)
      setTileset(ts)
    })
    return () => {
      // Same two-belt teardown as Last48Photoreal: flip `cancelled` now, defer
      // the destroy one microtask so the director's cleanup sees a live viewer.
      cancelled = true
      queueMicrotask(() => { m.destroy(); v.destroy() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Always dusk (Spec A2 §5); ?tod= still overrides ────────────────────
  useEffect(() => {
    if (viewer && tileset) applyGrade(viewer, tileset, true, props.todOverride)
  }, [viewer, tileset, props.todOverride])

  // ── Hero + queue discs; click = pick ──────────────────────────────────
  useEffect(() => { markers?.setHero(props.active) }, [markers, props.active])
  useEffect(() => { markers?.setQueue(props.queue) }, [markers, props.queue])
  useEffect(() => {
    if (!markers) return
    markers.onPick = (id) => cb.current.onPick(id)
    return () => { markers.onPick = undefined }
  }, [markers])

  // ── Breath: request frames for the colour animation, tab visible only ──
  useEffect(() => {
    if (!viewer || !props.active) return
    const id = setInterval(() => { if (!document.hidden && !viewer.isDestroyed()) viewer.scene.requestRender() }, BREATH_MS)
    return () => clearInterval(id)
  }, [viewer, props.active])

  // ── The band toggling changes the host size: ask for a frame ──────────
  useEffect(() => {
    const host = props.hostRef.current
    if (!viewer || !host) return
    const ro = new ResizeObserver(() => { if (!viewer.isDestroyed()) viewer.scene.requestRender() })
    ro.observe(host)
    return () => ro.disconnect()
  }, [viewer, props.hostRef])

  return (
    <>
      {viewer && tileset && (
        <Director
          viewer={viewer} tileset={tileset}
          active={props.active} next={props.next}
          pace={props.pace} hold={props.hold} reducedMotion={props.reducedMotion}
          onArrived={props.onArrived} onUserInput={props.onUserInput}
        />
      )}
      {props.tuneOn && viewer && (
        <PhotorealTunePanel viewer={viewer} tileset={tileset} tileLoads={tileLoads} onApply={applyQuality} />
      )}
    </>
  )
}

/** The director is a hook. This null-rendering MODULE-LEVEL child gives it a
 *  mount point that exists only once the tileset does (declaring it inside
 *  ImmersiveScene would make React remount it — and restart the flight — on
 *  every parent render). The canvas input handler lives here so it can reach
 *  the hook's cancel(). */
function Director(p: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  active: NormalizedEvent | null
  next: NormalizedEvent | null
  pace: PaceValues
  hold: boolean
  reducedMotion: boolean
  onArrived: () => void
  onUserInput: () => void
}) {
  const cb = useRef(p)
  // eslint-disable-next-line react-hooks/refs
  cb.current = p
  // The hook's leg effect depends on `target` by identity — memoise so a
  // parent render with the same event does not re-fly.
  const target = useMemo(() => toTarget(p.active), [p.active])
  const next = useMemo(() => toTarget(p.next), [p.next])
  const { cancel } = useDreamDirector({
    viewer: p.viewer, tileset: p.tileset,
    target, next,
    pace: p.pace, hold: p.hold, reducedMotion: p.reducedMotion,
    onArrived: () => cb.current.onArrived(),
  })
  const cancelRef = useRef(cancel)
  // eslint-disable-next-line react-hooks/refs
  cancelRef.current = cancel
  useEffect(() => {
    const { viewer } = p
    if (viewer.isDestroyed()) return
    const canvas = viewer.scene.canvas
    const onInput = () => { cancelRef.current(); cb.current.onUserInput() }
    canvas.addEventListener('pointerdown', onInput)
    canvas.addEventListener('wheel', onInput, { passive: true })
    return () => {
      canvas.removeEventListener('pointerdown', onInput)
      canvas.removeEventListener('wheel', onInput)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.viewer])
  return null
}
```

- [ ] **Step 2: Verify + commit**

Run: `npx tsc -b`
Expected: clean (the scene is mounted by Task 10).

```bash
git add src/views/Last48/photoreal/immersive/ImmersiveScene.tsx
git commit -m "feat(immersive): ImmersiveScene — render-on-demand viewer, dusk, hero + queue discs, dream director"
```

---

### Task 10: The route — `Last48Immersive` page, `ImmersiveGate`, App route, chrome-off shell

**Files:**
- Create: `src/views/Last48/photoreal/immersive/Last48Immersive.tsx`
- Create: `src/views/Last48/ImmersiveGate.tsx`
- Modify: `src/App.tsx` (import + one `<Route>` row beside the business detail routes)
- Modify: `src/components/layout/AppShell.tsx:33-75` (chrome-off branch)

**Interfaces:**
- Consumes: `useLast48Window` (`@/hooks/useLast48Window`), `LAST48_DATASETS`, `NormalizedEvent` (`@/types/last48`); `chainTour` (`../tourChain`); `carouselIndex`, `stepIndex`, `peekIds`, `queueIds`, `queueDiscIds` (`./carousel`, Task 3); `PACE_PRESETS` (`../../ambient/pace`, Task 2); `useAutoAdvance` (Task 7); `LowerThird`, `HOLD_MS`, `FrameTicks` (Task 8); `ImmersiveScene` (Task 9); `useRouteChrome` (`@/cities/useActiveCity`, Task 2); `IMMERSIVE_PATH` (`@/cities/routing`).
- Produces: the `/live/immersive` route; `ImmersiveGate` default export.

- [ ] **Step 1: The page**

```tsx
// src/views/Last48/photoreal/immersive/Last48Immersive.tsx
//
// /live/immersive — Spec A2. The slow documentary: one incident at a time,
// a lower-third band, a dream-paced camera. This file owns the DATA (the
// same 48h window hook as /live, same cite purposes — the route is a detail
// route of the `live` family, so the manifest's sources cover it), the URL
// contract (?event= is the active stop, ?play=1 auto-advance, ?tune=1 the
// dev panel, ?tod= the grade override), the carousel state, keys, hold and
// the overlay. Chrome is off (AppShell reads routeChrome); mobile / no key /
// resting never reach this file (ImmersiveGate).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { useLast48Window } from '@/hooks/useLast48Window'
import { LAST48_DATASETS, type NormalizedEvent } from '@/types/last48'
import { PACE_PRESETS } from '../../ambient/pace'
import { chainTour } from '../tourChain'
import { carouselIndex, stepIndex, peekIds, queueIds, queueDiscIds } from './carousel'
import { useAutoAdvance } from './useAutoAdvance'
import LowerThird, { HOLD_MS } from './LowerThird'
import FrameTicks from './FrameTicks'
import ImmersiveScene from './ImmersiveScene'

export default function Last48Immersive() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const hostRef = useRef<HTMLDivElement>(null)

  const window48 = useLast48Window({
    datasets: LAST48_DATASETS,
    cite: { viewId: 'live', sample: 'window-sample', count: 'window-count' },
  })
  const events = useMemo(
    () => window48.events.filter((e) => e.longitude != null && e.latitude != null),
    [window48.events],
  )
  // The pass: newest 24, nearest-neighbour chain. Recomputed when the window
  // polls; the id-based index below survives the reorder.
  const order = useMemo(() => chainTour(events), [events])
  const byId = useMemo(() => new Map(events.map((e) => [e.id, e])), [events])

  // ── URL contract ──────────────────────────────────────────────────────
  const activeId = searchParams.get('event')
  const playing = searchParams.get('play') === '1'
  const tuneOn = searchParams.get('tune') === '1'
  const todOverride = searchParams.get('tod')
  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      if ((prev.get(key) ?? null) === value) return prev
      const np = new URLSearchParams(prev)
      if (value) np.set(key, value); else np.delete(key)
      return np
    }, { replace: true })
  }, [setSearchParams])

  const index = carouselIndex(order, activeId)
  const active = index >= 0 ? byId.get(order[index]) ?? null : null
  // Keep ?event= truthful: an absent/stale id resolves to the newest stop and
  // the URL is written to say so (a copied link reopens the same stop).
  useEffect(() => {
    if (index >= 0 && order[index] !== activeId) setParam('event', order[index])
  }, [index, order, activeId, setParam])

  const peeks = peekIds(order, index)
  const prev = peeks.prev ? byId.get(peeks.prev) ?? null : null
  const next = peeks.next ? byId.get(peeks.next) ?? null : null
  const queue = useMemo(
    () => queueIds(order, index).map((id) => byId.get(id)).filter((e): e is NormalizedEvent => !!e),
    [order, index, byId],
  )
  const discs = useMemo(
    () => queueDiscIds(order, index).map((id) => byId.get(id)).filter((e): e is NormalizedEvent => !!e),
    [order, index, byId],
  )

  const jump = useCallback((id: string) => { setParam('event', id) }, [setParam])
  const step = useCallback((delta: 1 | -1) => {
    const i = stepIndex(order, index, delta)
    if (i >= 0) setParam('event', order[i])
  }, [order, index, setParam])

  // ── Arrival, play, hold, overlay ──────────────────────────────────────
  const [arrived, setArrived] = useState(false)
  useEffect(() => { setArrived(false) }, [activeId])
  const [holdLeftMs, setHoldLeftMs] = useState(0)
  const holdUntilRef = useRef(0)
  const startHold = useCallback(() => {
    holdUntilRef.current = Date.now() + HOLD_MS
    setHoldLeftMs(HOLD_MS)
  }, [])
  const hold = holdLeftMs > 0
  // One 100 ms ticker for the whole hold (deps on the BOOLEAN, so the ticker
  // is not torn down and rebuilt on every tick it causes).
  useEffect(() => {
    if (!hold) return
    const id = setInterval(() => setHoldLeftMs(Math.max(0, holdUntilRef.current - Date.now())), 100)
    return () => clearInterval(id)
  }, [hold])
  const [overlayOn, setOverlayOn] = useState(true)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const pace = PACE_PRESETS.dream

  useAutoAdvance({ playing, arrived, hold, dwellMs: pace.dwellMs, stopKey: activeId, onAdvance: () => step(1) })

  const leave = useCallback(() => {
    navigate(activeId ? `/live?event=${encodeURIComponent(activeId)}` : '/live')
  }, [navigate, activeId])
  // Google quota/auth refusal: the same session-only flag Spec A sets, so the
  // classic page shows its resting note and the gate blocks re-entry today.
  const rest = useCallback(() => {
    useAppStore.setState({ photorealResting: true })
    leave()
  }, [leave])

  // ── Keys (Spec A2 §2, §6; Plan ruling 3 adds Space) ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); step(-1); break
        case 'ArrowRight': e.preventDefault(); step(1); break
        case ' ': e.preventDefault(); setParam('play', playing ? null : '1'); break
        case 'o': case 'O': setOverlayOn((v) => !v); break
        case 'h': case 'H': startHold(); break
        case 'Escape': if (!overlayOn) setOverlayOn(true); else leave(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, playing, overlayOn, setParam, startHold, leave])

  return (
    <div className="flex h-full flex-col bg-espresso-950">
      <div ref={hostRef} className="relative flex-1 min-h-0" data-photoreal-host>
        <ImmersiveScene
          hostRef={hostRef}
          active={active}
          next={discs[0] ?? null}
          queue={discs}
          pace={pace}
          hold={hold}
          reducedMotion={reducedMotion}
          todOverride={todOverride}
          tuneOn={tuneOn}
          onArrived={() => setArrived(true)}
          onPick={jump}
          onUserInput={() => { if (playing) setParam('play', null) }}
          onRest={rest}
        />
        {!overlayOn && <FrameTicks hostRef={hostRef} />}
        {!overlayOn && (
          <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-espresso-900/70 px-3 py-1 font-mono text-nano uppercase tracking-widest text-paper-300/80">
            O · overlay
          </p>
        )}
      </div>
      {overlayOn && (
        <LowerThird
          active={active}
          prev={prev}
          next={next}
          queue={queue}
          playing={playing}
          holdLeftMs={holdLeftMs}
          onStep={step}
          onJump={jump}
          onPlayToggle={() => setParam('play', playing ? null : '1')}
          onHold={startHold}
          onOverlayToggle={() => setOverlayOn(false)}
          onExit={leave}
        />
      )}
    </div>
  )
}
```

Two notes for the implementer. (1) `ImmersiveScene` mounts its Cesium widget INTO `hostRef`'s div — the scene's own JSX renders only the director and the tune panel as siblings, and the Cesium canvas fills the host. `data-photoreal-host` on the host keeps the credit-bar CSS in `photoreal.css` applying. (2) The band is UNMOUNTED while the overlay is off (not `hidden`), so the flex column has one child and the map host grows; the scene's ResizeObserver requests the frame. Remounting replays the card's row stagger — intended.

- [ ] **Step 2: The gate**

```tsx
// src/views/Last48/ImmersiveGate.tsx
//
// Route element for /live/immersive (Spec A2 §2): desktop, key present and
// not resting → the lazy immersive page (the Cesium chunk); otherwise
// straight to /live with the same query. Imports NO Cesium — it rides the
// entry bundle beside the route table. useUrlSync stands down on this route
// (routeChrome === 'none') so its dateless write cannot clobber the redirect.
import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAppStore } from '@/stores/appStore'

const Page = lazy(() => import('./photoreal/immersive/Last48Immersive'))
const HAS_GOOGLE_KEY = !!import.meta.env.VITE_GOOGLE_TILES_KEY

export default function ImmersiveGate() {
  const isMobile = useIsMobile()
  const { search } = useLocation()
  const photorealResting = useAppStore((s) => s.photorealResting)
  if (isMobile || !HAS_GOOGLE_KEY || photorealResting) return <Navigate to={`/live${search}`} replace />
  return (
    <Suspense fallback={<div className="h-full w-full bg-espresso-950" />}>
      <Page />
    </Suspense>
  )
}
```

- [ ] **Step 3: The route row**

In `src/App.tsx` add beside the other view imports:

```ts
import ImmersiveGate from '@/views/Last48/ImmersiveGate'
import { IMMERSIVE_PATH } from '@/cities/routing'
```

and, directly above the `/business/chain/:ban` row:

```tsx
          {/* The immersive Last 48 — a detail route of the `live` family
              (Spec A2, plan ruling 1): parseRoute reports 'live', the shell
              reads routeChrome for its chrome-off, the gate coerces mobile /
              no key / resting back to /live. */}
          <Route path={IMMERSIVE_PATH} element={<ImmersiveGate />} />
```

- [ ] **Step 4: Chrome-off in `AppShell`**

In `src/components/layout/AppShell.tsx` change the `useActiveCity` import line to:

```ts
import { useActiveCity, useRouteView, useRouteChrome } from '@/cities/useActiveCity'
```

After `const { viewId } = useRouteView()` add `const chrome = useRouteChrome()`. Then, immediately BEFORE the `return (` that opens the shell's JSX (all hooks above it must stay above — the early return goes after the last hook, the keyboard `useEffect`):

```tsx
  // Spec A2 §2: chrome-less routes render only the page. useUrlSync and
  // useCitationScope have already run above, so hook order is stable across
  // the two branches.
  if (chrome === 'none') {
    return (
      <div className="h-screen overflow-hidden bg-espresso-950">
        <main className="h-full overflow-hidden relative">{children}</main>
      </div>
    )
  }
```

- [ ] **Step 5: Verify**

Run: `npx tsc -b && pnpm test && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: clean; `entry-bundle check ok`. Then confirm the gate is Cesium-free: `grep -n "cesium" src/views/Last48/ImmersiveGate.tsx` → no output.

- [ ] **Step 6: Commit**

```bash
git add src/views/Last48/photoreal/immersive/Last48Immersive.tsx src/views/Last48/ImmersiveGate.tsx src/App.tsx src/components/layout/AppShell.tsx
git commit -m "feat(immersive): /live/immersive — chrome-less page, carousel URL contract, keys, hold, overlay; gate + route + shell"
```

---

### Task 11: Ship it — flip `PHOTOREAL_OFFERED`, picker → immersive, About b-roll note, docs

**Files:**
- Modify: `src/stores/mapEngine.ts`, `src/stores/mapEngine.test.ts`
- Modify: `src/components/maps/MapPicker.tsx`
- Modify: `src/views/About/About.tsx` (after the "No SF dataset is real-time" Finding, ~line 440)
- Modify: `CLAUDE.md` (the Photoreal sentence), `docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md` (append §10)

- [ ] **Step 1: Flip the constant and its pin**

`src/stores/mapEngine.ts`: `export const PHOTOREAL_OFFERED = true` and reword its comment to `/** Spec A2 §7: the Photoreal row is offered (it opens /live/immersive). Was false during the dark launch of Spec A. */`. In `src/stores/mapEngine.test.ts` change the dark-launch test to:

```ts
describe('photoreal offered (Spec A2 §7)', () => {
  it('the picker offers Photoreal now that the immersive route ships', () => {
    expect(PHOTOREAL_OFFERED).toBe(true)
  })
})
```

- [ ] **Step 2: The picker row opens the immersive route**

In `src/components/maps/MapPicker.tsx`: change the photoreal row's hint to `'immersive · desktop'`; import `useLocation, useNavigate` from `react-router-dom` and `IMMERSIVE_PATH` from `@/cities/routing`; inside the component add `const navigate = useNavigate()` and `const { search } = useLocation()`; change the menu-item `onClick` to:

```ts
onClick={() => {
  setOpen(false)
  // Spec A2 §2: Photoreal IS the immersive route. The stored preference stays
  // what it was — the in-page Spec A renderer remains a ?engine=photoreal
  // dev/QA path, never something the picker sets.
  if (r.id === 'photoreal') { navigate(`${IMMERSIVE_PATH}${keepEvent(search)}`); return }
  setMapEngine(r.id)
}}
```

and add, at module level:

```ts
/** Carry only ?event= across — the immersive URL contract has no other /live params. */
function keepEvent(search: string): string {
  const ev = new URLSearchParams(search).get('event')
  return ev ? `?event=${encodeURIComponent(ev)}` : ''
}
```

- [ ] **Step 3: About — the b-roll paragraph (Spec A2 §6)**

In `src/views/About/About.tsx`, directly after the `<Finding title="No SF dataset is real-time — …">…</Finding>` block, add:

```tsx
            <Finding title="Recording the immersive Last 48 — b-roll, by design">
              <p>
                The immersive mode at <code>/live/immersive</code> is built as a plate for
                someone else&rsquo;s recorder: one incident at a time over Google&rsquo;s
                photorealistic 3D tiles, a slow camera, a lower third you can hide with
                the <kbd>O</kbd> key and hold in place for ten seconds with <kbd>H</kbd>. Any
                screen recorder will do; two to ten seconds per stop reads well. Google&rsquo;s
                terms allow this imagery to be shown in the app with its credits on screen
                and nowhere else, so the credit bar stays in frame and DataDiver provides
                no downloads, clips or exports of it &mdash; that absence is deliberate.
              </p>
            </Finding>
```

- [ ] **Step 4: CLAUDE.md**

Replace the sentence added in Task 1 (`**Dark-launched (Spec A2 §7):** …`) with:

```
**Immersive (Spec A2, Sept. 2026):** the picker's Photoreal row opens `/live/immersive` — a DETAIL route of `live` (hand-written in `App.tsx`; `parseRoute` still says 'live', so `useUrlSync`'s dateless rule and the manifest's sources carry over; NO manifest entry). Chrome-off comes from the pure `routeChrome()` in `src/cities/routing.ts` (AppShell early-returns; `useUrlSync` stands down there — the gate's `<Navigate>` would otherwise be clobbered). The page (`src/views/Last48/photoreal/immersive/`) shows ONE hero + 2 dim queue discs (`PhotorealMarkers.setQueue`), a lower-third carousel (`carousel.ts`, pure), `dream` pace (`hidden: true` — never `?ambient=`), render-on-demand (`requestRenderMode`, the hero's breath calls `requestRender` ≤20×/s), and the NEXT-STOP PRELOAD: the dwell is one slow LINEAR `flyTo` and `useDreamDirector` overwrites `scene.preloadFlightCamera` / `preloadFlightCullingVolume` (undocumented, cast) with the next stop's pose — Cesium's tileset preloads only while a flight is running. Quality per mode: `resetQuality(QUALITY_IMMERSIVE | QUALITY_DEFAULT)` at each scene mount (the live object is module-level). `ORBIT_RANGE_M` is `RANGE_M.orbit` (620); immersive uses `RANGE_M.immersive` (900). Spec A's in-page renderer stays reachable by `?engine=photoreal` on `/live` (session-only). DataDiver never serves clips (Google terms; About says so). Spec: `docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md`.
```

- [ ] **Step 5: Spec §10 "As built"**

Append to `docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md`:

```markdown
## 10. As built (plan `docs/superpowers/plans/2026-09-13-photoreal-immersive.md`)

- **Route identity (plan ruling 1).** `/live/immersive` is a hand-written
  detail route of the `live` family, not a manifest entry: `parseRoute`
  collapses deeper segments to their family, so `useUrlSync` keeps it
  dateless and the manifest's `sources`/`citable` cover it unchanged.
  Chrome-off is `routeChrome(pathname)` in `src/cities/routing.ts`
  (`useRouteChrome()` in the shell); `useUrlSync` stands down on it.
- **Band register (ruling 2).** The band follows the theme; only the tiles
  are always dusk.
- **Keys.** `Space` also toggles play (ruling 3). `H` hold = 10 s
  (`HOLD_MS`); release resumes the drift from the heading reached.
- **Pace.** `dream` carries `hidden: true` — never offered by the AUTO pill
  and `?ambient=dream` parses to null; the page reads `PACE_PRESETS.dream`
  directly.
- **Preload.** `useDreamDirector` overwrites `scene.preloadFlightCamera` and
  `scene.preloadFlightCullingVolume` (undocumented; one cast) right after the
  drift `flyTo` starts. If a Cesium upgrade drops the fields the cast reads
  `undefined` and the preload silently does nothing — check the tile gauge
  after any Cesium bump.
- **Quality.** `QUALITY_IMMERSIVE` is loaded into the live object at the
  immersive scene's mount and `QUALITY_DEFAULT` at Spec A's, via
  `resetQuality`; MSAA is set explicitly to 4 (`IMMERSIVE_MSAA`).
- **Ticks.** The 16:9 ticks render only while the overlay is hidden.
- **User input.** Pointer/wheel on the canvas cancels the running flight or
  drift and pauses play; the next `←`/`→` re-flies.
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm vitest run src/stores/mapEngine.test.ts && npx tsc -b && pnpm test && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: green; `entry-bundle check ok`.

```bash
git add src/stores/mapEngine.ts src/stores/mapEngine.test.ts src/components/maps/MapPicker.tsx src/views/About/About.tsx CLAUDE.md docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md
git commit -m "feat(immersive): offer Photoreal → /live/immersive; About b-roll note; docs as built"
```

---

## The walk (spec §8) — controller + Jesse, after the final review

Not a task; the acceptance gate before merge. Chrome, tab FOREGROUNDED (`document.hidden === false`), `?tune=1` for the fps/tiles readout, on the built app (Tarmac `datadiver-preview`, port 4173).

1. `/live` → picker → Photoreal → lands on `/live/immersive?event=…`: no rail, no header, no ticker, band present, ONE hero on the map, two dim discs.
2. `←` / `→` move the carousel; each moves the hero and starts an 18 s flight; the queue re-fills; the URL's `?event=` follows.
3. Play (`Space` or the button) → arrival → ~75 s drift → next stop. Read the tile gauge just before the auto-advance and just after the next arrival: the second flight should add markedly fewer tiles than a cold jump to the same stop (the preload). Record both numbers.
4. `O` hides the band; the map grows without a new flight; the credit bar stays; ticks appear. `O` again restores.
5. `H` holds: the drift stops, the ring counts down, the hero keeps breathing; release resumes.
6. Drag the map: the drift stops, play pauses (the button reads "play").
7. `Escape` → `/live?event=<same id>`, classic map, the event card open.
8. Idle fps readout in the band-visible, no-play state: ≈ 20 (the breath) not 30/60; during the drift ≤ 30 (the cap); no stall > 1 s on an arrival that was preloaded.
9. Light theme: band light, tiles still dusk. Mobile viewport (`?` resize to 700 px): `/live/immersive` → `/live`.
10. Production build on Jesse's M3 and one other desktop; Google Cloud quota unchanged (root requests still 125/day) — count root requests after one full pass.

## Self-review notes (run by the plan author, 2026-09-13)

- **Spec coverage.** §1 decisions → Tasks 2 (pace, quality, range), 5 (queue discs), 8 (band, carousel, controls), 9–10 (render-on-demand, chrome-off, keys, overlay/hold), 11 (picker, offered). §2 layout → Task 8 + 10. §3 camera/pace/preload → Tasks 2, 6, 9. §4 markers → Tasks 5, 9. §5 quality → Tasks 2, 9. §6 b-roll → Tasks 8 (ticks), 10 (`O`, `H`), 11 (About). §7 dark launch → Task 1 (+ flip in 11). §8 tests → Tasks 2, 3 (+ the walk above); `sources.test.ts` needs no change (ruling 1). §9 out of scope — nothing added.
- **Placeholders.** None: every step carries its code or its exact edit.
- **Type consistency.** `PhotorealTarget` is `{ lng, lat } | null` everywhere; `RANGE_M.immersive` in Task 6 matches Task 2; `resetQuality` / `QUALITY_IMMERSIVE` names match across Tasks 2, 4, 9; `setQueue(events: NormalizedEvent[])` (Task 5) is what Task 9 calls; `useAutoAdvance`'s `stopKey` is the page's `activeId`; `HOLD_MS` is exported from `LowerThird.tsx` and imported by the page; `IMMERSIVE_PATH` (Task 2) is used by Tasks 10 and 11; `applyQuality` lives in `viewerHost.ts` (Task 4), re-exported by `Last48Photoreal.tsx` for its tune panel and imported directly by Task 9.
