# Photoreal Last 48 — design (Spec A)

**Status:** approved in chat 2026-09-09 (Jesse), spec written same day.
**Branch:** `feat/photoreal-last48`.
**Companion:** Spec B (Mapbox Standard site-wide) is a separate, later spec; this
spec only reserves its slot in the preference type and the picker.

## 0. Why

A throwaway spike on 2026-09-09 — CesiumJS + Google Photorealistic 3D Tiles,
the three Last 48 streams as marks, a slow orbit tour with a fill-in bubble —
answered "story or toy?" with a story. Jesse: "wow, just wow … definitely
something I want to tune and incorporate." It is the photoreal version of The
Last 48's AUTO mode and the banked kiosk/playback idea — a lean-back,
cinematic surface, NOT an analytic one (choropleths and rankings read worse in
3D and stay on the flat map).

Measured on a 2021 MacBook Pro during the spike: 25–57 fps once retina
resolution was scaled to 0.65 and per-frame geometry rebuilds were removed;
the dips are tile streaming, which is Google's and is the real ceiling. At 1°/s
orbit the dips do not read as stutter. Jesse picked 1°/s.

## 1. Decisions (confirmed)

| Question | Decision |
|---|---|
| Placement | A MODE of The Last 48 (`/live`), switched by a map picker. Not a new view. |
| Marker honesty | TWO marker languages keyed by precision (§4). |
| Exposure | Public at launch, behind a Google daily quota cap with a graceful fallback (§6). |
| Picker scope | Site-wide preference `classic \| standard \| photoreal`; `standard` is Spec B and hidden until it ships; `photoreal` offered only on `/live`, desktop, key present. |
| Interaction | Tour by default; any input hands the camera over (AUTO rules); click a marker opens its bubble; the AUTO pill restarts. |
| Time of day | Grade follows theme: light = day (no grade), dark = dusk. `?tod=night` is a hidden override for later. |
| Mobile | Desktop only. On mobile the picker hides Photoreal and says why. |
| Architecture | Approach 1: a sibling renderer (`Last48Photoreal`, its own lazy chunk) mounted by the same `Last48.tsx` page. Cesium never reaches the entry bundle. |
| Decomposition | Spec A (this) first; Spec B (Mapbox Standard everywhere) after. |

## 2. Precision facts (probed 2026-09-09, live API, newest 2,000 rows each)

| Stream | Socrata id · geo column | Address form | Distinct coordinates |
|---|---|---|---|
| 911 realtime | `gnap-fj3t` · `intersection_point` | intersection (`intersection_name`) | 1,200 / 2,000 = 60% |
| Fire/EMS dispatch | `nuek-vuh3` · `case_location` | intersection ("MISSION ST/PARK ST") | 697 / 2,000 = 35% |
| 311 cases | `vw6y-z8j6` · `point` | street address ("831 FULTON ST") | 1,802 / 2,000 = 90% |

So 911 and Fire/EMS are snapped to the nearest intersection — roughly a
half-block of true uncertainty — and 311 is address-level. A needle on a corner
is false precision for two of the three streams. This is the first place the
repo records these facts; the `dispatch911Realtime` registry entry still says
`hasGeo: false` with an About note reading "no coordinates", which the feed
contradicts (it carries `intersection_point`; the app already draws it). That
contradiction is fixed as a rider in this work (§9).

## 3. Switch and plumbing

- **Preference leaf** `src/stores/mapEngine.ts` — zero-DOM, mirrors
  `src/stores/typeScale.ts` for the same reason (appStore is unimportable under
  the node-only Vitest):
  - `export type MapEngine = 'classic' | 'standard' | 'photoreal'`
  - `parseMapEngine(raw: string | null): MapEngine` — allow-list, `'classic'` on
    anything unknown or stale.
  - `effectiveMapEngine(pref, ctx: { isMobile: boolean; viewId: ViewId | null; hasKey: boolean }): MapEngine`
    — `photoreal` coerces to `classic` unless `viewId === 'live' && !isMobile && hasKey`;
    `standard` coerces to `classic` until Spec B flips a `STANDARD_SHIPPED`
    constant in this leaf.
- **Store:** `appStore.mapEngine: MapEngine` hydrated from
  `localStorage['dd-map-engine']`; `setMapEngine(engine)` writes it inside the
  same try/catch shape as `setTypeScale` (private mode must not block the
  in-session switch).
