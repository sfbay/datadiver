# Photoreal Last 48 — Immersive mode (Spec A2)

**Status:** designed in chat 2026-09-13 (Jesse + Claude), written the same day.
**Builds on:** Spec A, `2026-09-09-photoreal-last48-design.md` (built on
`feat/photoreal-last48`, walked in Chrome 2026-09-10 to 13).
**Branch plan:** Spec A lands on `main` first as a DARK LAUNCH (§7); A2 is a
second, smaller plan on top.

## 0. Why

Spec A works and Jesse's verdict is "a keeper, period." Two things are not
right, and they pull in opposite directions:

1. **It is slow.** Measured on Jesse's M3 MacBook Pro, production build: the
   orbit holds the 30 fps cap while the camera is still, then stalls to 2–8 fps
   for seconds at each arrival while Google's tiles stream and decode. The
   orbit never lets the streaming stop: every frame the edge of the view asks
   for new tiles. With DOTS off it was 5–8 fps, so the marker field (~600
   clamped entities) costs too, but streaming is the bigger half.
2. **The picture is not sharp enough.** Google's photogrammetry is blobby up
   close; at the 620 m orbit range we are near its limit, and the orbit never
   gives tiles time to finish refining.

Both are fixed by the same move: **slow everything down and show one thing at
a time.** A still (or barely drifting) camera streams once and stops, so
Cesium can draw only when something changes. One incident on the map instead
of six hundred. A smaller map viewport at FULL resolution instead of a big one
at 55%. And the next stop's tiles fetched during this stop's dwell.

The character changes with it. The classic Last 48 is the wire. This is the
slow documentary: "a dreamstate, floaty" (Jesse) — meant to live on a screen
ad infinitum like the classic AUTO, but calmer, denser, and interactive.
Broadcast has the idiom: the **lower third**.

## 1. Decisions (confirmed in chat)

