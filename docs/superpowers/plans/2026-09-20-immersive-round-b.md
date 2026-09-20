# The Last 48 Immersive — Round B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/live/immersive` three things its walk asked for — preset destinations in the rail (authored Places + computed Hotspots), a "here" reading in the telemetry strip when the reader clicks open ground, and a visible time-to-next-stop (a stripe on the active card + a figure in the band).

**Architecture:** Everything rides the existing immersive page (`src/views/Last48/photoreal/immersive/`). New logic is pure leaves with node tests (`places.ts`, `hotspots.ts`, `detour.ts`, `here.ts`, `pointInNeighborhood.ts`, `nextIn.ts`, `streamWords.ts`); the Cesium director learns one new input (`detour`); the page owns the URL contract (`?place=`, `?hot=`) and wires the leaves into three components (`Presets.tsx` in the rail, the strip's here cell, the card's stripe). No new backend, no new keys, no new Socrata query shapes — Hotspots reuse `useAnomalyBaseline` exactly as `/live` and the Pulse do.

**Tech Stack:** Vite + React 18 + TypeScript, CesiumJS 1.145 (already vendored), Vitest (node; UI untested by node, walked in Chrome), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-20-immersive-round-b-design.md` (binding). Builds on Spec A2 `docs/superpowers/specs/2026-09-13-photoreal-immersive-design.md` (§10 as-built, §11 post-merge rulings).

**Branch:** `feat/immersive-round-b` (exists, off `main` `1648797`, holds docs commits only).

## Global Constraints

- No jargon: spell words out (`Median rent`, `over 65`, `next in 48 s`). No clock. The word "Live" never appears near the tiles. Nothing may read as a claim that the imagery is live.
- The serif italic display face (`font-display italic`) is RESERVED for clickable specials: rail buttons, the DataDiver return, and **preset tile names**. Group headings, captions and labels stay plain.
- Neighborhood tier words come from `pulsePhrase.combinedDeviation(z).short` — never a raw z-score reaches the screen. Preset captions ≤ 40 characters (test-pinned for Places).
- Hotspot threshold = combined z ≥ 1.5 (the Pulse's first tier); freshness gate = `eventLagMs < FRESH_MAX_MS` per stream, from `@/lib/pulse/anomalyStats` — a stale stream contributes nothing.
- A preset is a DETOUR: the carousel's active card and `?event=` are untouched; `?place=<id>` / `?hot=<neighborhood>` record it; play PAUSES; `←`/`→`/a card click resume the chain and clear the detour.
- Place flights use the authored `headingDeg/pitchDeg/rangeM`; Hotspot flights target the centroid of that neighborhood's events in the current window at `HOTSPOT_RANGE_M = 700`.
- The "here" card lives in the telemetry strip's left cell, mono, values in latte pills (`#dcc9a6`), one line wrapping to two. Cheap sources only: local GeoJSON, `VITE_MAPBOX_TOKEN` reverse geocode (one request per click; failure ⇒ row omitted), the already-loaded 48 h events within 300 m, the committed ACS neighborhood JSON. No new keys.
- Time to next stop: a 3 px stripe along the TOP edge of the active card in the stream pigment, filling left→right; the band's status line appends `· next in 48 s` (mono, tabular, ticks once a second); `next in —` during the flight/settle; nothing in explore mode. ONE clock: `useAutoAdvance`'s `dueAt`, read by the page's existing 250 ms ticker.
- House rules: `md:` is banned (use `desk:`); micro type via `text-nano/micro/label`; mono for labels, serif for prose; every fetch of a Socrata dataset goes through the registry (none new here). Never run `pnpm dev` from a shell (Tarmac owns dev servers). Build via `~/dev/devman/tools/devman-build.mjs pnpm build`. `unset GITHUB_TOKEN` before any `gh` call. Commits end with the attribution lines from the session's system reminder.
- Tests: `pnpm vitest run <path>`. Full gate before the last task: `pnpm test` + `npx tsc -b` + the devman build.

## Plan rulings (made while writing; the controller may flip them, ledger the flip)