- **Picker** `src/components/maps/MapPicker.tsx` — modelled on
  `src/views/Last48/chrome/LayerControls.tsx` (one question, one menu). Rows:
  `Classic` ("today's map"), `Photoreal` ("Google 3D photos · slow and
  cinematic · desktop"), and `Standard` hidden until Spec B. Mounted in `/live`'s
  control row (underlay · DOTS · AUTO · **MAP**) and in the AppShell rail beside
  the dark-mode toggle for the site-wide options. When a row is unavailable on
  this route/device/key it is not rendered — never disabled-but-present (the
  UnderlayPicker rule: an empty affordance reads as broken).
- **Mount:** `src/views/Last48/Last48.tsx` gains one branch. It already owns the
  48h window hook, `?ambient=`/`?tune=`/`?event=` params, and the header.
  `effectiveMapEngine(...) === 'photoreal'` mounts
  `lazy(() => import('./photoreal/Last48Photoreal'))` in place of
  `Last48UnifiedView`, with the same props: `events`, `freshness`, enabled
  `datasets`, `ambientOn`/`ambientReady`/`ambientPace`, `selectedEvent` +
  setter, `onAmbientExit`, `pointsOn`.
- **Bundle:** `vite.config.ts` `manualChunks` adds `id.includes('cesium') → 'cesium'`
  beside the mapbox rule. Cesium's static assets (`Workers/`, `Assets/`,
  `ThirdParty/`) are copied to `public/cesium/` by a `prebuild` step and
  `window.CESIUM_BASE_URL = '/cesium/'` is set inside the lazy module only.
  A test asserts the built entry chunk does not reference `cesium`.
- **Key:** `VITE_GOOGLE_TILES_KEY`, set in the Vercel dashboard only (never
  `vercel env add`, per the standing rule), restricted to referrer
  `https://datadiver.jlabsf.org/*` + Map Tiles API. Absent → `hasKey=false` →
  Photoreal never offered. Local dev adds `http://localhost:5174/*` to the key's
  referrers; the value lives in `.env.local` (gitignored).

## 4. Markers — two languages

- **Precision table** `src/views/Last48/photoreal/markerPrecision.ts`
  (zero-import leaf): `PRECISION: Record<DatasetId, 'intersection' | 'address'>`
  = `'911-realtime': 'intersection'`, `'fire-ems-dispatch': 'intersection'`,
  `'311-cases': 'address'`. `markerPrecision.test.ts` pins every `DatasetId` in
  `LAST48_DATASETS` to a row, so a new stream must declare its class.
- **Intersection marker (911, Fire/EMS):** a soft ground disc ~40 m in
  diameter (stream pigment at ~0.18 alpha, 0.8-alpha rim, `height` 1 m), plus a
  short, wide, faded beam (`cylinder` length ~30 m, bottom radius ~5 m, top
  ~0.6 m, alpha ~0.25). It reads "around this corner."
- **Address marker (311):** a slim column (`cylinder` length 40 m, radius 2.2 m,
  alpha ~0.55) at the address. It reads "here."