| Question | Decision |
|---|---|
| Chrome | Immersive: no nav rail, no page header, no ticker, no super-chips, no rail list. Pure map plus the lower third. |
| Layout | A fixed **lower-third** band (cards) under the map; the band SHRINKS the map viewport (fewer pixels, cheaper). Jesse first said top third; bottom won on cost (the bottom of a tilted view is the dense ground, the top is cheap sky and distant city) and on the newscast feel. One-line flip if it reads wrong. |
| What is on the map | ONE active incident with the full hero (disc, ring, tube). The next two queued stops as dim ground discs. No marker field. |
| Connection | No stem. The card sits in the band; the map shows one highlighted spot. The pair is obviously one thing. |
| Cards | A carousel in the band: active card centred, previous/next peeking, keyboard ← → and click to move, the queue visible beneath as compact rows. |
| Motion | "Dream" pace: 15–20 s flights, 60–90 s stops, a barely-there drift (a few degrees over the whole stop) instead of an orbit. |
| Auto-advance | Opt-in: a play button on the carousel. Default is explore (manual). |
| Rendering | Render-on-demand (`requestRenderMode`), full resolution in the smaller viewport, MSAA on, camera pulled back to ~900 m so tile detail matches pixels. |
| Preload | The next stop's tiles are fetched DURING the current dwell (§3). |
| B-roll | A recorder-friendly mode: overlay toggle, hold, clean 16:9 framing, credits kept on screen. DataDiver never renders or serves clips (Google's terms). |
| Shipping | Spec A merges to `main` dark-launched (§7). A2 is its own plan. |

## 2. Immersive layout

- **Route:** `/live/immersive` (SF only; `dateless`, era-free, same param
  contract as `/live` for `?event=` and `?tune=`; no `?ambient=` — play is a
  carousel state, `?play=1`). Entering Photoreal from the `/live` picker
  navigates here; the picker's Photoreal row hint becomes "immersive · desktop".
  `Escape` or the ✕ returns to `/live` (classic) with the same `?event=`.
- **Chrome off:** `AppShell` learns an `immersive` flag from the route manifest
  entry (`chrome: 'none'`) — no rail, no mobile top bar, no page header. The
  Last 48 header, ticker, super-chips, ScannerStrip, and the rail list are not
  rendered. Desktop only (mobile coerces to `/live`, as Spec A does).
- **Lower third:** a fixed band at the bottom, height `clamp(220px, 30vh,
  340px)`, espresso glass in both themes (this mode is always the dark grade:
  dusk; the light theme still renders the band in the light register but the
  tiles stay dusk — the "documentary" look is the point; `?tod=` override
  stays). The map fills the rest. The band is `#immersive-lower-third`,
  `data-export-ignore` (there is no PNG export here anyway).
- **Band contents, left to right:**
  1. **Carousel** (centre, ~60% width): the active card (same field logic as
     `eventCardModel.ts`: age headline, stream eyebrow + open/closed, headline,
     priority, `Nearest intersection · …` / `Address · …`, populated rows,
     Explore link), with the previous and next cards peeking at 40% opacity.
     Arrow buttons, ← → keys, click a peeking card to go there.
  2. **Queue** (right, ~25%): the next 6 stops as compact rows (age · stream
     dot · headline · place). Click jumps the carousel. The first two are the
     dim discs on the map.
  3. **Controls** (left, ~15%): play/pause (auto-advance), hold (§6), overlay
     on/off (§6), the ✕ to leave. Mono labels; prose stays serif.
- **Credits:** Cesium's credit container stays visible above the band's top
  edge (Google requires it on screen), restyled as in Spec A.

## 3. Camera, pace, preload

- **Pace preset `dream`** in `ambient/pace.ts` (`photorealOnly: true`,
  label "Dream", hint "immersive"): `tweenMs 18000`, `dwellMs 75000`,
  `breathMs 0` (no citywide breath — the queue never empties), `orbitDegPerS
  0.05` (≈4° across a 75 s stop), `pitchMin 30`. `cinema` stays for the
  non-immersive Spec A mode.
- **Stop order:** `chainTour` (nearest neighbour from the newest) — unchanged.
  The carousel IS the pass; the queue shows the chain ahead.
- **A stop is one slow flight.** On arrival the director does not orbit. It
  starts a second `camera.flyTo` from the arrival pose to the drift end-pose
  (`orbitPose(center, heading + driftDeg, pitch, range)`) with `duration =
  dwellMs`, `easingFunction: LINEAR_NONE`. Cesium treats it as a flight, which
  is what unlocks the preload below; to the eye it is a barely-moving camera.
  Both poses come from the pure `cameraPose.ts` — one authority, as before.
- **Next-stop preload (the point of the trick).** Cesium's tileset runs a
  PRELOAD_FLIGHT pass only while `camera._currentFlight` exists
  (`Camera.canPreloadFlight`, Cesium 1.145), using `scene.preloadFlightCamera`
  + `scene.preloadFlightCullingVolume`, which `flyTo` sets to ITS destination.
  Immediately after starting the drift flight, the director overwrites both
  with the NEXT stop's arrival pose (a cloned camera `setView` to
  `orbitPose(next, heading, pitch, range)` and its `computeCullingVolume`).
  Result: the next stop's tiles stream during this dwell, at the preload
  pass's coarser detail, and the 18 s flight refines the rest. Verified
  against the shipped source before build; if a Cesium upgrade closes the
  door, the fallback is a hidden second `Viewer` parked at the next stop with
  `resolutionScale 0.1` (costly; disclosed).
- **Range:** `ORBIT_RANGE_M` becomes a per-mode value: 620 (Spec A) / 900
  (immersive). Pitch −30° unchanged.
- **Render-on-demand:** `requestRenderMode: true`, `maximumRenderTimeChange
  = Infinity`. Cesium renders on camera change (the drift), tile arrival, and
  an explicit `scene.requestRender()` that the hero's breathing timer calls at
  most 20×/s. Idle cost ≈ 0.
- **Quality knobs** (`quality.ts`) gain a `mode` default: immersive uses
  `resolution 1.0`, `sseOrbit 12`, `fpsCap 30`, `msaa 4`, `foveation 4`.
  `?tune=1` keeps the sliders.

## 4. Markers

