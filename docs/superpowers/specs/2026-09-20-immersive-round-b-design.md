# The Last 48 Immersive — Round B (presets, the "here" card, time to next stop)

**Status:** designed in chat 2026-09-20 (Jesse + Claude) during the walks of PR #175;
written the same day. **Builds on:** Spec A2 (`2026-09-13-photoreal-immersive-design.md`,
merged #175). **Branch:** `feat/immersive-round-b`.

## 0. Why

The immersive route ships (PR #175) and Jesse's verdict on the walk was "looking great".
Three things it still lacks, each raised on the walk:

1. **Nowhere to go but the chain.** The 24-stop nearest-neighbour pass is the only way
   around the city. The rail's empty middle was reserved for *presets*: places people
   want to see, and places the data says are worth seeing.
2. **A click on the map does nothing useful.** Round A made it jump to the nearest
   stop within 150 m; beyond that, silence. Cheap metadata exists for any point.
3. **Nobody can tell how long a stop lasts.** The dwell is 75 s; the rail's 4 px
   progress rule is too quiet. Jesse: "some indicator of timing… maybe a subtle stripe".

## 1. Decisions (confirmed in chat)

| Question | Decision |
|---|---|
| Where presets live | The rail's empty middle (`flex-1` spacer, reserved in Round A). |
| Preset headings | The serif italic display face — Jesse reserved it for "special clickable items like the buttons and the *Name of Location* preset headings". Labels/captions stay plain. |
| Two categories | **Places** (authored, tourist/landmark) and **Hotspots** (computed from the 48 h anomaly engine — "doing some journalistic work"). |
| "Here" card | Lives in the telemetry strip's left cell (the strip "houses onclick metadata too"). Cheap sources only, no new keys. |
| Time to next stop | A visible countdown, a stripe, plus the rail's rule kept. Only while playing. |
| No clock, no "live" | Still binding: nothing on screen may read as a claim that the imagery is live. |

## 2. Presets (rail)

- **Component** `immersive/Presets.tsx`, mounted in the rail between the View group and
  the stop ledger. Two stacked groups, each a heading in plain text (`Places`, `Hotspots`)
  and up to 4 tiles. A tile = a 56 px-tall row: a small pigment/thumbnail block on the
  left (no imagery: a 40×40 rounded square in the tile's colour, later a real thumbnail),
  the **name in `font-display italic` at 1.2vw**, a one-line caption in plain text
  (`text-label`). Click flies there.
- **Places** = an authored leaf `immersive/places.ts` (zero-import, tested): id, name,
  caption, lng, lat, heading, pitch, range. Seed list (8): Golden Gate Bridge (south
  anchorage), Coit Tower, Ferry Building, Painted Ladies (Alamo Square), Twin Peaks,
  Palace of Fine Arts, Oracle Park, Lombard Street. A test pins every preset inside the
  SF bbox and range 150–1500 m. The rail shows 4 and a `More places` turn-down.
- **Hotspots** = the 48 h anomaly engine (`useAnomalyBaseline` per neighborhood, the
  Stouffer combine the Last 48 choropleth uses) — the top 4 neighborhoods by combined z
  ≥ 1.5, freshness-gated exactly as the Pulse is (a quiet reading never surfaces; a stale
  stream never surfaces). Tile name = the neighborhood, caption = the dejargoned tier
  word from `pulsePhrase.combinedDeviation` ("busier than usual"). Fly-to target = the
  centroid of that neighborhood's events in the current window (not the polygon
  centroid — the events are the story), range 700 m. Empty → the group shows one plain
  line "Nothing unusual right now" (absence stated, never a blank).
- **Flying to a preset** is a *detour*, not a stop: the director flies (18 s) and drifts
  as usual; the carousel keeps its active card; `?event=` is untouched; `?place=<id>`
  or `?hot=<nhood>` records it. Play pauses on a detour (a preset is user input). `←`/`→`
  resume the chain from the active card.
- Preset tiles are the third class of serif-italic clickable (after the rail buttons
  and the DataDiver return).

## 3. The "here" card (telemetry strip)

- A **click on the map that hits no stop** (beyond 150 m) opens the here card in the
  strip's left cell, replacing `San Francisco · Latitude · Longitude` for as long as it is
  open (✕ or a second click elsewhere closes it; `Escape` closes it before it leaves).
- Contents, all cheap and already on hand:
  1. **Neighborhood** — point-in-polygon against
     `/data/geo/sf-analysis-neighborhoods.geojson` (local; a pure helper
     `immersive/pointInNeighborhood.ts` with a test).
  2. **Nearest corner** — Mapbox reverse geocoding (`VITE_MAPBOX_TOKEN` is already
     client-side); one request per click, `types=address,poi`, rendered as
     "near Broadway & Sansome St" / "near Ferry Building". Failure → the row is omitted.
  3. **Last 48 hours within 300 m** — counts by stream from the events already loaded
     (`911 dispatch 4 · Fire/EMS 1 · 311 case 2`); zero → "quiet here".
  4. **One neighborhood line** from the committed ACS JSON: median rent and share over 65
     ("Median rent $2,340 · 18% over 65"), via the existing census neighborhoods payload.
- Register: the strip's mono, values in latte pills (as latitude/longitude are). It is a
  *reading*, not a card: one line, wraps to two on narrow windows.
- Also drops the beacon? No — the hero beacon stays on the active stop; the clicked point
  gets a small paper ring (a second, dimmer `Beacon` instance, `variant="probe"`) so the
  reader sees what the card is about.

## 4. Time to next stop

- **The stripe.** A 3 px band along the TOP EDGE of the active card that fills
  left→right across the dwell in the stream pigment (the card already carries the
  pigment tab on its left edge; the stripe reads as the same colour running out). Only
  while `playing`; hold freezes it; explore mode shows no stripe.
- **The figure.** In the band's status line, after `Stop 7 of 24`: `· next in 48 s`
  (mono, tabular, updates once a second). Reads "next in —" during the flight and the
  settle gate. Nothing during explore.
- The rail's progress rule stays (it is the same number, drawn twice — that is fine; the
  rule is the rail's own summary).
- `useAutoAdvance` already knows `dueAt`; expose `remainingMs` from the page's ticker
  (the same 250 ms interval that drives `dwellProgress`) — no second clock.

## 5. Copy rules (binding)

No jargon (spell it out), no clock, no "live". Neighborhood and tier words come from the
Pulse phrase layer, never raw z-scores. Preset captions are ≤ 40 characters.

## 6. Tests and the walk

- Node: `places.test.ts` (bbox, ranges, unique ids), `pointInNeighborhood.test.ts`
  (a known Mission point → "Mission"; ocean → null), a pure `hotspots.ts` selector test
  (top-4 by combined z, threshold, freshness gate) and `nextIn.ts` (remaining-ms →
  "next in 48 s" / "next in —").
- Walk: click a Place → 18 s flight, card unchanged, `?place=` set, play paused; a Hotspot
  tile appears only when the Pulse would say something; click open ground → the here
  card with all four rows (and the row omitted when the geocoder fails — pull the
  network to check); play → stripe fills and "next in" counts down in step with the
  rail's rule.

## 7. Out of scope

Thumbnail imagery for presets (needs a licensing decision), Oakland, a preset editor,
saving presets per user, any Google Places call.

## 8. As built (2026-09-20)

Plan: `docs/superpowers/plans/2026-09-20-immersive-round-b.md`. Rulings made while
planning, all recorded there: (1) a second open-ground click MOVES the here card rather
than closing it; (2) Mapbox Geocoding v6 reverse has no `poi` type, so the corner row is
`types=address,street` rendered as "near 445 Minna Street"; (3) hotspot camera heading
20 (superseded by §8.2: no heading, arrive facing travel) / pitch −35 / range 700, and a hotspot with no located events is skipped; (4) the
rail's dwell rule now reads the same `remainingMs()` as the stripe and the figure, which
also fixes the rule jumping after a hold; (5) a stale `?place=` clears at once, a stale
`?hot=` clears only once the anomaly engine has loaded with no error and no stream
missing its current counts — a failed engine or a missing stream renders a named
`hotspotsNote` reason instead, never a false "Nothing unusual"; an ENGAGED `?hot=` is never evicted — the final review froze a detour per key (the page's memo returns the cached object while the key is unchanged) and keyed the director's leg on `dest = detour ?? target`, so a centroid shift, a rank swap or an aged-out active stop cannot re-fly or evict the camera under a parked reader. Drift from the plan
during implementation, corrected here rather than in the plan doc: caption length is
`PLACE_CAPTION_MAX = 26` (not the drafted 40), cut to fit the 13.5rem rail, with the
preset name at `text-[min(1.2vw,1.05rem)]`; a second click on the pressed preset tile
calls `onClear` directly, and `useAutoAdvance`'s `stopKey`
(`${activeId}|${detour?.key ?? ''}`) gives a full dwell on entering OR leaving a detour;
`sameDetour` compares a raw coordinate difference (< 1e-4°), not a rounded bucket; the
neighborhood boundary GeoJSON now loads lazily on the first ground click
(`useBoundariesAsset` accepts `null` and stays idle until then), and the ground click
resolves against Cesium's depth buffer (`scene.pickPosition`) first, the ellipsoid as
fallback; the Escape ladder is restore hidden panels → close the here card → leave, and
the probe beacon ignores the rail's Beacon toggle on purpose. Files: `nextIn.ts`,
`streamWords.ts`, `places.ts`, `hotspots.ts`, `detour.ts`, `Presets.tsx`,
`pointInNeighborhood.ts`, `here.ts`, `useHereCard.ts`, plus `useAutoAdvance`,
`useDreamDirector`, `ImmersiveScene`, `Beacon`, `TelemetryStrip`, `LowerThird`,
`ImmersiveCard`, `RightRail`, `Last48Immersive`.

### 8.1 Post-merge camera rulings (2026-09-21, hotfixes on main)

Jesse's prod walk after #176: (1) the hero aims 30 m above the TILE SURFACE (`tileset.getHeight`), never the ellipsoid — a hill stop rode high in the frame; the settle gate fires as soon as a height is readable and glides any > 10 m miss into the true frame. (2) The FIRST leg of a session keeps the house heading, arrives 3× the range out at −45° and descends 4 s once the ground is known — the default camera sits far over the Bay with no tiles under the stop, and aiming it at an unknown surface crashed it under a hill. (3) A leg is TURN-THEN-FLY: a 3 s pivot on the spot toward the destination's bearing, then the flight with heading held, arc capped at 700 m ("look where you're flying"); Cesium's `pitchAdjustHeight` was tried and removed — it dived on the climb and swivelled back on arrival, "flight-sim crash vibes". (4) Hero drift 0.63°/s (≈47° per dwell). (5) Card date line carries no year. Hotspot detours still arrived with the fixed heading 20 after this walk — fixed in §8.2.

### 8.2 Hotspots arrive facing travel (2026-09-21)

A Hotspot is a neighborhood the data picked, so it has no composed view to arrive at. Its fixed heading of 20 (ruling (3) of §8) made the camera turn toward the destination, then slerp round to 20 across the flight: measured on sample legs, it travelled 29° to 159° off its own facing. `DetourTarget.headingDeg` is now `number | null`; a Hotspot carries `null` and arrives facing the bearing it flew, exactly as a stop does (0° off-axis on every leg farther than the arrival's 573 m ground offset). A Hotspot closer than that is a straight pull-back while facing it, where the old rule also flew nearly backward (165° to 177°). Places keep their authored postcard headings. The one arrival-heading rule is `arrivalHeadingDeg` in `detour.ts`: an authored heading wins; else the travel bearing; except the first leg of a session, which keeps the house heading. `HOTSPOT_HEADING_DEG` is deleted.

### 8.3 Place thumbnails (2026-09-22)

§7 left preset imagery out pending a licensing call. Rulings: Google tiles cannot be captured (Google's terms), and a Mapbox screenshot is banned by name in Mapbox's Product Terms (July 21, 2026, §2.8.1: no distributing map content "by using a screenshot or other static image"); the hotlinked Static Images API is allowed but cannot draw Mapbox Standard's 3D landmarks. So the tiles use Jesse's OWN photographs. Astra searched his Google Photos (read-only; the brief and candidates stay in a private folder outside this public repo) and found usable shots for 6 of 8 places; Twin Peaks and Lombard Street keep the colour block. Each file is a 160 px square WebP crop, rotated by its EXIF orientation first and then stripped of all metadata; `places.test.ts` pins the path (`/immersive/places/<id>.webp`), the size, the absence of any EXIF/XMP chunk, a photo on every default-shown place, and no orphan files. The photographs are © Jesse Garnier, excluded from the CC BY grant in `LICENSE-CONTENT.md`.