- **Current stop:** the same shape, ~1.6× larger. The disc rim and the beam
  breathe in COLOUR only — a `CallbackProperty` on the material, NEVER on any
  geometry dimension (a per-frame size change rebuilds the geometry and halved
  the spike's frame rate).
- **Age:** `ageColor(datasetId, ageMs)` / `ageBucket` / `COLORS` /
  `LATENCY_BASELINE_MS` / `PAPER_ANCHOR` are EXTRACTED from
  `src/views/Last48/modes/FlowMapLayer.tsx` (module-private today) into a pure
  `src/views/Last48/ageRamp.ts`; the Flow layer imports them back
  (behaviour-neutral, byte-pinned by a test on the three COLORS and the four
  bucket stops). Priority-A 911 keeps full pigment regardless of age, as today.
- **Draw budget:** only events within 1.5 km of the current stop are
  instantiated (`drawNear`); markers outside are removed. In free look, the
  radius is measured from the camera's ground target instead.
- **Card discloses the same fact:** the location row reads
  `Nearest intersection · 19th St & Dolores St` or `Address · 831 Fulton St`.

## 5. Camera and tour

Files under `src/views/Last48/photoreal/`.

- **Reused verbatim:** `ambient/tour.ts` (`buildPass`, `nextTourId`,
  `dueWaitMs`, `PASS_SIZE = 24`), `ambient/useAmbientTour.ts` (single-flight
  generation guard, wall-clock gate, hidden-tab pause), `ambient/pace.ts`.
- **New pace preset `cinema`** in `pace.ts`: `orbitDegPerS 1`, `tweenMs 9000`,
  `dwellMs 30000`, `breathMs 14000`, `pitchMin 30`, label "Cinema", hint
  "photoreal". `PaceId` gains `'cinema'`; `parsePaceId` accepts it; the Mapbox
  director treats `cinema` like `stroll` if ever armed on the flat map (it is
  only offered in photoreal mode). The three existing presets are untouched.
- **Stop order** `tourChain.ts` (pure): take `buildPass`'s newest-24 ids, then
  greedy nearest-neighbour from the newest. Short hops reuse resident tiles.
  Test: same ids in and out, no repeats, first element is the newest.
- **Director** `useCesiumDirector.ts` — the Cesium twin of
  `ambient/useAmbientDirector.ts`. Same `AmbientPhase` machine
  (`off → ramp-in → on → ramp-out`), same exit on capture-phase
  `pointerdown`/`wheel`/`keydown`/`touchstart` outside `[data-ambient-toggle]`,
  same reduced-motion gate, same "do not fight the boot curtain" gate
  (`ambientReady`).
  - **Leg:** ONE native `camera.flyTo` to the WORLD pose the orbit will start
    from. The pose is computed by a pure helper `orbitPose(center, heading,
    pitch, range)` that calls `lookAt` on a scratch camera and reads
    `positionWC` / `directionWC` / `upWC` before `lookAtTransform(IDENTITY)`.
    Reading the local `position` instead sent the spike's first flight to the
    centre of the Earth; `cesiumPose.test.ts` pins that the flight target equals
    the orbit's frame-0 pose.
  - **Hold:** per-frame `camera.lookAt(center, HeadingPitchRange(h, PITCH, RANGE))`
    on `scene.preRender`, `h` advancing at `orbitDegPerS` (a continuous turn, not
    the flat map's pendulum — the photo scene has no "south is up" problem at
    this pitch). `RANGE` 620 m, `PITCH` −30° (spike values; tunable via `?tune=1`).
  - **Tiles by phase:** `tileset.maximumScreenSpaceError` 40 during the leg, 10
    during the hold. `preloadFlightDestinations` stays on.
  - **Settle gate:** the bubble waits for `tileset.tilesLoaded`, capped at 12 s
    so a slow tile never stalls the beat.
- **Free look:** the director's exit hands over Cesium's default controller;
  the AUTO pill re-arms. `?event=<id>` deep links fly to that event and orbit
  it (a one-stop pass) — `DeepLinkLander`'s "bail while ambientOn" rule carries
  over.
- **Performance defaults:** `viewer.resolutionScale = 0.65`; FXAA on; fog on;
  globe hidden under the tileset; `requestRenderMode` OFF (the orbit is
  continuous).

## 6. Grade, cost, fallback, credit

- **Grade** `grade.ts`: a table `{ day, dusk, night }` of `{ tint: [r,g,b],
  mul, win }` and a `CustomShader` factory. Spike values: day `[1,1,1] · 1.0 ·
  0`; dusk `[1,.80,.62] · .82 · .35`; night `[.42,.50,.78] · .30 · 1.6`. The
  fragment stage multiplies diffuse by tint·mul and adds back a warm boost for
  pixels whose luma passes `smoothstep(.62,.9)` scaled by `win` (lit windows).
  Theme → `day` in light mode, `dusk` in dark mode; `?tod=night` overrides.
  `viewer.clock.currentTime` is set to the matching SF instant (13:00 / 19:20 /
  22:30 PDT) so the real sun and sky agree with the grade.
- **Cost cap:** Jesse sets a daily quota on the Map Tiles API in Google Cloud.
  When Google refuses (403/429 on the root or a tile), the tileset's error path
  calls `setMapEngine('classic')` for the SESSION (not persisted) and the page
  shows one line: "Photoreal is resting for today." A black or half-loaded map
  is never shown.
- **Cost gauge:** under `?tune=1` the tune panel shows tiles loaded per stop
  and per minute (from `tileset.tileLoad` events) so a kiosk hour can be priced
  from measured numbers before any kiosk is proposed.
- **Credit:** Google requires its logo and per-tile data credits on screen.
  Cesium's credit container stays visible, restyled to the same register as
  the Mapbox attribution (`.mapboxgl-ctrl-attrib` rules in `index.css`). A new
  `NON_SOCRATA` row `google-3d-tiles` (`kind: 'basemap'`, cities `['sf']`,
  publisher "Google · Photorealistic 3D Tiles") in
  `src/lib/provenance/nonSocrata.ts`; `/live`'s manifest `staticSources` gains
  it; About's generated table and the source pill are therefore honest.
- **Withheld in photoreal mode**, each with a one-line reason where the control
  used to be: PNG export (Cesium canvas + html2canvas is a separate project),
  the Pulse choropleth, the demographic underlay, the hotspots legend. The DOTS
  toggle stays and hides/shows the markers.

## 7. Bubble card

- **Shared model** `src/views/Last48/detail/eventCardModel.ts` — the field logic
  extracted from `Last48EventCard.tsx`: `formatAge`, `DATASET_META`,
  `compactFields`, `resolveExplore`, `extractId`, the 311 media classification
  hand-off. Pure; `eventCardModel.test.ts` runs one fixture per stream. Both
  cards consume it so they cannot drift.
- **`PhotorealBubble.tsx`** — an HTML card pinned above the marker via
  `scene.cartesianToCanvasCoordinates` on `postRender`, with a 1-px stem down
  to the mark. Content order mirrors the flat card: age headline (Fraunces
  italic), stream eyebrow + open/closed pill, headline, priority (911),
  location row (precision word first, §4), compact rows, 311 photo, Explore
  link. Body copy is serif; eyebrow and values are mono.
- **Reveal:** fades in on the settle gate; rows stagger ~1.1 s apart via CSS
  `animation-delay`; under `prefers-reduced-motion` everything appears at once.
- **Free look:** click a marker → its bubble; Escape or the next click closes.

## 8. Testing and the walk

- **Node tests (Vitest, `src/**/*.test.ts`):** `mapEngine.test.ts` (parse
  allow-list, every coercion case), `markerPrecision.test.ts`,
  `tourChain.test.ts`, `cesiumPose.test.ts`, `eventCardModel.test.ts`,
  `ageRamp.test.ts` (COLORS + bucket stops byte-pinned), `pace.test.ts` gains
  `cinema`, `sources.test.ts` unchanged except the new `staticSources` id, and a
  bundle guard that the entry chunk never references `cesium` (extending the
  existing Mapbox entry-bundle rule).
- **Build:** `~/dev/devman/tools/devman-build.mjs pnpm build` and `pnpm test`.
- **Chrome walk before merge** (tab FOREGROUNDED, `document.hidden === false`,
  fps readout visible): dark mode → dusk tour, bubble fills, 1°/s orbit; light
  mode → day; drag stops the tour; click a marker; `?event=` deep link; a bad
  key → the fallback note and the classic map; mobile viewport → Photoreal
  absent from the picker; DevTools Network shows the `cesium` chunk only after
  switching. This repo has no component tests; the walk is the gate.
- **Cost:** after one full tour on production, Jesse reads Billing → Reports
  and records the Map Tiles figure in `docs/data-insights.md`.

## 9. Riders (small, same branch)

- Fix the `dispatch911Realtime` registry contradiction: `hasGeo: true`,
  `geoField: 'intersection_point'`, and the About note "no coordinates" →
  "coordinates are the nearest intersection (~half-block precision)". Fire/EMS
  and 311 notes gain their precision class too (§2).
- `docs/data-insights.md` gains a "Location precision on the three Last 48
  streams" section with the §2 table and probe method.

## 10. Out of scope

Spec B (Mapbox Standard on every map view); PNG export of the Cesium canvas;
`night` in the picker; mobile photoreal; kiosk wiring beyond `?ambient=cinema`;
Oakland (no Google 3D Tiles decision yet, and the Last 48 is SF-only).

## 11. As built (2026-09-10)

- §6 deviation: `google-3d-tiles` is a `NON_SOCRATA` row only; NOT added to the manifest's `staticSources` — the pill filters `basemap` rows by design and no manifest lists `mapbox-basemap` either. About shows it via `nonSocrataFor('sf')`.
- §5: the orbit is driven by `camera.setView` along the pure `orbitPose()` every frame (not `lookAt`), so the flight target and frame 0 are literally the same function output.
- §5: `useAmbientTour` gained an optional `order` strategy (default `buildPass`); the photoreal conductor passes `chainTour`.
- `cinema` carries `photorealOnly: true`; the AUTO pill hides it on the flat map.
- The rail `MapPicker` renders null until Spec B (fewer than two offerable rows).
- The `preload-helper` Vite chunk rule: Vite's preload helper co-located with the cesium chunk and index.html eagerly modulepreloaded it; `vite.config.ts` pins the helper to its own micro-chunk; the guard is unchanged.
- The conductor feeds the director `phase` whenever the machine is not at rest (so `ramp-out` completes), lands a free-look target only when the selected event ID changes (`landedRef`), and clears a stale free target when the tour arms; the director's settle gate was removed (the bubble polls `tilesLoaded` itself).
- On the engine flip to photoreal a non-`cinema` URL pace is rewritten to `cinema` (and `cinema` back to the default on the flip to classic); a later explicit pick in photoreal is honoured.
- The "Photoreal is resting" note is body serif (house mono-prose rule), not the mono label the plan drafted.
- Cesium 1.145 typings: two-arg `createGooglePhotorealistic3DTileset(apiOptions, tilesetOptions)`; `skyAtmosphere` is optional; `Scene.pick()` is `any`.