- **Hero:** the Spec A hero as tuned 2026-09-10 to 13: ground disc (RELATIVE
  to the tiles, 1 m lift), pulsing outer ring, flared 90 m tube (6 m → 10 m)
  that breathes at 1.8 s. No cone, no inner band, no stem. Colour-only
  animation; the breath drives `requestRender`.
- **Queue discs:** the next two stops get a plain disc (no tube, no ring) at
  0.35 alpha in their stream pigment, clamped like the hero. Click = jump.
- **Nothing else is drawn.** The `PhotorealMarkers` field (`setEvents`,
  `DRAW_RADIUS_KM`, the focus probe) is not used in immersive; the class gains
  `setQueue(events)` beside `setHero`. Precision-honesty holds: 911/Fire discs
  are the ~40 m "around this corner" disc; a 311 hero keeps its slim base.

## 5. Rendering quality

- Full resolution in the smaller viewport; MSAA 4; camera at 900 m so
  Google's mesh sits at the detail level where it looks right.
- Tiles get the whole dwell to refine because the camera barely moves.
- The lower third hides the dense near-ground; the sky and the distant city
  fill the top of the frame (cheap, and the "floaty" feel).
- Grade: dusk by default in this mode (`?tod=` overrides).

## 6. B-roll mode

The screen is a plate for someone ELSE's recorder; DataDiver never renders,
stores, or serves video of Google's imagery (Google Maps Platform terms:
display in-app with attribution only; no export or redistribution).

- **Overlay toggle** (`O`): hides the lower third; the map expands to the
  full window at the same camera (a `requestRender` and a tile refine, not a
  new flight). The credit bar stays. Show again with `O` or `Escape`.
- **Hold** (`H`, 10 s): freezes the drift and the auto-advance; the hero keeps
  breathing. A thin countdown ring on the hold button; nothing on the map.
- **Framing:** the map viewport keeps a 16:9 inner frame marked by a faint
  1-px corner tick set, toggled with the overlay (off by default). The card,
  when shown, sits inside that frame.
- **About:** one paragraph under the Last 48 notes — how to record (any screen
  recorder, 2–10 s per stop, credits must stay in frame per Google's terms),
  and that DataDiver provides no downloads by design.

## 7. Dark launch of Spec A

- Merge `feat/photoreal-last48` to `main` with the Photoreal row HIDDEN from
  `MapPicker` (a `PHOTOREAL_OFFERED = false` constant in `mapEngine.ts`,
  test-pinned) — reachable by `?engine=photoreal` on `/live` (parsed by
  `Last48.tsx`, session-only, never persisted) so Jesse can test on production
  hardware behind the real key and quota. `effectiveMapEngine` is unchanged;
  the picker filter reads the constant.
- The Vercel `VITE_GOOGLE_TILES_KEY` (Production + Preview) and the Google
  referrer list (`datadiver.jlabsf.org`, `*.vercel.app`, localhost 4173/5173/
  5174) are set as of 2026-09-13; the Map Tiles daily root-request quota is
  125.
- A2 flips `PHOTOREAL_OFFERED` when the immersive route ships.

## 8. Tests and the walk

- Node tests: `pace.test.ts` gains `dream`; `quality.test.ts` gains the
  immersive defaults; `mapEngine.test.ts` pins `PHOTOREAL_OFFERED`; a pure
  `carousel.ts` (active index, prev/next/peek, queue slice of the chain) with
  `carousel.test.ts`; `cameraPose.test.ts` gains the per-mode range;
  `sources.test.ts` learns the new manifest entry (same `sources` as `/live`).
- Chrome walk (tab FOREGROUNDED, `?tune=1` fps readout): enter from the
  picker → chrome gone, band present, one hero; ← → moves the carousel and
  flies; play → 18 s flight, 75 s drift, next stop's tiles already resident
  on arrival (count from the tile gauge before/after); `O` hides the band;
  `H` holds; Escape returns to `/live` with `?event=`; idle fps readout near
  0 (render-on-demand) and no stall > 1 s on arrival; production build on
  Jesse's M3 and one other desktop.

## 9. Out of scope

Mobile immersive; PNG/video export of any kind; Oakland; night in the
picker; a second Viewer preload unless the flight-preload trick fails; Spec B
(Mapbox Standard).

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
