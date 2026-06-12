# The Last 48 — Ambient Mode (DRIFT) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An idle "DRIFT" behavior for The Last 48: a toggle arms a slow pitched map orbit while the view auto-walks the freshest events (real rail selection, real detail card, camera re-centers mid-orbit), until untoggled or any user input ramps it to a stop.

**Architecture:** A null-rendering `AmbientConductor` inside `Last48UnifiedView`'s `mapOverlay` (same pattern as the existing `DeepLinkLander`) hosts a 4-phase state machine (`off → ramp-in → on → ramp-out`). `useAmbientDirector` is a single-writer camera RAF loop (bearing drift + screen-space feedback controller easing toward a published `CameraTarget`). `useAmbientTour` owns *what* is selected (pass snapshots, id-cursor, dwell timers) and publishes targets; pure pass logic lives in `tour.ts` with vitest tests. `?ambient=1` is the state (URL-as-state, view convention).

**Tech Stack:** React 18, TypeScript, Mapbox GL JS v3 (`jumpTo`, `project`/`unproject`), vitest (already configured: `pnpm test`).

**Spec:** `docs/superpowers/specs/2026-06-12-last48-ambient-drift-design.md`

**Delivery: two stacked PRs.** PR A (Tasks 1–5): toggle + director — DRIFT orbits citywide, no per-event visits; camera feel is tuned here. PR B (Tasks 6–8): the tour. Branches `last48-ambient-1`, `last48-ambient-2` (based on `-1`).

**Conventions that bind every task** (from CLAUDE.md / memory):
- Verify with full `pnpm build` before any push — `tsc -b` alone can false-pass on incremental cache.
- Never run `pnpm dev` via Bash — the dev server is owned by tarmac MCP; visual smoke happens there or on the Vercel PR preview.
- `unset GITHUB_TOKEN` before any `gh` command.
- Squash-merge; PR bodies end with the Claude Code attribution line.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/views/Last48/ambient/AmbientToggle.tsx` | Create | DRIFT pill + fullscreen button (header cluster) |
| `src/views/Last48/ambient/useAmbientDirector.ts` | Create | Camera RAF loop: bearing drift, feedback-controller centering, ramps |
| `src/views/Last48/ambient/AmbientConductor.tsx` | Create | Phase state machine, input-exit listener, tour↔director wiring; renders null |
| `src/views/Last48/ambient/tour.ts` | Create | Pure pass/cursor logic |
| `src/views/Last48/ambient/tour.test.ts` | Create | Vitest tests for tour.ts |
| `src/views/Last48/ambient/useAmbientTour.ts` | Create | Dwell/breath timers, pass orchestration, visibility pause |
| `src/views/Last48/Last48.tsx` | Modify | Parse `?ambient=`, render toggle, pass props down |
| `src/views/Last48/modes/Last48UnifiedView.tsx` | Modify | Accept ambient props, mount `AmbientConductor` in `mapOverlay` |

Existing pieces reused untouched: `cameraPadding.ts` (`obstructedRightBand` — PR #83), selection → `?event=` mirroring (already `replace: true`), `FlowRail` highlight + `scrollIntoView`, `Last48EventCard`, `FlowSelectedRadar`.

---

## PR A — director + chrome (branch `last48-ambient-1`)

### Task 1: `AmbientToggle` component

**Files:**
- Create: `src/views/Last48/ambient/AmbientToggle.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/views/Last48/ambient/AmbientToggle.tsx
//
// DRIFT pill — arms/disarms ambient mode — plus a fullscreen button.
// Sits in the Last 48 header cluster next to LayerControls. Visual idiom
// matches LayerControls' FLOW toggle (mono uppercase pill, filled when
// active). Hidden entirely under prefers-reduced-motion: the feature is
// motion, so it must not exist for users who opted out of motion.
//
// data-ambient-toggle marks the subtree so AmbientConductor's exit-on-input
// listener can ignore clicks on the control itself (otherwise pressing the
// pill to turn DRIFT off would first trigger the "any input exits" path and
// the toggle would read stale state).