1. **A second open-ground click MOVES the here card** to the new point (the spec's "second click elsewhere closes it" is read as "the reading follows the click"; a click that hits a stop or a marker closes it). Cost if wrong: one `if`.
2. **Mapbox Geocoding v6 has no `poi` type on reverse lookups.** The corner row uses `types=address,street` and renders `near {properties.name}` ("near 445 Minna Street"). Cost if wrong: one string.
3. **Hotspot camera:** `headingDeg 20` (the site's default bearing), `pitchDeg −35`, `rangeM 700`. A hotspot whose events carry no coordinates is skipped (nothing to fly to).
4. **`dwellProgress` now derives from the same `remainingMs`** the figure shows — this fixes a latent Round A bug where the rail's rule jumped forward after a hold while the auto-advance clock had paused.
5. **A stale `?hot=`** (the neighborhood dropped off the list) is cleared from the URL once the anomaly engine has loaded; a stale `?place=` (unknown id) is cleared immediately.

---

## File structure

| File | Responsibility |
|---|---|
| `src/views/Last48/photoreal/immersive/nextIn.ts` (+test) | Pure: `formatNextIn(ms)` → `next in 48 s` / `next in —`. |
| `src/views/Last48/photoreal/immersive/useAutoAdvance.ts` | Gains `remainingMs()` (reads `dueAt`); the one clock. |
| `src/views/Last48/photoreal/immersive/streamWords.ts` | Pure leaf: reader-facing stream words (moved out of `LowerThird.tsx`). |
| `src/views/Last48/photoreal/immersive/places.ts` (+test) | Authored Places, zero-import. |
| `src/views/Last48/photoreal/immersive/hotspots.ts` (+test) | Pure selector over anomalies + freshness + events. |
| `src/views/Last48/photoreal/immersive/detour.ts` (+test) | `DetourTarget` + builders from a Place / a Hotspot. |
| `src/views/Last48/photoreal/immersive/useDreamDirector.ts` | Gains `detour` input; per-leg pitch/range. |
| `src/views/Last48/photoreal/immersive/Presets.tsx` | The rail's two preset groups. |
| `src/views/Last48/photoreal/immersive/RightRail.tsx` | Gains a `presets` slot. |
| `src/views/Last48/photoreal/immersive/pointInNeighborhood.ts` (+test) | Pure: point → neighborhood name or null. |
| `src/views/Last48/photoreal/immersive/here.ts` (+test) | Pure: nearby counts, ACS line, corner-from-geocode. |
| `src/views/Last48/photoreal/immersive/useHereCard.ts` | Assembles a `HereReading` (geocode fetch inside). |
| `src/views/Last48/photoreal/immersive/TelemetryStrip.tsx` | Left cell shows the here reading when open. |
| `src/views/Last48/photoreal/immersive/Beacon.tsx` | `variant="probe"`; takes `lng/lat` not an event. |
| `src/views/Last48/photoreal/immersive/ImmersiveCard.tsx` | Active card's top-edge stripe. |
| `src/views/Last48/photoreal/immersive/LowerThird.tsx` | Status line's `· next in …`. |
| `src/views/Last48/photoreal/immersive/ImmersiveScene.tsx` | Threads `detour`, probe beacon. |
| `src/views/Last48/photoreal/immersive/Last48Immersive.tsx` | URL contract, wiring. |
| `CLAUDE.md`, spec §8 | Docs. |

---

### Task 1: The one clock — `nextIn.ts` + `useAutoAdvance.remainingMs()`

**Files:**
- Create: `src/views/Last48/photoreal/immersive/nextIn.ts`
- Create: `src/views/Last48/photoreal/immersive/nextIn.test.ts`
- Modify: `src/views/Last48/photoreal/immersive/useAutoAdvance.ts`

**Interfaces:**
- Produces: `formatNextIn(remainingMs: number | null): string`; `useAutoAdvance(opts): { remainingMs: () => number | null }` (was `void`). `remainingMs()` returns ms left on the running clock, the frozen remainder while held, or `null` when the stop has not arrived / play is off.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/Last48/photoreal/immersive/nextIn.test.ts
import { describe, it, expect } from 'vitest'
import { formatNextIn } from './nextIn'

describe('formatNextIn', () => {
  it('rounds UP to the next whole second', () => {
    expect(formatNextIn(47_100)).toBe('next in 48 s')
    expect(formatNextIn(48_000)).toBe('next in 48 s')
  })
  it('never shows a negative or fractional figure', () => {
    expect(formatNextIn(0)).toBe('next in 0 s')
    expect(formatNextIn(-500)).toBe('next in 0 s')
  })
  it('reads "—" while the clock is not running (flight, settle gate)', () => {
    expect(formatNextIn(null)).toBe('next in —')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/nextIn.test.ts`
Expected: FAIL — cannot resolve `./nextIn`.

- [ ] **Step 3: Write the leaf**

```ts
// src/views/Last48/photoreal/immersive/nextIn.ts
//
// The time-to-next-stop FIGURE (Round B §4). One string, mono in the band's
// status line. Whole seconds, rounded UP: a reader watching "next in 1 s"
// should see the stop change on the beat, not a second after it says 0.
// `null` = the clock is not running (the flight, the settle gate, explore),
// and the figure says so with a dash rather than pretending.

/** `next in 48 s` / `next in —`. */
export function formatNextIn(remainingMs: number | null): string {
  if (remainingMs == null) return 'next in —'
  const s = Math.max(0, Math.ceil(remainingMs / 1000))
  return `next in ${s} s`
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/nextIn.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Expose the clock from `useAutoAdvance`**

Replace the whole file with:

```ts
// src/views/Last48/photoreal/immersive/useAutoAdvance.ts
//
// The immersive PLAY clock (Spec A2 §1: auto-advance is opt-in; explore is
// the default). Counts the dwell from ARRIVAL — the page flips `arrived`
// when the director's settle gate fires — then calls onAdvance once. Hold
// pauses the clock and keeps the remainder; a new stop (stopKey) discards
// it. Same wall-clock gate as the flat tour (dueWaitMs), so a backgrounded
// tab's coalesced timers cannot fire a burst of advances on refocus.
//
// Round B (§4): this is THE clock. `remainingMs()` is what the band's
// "next in 48 s", the card's stripe and the rail's rule all read — one
// number drawn three times, so a hold freezes all three together (before
// Round B the rail's rule ran off arrival time and jumped after a hold).
import { useCallback, useEffect, useRef } from 'react'
import { dueWaitMs } from '../../ambient/tour'

export function useAutoAdvance(opts: {
  playing: boolean
  arrived: boolean
  hold: boolean
  dwellMs: number
  /** The active stop's id. Changing it resets the clock. */
  stopKey: string | null
  onAdvance: () => void
}): { remainingMs: () => number | null } {
  const cb = useRef(opts.onAdvance)
  // eslint-disable-next-line react-hooks/refs
  cb.current = opts.onAdvance
  /** Milliseconds left when the clock was last paused, for THIS stop. */
  const remainingRef = useRef<number | null>(null)
  /** When the running clock fires; null while it is not running. */
  const dueAtRef = useRef<number | null>(null)

  // A new stop discards any remainder. Declared BEFORE the timer effect so
  // React runs it first on the same commit.
  useEffect(() => { remainingRef.current = null }, [opts.stopKey])

  useEffect(() => {
    if (!opts.playing || !opts.arrived || opts.hold) return
    const delay = remainingRef.current ?? opts.dwellMs
    const dueAt = Date.now() + delay
    dueAtRef.current = dueAt
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const wait = dueWaitMs(dueAt, Date.now())
      if (wait > 0) { timer = setTimeout(tick, wait); return }
      remainingRef.current = null
      dueAtRef.current = null
      cb.current()
    }
    timer = setTimeout(tick, delay)
    return () => {
      clearTimeout(timer)
      dueAtRef.current = null
      remainingRef.current = Math.max(0, dueAt - Date.now())
    }
  }, [opts.playing, opts.arrived, opts.hold, opts.dwellMs, opts.stopKey])

  // Running → what is left; held → the frozen remainder; otherwise null
  // (not arrived yet, or play is off and nothing was ever counted).
  const remainingMs = useCallback((): number | null => {
    if (dueAtRef.current != null) return Math.max(0, dueAtRef.current - Date.now())
    return remainingRef.current
  }, [])

  return { remainingMs }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc -b`
Expected: passes (the page still ignores the return value; Task 2 wires it).

- [ ] **Step 7: Commit**

```bash
git add src/views/Last48/photoreal/immersive/nextIn.ts src/views/Last48/photoreal/immersive/nextIn.test.ts src/views/Last48/photoreal/immersive/useAutoAdvance.ts
git commit -m "feat(immersive): one dwell clock — useAutoAdvance.remainingMs() + formatNextIn"
```

---

### Task 2: Time to next stop on screen — stripe + figure + rule from one number

**Files:**
- Create: `src/views/Last48/photoreal/immersive/streamWords.ts`
- Modify: `src/views/Last48/photoreal/immersive/ImmersiveCard.tsx`
- Modify: `src/views/Last48/photoreal/immersive/LowerThird.tsx`
- Modify: `src/views/Last48/photoreal/immersive/Last48Immersive.tsx`

**Interfaces:**
- Consumes: `useAutoAdvance(...).remainingMs`, `formatNextIn` (Task 1).
- Produces: `STREAM_WORD: Record<DatasetId, string>` (`'911 dispatch' | 'Fire/EMS' | '311 case'`) in `streamWords.ts`; `ImmersiveCard` prop `progress?: number | null` (0..1 fills the stripe; null/undefined = no stripe); `LowerThird` prop `nextIn: string | null`.

- [ ] **Step 1: Create the stream-words leaf and point `LowerThird` at it**

```ts
// src/views/Last48/photoreal/immersive/streamWords.ts
//
// Reader-facing stream names for SENTENCES — the band's status line and the
// here card's counts. The map chips shout in caps (DATASET_META.label);
// these are the same three streams said quietly. Zero-import so the pure
// leaves (here.ts) and the components can both read them.
import type { DatasetId } from '@/types/last48'

export const STREAM_WORD: Record<DatasetId, string> = {
  '911-realtime': '911 dispatch',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases': '311 case',
}
```

In `LowerThird.tsx`: delete the local `STREAM_LABEL` constant, add `import { STREAM_WORD } from './streamWords'`, and change the status-line usage to `{STREAM_WORD[active.datasetId] ?? meta.label}`.

- [ ] **Step 2: Add the stripe to the active card**

In `ImmersiveCard.tsx`:

Props:
```ts
interface Props {
  event: NormalizedEvent
  role: 'active' | 'peek'
  onClick?: () => void
  glow?: boolean
  /** ACTIVE only: 0..1 fills a 3 px stripe along the top edge across the
   *  dwell (Round B §4). null/undefined = no stripe (explore, flight). */
  progress?: number | null
}
```

Destructure `progress` in the signature. Change the active `face` string so the card can clip the stripe:

```ts
    : `${shell} ${primary} relative overflow-hidden -translate-y-3 scale-[1.06] ${glow ? 'glow-host' : ''}`
```

Inside `body`, immediately after `{!peek && glow && <div className="glow-corner" />}` add:

```tsx
      {/* THE STRIPE (Round B §4): the stream pigment running out along the
          top edge across the dwell — the same colour as the tab down the
          left edge, so it reads as that tab's ink being spent. Width moves
          in 250 ms steps (the page's ticker) and the linear transition
          smooths them into one continuous fill. Hidden entirely unless the
          page is PLAYING and the stop has arrived. */}
      {!peek && progress != null && (
        <div
          aria-hidden
          className="absolute left-0 top-0 h-[3px] transition-[width] duration-[250ms] ease-linear"
          style={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%`, background: meta.color }}
        />
      )}
```

- [ ] **Step 3: Add the figure to the band's status line**

In `LowerThird.tsx` add the prop and render it:

```ts
interface Props {
  prev: NormalizedEvent | null
  active: NormalizedEvent | null
  ahead: NormalizedEvent[]
  onJump: (id: string) => void
  onStep: (delta: 1 | -1) => void
  stopIndex: number
  stopCount: number
  /** `next in 48 s` while playing (Round B §4); null in explore mode. */
  nextIn: string | null
  /** 0..1 across the dwell for the active card's stripe; null = no stripe. */
  progress: number | null
}
```

Destructure both. After `<span>Stop {known ? stopIndex : '—'} of {known ? stopCount : '—'}</span>` add:

```tsx
          {nextIn && (<><span aria-hidden>·</span><span className="tabular-nums">{nextIn}</span></>)}
```

And pass the stripe to the active card:

```tsx
              ? <ImmersiveCard key={active.id} event={active} role="active" glow progress={progress} />
```

- [ ] **Step 4: Wire the page to the one clock**

In `Last48Immersive.tsx`:

Add the import: `import { formatNextIn } from './nextIn'`.

Delete `arrivedAtRef`, the `dwellProgress` state, and the whole "dwell rule in the rail" 250 ms effect. Replace the arrival block with:

```ts
  const [arrived, setArrived] = useState(false)
  useEffect(() => { setArrived(false) }, [activeId])
  const handleArrived = useCallback(() => setArrived(true), [])
```

Replace the `useAutoAdvance(...)` call and add the ticker:

```ts
  const { remainingMs } = useAutoAdvance({ playing, arrived, hold, dwellMs: pace.dwellMs, stopKey: activeId, onAdvance: () => step(1) })

  // ONE clock, three readers (Round B §4): the band's "next in", the active
  // card's stripe and the rail's rule all come from remainingMs(). Sampled
  // four times a second while playing; a hold freezes the number inside the
  // hook, so all three freeze together. Null (flight / settle gate) reads as
  // "next in —" and no stripe.
  const [nextInMs, setNextInMs] = useState<number | null>(null)
  useEffect(() => {
    if (!playing) { setNextInMs(null); return }
    const tick = () => setNextInMs(remainingMs())
    tick()
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [playing, arrived, hold, remainingMs])
  const dwellProgress = nextInMs == null ? -1 : Math.max(0, Math.min(1, 1 - nextInMs / pace.dwellMs))
  const nextIn = playing ? formatNextIn(nextInMs) : null
  const stripe = playing && nextInMs != null ? dwellProgress : null
```

Pass to the band: `nextIn={nextIn}` and `progress={stripe}`. The rail's `dwellProgress={dwellProgress}` prop stays as is (it now reads the same number).

- [ ] **Step 5: Typecheck + tests**

Run: `npx tsc -b && pnpm vitest run src/views/Last48/photoreal`
Expected: both pass.

- [ ] **Step 6: Commit**

```bash
git add src/views/Last48/photoreal/immersive/streamWords.ts src/views/Last48/photoreal/immersive/ImmersiveCard.tsx src/views/Last48/photoreal/immersive/LowerThird.tsx src/views/Last48/photoreal/immersive/Last48Immersive.tsx
git commit -m "feat(immersive): time to next stop — top-edge stripe on the active card, 'next in' in the band, rail rule off the same clock"
```

---

### Task 3: Places — the authored leaf

**Files:**
- Create: `src/views/Last48/photoreal/immersive/places.ts`
- Create: `src/views/Last48/photoreal/immersive/places.test.ts`

**Interfaces:**
- Produces: `interface Place { id: string; name: string; caption: string; lng: number; lat: number; headingDeg: number; pitchDeg: number; rangeM: number }`, `PLACES: readonly Place[]` (8), `PLACES_SHOWN = 4`, `PLACE_CAPTION_MAX = 40`.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/Last48/photoreal/immersive/places.test.ts
import { describe, it, expect } from 'vitest'
import { PLACES, PLACES_SHOWN, PLACE_CAPTION_MAX } from './places'
import { SF_BOUNDS } from '@/utils/geo'

describe('PLACES (Round B §2)', () => {
  it('seeds eight places and shows four', () => {
    expect(PLACES).toHaveLength(8)
    expect(PLACES_SHOWN).toBe(4)
  })
  it('ids are unique kebab-case', () => {
    const ids = PLACES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })
  it('every place sits inside San Francisco', () => {
    for (const p of PLACES) {
      expect(p.lat, p.id).toBeGreaterThan(SF_BOUNDS.south)
      expect(p.lat, p.id).toBeLessThan(SF_BOUNDS.north)
      expect(p.lng, p.id).toBeGreaterThan(SF_BOUNDS.west)
      expect(p.lng, p.id).toBeLessThan(SF_BOUNDS.east)
    }
  })
  it('camera range is 150–1500 m, pitch looks down, heading is a compass bearing', () => {
    for (const p of PLACES) {
      expect(p.rangeM, p.id).toBeGreaterThanOrEqual(150)
      expect(p.rangeM, p.id).toBeLessThanOrEqual(1500)
      expect(p.pitchDeg, p.id).toBeLessThan(0)
      expect(p.pitchDeg, p.id).toBeGreaterThanOrEqual(-60)
      expect(p.headingDeg, p.id).toBeGreaterThanOrEqual(0)
      expect(p.headingDeg, p.id).toBeLessThan(360)
    }
  })
  it('captions are short and plain', () => {
    for (const p of PLACES) {
      expect(p.caption.length, p.id).toBeLessThanOrEqual(PLACE_CAPTION_MAX)
      expect(p.caption, p.id).not.toMatch(/live/i)
    }
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/places.test.ts`
Expected: FAIL — cannot resolve `./places`.

- [ ] **Step 3: Write the leaf**

```ts
// src/views/Last48/photoreal/immersive/places.ts
//
// PLACES — the authored half of the rail's presets (Round B §2). Eight
// landmarks a visitor would name, each with its own camera: where the
// camera looks FROM is as authored as where it looks AT (the Painted
// Ladies face east, so the camera stands east of them). Zero-import, so the
// test can pin every row without a DOM. Conventions match cameraPose.ts:
// heading clockwise from north, pitch negative looking down, range metres
// from the target to the camera.
//
// The rail shows the first PLACES_SHOWN and a "More places" turn-down for
// the rest; order here IS display order.

export interface Place {
  id: string
  name: string
  /** ≤ PLACE_CAPTION_MAX characters, plain words. */
  caption: string
  lng: number
  lat: number
  headingDeg: number
  pitchDeg: number
  rangeM: number
}

export const PLACES_SHOWN = 4
export const PLACE_CAPTION_MAX = 40

export const PLACES: readonly Place[] = [
  { id: 'golden-gate-bridge', name: 'Golden Gate Bridge', caption: 'The south anchorage and Fort Point',
    lng: -122.4757, lat: 37.8085, headingDeg: 330, pitchDeg: -25, rangeM: 900 },
  { id: 'coit-tower', name: 'Coit Tower', caption: 'Telegraph Hill, above North Beach',
    lng: -122.4058, lat: 37.8024, headingDeg: 200, pitchDeg: -30, rangeM: 500 },
  { id: 'ferry-building', name: 'Ferry Building', caption: 'The foot of Market Street',
    lng: -122.3937, lat: 37.7955, headingDeg: 60, pitchDeg: -30, rangeM: 500 },
  { id: 'painted-ladies', name: 'Painted Ladies', caption: 'Alamo Square, Steiner Street',
    lng: -122.4330, lat: 37.7762, headingDeg: 270, pitchDeg: -25, rangeM: 350 },
  { id: 'twin-peaks', name: 'Twin Peaks', caption: 'The city from its middle',
    lng: -122.4477, lat: 37.7544, headingDeg: 45, pitchDeg: -20, rangeM: 800 },
  { id: 'palace-of-fine-arts', name: 'Palace of Fine Arts', caption: 'The rotunda and lagoon, Marina',
    lng: -122.4484, lat: 37.8029, headingDeg: 315, pitchDeg: -30, rangeM: 450 },
  { id: 'oracle-park', name: 'Oracle Park', caption: 'The ballpark on McCovey Cove',
    lng: -122.3893, lat: 37.7786, headingDeg: 90, pitchDeg: -35, rangeM: 600 },
  { id: 'lombard-street', name: 'Lombard Street', caption: 'The crooked block, Russian Hill',
    lng: -122.4187, lat: 37.8021, headingDeg: 270, pitchDeg: -30, rangeM: 350 },
]
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/places.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/photoreal/immersive/places.ts src/views/Last48/photoreal/immersive/places.test.ts
git commit -m "feat(immersive): authored Places leaf (8 landmarks, camera per place, test-pinned)"
```

---

### Task 4: Hotspots — the pure selector

**Files:**
- Create: `src/views/Last48/photoreal/immersive/hotspots.ts`
- Create: `src/views/Last48/photoreal/immersive/hotspots.test.ts`

**Interfaces:**
- Consumes: `combineZ` from `src/views/Last48/modes/anomalyRamp.ts`; `combinedDeviation` from `@/lib/pulse/pulsePhrase`; `FRESH_MAX_MS` from `@/lib/pulse/anomalyStats`; types `AnomalyResult`, `FreshnessMap`, `NormalizedEvent`, `DatasetId` from `@/types/last48`.
- Produces: `interface Hotspot { neighborhood: string; z: number; tier: 1 | 2 | 3; caption: string; lng: number; lat: number; count: number }`; `selectHotspots(anomalies, freshness, events, limit = HOTSPOT_LIMIT): Hotspot[]`; constants `HOTSPOT_MIN_Z = 1.5`, `HOTSPOT_LIMIT = 4`, `HOTSPOT_RANGE_M = 700`, `HOTSPOT_TIER_COLOR: Record<1|2|3, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/Last48/photoreal/immersive/hotspots.test.ts
import { describe, it, expect } from 'vitest'
import { selectHotspots, HOTSPOT_MIN_Z, HOTSPOT_LIMIT } from './hotspots'
import type { AnomalyResult, FreshnessMap, NormalizedEvent } from '@/types/last48'

const fresh = (lagMs: number | null) => ({ rowsUpdatedAt: null, maxEventTime: null, eventLagMs: lagMs, refreshLagMs: null, error: null })
const ALL_FRESH: FreshnessMap = {
  '911-realtime': fresh(60_000),
  'fire-ems-dispatch': fresh(60_000),
  '311-cases': fresh(60_000),
}
const anomaly = (neighborhood: string, datasetId: AnomalyResult['datasetId'], zScore: number): AnomalyResult =>
  ({ neighborhood, datasetId, zScore, count48h: 10, baselineMean: 5, baselineSd: 2 })
const ev = (id: string, neighborhood: string, lng: number, lat: number): NormalizedEvent =>
  ({ id, datasetId: '911-realtime', timestamp: '', receivedAt: 1, neighborhood, longitude: lng, latitude: lat, raw: {} })

const EVENTS = [
  ev('a', 'Mission', -122.42, 37.76), ev('b', 'Mission', -122.40, 37.74),
  ev('c', 'Tenderloin', -122.41, 37.78),
  ev('d', 'Sunset/Parkside', -122.49, 37.75),
]

describe('selectHotspots (Round B §2)', () => {
  it('combines per neighborhood with Stouffer (Σz/√k), keeps z ≥ 1.5, ranks descending', () => {
    const out = selectHotspots([
      anomaly('Mission', '911-realtime', 2.0), anomaly('Mission', '311-cases', 2.0),   // 4/√2 = 2.83
      anomaly('Tenderloin', '911-realtime', 1.6),                                     // 1.6
      anomaly('Sunset/Parkside', '911-realtime', 1.4),                                // below the line
    ], ALL_FRESH, EVENTS)
    expect(out.map((h) => h.neighborhood)).toEqual(['Mission', 'Tenderloin'])
    expect(out[0].z).toBeCloseTo(2.83, 2)
    expect(out[0].tier).toBe(3)
    expect(out[1].tier).toBe(1)
    expect(HOTSPOT_MIN_Z).toBe(1.5)
  })
  it('speaks the Pulse tier words, never a z-score', () => {
    const out = selectHotspots([anomaly('Mission', '911-realtime', 2.0)], ALL_FRESH, EVENTS)
    expect(out[0].caption).toBe('well above usual')
    expect(out[0].caption).not.toMatch(/\d/)
  })
  it('flies to the centroid of the neighborhood’s events, and counts them', () => {
    const out = selectHotspots([anomaly('Mission', '911-realtime', 2.0)], ALL_FRESH, EVENTS)
    expect(out[0].lng).toBeCloseTo(-122.41, 5)
    expect(out[0].lat).toBeCloseTo(37.75, 5)
    expect(out[0].count).toBe(2)
  })
  it('a stale stream contributes nothing (freshness gate, as the Pulse)', () => {
    const stale: FreshnessMap = { ...ALL_FRESH, '311-cases': fresh(48 * 3_600_000) }
    const out = selectHotspots([
      anomaly('Mission', '311-cases', 3.0),                 // stale — dropped
      anomaly('Tenderloin', '911-realtime', 1.6),
    ], stale, EVENTS)
    expect(out.map((h) => h.neighborhood)).toEqual(['Tenderloin'])
    const unknown: FreshnessMap = { ...ALL_FRESH, '311-cases': fresh(null) }
    expect(selectHotspots([anomaly('Mission', '311-cases', 3.0)], unknown, EVENTS)).toEqual([])
  })
  it('a quiet reading never surfaces', () => {
    expect(selectHotspots([anomaly('Mission', '911-realtime', -3.0)], ALL_FRESH, EVENTS)).toEqual([])
  })
  it('a neighborhood with no located events is skipped (nothing to fly to)', () => {
    expect(selectHotspots([anomaly('Presidio', '911-realtime', 3.0)], ALL_FRESH, EVENTS)).toEqual([])
  })
  it('caps at four and ignores pre-combined rows', () => {
    const many = ['Mission', 'Tenderloin', 'Sunset/Parkside', 'Presidio', 'Marina'].map((n) => anomaly(n, '911-realtime', 2.0))
    const events = ['Mission', 'Tenderloin', 'Sunset/Parkside', 'Presidio', 'Marina'].map((n, i) => ev(String(i), n, -122.4, 37.7))
    const out = selectHotspots([...many, anomaly('Mission', 'combined', 9)], ALL_FRESH, events)
    expect(out).toHaveLength(HOTSPOT_LIMIT)
    expect(out[0].z).toBeCloseTo(2.0, 5)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/hotspots.test.ts`
Expected: FAIL — cannot resolve `./hotspots`.

- [ ] **Step 3: Write the selector**

```ts
// src/views/Last48/photoreal/immersive/hotspots.ts
//
// HOTSPOTS — the computed half of the rail's presets (Round B §2): "places
// the data says are worth seeing". The same 48 h anomaly engine the Last 48
// choropleth and the Pulse read, reduced to the top four neighborhoods.
// Every rule here is borrowed, not invented, so a hotspot tile can only
// appear when the Pulse would say something about that neighborhood:
//   · combine per neighborhood with Stouffer (Σz/√k) — anomalyRamp.combineZ;
//   · the line is the Pulse's first tier, z ≥ 1.5;
//   · the freshness gate is the Pulse's — a stream behind on publishing
//     contributes nothing (busy OR quiet: with no fresh count there is no
//     reading, and a stale "busy" would be yesterday's news);
//   · a QUIET reading never surfaces (negative z) — a hotspot is a place to
//     go look at, and there is nothing to look at in an absence;
//   · the tier word is the phrase layer's, never a figure.
// Fly-to = the centroid of the neighborhood's events in the current window
// (the events are the story, not the polygon); a neighborhood with no
// located events is skipped — there would be nothing to fly to.
import { combineZ } from '../../modes/anomalyRamp'
import { combinedDeviation } from '@/lib/pulse/pulsePhrase'
import { FRESH_MAX_MS } from '@/lib/pulse/anomalyStats'
import type { AnomalyResult, DatasetId, FreshnessMap, NormalizedEvent } from '@/types/last48'

export const HOTSPOT_MIN_Z = 1.5
export const HOTSPOT_LIMIT = 4
/** Camera distance for a hotspot detour — a neighborhood, not a doorway. */
export const HOTSPOT_RANGE_M = 700
/** The ramp's three warm stops (ochre / terracotta / brick) — the tile's
 *  colour block says the tier the caption says. */
export const HOTSPOT_TIER_COLOR: Record<1 | 2 | 3, string> = { 1: '#d4a435', 2: '#b85a33', 3: '#963e30' }

export interface Hotspot {
  neighborhood: string
  /** Combined z (Σz/√k over the FRESH streams). */
  z: number
  tier: 1 | 2 | 3
  /** The Pulse tier word — "above usual", "well above usual", "far above usual". */
  caption: string
  /** Centroid of the neighborhood's located events in the window. */
  lng: number
  lat: number
  /** How many located events fed the centroid. */
  count: number
}

function streamFresh(freshness: FreshnessMap, id: DatasetId): boolean {
  const lag = freshness[id]?.eventLagMs
  return lag != null && lag < FRESH_MAX_MS
}

export function selectHotspots(
  anomalies: readonly AnomalyResult[],
  freshness: FreshnessMap,
  events: readonly NormalizedEvent[],
  limit: number = HOTSPOT_LIMIT,
): Hotspot[] {
  const zsByNh = new Map<string, number[]>()
  for (const a of anomalies) {
    if (a.datasetId === 'combined') continue
    if (!streamFresh(freshness, a.datasetId)) continue
    const zs = zsByNh.get(a.neighborhood) ?? []
    zs.push(a.zScore)
    zsByNh.set(a.neighborhood, zs)
  }

  const sums = new Map<string, { lng: number; lat: number; n: number }>()
  for (const e of events) {
    if (!e.neighborhood || e.longitude == null || e.latitude == null) continue
    const s = sums.get(e.neighborhood) ?? { lng: 0, lat: 0, n: 0 }
    s.lng += e.longitude; s.lat += e.latitude; s.n += 1
    sums.set(e.neighborhood, s)
  }

  const out: Hotspot[] = []
  for (const [neighborhood, zs] of zsByNh) {
    const z = combineZ(zs)
    if (z < HOTSPOT_MIN_Z) continue
    const s = sums.get(neighborhood)
    if (!s || s.n === 0) continue
    const d = combinedDeviation(z)
    out.push({ neighborhood, z, tier: d.magnitude, caption: d.short, lng: s.lng / s.n, lat: s.lat / s.n, count: s.n })
  }
  out.sort((a, b) => b.z - a.z || a.neighborhood.localeCompare(b.neighborhood))
  return out.slice(0, limit)
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/hotspots.test.ts`
Expected: PASS (7 tests). If `combinedDeviation(2.83).short` is not `'far above usual'`/tier 3, re-read `volumeTier` in `src/lib/pulse/pulsePhrase.ts` (≥2.6 → 3, ≥1.9 → 2) and fix the TEST's expectation, never the phrase layer.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/photoreal/immersive/hotspots.ts src/views/Last48/photoreal/immersive/hotspots.test.ts
git commit -m "feat(immersive): pure Hotspots selector — Stouffer combine, z ≥ 1.5, Pulse freshness gate, event centroid"
```

---

### Task 5: Detours — `detour.ts` + the director learns a second target

**Files:**
- Create: `src/views/Last48/photoreal/immersive/detour.ts`
- Create: `src/views/Last48/photoreal/immersive/detour.test.ts`
- Modify: `src/views/Last48/photoreal/immersive/useDreamDirector.ts`
- Modify: `src/views/Last48/photoreal/immersive/ImmersiveScene.tsx`

**Interfaces:**
- Consumes: `Place` (Task 3), `Hotspot`, `HOTSPOT_RANGE_M` (Task 4).
- Produces: `interface DetourTarget { key: string; lng: number; lat: number; headingDeg: number; pitchDeg: number; rangeM: number }`; `detourFromPlace(p: Place): DetourTarget` (key `place:<id>`); `detourFromHotspot(h: Hotspot): DetourTarget` (key `hot:<neighborhood>`); `sameDetour(a, b): boolean`. `useDreamDirector` gains `detour?: DetourTarget | null`; `ImmersiveScene` gains prop `detour: DetourTarget | null`.

- [ ] **Step 1: Write the failing test**

```ts
// src/views/Last48/photoreal/immersive/detour.test.ts
import { describe, it, expect } from 'vitest'
import { detourFromPlace, detourFromHotspot, sameDetour, HOTSPOT_HEADING_DEG, HOTSPOT_PITCH_DEG } from './detour'
import { PLACES } from './places'
import { HOTSPOT_RANGE_M, type Hotspot } from './hotspots'

const HOT: Hotspot = { neighborhood: 'Mission', z: 2, tier: 2, caption: 'well above usual', lng: -122.41, lat: 37.75, count: 3 }

describe('detour builders (Round B §2)', () => {
  it('a Place detour carries its authored camera under a place: key', () => {
    const p = PLACES[0]
    const d = detourFromPlace(p)
    expect(d).toEqual({ key: `place:${p.id}`, lng: p.lng, lat: p.lat, headingDeg: p.headingDeg, pitchDeg: p.pitchDeg, rangeM: p.rangeM })
  })
  it('a Hotspot detour flies to the event centroid at 700 m under a hot: key', () => {
    const d = detourFromHotspot(HOT)
    expect(d).toEqual({ key: 'hot:Mission', lng: -122.41, lat: 37.75, headingDeg: HOTSPOT_HEADING_DEG, pitchDeg: HOTSPOT_PITCH_DEG, rangeM: HOTSPOT_RANGE_M })
  })
  it('sameDetour ignores centroid drift under ~11 m so a poll does not re-fly', () => {
    const a = detourFromHotspot(HOT)
    const b = detourFromHotspot({ ...HOT, lng: -122.41004, lat: 37.75004 })
    const c = detourFromHotspot({ ...HOT, lng: -122.42 })
    expect(sameDetour(a, b)).toBe(true)
    expect(sameDetour(a, c)).toBe(false)
    expect(sameDetour(a, null)).toBe(false)
    expect(sameDetour(null, null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/detour.test.ts`
Expected: FAIL — cannot resolve `./detour`.

- [ ] **Step 3: Write the leaf**

```ts
// src/views/Last48/photoreal/immersive/detour.ts
//
// A DETOUR (Round B §2) is a camera destination that is not a stop: the
// director flies there and drifts as usual, but the carousel keeps its
// active card, ?event= is untouched and play is paused. Places bring their
// own authored camera; hotspots get one house camera (heading = the site's
// default bearing, a moderate pitch, a neighborhood-scale range). `key` is
// what the URL and the rail's active tile agree on.
import type { Place } from './places'
import { HOTSPOT_RANGE_M, type Hotspot } from './hotspots'

export interface DetourTarget {
  /** `place:<id>` or `hot:<neighborhood>`. */
  key: string
  lng: number
  lat: number
  headingDeg: number
  pitchDeg: number
  rangeM: number
}

/** SF_DEFAULT_BEARING, rounded — the way every DataDiver map first faces. */
export const HOTSPOT_HEADING_DEG = 20
export const HOTSPOT_PITCH_DEG = -35

export function detourFromPlace(p: Place): DetourTarget {
  return { key: `place:${p.id}`, lng: p.lng, lat: p.lat, headingDeg: p.headingDeg, pitchDeg: p.pitchDeg, rangeM: p.rangeM }
}

export function detourFromHotspot(h: Hotspot): DetourTarget {
  return { key: `hot:${h.neighborhood}`, lng: h.lng, lat: h.lat, headingDeg: HOTSPOT_HEADING_DEG, pitchDeg: HOTSPOT_PITCH_DEG, rangeM: HOTSPOT_RANGE_M }
}

/** Four decimals ≈ 11 m: a hotspot centroid moves a few metres per poll and
 *  the director must not re-fly an 18 s leg for that. */
const r4 = (v: number) => Math.round(v * 1e4) / 1e4
export function sameDetour(a: DetourTarget | null, b: DetourTarget | null): boolean {
  if (a == null || b == null) return a === b
  return a.key === b.key && r4(a.lng) === r4(b.lng) && r4(a.lat) === r4(b.lat)
    && a.headingDeg === b.headingDeg && a.pitchDeg === b.pitchDeg && a.rangeM === b.rangeM
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/detour.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Teach the director a detour**

In `useDreamDirector.ts`:

Add the import `import type { DetourTarget } from './detour'` and the option:

```ts
  /** Round B: a detour (a Place or a Hotspot). When set it REPLACES the
   *  target as the camera's destination — same flight, same settle gate,
   *  same drift — but with its own heading/pitch/range. The preload still
   *  aims at `next` (the chain resumes from the active card). */
  detour?: DetourTarget | null
```

Destructure it: `const { viewer, tileset, target, hold } = opts` → `const { viewer, tileset, target, hold } = opts; const detour = opts.detour ?? null`.

Add a per-leg pose ref beside `centerRef`:

```ts
  /** The pitch/range of the CURRENT leg — a detour's own, or the house
   *  hero pose. startDrift and the hold-release read it so a detour drifts
   *  at its own distance rather than snapping back to 200 m. */
  const legRef = useRef<{ pitchDeg: number; rangeM: number } | null>(null)
```

In `api.current`, replace `pitch()` with two helpers and make `startDrift` use them:

```ts
    pitch: () => legRef.current?.pitchDeg ?? Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin),
    range: () => legRef.current?.rangeM ?? cbRef.current.rangeM ?? RANGE_M.immersive,
```

- in `preloadNext` keep the HOUSE pose (the next stop is a stop, not a detour): replace `this.pitch()` with `Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin)` and `(cbRef.current.rangeM ?? RANGE_M.immersive)` stays.
- in `startDrift` replace `orbitPose(center, to, this.pitch(), (cbRef.current.rangeM ?? RANGE_M.immersive))` with `orbitPose(center, to, this.pitch(), this.range())`.

Rewrite the leg effect's head so a detour wins:

```ts
  // One leg per destination: the detour when there is one, else the target.
  useEffect(() => {
    const a = api.current
    const dest = detour
      ? { lng: detour.lng, lat: detour.lat, headingDeg: detour.headingDeg, pitchDeg: detour.pitchDeg, rangeM: detour.rangeM }
      : target
        ? { lng: target.lng, lat: target.lat, headingDeg: headingRef.current,
            pitchDeg: Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin), rangeM: cbRef.current.rangeM ?? RANGE_M.immersive }
        : null
    if (!dest) {
      a.stopDrift()
      arrivedRef.current = false
      centerRef.current = null
      legRef.current = null
      return
    }
    let disposed = false
    let settle: ReturnType<typeof setInterval> | undefined
    arrivedRef.current = false
    cancelledRef.current = false
    a.stopDrift()
    // A detour brings its own heading; a stop continues from the last one.
    headingRef.current = dest.headingDeg
    legRef.current = { pitchDeg: dest.pitchDeg, rangeM: dest.rangeM }
    const center: Center = { lng: dest.lng, lat: dest.lat, height: TARGET_HEIGHT_M }
    centerRef.current = center
    const arrival = orbitPose(center, dest.headingDeg, dest.pitchDeg, dest.rangeM)
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
          if (disposed || cancelledRef.current || !a.alive()) { clearInterval(settle); return }
          if (tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) {
            clearInterval(settle)
            if (cancelledRef.current) return
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
  }, [target, detour, viewer, tileset])
```

(The body is the existing leg with `dest` in place of `target`; the `hold` effect and `cancel` are unchanged.)

Update the header comment's first paragraph with one sentence: "Round B: an optional `detour` (a Place or a Hotspot) replaces the target as the leg's destination with its own heading/pitch/range; the preload still aims at `next`."

- [ ] **Step 6: Thread it through the scene**

In `ImmersiveScene.tsx`:
- import `import type { DetourTarget } from './detour'`
- add to `Props`: `/** Round B: a preset destination. Replaces the active stop as the camera's target while set. */ detour: DetourTarget | null`
- pass `detour={props.detour}` to `<Director …>`
- in `Director`'s props add `detour: DetourTarget | null`; memoise by value so a parent render never re-flies:

```ts
  const detourRef = useRef<DetourTarget | null>(null)
  const detour = useMemo(() => {
    const cur = sameDetour(detourRef.current, p.detour) ? detourRef.current : p.detour
    detourRef.current = cur
    return cur
  }, [p.detour])
```
  (import `sameDetour` from `./detour`) and pass `detour` into `useDreamDirector({ …, detour })`.

- [ ] **Step 7: Typecheck**

Run: `npx tsc -b`
Expected: error in `Last48Immersive.tsx` — `detour` is a required prop of `ImmersiveScene` and is not passed. Add `detour={null}` to the `<ImmersiveScene …>` call for now (Task 6 replaces it). Re-run: passes.

- [ ] **Step 8: Commit**

```bash
git add src/views/Last48/photoreal/immersive/detour.ts src/views/Last48/photoreal/immersive/detour.test.ts src/views/Last48/photoreal/immersive/useDreamDirector.ts src/views/Last48/photoreal/immersive/ImmersiveScene.tsx src/views/Last48/photoreal/immersive/Last48Immersive.tsx
git commit -m "feat(immersive): detours — DetourTarget leaf; the dream director flies a preset with its own heading/pitch/range"
```

---

### Task 6: Presets in the rail + the URL contract

**Files:**
- Create: `src/views/Last48/photoreal/immersive/Presets.tsx`
- Modify: `src/views/Last48/photoreal/immersive/RightRail.tsx`
- Modify: `src/views/Last48/photoreal/immersive/Last48Immersive.tsx`

**Interfaces:**
- Consumes: `PLACES`, `PLACES_SHOWN`, `Place` (Task 3); `selectHotspots`, `Hotspot`, `HOTSPOT_TIER_COLOR` (Task 4); `detourFromPlace`, `detourFromHotspot`, `sameDetour`, `DetourTarget` (Task 5); `useAnomalyBaseline` from `@/hooks/useAnomalyBaseline`.
- Produces: `Presets` component `{ places, hotspots, hotspotsLoading, activeKey, onPlace, onHot }`; `RightRail` prop `presets?: ReactNode`; page params `?place=`, `?hot=`.

- [ ] **Step 1: The Presets component**

```tsx
// src/views/Last48/photoreal/immersive/Presets.tsx
//
// The rail's middle (Round B §2) — the empty air Round A reserved. Two
// stacked groups: PLACES (authored, places.ts) and HOTSPOTS (computed,
// hotspots.ts). A tile is a 3.5rem row like the controls above it: a 40 px
// colour block on the left (a thumbnail slot — imagery is out of scope
// until the licensing call), the NAME in the display italic (the third
// class of serif-italic clickable, after the rail buttons and the DataDiver
// return — Jesse: "the Name of Location preset headings") and a one-line
// plain caption. Group headings and captions stay plain: the serif is for
// what you can click.
//
// A tile is a DETOUR: the page flies there, pauses play, keeps the active
// card. The active tile wears the rail's ochre like a pressed control.
// Hotspots: an empty list says so ("Nothing unusual right now") — absence
// stated, never a blank; loading says it is reading.
import { useState } from 'react'
import type { Place } from './places'
import { PLACES_SHOWN } from './places'
import { HOTSPOT_TIER_COLOR, type Hotspot } from './hotspots'

interface Props {
  places: readonly Place[]
  hotspots: readonly Hotspot[]
  hotspotsLoading: boolean
  /** The current detour's key (`place:<id>` / `hot:<neighborhood>`), or null. */
  activeKey: string | null
  onPlace: (id: string) => void
  onHot: (neighborhood: string) => void
}

/** Places have no data tier — one house colour, the rail's ochre. */
const PLACE_COLOR = '#d4a435'

const HEADING = 'text-[1vw] leading-none text-paper-800 dark:text-paper-200'
const TILE = `h-[3.5rem] w-full rounded-lg flex items-center gap-3 px-2 text-left transition-colors
  ring-1 ring-transparent hover:ring-paper-500/60 hover:bg-paper-200/40 dark:hover:bg-espresso-800/60`
const TILE_ON = 'bg-ochre-500/18 ring-paper-400/40 dark:ring-paper-300/20'
const NAME = 'font-display italic text-[1.2vw] leading-none text-ink dark:text-paper-100 truncate'
const CAPTION = 'text-label leading-none text-paper-600 dark:text-paper-400 truncate'
const NOTE = 'px-2 py-2 text-label leading-snug text-paper-600 dark:text-paper-500'

function Tile({ color, name, caption, on, onClick }: { color: string; name: string; caption: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`${TILE} ${on ? TILE_ON : ''}`} title={`Fly to ${name}`}>
      <span aria-hidden className="w-10 h-10 shrink-0 rounded-md" style={{ background: color, opacity: 0.85 }} />
      <span className="flex min-w-0 flex-col gap-1">
        <span className={NAME}>{name}</span>
        <span className={CAPTION}>{caption}</span>
      </span>
    </button>
  )
}

export default function Presets({ places, hotspots, hotspotsLoading, activeKey, onPlace, onHot }: Props) {
  const [more, setMore] = useState(false)
  const shown = more ? places : places.slice(0, PLACES_SHOWN)

  return (
    <div className="mt-4 flex flex-col gap-3">
      <section aria-label="Places">
        <p className={`${HEADING} px-2 pb-2`}>Places</p>
        <div className="flex flex-col gap-1">
          {shown.map((p) => (
            <Tile key={p.id} color={PLACE_COLOR} name={p.name} caption={p.caption}
              on={activeKey === `place:${p.id}`} onClick={() => onPlace(p.id)} />
          ))}
        </div>
        {places.length > PLACES_SHOWN && (
          <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
            className="mt-1 px-2 py-1 font-mono text-label uppercase tracking-wider text-paper-600 dark:text-paper-500 hover:text-ink dark:hover:text-paper-200">
            {more ? 'Fewer places' : 'More places'}
          </button>
        )}
      </section>

      <section aria-label="Hotspots">
        <p className={`${HEADING} px-2 pb-2`}>Hotspots</p>
        {hotspots.length > 0 ? (
          <div className="flex flex-col gap-1">
            {hotspots.map((h) => (
              <Tile key={h.neighborhood} color={HOTSPOT_TIER_COLOR[h.tier]} name={h.neighborhood} caption={h.caption}
                on={activeKey === `hot:${h.neighborhood}`} onClick={() => onHot(h.neighborhood)} />
            ))}
          </div>
        ) : (
          <p className={NOTE}>{hotspotsLoading ? 'Reading the last 48 hours…' : 'Nothing unusual right now'}</p>
        )}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Give the rail a slot**

In `RightRail.tsx` add to `Props`: `/** Round B: the preset groups, rendered between the View group and the air. */ presets?: ReactNode`; destructure it; render `{presets}` immediately after the View group's closing `</div>` and before `<div className="flex-1" aria-hidden />`. Update the header comment's reading order line to `masthead · PLAY · HOLD · HIDE · VIEW · PRESETS · air · the stop ledger · RETURN`.

- [ ] **Step 3: The page — params, detour, pause, clear**

In `Last48Immersive.tsx`:

Imports to add:
```ts
import { useAnomalyBaseline } from '@/hooks/useAnomalyBaseline'
import { PLACES } from './places'
import { selectHotspots } from './hotspots'
import { detourFromPlace, detourFromHotspot, sameDetour, type DetourTarget } from './detour'
import Presets from './Presets'
```

Replace `setParam` with a multi-key writer plus the old one-key shim:

```ts
  /** Write several params in one history entry; a no-op when nothing changes. */
  const setParams = useCallback((patch: Record<string, string | null>) => {
    setSearchParams((prev) => {
      let changed = false
      const np = new URLSearchParams(prev)
      for (const [key, value] of Object.entries(patch)) {
        if ((prev.get(key) ?? null) === value) continue
        changed = true
        if (value) np.set(key, value); else np.delete(key)
      }
      return changed ? np : prev
    }, { replace: true })
  }, [setSearchParams])
  const setParam = useCallback((key: string, value: string | null) => setParams({ [key]: value }), [setParams])
```

A stop change clears any detour — `jump` and `step` become:

```ts
  const jump = useCallback((id: string) => { setParams({ event: id, place: null, hot: null }) }, [setParams])
  const step = useCallback((delta: 1 | -1) => {
    const i = stepIndex(order, index, delta)
    if (i >= 0) setParams({ event: order[i], place: null, hot: null })
  }, [order, index, setParams])
```

After the `ahead` memo, add the preset block:

```ts
  // ── Presets (Round B §2) ──────────────────────────────────────────────
  // The same anomaly engine /live and the Pulse read (baseline cached 4 h,
  // current counts server-side, single-flighted across consumers).
  const { anomalies, isLoading: anomaliesLoading } = useAnomalyBaseline({ datasets: LAST48_DATASETS, freshness: window48.freshness })
  const hotspots = useMemo(() => selectHotspots(anomalies, window48.freshness, events), [anomalies, window48.freshness, events])
  const placeId = searchParams.get('place')
  const hotNh = searchParams.get('hot')
  // A detour is stabilised by VALUE like the events: a hotspot's centroid
  // shifts a few metres per poll and must not restart an 18 s flight.
  const detourRef = useRef<DetourTarget | null>(null)
  const detour = useMemo(() => {
    let fresh: DetourTarget | null = null
    if (placeId) { const p = PLACES.find((x) => x.id === placeId); fresh = p ? detourFromPlace(p) : null }
    else if (hotNh) { const h = hotspots.find((x) => x.neighborhood === hotNh); fresh = h ? detourFromHotspot(h) : null }
    const out = sameDetour(detourRef.current, fresh) ? detourRef.current : fresh
    detourRef.current = out
    return out
  }, [placeId, hotNh, hotspots])
  // Keep the URL truthful: an unknown ?place= goes at once; a ?hot= whose
  // neighborhood has left the list goes once the engine has actually read.
  useEffect(() => {
    if (placeId && !PLACES.some((x) => x.id === placeId)) setParam('place', null)
  }, [placeId, setParam])
  useEffect(() => {
    if (hotNh && !anomaliesLoading && !hotspots.some((x) => x.neighborhood === hotNh)) setParam('hot', null)
  }, [hotNh, anomaliesLoading, hotspots, setParam])
  // A preset is user input: play pauses (Round B §2). ← → and a card click
  // resume the chain from the active card (they clear place/hot above).
  const goPlace = useCallback((id: string) => setParams({ place: id, hot: null, play: null }), [setParams])
  const goHot = useCallback((nh: string) => setParams({ hot: nh, place: null, play: null }), [setParams])
```

Arrival must reset on a detour too — change the reset effect from Task 2 to:

```ts
  useEffect(() => { setArrived(false) }, [activeId, detour?.key])
```

Pass `detour={detour}` to `<ImmersiveScene …>` (replacing the `detour={null}` placeholder from Task 5), and give the rail its slot:

```tsx
          presets={(
            <Presets
              places={PLACES}
              hotspots={hotspots}
              hotspotsLoading={anomaliesLoading}
              activeKey={detour?.key ?? null}
              onPlace={goPlace}
              onHot={goHot}
            />
          )}
```

Update the file's header comment: add `?place=<id> / ?hot=<neighborhood>` to the URL contract sentence ("a detour — the camera goes, the card stays, play pauses").

- [ ] **Step 4: Typecheck + tests + build**

Run: `npx tsc -b && pnpm vitest run src/views/Last48/photoreal && pnpm vitest run src/cities/sources.test.ts`
Expected: all pass. (`sources.test.ts` must still pass: `useAnomalyBaseline` fetches keys the `live` manifest entry already declares because `Last48.tsx` calls the same hook — if the scanner flags a new key, the fix is a manifest `sources` row, never a scanner exception.)

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: exit 0; `scripts/check-entry-bundle.mjs` still passes (nothing here imports Cesium outside the photoreal chunk).

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/photoreal/immersive/Presets.tsx src/views/Last48/photoreal/immersive/RightRail.tsx src/views/Last48/photoreal/immersive/Last48Immersive.tsx
git commit -m "feat(immersive): presets in the rail — Places + Hotspots tiles, ?place=/?hot= detours pause play and keep the card"
```

---

### Task 7: The here leaves — `pointInNeighborhood.ts` + `here.ts`

**Files:**
- Create: `src/views/Last48/photoreal/immersive/pointInNeighborhood.ts`
- Create: `src/views/Last48/photoreal/immersive/pointInNeighborhood.test.ts`
- Create: `src/views/Last48/photoreal/immersive/here.ts`
- Create: `src/views/Last48/photoreal/immersive/here.test.ts`

**Interfaces:**
- Consumes: `findNeighborhood` from `@/utils/pointInPolygon`; `STREAM_WORD` (Task 2); `LAST48_DATASETS`, `DatasetId`, `NormalizedEvent` from `@/types/last48`.
- Produces: `pointInNeighborhood(lng, lat, boundaries: GeoJSON.FeatureCollection | null): string | null`; `HERE_RADIUS_M = 300`; `nearbyCounts(events, lng, lat, radiusM?): Record<DatasetId, number>`; `formatNearby(counts): string`; `acsLine(row: { medianRent?: number; pctOver65?: number } | undefined): string | null`; `cornerFromGeocode(json: unknown): string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/views/Last48/photoreal/immersive/pointInNeighborhood.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pointInNeighborhood } from './pointInNeighborhood'

const boundaries = JSON.parse(readFileSync('public/data/geo/sf-analysis-neighborhoods.geojson', 'utf8')) as GeoJSON.FeatureCollection

describe('pointInNeighborhood (Round B §3)', () => {
  it('16th & Mission is the Mission', () => {
    expect(pointInNeighborhood(-122.4194, 37.7649, boundaries)).toBe('Mission')
  })
  it('the ocean is nowhere', () => {
    expect(pointInNeighborhood(-122.6, 37.75, boundaries)).toBeNull()
  })
  it('no boundaries yet → null, not a throw', () => {
    expect(pointInNeighborhood(-122.4194, 37.7649, null)).toBeNull()
  })
})
```

```ts
// src/views/Last48/photoreal/immersive/here.test.ts
import { describe, it, expect } from 'vitest'
import { nearbyCounts, formatNearby, acsLine, cornerFromGeocode, HERE_RADIUS_M } from './here'
import type { NormalizedEvent } from '@/types/last48'

const ev = (id: string, datasetId: NormalizedEvent['datasetId'], lng: number, lat: number): NormalizedEvent =>
  ({ id, datasetId, timestamp: '', receivedAt: 1, longitude: lng, latitude: lat, raw: {} })

// 0.001° lat ≈ 111 m; 0.003° ≈ 334 m (outside 300).
const HERE = { lng: -122.42, lat: 37.76 }
const EVENTS = [
  ev('a', '911-realtime', -122.42, 37.761),
  ev('b', '911-realtime', -122.4205, 37.7605),
  ev('c', 'fire-ems-dispatch', -122.42, 37.759),
  ev('d', '311-cases', -122.42, 37.763),          // 334 m north — out
  ev('e', '311-cases', -122.4235, 37.76),         // ≈308 m west (cos 37.76 ≈ 0.79) — out
  { ...ev('f', '311-cases', 0, 0), longitude: undefined, latitude: undefined },
]

describe('nearbyCounts / formatNearby (Round B §3)', () => {
  it('counts by stream within 300 m, ignoring unlocated rows', () => {
    expect(HERE_RADIUS_M).toBe(300)
    expect(nearbyCounts(EVENTS, HERE.lng, HERE.lat)).toEqual({ '911-realtime': 2, 'fire-ems-dispatch': 1, '311-cases': 0 })
  })
  it('speaks the stream words in stream order and skips zeros', () => {
    expect(formatNearby({ '911-realtime': 4, 'fire-ems-dispatch': 1, '311-cases': 2 })).toBe('911 dispatch 4 · Fire/EMS 1 · 311 case 2')
    expect(formatNearby({ '911-realtime': 0, 'fire-ems-dispatch': 3, '311-cases': 0 })).toBe('Fire/EMS 3')
  })
  it('all zero reads "quiet here"', () => {
    expect(formatNearby({ '911-realtime': 0, 'fire-ems-dispatch': 0, '311-cases': 0 })).toBe('quiet here')
  })
})

describe('acsLine', () => {
  it('one plain line, whole dollars, whole percent', () => {
    expect(acsLine({ medianRent: 2339.6, pctOver65: 18.4 })).toBe('Median rent $2,340 · 18% over 65')
  })
  it('omits a missing half; null when both are missing', () => {
    expect(acsLine({ medianRent: 2100 })).toBe('Median rent $2,100')
    expect(acsLine({ pctOver65: 9.6 })).toBe('10% over 65')
    expect(acsLine({})).toBeNull()
    expect(acsLine(undefined)).toBeNull()
  })
})

describe('cornerFromGeocode', () => {
  it('reads the first feature’s name from a Mapbox v6 reverse response', () => {
    const json = { features: [{ properties: { name: '445 Minna Street', full_address: '445 Minna Street, San Francisco, California 94103, United States' } }] }
    expect(cornerFromGeocode(json)).toBe('near 445 Minna Street')
  })
  it('anything else → null (the row is omitted)', () => {
    expect(cornerFromGeocode({ features: [] })).toBeNull()
    expect(cornerFromGeocode({ features: [{ properties: {} }] })).toBeNull()
    expect(cornerFromGeocode(null)).toBeNull()
    expect(cornerFromGeocode('nope')).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/pointInNeighborhood.test.ts src/views/Last48/photoreal/immersive/here.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the two leaves**

```ts
// src/views/Last48/photoreal/immersive/pointInNeighborhood.ts
//
// Which SF Analysis Neighborhood a clicked point is in (Round B §3). A thin
// honest wrapper over the shared ray-cast: the shared helper answers
// 'Unknown' for the ocean, and a reading must not print that word as if it
// were a place — here it is null and the row is omitted.
import { findNeighborhood } from '@/utils/pointInPolygon'

export function pointInNeighborhood(lng: number, lat: number, boundaries: GeoJSON.FeatureCollection | null): string | null {
  if (!boundaries) return null
  const name = findNeighborhood(lng, lat, boundaries)
  return name === 'Unknown' ? null : name
}
```

```ts
// src/views/Last48/photoreal/immersive/here.ts
//
// The "here" reading's pure parts (Round B §3): what the last 48 hours
// held within 300 m of a clicked point, one line of ACS context for its
// neighborhood, and the corner the geocoder names. Cheap by construction:
// the events are already in memory, the ACS row is the committed JSON, and
// the geocoder's answer is one string.
import { LAST48_DATASETS, type DatasetId, type NormalizedEvent } from '@/types/last48'
import { STREAM_WORD } from './streamWords'

export const HERE_RADIUS_M = 300
const DEG_LAT_M = 111_320

/** Counts by stream within `radiusM` of the point. Equirectangular at the
 *  point's own latitude — exact enough at 300 m. Unlocated rows never count. */
export function nearbyCounts(
  events: readonly NormalizedEvent[], lng: number, lat: number, radiusM: number = HERE_RADIUS_M,
): Record<DatasetId, number> {
  const out = Object.fromEntries(LAST48_DATASETS.map((id) => [id, 0])) as Record<DatasetId, number>
  const kx = Math.cos(lat * Math.PI / 180)
  const r2 = (radiusM / DEG_LAT_M) ** 2
  for (const e of events) {
    if (e.longitude == null || e.latitude == null) continue
    const dx = (e.longitude - lng) * kx, dy = e.latitude - lat
    if (dx * dx + dy * dy <= r2 && e.datasetId in out) out[e.datasetId] += 1
  }
  return out
}

/** `911 dispatch 4 · Fire/EMS 1 · 311 case 2`, zeros skipped; all zero →
 *  `quiet here` (absence stated, never a blank). */
export function formatNearby(counts: Record<DatasetId, number>): string {
  const parts = LAST48_DATASETS.filter((id) => counts[id] > 0).map((id) => `${STREAM_WORD[id]} ${counts[id]}`)
  return parts.length ? parts.join(' · ') : 'quiet here'
}

/** `Median rent $2,340 · 18% over 65` from the committed ACS neighborhood row. */
export function acsLine(row: { medianRent?: number; pctOver65?: number } | undefined): string | null {
  if (!row) return null
  const parts: string[] = []
  if (row.medianRent != null && Number.isFinite(row.medianRent)) parts.push(`Median rent $${Math.round(row.medianRent).toLocaleString('en-US')}`)
  if (row.pctOver65 != null && Number.isFinite(row.pctOver65)) parts.push(`${Math.round(row.pctOver65)}% over 65`)
  return parts.length ? parts.join(' · ') : null
}

/** The first feature's `properties.name` from a Mapbox Geocoding v6 reverse
 *  response, as `near 445 Minna Street`. Anything malformed → null. */
export function cornerFromGeocode(json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const features = (json as { features?: unknown }).features
  if (!Array.isArray(features) || features.length === 0) return null
  const props = (features[0] as { properties?: { name?: unknown } })?.properties
  const name = props?.name
  return typeof name === 'string' && name.trim() ? `near ${name.trim()}` : null
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run src/views/Last48/photoreal/immersive/pointInNeighborhood.test.ts src/views/Last48/photoreal/immersive/here.test.ts`
Expected: PASS (3 + 7). If the Mission fixture point lands in a neighbour, probe with `node -e` against the GeoJSON and move the point to the block of 16th & Mission (`-122.4194, 37.7649` is the BART plaza) — fix the fixture, not the helper.

- [ ] **Step 5: Commit**

```bash
git add src/views/Last48/photoreal/immersive/pointInNeighborhood.ts src/views/Last48/photoreal/immersive/pointInNeighborhood.test.ts src/views/Last48/photoreal/immersive/here.ts src/views/Last48/photoreal/immersive/here.test.ts
git commit -m "feat(immersive): here leaves — point→neighborhood, 300 m stream counts, ACS line, corner from geocode"
```

---

### Task 8: The here card — hook, strip cell, probe beacon, click wiring

**Files:**
- Create: `src/views/Last48/photoreal/immersive/useHereCard.ts`
- Modify: `src/views/Last48/photoreal/immersive/TelemetryStrip.tsx`
- Modify: `src/views/Last48/photoreal/immersive/Beacon.tsx`
- Modify: `src/views/Last48/photoreal/immersive/ImmersiveScene.tsx`
- Modify: `src/views/Last48/photoreal/immersive/Last48Immersive.tsx`

**Interfaces:**
- Consumes: Task 7's leaves; `useNeighborhoodBoundaries` from `@/hooks/useNeighborhoodBoundaries` (`{ boundaries }`); `useCensusData` from `@/hooks/useCensusData` (`{ neighborhoods }`, rows `{ name, medianRent?, pctOver65? }`).
- Produces: `interface HerePoint { lng: number; lat: number }`; `interface HereReading { neighborhood: string | null; corner: string | null; nearby: string; acs: string | null }`; `useHereCard(point: HerePoint | null, events): HereReading | null`; `TelemetryStrip` props `here: HereReading | null`, `onCloseHere: () => void`; `Beacon` props become `{ viewer, tileset, lng, lat, color, variant?: 'hero' | 'probe' }`; `ImmersiveScene` prop `probe: HerePoint | null`.

- [ ] **Step 1: The hook**

```ts
// src/views/Last48/photoreal/immersive/useHereCard.ts
//
// Assembles the "here" reading for a clicked point (Round B §3). Three of
// the four rows are synchronous from data already in memory; the fourth —
// the nearest corner — is ONE Mapbox reverse-geocode per click, aborted if
// the point changes first, and simply omitted on any failure (no token, no
// network, a 4xx). Nothing here is cached: a reader who clicks the same
// spot twice has asked twice, and one request a click is the budget.
import { useEffect, useMemo, useState } from 'react'
import type { NormalizedEvent } from '@/types/last48'
import { useNeighborhoodBoundaries } from '@/hooks/useNeighborhoodBoundaries'
import { useCensusData } from '@/hooks/useCensusData'
import { pointInNeighborhood } from './pointInNeighborhood'
import { nearbyCounts, formatNearby, acsLine, cornerFromGeocode } from './here'

export interface HerePoint { lng: number; lat: number }

export interface HereReading {
  neighborhood: string | null
  /** `near 445 Minna Street`, or null while loading / on failure. */
  corner: string | null
  /** `911 dispatch 4 · Fire/EMS 1 · 311 case 2` or `quiet here`. */
  nearby: string
  /** `Median rent $2,340 · 18% over 65`, or null when the row is missing. */
  acs: string | null
}

const GEOCODE = 'https://api.mapbox.com/search/geocode/v6/reverse'

export function useHereCard(point: HerePoint | null, events: readonly NormalizedEvent[]): HereReading | null {
  const { boundaries } = useNeighborhoodBoundaries()
  const { neighborhoods } = useCensusData()
  const [corner, setCorner] = useState<string | null>(null)

  useEffect(() => {
    setCorner(null)
    if (!point) return
    const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined
    if (!token) return
    const ac = new AbortController()
    const url = new URL(GEOCODE)
    url.searchParams.set('longitude', point.lng.toFixed(5))
    url.searchParams.set('latitude', point.lat.toFixed(5))
    url.searchParams.set('types', 'address,street')
    url.searchParams.set('limit', '1')
    url.searchParams.set('access_token', token)
    fetch(url, { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!ac.signal.aborted) setCorner(cornerFromGeocode(j)) })
      .catch(() => { /* omitted row — the reading never shows an error */ })
    return () => ac.abort()
  }, [point])

  return useMemo(() => {
    if (!point) return null
    const neighborhood = pointInNeighborhood(point.lng, point.lat, boundaries)
    const row = neighborhood ? neighborhoods.find((n) => n.name === neighborhood) : undefined
    return {
      neighborhood,
      corner,
      nearby: formatNearby(nearbyCounts(events, point.lng, point.lat)),
      acs: acsLine(row),
    }
  }, [point, boundaries, neighborhoods, events, corner])
}
```

- [ ] **Step 2: The strip's left cell**

In `TelemetryStrip.tsx`:

Add to `Props`:
```ts
  /** Round B §3: the here reading, when a ground click opened one. Replaces
   *  the San Francisco · Latitude · Longitude cell while open. */
  here: HereReading | null
  onCloseHere: () => void
```
with `import type { HereReading } from './useHereCard'`. Destructure both.

Change the outer div's classes from `h-9 flex items-center gap-6 px-4 overflow-hidden` to `min-h-9 py-1 flex flex-wrap items-center gap-x-6 gap-y-1 px-4` (a reading may wrap to two lines; nothing else changes height because every cell is one line).

Replace the first `<div className={GROUP}>` block with:

```tsx
      {here ? (
        // The here reading: neighborhood as the leading pill (it is the
        // answer to "where is this"), then the corner, the counts, the ACS
        // line — each omitted when unknown, never printed as a dash.
        <div className={`${GROUP} pointer-events-auto flex-wrap gap-y-1`} role="status" aria-live="polite">
          {here.neighborhood && <span className={PILL} style={PILL_STYLE}>{here.neighborhood}</span>}
          {here.corner && (<><Dot /><span>{here.corner}</span></>)}
          <Dot />
          <span>{here.nearby}</span>
          {here.acs && (<><Dot /><span>{here.acs}</span></>)}
          <button
            type="button" onClick={onCloseHere} aria-label="Close" title="Close (Escape)"
            className="ml-1 h-5 w-5 rounded-full text-paper-400 hover:text-paper-100 hover:bg-paper-300/15 leading-none"
          >×</button>
        </div>
      ) : (
        <div className={GROUP}>
          <span className="hidden xl:inline">San Francisco</span>
          <span className="hidden xl:inline"><Dot /></span>
          {lat != null && lng != null ? (
            <>
              <Cell label="Latitude" value={formatLat(lat)} pill />
              <Dot />
              <Cell label="Longitude" value={formatLng(lng)} pill />
            </>
          ) : (
            <span className="text-paper-400">Finding the ground…</span>
          )}
        </div>
      )}
```

Update the header comment: one sentence — "Round B: when the reader clicks open ground the left cell becomes the HERE reading (neighborhood, corner, the last 48 hours within 300 m, one ACS line) — still a reading, not a control; the ✕ is its only button."

- [ ] **Step 3: The probe beacon**

In `Beacon.tsx` change the props and the geometry to be variant-aware:

```ts
interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset | null
  lng: number
  lat: number
  /** The stream pigment — DATASET_META[datasetId].color — or, for a probe,
   *  the paper tone. */
  color: string
  /** `hero` (default): the cased pigment ring with swirl and breath over the
   *  active stop. `probe` (Round B §3): a smaller, stiller paper ring over a
   *  clicked point — "this is what the here card is about". */
  variant?: 'hero' | 'probe'
}
```

Make the sizes a table:

```ts
const GEOM = {
  hero:  { SIZE: 56, PIGMENT: 52, SWIRL: 44, INNER: 44, CORE: 10, ringPx: 3 },
  probe: { SIZE: 36, PIGMENT: 32, SWIRL: 0,  INNER: 26, CORE: 6,  ringPx: 2 },
} as const
```

Delete the module-level `SIZE/PIGMENT/SWIRL/INNER/CORE` constants and the module-level `ring` helper. In the component: `const variant = props.variant ?? 'hero'`, `const g = GEOM[variant]`, `const ring = (d: number) => (g.SIZE - d) / 2`, and use `g.SIZE` etc. throughout (the `translate(...)` in `tick`, the wrapper's width/height, every `inset`). The effect keys on `[viewer, tileset, lng, lat]` and builds `carto`/`anchor` from the props (delete the `event` null checks; the component no longer takes an event). Render differences for `probe`: skip the swirl div entirely (`g.SWIRL > 0 &&`), drop the `beacon-ring` class from the pigment ring (no breath), halve the pigment ring's bloom (`0 0 8px 2px ${color}`), and set the wrapper's `opacity` to `0.85`.

In `ImmersiveScene.tsx`:
- add prop `/** Round B §3: the here card's point — a small paper ring marks it. */ probe: HerePoint | null` with `import type { HerePoint } from './useHereCard'`
- change the hero `<Beacon …>` call to `lng={props.active.longitude!} lat={props.active.latitude!}` (the guard `props.active.longitude != null && props.active.latitude != null` joins the existing condition) and add beside it:

```tsx
      {viewer && props.probe && (
        <Beacon viewer={viewer} tileset={tileset} lng={props.probe.lng} lat={props.probe.lat} color="#f5ecd9" variant="probe" />
      )}
```

- [ ] **Step 4: The page — click, close, Escape**

In `Last48Immersive.tsx`:

Imports: `import { useHereCard, type HerePoint } from './useHereCard'`.

State + hook (after the preset block):

```ts
  // ── The "here" card (Round B §3) ──────────────────────────────────────
  const [herePoint, setHerePoint] = useState<HerePoint | null>(null)
  const here = useHereCard(herePoint, events)
  const closeHere = useCallback(() => setHerePoint(null), [])
```

Rename `clickNearest` to `clickGround` and make the miss open the reading (ruling 1: a second ground click MOVES it):

```ts
  // A click on the ground: within NEAREST_M of a stop in the pass it snaps
  // there (Round A); further away it opens the "here" reading for that point
  // (Round B §3). A jump closes any open reading.
  const clickGround = useCallback((lng: number, lat: number) => {
    let bestId: string | null = null
    let bestD = Number.POSITIVE_INFINITY
    for (const id of order) {
      const e = byId.get(id)
      if (!e || e.longitude == null || e.latitude == null) continue
      const dx = (e.longitude - lng) * LNG_FACTOR, dy = e.latitude - lat
      const d = dx * dx + dy * dy
      if (d < bestD) { bestD = d; bestId = id }
    }
    if (bestId && Math.sqrt(bestD) * DEG_LAT_M <= NEAREST_M) { setHerePoint(null); jump(bestId); return }
    setHerePoint({ lng, lat })
  }, [order, byId, jump])
```

`jump` closes the reading: `const jump = useCallback((id: string) => { setHerePoint(null); setParams({ event: id, place: null, hot: null }) }, [setParams])` (declare `herePoint` state ABOVE `jump`, or move `setHerePoint` into a ref — simplest: declare the state before `jump`).

Keys: `case 'Escape': if (herePoint) closeHere(); else if (!overlayOn) setOverlayOn(true); else leave(); break` and add `herePoint, closeHere` to the effect's deps.

Scene: `onMapClick={clickGround}` and `probe={herePoint}`. Strip: `here={here}` and `onCloseHere={closeHere}`.

- [ ] **Step 5: Typecheck + tests + build**

Run: `npx tsc -b && pnpm vitest run src/views/Last48/photoreal src/cities/sources.test.ts`
Expected: pass. (The geocoder is a plain `fetch`, not a registry dataset — the sources scanner does not see it and needs no row.)

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/views/Last48/photoreal/immersive/useHereCard.ts src/views/Last48/photoreal/immersive/TelemetryStrip.tsx src/views/Last48/photoreal/immersive/Beacon.tsx src/views/Last48/photoreal/immersive/ImmersiveScene.tsx src/views/Last48/photoreal/immersive/Last48Immersive.tsx
git commit -m "feat(immersive): the here card — ground click beyond 150 m opens neighborhood · corner · 48 h counts · ACS in the strip, with a probe beacon"
```

---

### Task 9: Docs, the full gate, and the walk checklist

**Files:**
- Modify: `CLAUDE.md` (the Photoreal bullet under "The Last 48")
- Modify: `docs/superpowers/specs/2026-09-20-immersive-round-b-design.md` (append §8)

- [ ] **Step 1: The full gate**

Run: `pnpm test && npx tsc -b && ~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: every suite green, exit 0.

- [ ] **Step 2: CLAUDE.md**

In the Photoreal bullet, after the sentence ending `…Round B spec (presets, the here card, time-to-next stripe): \`docs/superpowers/specs/2026-09-20-immersive-round-b-design.md\`.` append:

```
**Round B (Sept. 2026):** the rail's middle holds PRESETS (`immersive/Presets.tsx`) — authored Places (`places.ts`, 8, test-pinned inside SF, captions ≤ 40 chars) and computed Hotspots (`hotspots.ts`: the SAME anomaly engine as `/live`/Pulse — Stouffer combine, z ≥ 1.5, per-stream `FRESH_MAX_MS` gate, fly-to = the neighborhood's EVENT centroid at 700 m; never a raw z on screen). A preset is a DETOUR (`detour.ts` → `useDreamDirector`'s `detour` input): the camera goes, the active card and `?event=` stay, play pauses, `?place=`/`?hot=` record it and any stop change clears it. A ground click beyond 150 m opens the HERE reading in the telemetry strip's left cell (`useHereCard`: local point-in-polygon, ONE Mapbox v6 reverse geocode per click — `types=address,street`, v6 has no `poi` — omitted on failure, 48 h counts within 300 m from the loaded events, one ACS line from the committed neighborhood JSON) with a `variant="probe"` Beacon; a second ground click MOVES it. Time to next stop is ONE clock: `useAutoAdvance().remainingMs()` feeds the band's `next in 48 s`, the active card's 3 px top-edge stripe and the rail's rule — a hold freezes all three.
```

- [ ] **Step 3: Spec §8 "As built"**

Append to the Round B spec:

```markdown
## 8. As built (2026-09-2x)

Plan: `docs/superpowers/plans/2026-09-20-immersive-round-b.md`. Rulings made while planning, all recorded there: (1) a second open-ground click MOVES the here card rather than closing it; (2) Mapbox Geocoding v6 reverse has no `poi` type, so the corner row is `types=address,street` rendered as "near 445 Minna Street"; (3) hotspot camera heading 20 / pitch −35 / range 700, and a hotspot with no located events is skipped; (4) the rail's dwell rule now reads the same `remainingMs()` as the stripe and the figure, which also fixes the rule jumping after a hold; (5) a stale `?place=` clears at once, a stale `?hot=` clears once the engine has read. Files: `nextIn.ts`, `streamWords.ts`, `places.ts`, `hotspots.ts`, `detour.ts`, `Presets.tsx`, `pointInNeighborhood.ts`, `here.ts`, `useHereCard.ts`, plus `useAutoAdvance`, `useDreamDirector`, `ImmersiveScene`, `Beacon`, `TelemetryStrip`, `LowerThird`, `ImmersiveCard`, `RightRail`, `Last48Immersive`.
```

- [ ] **Step 4: Commit and push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-20-immersive-round-b-design.md
git commit -m "docs: immersive Round B as built (CLAUDE.md Photoreal bullet, spec §8)"
git push -u origin feat/immersive-round-b
```

- [ ] **Step 5: The walk (controller + Jesse, in Chrome; tab FOREGROUNDED, `document.hidden === false`)**

On the Tarmac dev server at `http://localhost:5173/live/immersive`:

1. **Places** — click Coit Tower: an 18 s flight, the active card unchanged, the URL gains `?place=coit-tower`, the Play row reads "Play" (paused), the tile wears ochre. Press `→`: the URL loses `?place=`, the camera flies to the next stop. "More places" shows four more; "Fewer places" folds them.
2. **Hotspots** — the group shows tiles only when `/pulse` shows a neighborhood volume card at "above usual" or higher; otherwise "Nothing unusual right now". Click one: `?hot=<Neighborhood>`, the camera lands on the neighborhood's events at ~700 m, play paused.
3. **Here card** — click open ground far from any stop: the strip's left cell shows `[Neighborhood] · near … · 911 dispatch n · … · Median rent $… · …% over 65` and a small paper ring marks the point. Open DevTools → Network → Offline, click again: the corner row is absent, everything else present. `Escape` closes the reading first; a second `Escape` hides the panels; a third leaves.
4. **Time to next stop** — press Space: the active card's top edge fills in the stream pigment over 75 s, the band reads `· next in 74 s` counting down once a second, the rail's rule moves in step. Press `H`: all three freeze for 10 s and resume together. During the next flight the band reads `next in —` and the stripe is gone.
5. **Nothing reads "live"**, nothing shows a clock. The dark grade still applies.

Record any finding as a Task-10 fix round in the SDD ledger; none of the walk is a subagent's job.

---

## Self-review

**Spec coverage.** §2 presets: Task 3 (Places leaf), 4 (Hotspots selector), 5 (detour + director), 6 (component, rail slot, URL, pause, resume). §3 here card: Task 7 (leaves), 8 (hook, strip cell, probe beacon, click, Escape). §4 time to next: Task 1 (clock + figure), 2 (stripe, band, rail off one number). §5 copy rules: pinned in the Places test (captions, no "live"), the Hotspots test (no digits in the caption), and the Global Constraints. §6 tests: `places.test.ts`, `pointInNeighborhood.test.ts`, `hotspots.test.ts`, `nextIn.test.ts` — all present, plus `detour.test.ts` and `here.test.ts`; the walk is Task 9 step 5. §7 out of scope: no thumbnails (the 40 px colour block is the slot), no Oakland, no Google Places call.

**Placeholders.** None: every code step is complete code; no "similar to Task N".

**Type consistency.** `DetourTarget.key` (`place:<id>` / `hot:<nh>`) is what `Presets.activeKey`, `detour?.key` in the page and `sameDetour` all read. `useAutoAdvance` returns `{ remainingMs }` (Task 1) and Task 2 destructures exactly that. `Beacon` takes `lng/lat/variant` (Task 8) and both call sites in `ImmersiveScene` pass them. `STREAM_WORD` (Task 2) is the one table `LowerThird` and `here.ts` read. `HereReading`/`HerePoint` are exported from `useHereCard.ts` and imported by `TelemetryStrip` and `ImmersiveScene`. `HOTSPOT_RANGE_M` lives in `hotspots.ts` and `detour.ts` imports it from there.