import { useSyncExternalStore } from 'react'

interface Props {
  on: boolean
  /** Disabled while streams are still booting or no events have geo. */
  disabled: boolean
  onToggle: (next: boolean) => void
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(cb: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export default function AmbientToggle({ on, disabled, onToggle }: Props) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion)
  if (reducedMotion) return null

  return (
    <div className="flex items-center gap-1" data-ambient-toggle>
      <button
        onClick={() => onToggle(!on)}
        disabled={disabled}
        aria-pressed={on}
        title={
          disabled
            ? 'Drift starts once events finish loading'
            : 'Ambient drift — slow orbit touring the freshest events. Any input stops it.'
        }
        className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
          on
            ? 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
            : disabled
              ? 'text-paper-400 dark:text-paper-700 cursor-not-allowed'
              : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
      >
        {on ? '◉ drift' : '○ drift'}
      </button>
      <button
        onClick={() => {
          if (document.fullscreenElement) void document.exitFullscreen()
          else void document.documentElement.requestFullscreen()
        }}
        title="Fullscreen — pairs with drift for an unattended display"
        className="px-2 py-1.5 rounded-md text-[12px] font-mono text-paper-500 dark:text-paper-600 hover:text-paper-300 transition-colors"
        aria-label="Toggle fullscreen"
      >
        ⛶
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors (component not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git checkout -b last48-ambient-1
git add src/views/Last48/ambient/AmbientToggle.tsx
git commit -m "feat(last48): AmbientToggle — DRIFT pill + fullscreen button (not yet wired)"
```

### Task 2: `useAmbientDirector` — the camera

**Files:**
- Create: `src/views/Last48/ambient/useAmbientDirector.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/views/Last48/ambient/useAmbientDirector.ts
//
// Single-writer camera for ambient mode. While phase ≠ 'off', ONE RAF loop
// owns the camera completely — nothing else (including Mapbox's own
// flyTo/easeTo animations) may write to it. This is the fix for the
// orbit-vs-recenter fight: bearing increments every frame, and the center
// eases toward the published target THROUGH the rotation instead of via a
// rival animation.
//
// Centering is a screen-space feedback controller: each frame, project the
// target, measure its pixel error from the desired on-screen landing point
// (the visible-map center, left of the detail card's band — see
// cameraPadding.ts), and move the camera center by a smoothed fraction of
// that error. project/unproject account for bearing/pitch/zoom implicitly,
// so the dot homes to its landing point no matter how the orbit has the
// map rotated. (A fixed lng/lat target computed once would drift around the
// screen as bearing advances.)
//
// Ramps: ramp-in scales orbit speed 0→1 and pitch 0→AMBIENT_PITCH over
// RAMP_IN_MS; ramp-out reverses both over RAMP_OUT_MS and — critically —
// stops writing center/zoom, so a user's interrupting drag isn't fought
// during the decelerating second.

import { useEffect, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'
import { obstructedRightBand } from '../cameraPadding'

export type AmbientPhase = 'off' | 'ramp-in' | 'on' | 'ramp-out'

export interface CameraTarget {
  lng: number
  lat: number
  zoom: number
  /** Visit register: land the point clear of the detail card's band. */
  avoidCard: boolean
}

// Geographic center of SF — the resting/citywide register.
export const CITYWIDE_TARGET: CameraTarget = {
  lng: -122.4376,
  lat: 37.7577,
  zoom: 11.5,
  avoidCard: false,
}

// Tuning constants — adjust by feel on the dev server; these are the
// spec's starting points, not contracts.
const ORBIT_DEG_PER_S = 1.2     // full rotation ≈ 5 min
const AMBIENT_PITCH = 50        // degrees
const RAMP_IN_MS = 2000
const RAMP_OUT_MS = 1000
const CENTER_TAU_MS = 900       // center smoothing time-constant
const ZOOM_TAU_MS = 1200        // zoom smoothing time-constant
const MAX_FRAME_DT_MS = 64      // clamp dt across tab-hidden gaps

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export function useAmbientDirector(opts: {
  map: mapboxgl.Map | null
  phase: AmbientPhase
  target: CameraTarget
  onRampInDone: () => void
  onRampOutDone: () => void
}): void {
  const { map, phase } = opts

  // Loop-read refs — the RAF closure reads these so prop changes never
  // restart the loop (same pattern as useChronologicalReveal).
  const targetRef = useRef(opts.target)
  targetRef.current = opts.target
  const onRampInDoneRef = useRef(opts.onRampInDone)
  onRampInDoneRef.current = opts.onRampInDone
  const onRampOutDoneRef = useRef(opts.onRampOutDone)
  onRampOutDoneRef.current = opts.onRampOutDone
  const phaseRef = useRef(phase)

  // Camera scalars owned by the loop.
  const bearingRef = useRef(0)
  const zoomRef = useRef(CITYWIDE_TARGET.zoom)
  const phaseStartRef = useRef(0)
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef(0)

  // Phase transitions: stamp the entry time; seed scalars from the live
  // camera on ramp-in so the orbit picks up wherever the user left the map.
  useEffect(() => {
    if (phase === phaseRef.current) return
    phaseRef.current = phase
    phaseStartRef.current = performance.now()
    if (phase === 'ramp-in' && map) {
      bearingRef.current = map.getBearing()
      zoomRef.current = map.getZoom()
    }
  }, [phase, map])

  useEffect(() => {
    if (!map || phase === 'off') return

    lastTsRef.current = 0

    const tick = (now: number) => {
      const m = map
      const ph = phaseRef.current
      if (ph === 'off') return

      const dt = lastTsRef.current === 0 ? 16 : Math.min(MAX_FRAME_DT_MS, now - lastTsRef.current)
      lastTsRef.current = now

      let speedScale = 1
      let pitch = AMBIENT_PITCH

      if (ph === 'ramp-in') {
        const p = clamp01((now - phaseStartRef.current) / RAMP_IN_MS)
        speedScale = p
        pitch = AMBIENT_PITCH * easeOutCubic(p)
        if (p >= 1) onRampInDoneRef.current()
      } else if (ph === 'ramp-out') {
        const p = clamp01((now - phaseStartRef.current) / RAMP_OUT_MS)
        speedScale = 1 - p
        pitch = AMBIENT_PITCH * (1 - easeOutCubic(p))
        if (p >= 1) {
          onRampOutDoneRef.current()
          return // loop ends; phase flips to 'off' via the conductor
        }
      }

      bearingRef.current = (bearingRef.current + (ORBIT_DEG_PER_S * speedScale * dt) / 1000) % 360

      if (ph === 'ramp-out') {
        // Decelerate rotation + relax pitch only. Center/zoom are released
        // immediately so an interrupting drag isn't fought.
        m.jumpTo({ bearing: bearingRef.current, pitch })
      } else {
        const target = targetRef.current

        const kz = 1 - Math.exp(-dt / ZOOM_TAU_MS)
        zoomRef.current += (target.zoom - zoomRef.current) * kz

        // Screen-space feedback: nudge the camera center so the target's
        // projection homes toward the desired landing point.
        const container = m.getContainer()
        const band = target.avoidCard ? obstructedRightBand(m) : 0
        const desiredX = (container.clientWidth - band) / 2
        const desiredY = container.clientHeight / 2
        const projected = m.project([target.lng, target.lat])
        const kc = 1 - Math.exp(-dt / CENTER_TAU_MS)
        const centerPx = m.project(m.getCenter())
        const nextCenter = m.unproject([
          centerPx.x + (projected.x - desiredX) * kc,
          centerPx.y + (projected.y - desiredY) * kc,
        ])

        m.jumpTo({
          center: nextCenter,
          zoom: zoomRef.current,
          bearing: bearingRef.current,
          pitch,
        })
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = undefined
      }
    }
  }, [map, phase])
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/Last48/ambient/useAmbientDirector.ts
git commit -m "feat(last48): useAmbientDirector — single-writer orbit camera with screen-space target homing"
```

### Task 3: `AmbientConductor` (orbit-only for PR A)

**Files:**
- Create: `src/views/Last48/ambient/AmbientConductor.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/views/Last48/ambient/AmbientConductor.tsx
//
// Null-rendering orchestrator for ambient mode — the same "side-effect
// component inside mapOverlay" pattern as Last48UnifiedView's
// DeepLinkLander. Owns the phase state machine and the exit-on-input
// listener. PR A: orbits citywide only. PR B adds the tour (per-event
// visits) on top.
//
// Exit semantics: ANY user input (pointerdown / wheel / keydown /
// touchstart) ramps out — EXCEPT input inside [data-ambient-toggle], which
// must reach the toggle untranslated so it can disarm cleanly. Ramp-out
// completes → onExit() flips ?ambient= off → phase returns to 'off'.

import { useEffect, useRef, useState } from 'react'
import type mapboxgl from 'mapbox-gl'
import {
  useAmbientDirector,
  CITYWIDE_TARGET,
  type AmbientPhase,
  type CameraTarget,
} from './useAmbientDirector'

interface Props {
  map: mapboxgl.Map | null
  /** Armed state from ?ambient=1 (URL is the source of truth). */
  ambientOn: boolean
  /** Streams booted and at least one event available — gate for ramp-in. */
  ready: boolean
  /** Flip ?ambient= off (called when ramp-out completes). */
  onExit: () => void
}

export default function AmbientConductor({ map, ambientOn, ready, onExit }: Props) {
  const [phase, setPhase] = useState<AmbientPhase>('off')
  const [target] = useState<CameraTarget>(CITYWIDE_TARGET) // PR B: setTarget from the tour

  // Arm / disarm. Reduced-motion users never see the toggle, but guard
  // anyway in case ?ambient=1 arrives by URL.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ambientOn && ready && !reduced && phase === 'off') setPhase('ramp-in')
    if (!ambientOn && (phase === 'ramp-in' || phase === 'on')) setPhase('ramp-out')
  }, [ambientOn, ready, phase])

  const onExitRef = useRef(onExit)
  onExitRef.current = onExit

  // Exit on any user input while running.
  useEffect(() => {
    if (phase !== 'ramp-in' && phase !== 'on') return
    const exit = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-ambient-toggle]')) return
      onExitRef.current()
    }
    const opts = { capture: true } as const
    window.addEventListener('pointerdown', exit, opts)
    window.addEventListener('wheel', exit, opts)
    window.addEventListener('keydown', exit, opts)
    window.addEventListener('touchstart', exit, opts)
    return () => {
      window.removeEventListener('pointerdown', exit, opts)
      window.removeEventListener('wheel', exit, opts)
      window.removeEventListener('keydown', exit, opts)
      window.removeEventListener('touchstart', exit, opts)
    }
  }, [phase])

  useAmbientDirector({
    map,
    phase,
    target,
    onRampInDone: () => setPhase('on'),
    onRampOutDone: () => {
      setPhase('off')
      onExitRef.current() // clears ?ambient=1; toggle reads as off
    },
  })

  return null
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/Last48/ambient/AmbientConductor.tsx
git commit -m "feat(last48): AmbientConductor — phase machine + exit-on-input (orbit-only)"
```

### Task 4: Wire into `Last48.tsx` and `Last48UnifiedView.tsx`

**Files:**
- Modify: `src/views/Last48/Last48.tsx` (param parse near the other parsers ~line 26-52; toggle render in the header cluster ~line 272-282; props at ~line 310)
- Modify: `src/views/Last48/modes/Last48UnifiedView.tsx` (props interface ~line 41; mount conductor in `mapOverlay` next to `DeepLinkLander` ~line 299)

- [ ] **Step 1: Last48.tsx — parse + state + toggle**

Add with the other imports:

```ts
import AmbientToggle from './ambient/AmbientToggle'
```

Add below `parseDatasets` (the param-parser block):

```ts
function parseAmbient(s: string | null): boolean {
  return s === '1'
}
```

Inside the component, below the `selectedEventId` line:

```ts
const ambientOn = parseAmbient(searchParams.get('ambient'))

const setAmbientOn = useCallback((next: boolean) => {
  setSearchParams((prev) => {
    const np = new URLSearchParams(prev)
    if (next) np.set('ambient', '1')
    else np.delete('ambient')
    return np
  }, { replace: true })
}, [setSearchParams])

// DRIFT is armed only once every enabled stream has fully loaded or
// terminally errored, and at least one event exists — ?ambient=1 must not
// fight the boot choreography (spec: arms AFTER the stream curtain).
const ambientReady = useMemo(
  () =>
    window48.events.length > 0 &&
    LAST48_DATASETS.every(
      (id) =>
        !datasets.includes(id) ||
        window48.fullyLoadedByDataset[id] ||
        !!window48.errorByDataset[id],
    ),
  [datasets, window48.events.length, window48.fullyLoadedByDataset, window48.errorByDataset],
)
```

In the header's right cluster, insert the toggle between `LayerControls` and `ExportButton`:

```tsx
<AmbientToggle on={ambientOn} disabled={!ambientReady} onToggle={setAmbientOn} />
```

Pass to the view (with the other props on `<Last48UnifiedView …>`):

```tsx
ambientOn={ambientOn}
ambientReady={ambientReady}
onAmbientExit={() => setAmbientOn(false)}
```

- [ ] **Step 2: Last48UnifiedView.tsx — accept props, mount conductor**

Add to the `Props` interface:

```ts
/** ?ambient=1 — DRIFT armed (URL is the source of truth). */
ambientOn: boolean
/** Streams booted + events present — ramp-in gate. */
ambientReady: boolean
/** Disarm (clears ?ambient=) — called when ramp-out completes or input exits. */
onAmbientExit: () => void
```

Destructure the three new props in the function signature. Add the import:

```ts
import AmbientConductor from '../ambient/AmbientConductor'
```

In `mapOverlay`, directly below the `<DeepLinkLander …/>` block:

```tsx
{/* ── Ambient conductor — DRIFT phase machine + camera (renders null) ── */}
<AmbientConductor
  map={map}
  ambientOn={ambientOn}
  ready={ambientReady}
  onExit={onAmbientExit}
/>
```

- [ ] **Step 3: Full build**

Run: `pnpm build`
Expected: clean build (this is the push gate, not just `tsc -b`).

- [ ] **Step 4: Visual smoke (tarmac dev server or Vercel preview after push)**

Checklist:
- `○ drift` pill appears next to the layers dropdown; disabled (dimmed) until all chips settle.
- Click → pitch eases in over ~2s, slow clockwise orbit begins, citywide framing holds.
- Any map drag / key / scroll → orbit decelerates over ~1s, pitch returns flat, pill reads `○ drift`, URL has no `?ambient`.
- Toggle off via the pill itself → same ramp-out (the `data-ambient-toggle` guard means the click reaches the pill).
- Load `/live-feeds?ambient=1` cold → boot choreography plays untouched, DRIFT ramps in only after the last stream settles.
- ⛶ enters/exits fullscreen.
- OS reduced-motion enabled → pill absent; `?ambient=1` inert.

- [ ] **Step 5: Commit + PR**

```bash
git add src/views/Last48/Last48.tsx src/views/Last48/modes/Last48UnifiedView.tsx
git commit -m "feat(last48): wire DRIFT toggle + ambient conductor (citywide orbit)"
unset GITHUB_TOKEN && git push -u origin last48-ambient-1
gh pr create --title "feat(last48): ambient DRIFT mode — phase machine + orbit camera (1/2)" --body "…spec link, what's in PR A vs PR B, manual checklist results…"
```

### Task 5: Feel-tuning pass (PR A, post-smoke)

**Files:**
- Modify: `src/views/Last48/ambient/useAmbientDirector.ts` (constants block only)

- [ ] **Step 1:** With Jesse on the preview, adjust `ORBIT_DEG_PER_S`, `AMBIENT_PITCH`, `CENTER_TAU_MS`, `ZOOM_TAU_MS`, ramp durations to taste. Commit each accepted change:

```bash
git add src/views/Last48/ambient/useAmbientDirector.ts
git commit -m "polish(last48): tune ambient camera constants from preview feel-test"
```

---

## PR B — the tour (branch `last48-ambient-2`, based on `last48-ambient-1`)

### Task 6: `tour.ts` pure logic (TDD)

**Files:**
- Create: `src/views/Last48/ambient/tour.test.ts`
- Create: `src/views/Last48/ambient/tour.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/views/Last48/ambient/tour.test.ts
import { describe, it, expect } from 'vitest'
import { buildPass, nextTourId, PASS_SIZE } from './tour'
import type { NormalizedEvent } from '@/types/last48'

function ev(p: { id: string; receivedAt: number; geo?: boolean }): NormalizedEvent {
  return {
    id: p.id,
    datasetId: '911-realtime',
    timestamp: new Date(p.receivedAt).toISOString(),
    receivedAt: p.receivedAt,
    ...(p.geo === false ? {} : { longitude: -122.4, latitude: 37.76 }),
  } as NormalizedEvent
}

describe('buildPass', () => {
  it('returns newest-first ids, capped at PASS_SIZE', () => {
    const events = Array.from({ length: PASS_SIZE + 10 }, (_, i) =>
      ev({ id: `e${i}`, receivedAt: i }))
    const pass = buildPass(events)
    expect(pass).toHaveLength(PASS_SIZE)
    expect(pass[0]).toBe(`e${PASS_SIZE + 9}`) // newest
    expect(pass[pass.length - 1]).toBe('e10')  // oldest in the pass
  })

  it('excludes events without coordinates', () => {
    const events = [
      ev({ id: 'geo', receivedAt: 2 }),
      ev({ id: 'nogeo', receivedAt: 3, geo: false }),
    ]
    expect(buildPass(events)).toEqual(['geo'])
  })

  it('returns empty for empty input', () => {
    expect(buildPass([])).toEqual([])
  })
})

describe('nextTourId', () => {
  const pass = ['a', 'b', 'c']

  it('starts at the first id when current is null', () => {
    expect(nextTourId(pass, null, new Set(pass))).toBe('a')
  })

  it('advances to the next id', () => {
    expect(nextTourId(pass, 'a', new Set(pass))).toBe('b')
  })

  it('skips ids evicted from the window', () => {
    expect(nextTourId(pass, 'a', new Set(['a', 'c']))).toBe('c')
  })

  it('returns null when the pass is exhausted', () => {
    expect(nextTourId(pass, 'c', new Set(pass))).toBeNull()
  })

  it('returns null when current id is unknown and nothing remains', () => {
    expect(nextTourId(pass, 'zzz', new Set(pass))).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/views/Last48/ambient/tour.test.ts`
Expected: FAIL — cannot resolve `./tour`.

- [ ] **Step 3: Implement**

```ts
// src/views/Last48/ambient/tour.ts
//
// Pure pass/cursor logic for the ambient tour. A "pass" is a snapshot of
// the newest PASS_SIZE geo-located visible events, toured newest-first by
// id. Id-cursor (never index): the live rail re-sorts as polls land, so an
// index cursor would skip or repeat rows; ids are immune. Mid-pass
// arrivals are picked up by the NEXT pass's snapshot (calm register — no
// preemption, per spec).

import type { NormalizedEvent } from '@/types/last48'

export const PASS_SIZE = 24

/** Snapshot the newest geo-located events as an ordered id list. */
export function buildPass(events: NormalizedEvent[], limit: number = PASS_SIZE): string[] {
  return events
    .filter((e) => e.longitude != null && e.latitude != null)
    .sort((a, b) => b.receivedAt - a.receivedAt)
    .slice(0, limit)
    .map((e) => e.id)
}

/**
 * Advance the cursor: the first id after `currentId` that still exists in
 * the window. null currentId starts the pass; null return = exhausted.
 * Unknown currentId (shouldn't happen, but defensive) = exhausted.
 */
export function nextTourId(
  pass: string[],
  currentId: string | null,
  liveIds: ReadonlySet<string>,
): string | null {
  const start = currentId === null ? 0 : pass.indexOf(currentId) + 1
  if (currentId !== null && start === 0) return null // unknown current id
  for (let i = start; i < pass.length; i++) {
    if (liveIds.has(pass[i])) return pass[i]
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/views/Last48/ambient/tour.test.ts`
Expected: 8 passing.

- [ ] **Step 5: Commit**

```bash
git checkout -b last48-ambient-2
git add src/views/Last48/ambient/tour.ts src/views/Last48/ambient/tour.test.ts
git commit -m "feat(last48): ambient tour pass/cursor pure logic + tests"
```

### Task 7: `useAmbientTour` — dwell/breath orchestration

**Files:**
- Create: `src/views/Last48/ambient/useAmbientTour.ts`

- [ ] **Step 1: Write the hook**

```ts
// src/views/Last48/ambient/useAmbientTour.ts
//
// Owns WHAT is selected during ambient mode; the director owns WHERE the
// camera is. Communicates outward only through callbacks: onVisit(event)
// (select + publish visit target) and onBreath() (clear selection +
// publish citywide target). Timer-driven; reads live events via a ref so
// poll-driven re-renders never reset the dwell clock.
//
// Rhythm: visit … (DWELL_MS) … visit … pass exhausted → breath
// (BREATH_MS, card closed, citywide) → fresh snapshot → next pass.
// Tab hidden → timers pause (visibilitychange); resumes where it stopped.

import { useEffect, useRef } from 'react'
import type { NormalizedEvent } from '@/types/last48'
import { buildPass, nextTourId } from './tour'

export const DWELL_MS = 8000
export const BREATH_MS = 10000

export function useAmbientTour(opts: {
  /** True only while the conductor's phase is 'on'. */
  active: boolean
  events: NormalizedEvent[]
  onVisit: (ev: NormalizedEvent) => void
  onBreath: () => void
}): void {
  const { active } = opts

  const eventsRef = useRef(opts.events)
  eventsRef.current = opts.events
  const onVisitRef = useRef(opts.onVisit)
  onVisitRef.current = opts.onVisit
  const onBreathRef = useRef(opts.onBreath)
  onBreathRef.current = opts.onBreath

  useEffect(() => {
    if (!active) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let pass: string[] = []
    let currentId: string | null = null
    let disposed = false

    const liveIds = () => new Set(eventsRef.current.map((e) => e.id))

    const step = () => {
      if (disposed) return
      const nextId = nextTourId(pass, currentId, liveIds())
      if (nextId === null) {
        // Pass exhausted → breath, then a fresh snapshot.
        currentId = null
        onBreathRef.current()
        timer = setTimeout(() => {
          pass = buildPass(eventsRef.current)
          step()
        }, BREATH_MS)
        return
      }
      const ev = eventsRef.current.find((e) => e.id === nextId)
      if (!ev) {
        // Evicted between cursor math and lookup — advance immediately.
        currentId = nextId
        step()
        return
      }
      currentId = nextId
      onVisitRef.current(ev)
      timer = setTimeout(step, DWELL_MS)
    }

    // Pause the rhythm while the tab is hidden (RAF already stops; without
    // this the selection would advance invisibly and the camera would lag
    // a whole pass behind on return).
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        if (timer) clearTimeout(timer)
      } else if (hiddenAt !== null) {
        hiddenAt = null
        timer = setTimeout(step, 1000) // gentle resume beat
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    pass = buildPass(eventsRef.current)
    step()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/views/Last48/ambient/useAmbientTour.ts
git commit -m "feat(last48): useAmbientTour — dwell/breath rhythm over pass snapshots"
```

### Task 8: Wire the tour into the conductor + view

**Files:**
- Modify: `src/views/Last48/ambient/AmbientConductor.tsx`
- Modify: `src/views/Last48/modes/Last48UnifiedView.tsx` (conductor mount gains selection props)

- [ ] **Step 1: Extend `AmbientConductor`**

Replace the `const [target] = useState…` line and add tour wiring (new/changed code shown in full):

```tsx
import { useAmbientTour } from './useAmbientTour'
import type { NormalizedEvent } from '@/types/last48'
```

New props (add to `Props` and destructure):

```ts
/** Geo-bearing visible events (the tour's source). */
events: NormalizedEvent[]
/** Select an event exactly as a rail click would. */
onVisit: (ev: NormalizedEvent) => void
/** Clear the selection (breath — card closes for the citywide shot). */
onClearSelection: () => void
```

Body changes:

```tsx
const [target, setTarget] = useState<CameraTarget>(CITYWIDE_TARGET)

useAmbientTour({
  active: phase === 'on',
  events,
  onVisit: (ev) => {
    onVisit(ev)
    setTarget({ lng: ev.longitude!, lat: ev.latitude!, zoom: 14, avoidCard: true })
  },
  onBreath: () => {
    onClearSelection()
    setTarget(CITYWIDE_TARGET)
  },
})
```

Also reset the target on disarm so re-arming starts citywide — in the arm/disarm effect, when entering `ramp-out` add `setTarget(CITYWIDE_TARGET)` **only if** you also clear the selection there; per spec the selection STAYS on exit, so do **not** clear selection on ramp-out — just reset the target:

```tsx
if (!ambientOn && (phase === 'ramp-in' || phase === 'on')) {
  setPhase('ramp-out')
  setTarget(CITYWIDE_TARGET)
}
```

- [ ] **Step 2: Pass the selection plumbing from `Last48UnifiedView`**

The conductor mount becomes:

```tsx
<AmbientConductor
  map={map}
  ambientOn={ambientOn}
  ready={ambientReady}
  onExit={onAmbientExit}
  events={visibleEvents}
  onVisit={(ev) => setSelectedEvent(ev)}
  onClearSelection={() => setSelectedEvent(null)}
/>
```

`setSelectedEvent` is the same state the rail and map clicks drive, so the existing URL mirror (`replace: true`), rail highlight + `scrollIntoView`, `FlowSelectedRadar`, and `Last48EventCard` all follow for free.

- [ ] **Step 3: Run all tests + full build**

Run: `pnpm test && pnpm build`
Expected: tour tests pass; clean build.

- [ ] **Step 4: Visual smoke**

Checklist (tarmac dev server or PR preview):
- Arm DRIFT → orbit establishes (~one breath), then the newest event selects: rail row highlights and scrolls into view, card opens, camera eases to it with the dot landing LEFT of the card (clear of it), orbit never stops.
- ~8s later the next event — repeat. Watch 3–4 visits.
- After the pass (or set `PASS_SIZE = 3` temporarily to see it fast): card closes, camera breathes out citywide ~10s, then a fresh pass starts with the now-newest events.
- Interact mid-visit → ramp-out, the visited event STAYS selected (card open), URL has `?event=` for it; back button leaves the site in one step (no history spam).
- Hide the tab 1 min, return → tour resumes ~1s later from where it stopped, camera consistent.
- Toggle off, all chips off → pill disabled.

- [ ] **Step 5: Commit + PR**

```bash
git add src/views/Last48/ambient/AmbientConductor.tsx src/views/Last48/modes/Last48UnifiedView.tsx
git commit -m "feat(last48): wire ambient tour — point-to-point walkthrough with breath cycles"
unset GITHUB_TOKEN && git push -u origin last48-ambient-2
gh pr create --base last48-ambient-1 --title "feat(last48): ambient DRIFT mode — the tour (2/2)" --body "…"
```

(If PR A has already squash-merged, rebase with the banked `--onto` recipe and target `main` instead — see memory `feedback_stacked_pr_rebase_recipe.md`.)

---

## Post-merge

- [ ] Update CLAUDE.md's Last 48 view entry: add DRIFT (ambient mode) one-liner.
- [ ] Memory: mark the old `project_last48_playback_kiosk_mode.md` as superseded by the shipped ambient design; record tuned camera constants if they diverged from spec defaults.
- [ ] Mark spec Delivery section's PR numbers.
