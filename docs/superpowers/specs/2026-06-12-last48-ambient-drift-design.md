# The Last 48 — Ambient mode ("DRIFT") design

**Date:** 2026-06-12
**Status:** Approved (brainstorm with Jesse, June 12 2026)
**Supersedes:** the "Mode: KIOSK (meta-mode)" section of `2026-05-12-last-48-design.md` (scene-director concept) and the playback-mode primitives sketched in memory `project_last48_playback_kiosk_mode.md`, both of which assumed a separate scene-composing director. This design replaces all of that with a far simpler idle behavior of the existing view.

## Concept

Ambient mode is an **idle behavior of the existing Last 48 view** — not a separate mode, route, or layout. When armed, the map enters a slow pitched orbit while the view performs a continuous **walkthrough of the freshest events**: each event is selected in the rail exactly as if a user pressed ↓, the real detail card opens, the camera re-centers mid-orbit, dwells, and advances. It runs until untoggled or until any user input ramps it to a stop.

Three audiences, one mechanism:

1. **Attract mode / wall display** — an unattended 16:9 or 9:16 screen stays alive, fresh, and informative "forever" (the polling engine already keeps the 48h buffer current).
2. **Screensaver / second monitor** — idle beauty on a desk display.
3. **Guided demo** — because the tour drives the *real* UI (real rail highlight, real event card, real selection halo), a first-time viewer learns the interface by watching it used. The display teaches by performing.

Orientation is a non-issue by design: the existing responsive view IS the layout (liquid-layout philosophy applied to the display itself). There are no kiosk-specific layouts, scenes, or chrome.

### Naming

- **User-facing label:** `◉ DRIFT` (working name — one word, names the camera behavior honestly, no "live" overpromise, reads correctly in the mono eyebrow register). Fallback candidates if it doesn't land in situ: `AMBIENT`, `TOUR`, `ORBIT`.
- **Code name:** `ambient` everywhere — `useAmbientDirector`, `useAmbientTour`, `AmbientToggle`, `?ambient=1`.

## State machine

```
OFF ──(toggle / ?ambient=1 after boot)──▶ RAMP-IN (~2s)
RAMP-IN ──▶ TOURING
TOURING ──(any user input)──▶ RAMP-OUT (~1s) ──▶ OFF
TOURING ──(untoggle)──▶ RAMP-OUT ──▶ OFF
```

- **RAMP-IN (~2s):** pitch eases 0 → ~50°, orbit angular velocity spins up from zero. The camera director takes sole ownership of the camera.
- **TOURING:** the pass loop (below) runs ad infinitum.
- **RAMP-OUT (~1s):** orbit decelerates smoothly (no snap), pitch eases back to the view's normal flat register, camera ownership returns to Mapbox's default interactions. **The current selection stays** — a viewer can grab the thing that caught their eye mid-tour; that is the attract-mode payoff.
- Trigger inputs for ramp-out: `pointerdown`, `wheel`, `keydown`, `touchstart` anywhere on the page. The toggle itself re-arms.

**Toggle only — no idle auto-start.** Explicitly decided: nothing self-arms after N minutes of inactivity (risk: hijacking someone who is reading). The `?ambient=1` URL param covers the unattended-display case. Revisit after feel-testing.

## Camera director (single-writer model)

The fix for the orbit-vs-recenter animation fight: while ambient is on, **one RAF loop owns the camera completely**. Nothing else (including Mapbox's own `flyTo`/`easeTo` animations) writes to it.

- Bearing increments continuously at ~1.2°/s (full rotation ≈ 5 min).
- Per-event moves never call `flyTo` (it would cancel the orbit). The director holds a **target center/zoom** and interpolates the live camera toward it each frame; composed values are written once per frame via `map.jumpTo`. One writer, no conflicts.
- **Tour → director linkage:** the tour owns *what* is selected; the director owns *where the camera is*. When the tour advances the selection, it publishes the new event's coordinates as the director's target (visit register); at pass end it publishes the citywide target (breath register). The director never knows about events, only targets.
- Registers:
  - **Resting / citywide:** ≈ z11.5, pitch ~50°, centered on the city.
  - **Visiting an event:** ease to ≈ z14 over ~2.5s, dwell, move on.
  - **Inter-pass breath:** ease back out to citywide for ~10s, still orbiting, detail card closed — the rhythm reads *tour… breathe… tour…*
- **Unobstructed centering (shared fix):** "center on the event" means the center of the *visible* map, not the viewport. The detail card (top-right, `max-h-[80vh]`) and chrome can cover a viewport-centered dot on squarish viewports (observed on an unfolded Pixel in the interactive view — today's `flyTo` at `Last48UnifiedView.tsx` centers exactly). Fix: a shared `obstructedRightBand(map)` helper (`src/views/Last48/cameraPadding.ts`) computes the card-covered band from the card's width formula (the card isn't in the DOM yet at flyTo time, so live measurement can't work for fresh selections); the interactive `flyTo` calls consume it via a stateless `offset` (no persistent-padding reset choreography), and the ambient visit register reuses the band in its per-frame framing. Shipped ahead of ambient as a standalone interactive bugfix.
- Tuning values (angular velocity, zooms, pitch, dwell, ramp durations) are constants in `useAmbientDirector.ts` — expected to be tuned by feel during build; the numbers above are starting points, not contracts.

## Tour mechanics

- **The pass:** snapshot the newest **~24 visible events** (respecting the dataset super-chip filters), tour newest-first, advancing by **event id** (never index — the rail is newest-first and shifts as polls land; an id cursor is immune). ~8s dwell per event.
- **Mid-pass arrivals** do not interrupt — not even priority-A (its halo is already visible during the orbit, and it will lead the next pass). Calm register, no preemption.
- **Pass end:** citywide breath → re-snapshot the now-newest events → next pass. Because polling has refreshed the buffer continuously, "newest" is genuinely newest, forever.
- **Selection plumbing:** the director drives the same `?event=` URL selection that map clicks and rail clicks use — but with `replace: true`, so hours of touring add **zero history entries**. Only human selections push history. Rail `scrollIntoView` + row highlight work for free because it is real selection.
- **Edge cases:**
  - Event evicted from the 48h buffer mid-pass → skip silently to the next id.
  - Zero visible events (all chips off, or boot not finished) → toggle disabled with tooltip.
  - `prefers-reduced-motion` → the feature is suppressed entirely (toggle hidden or disabled).
  - Tab hidden → RAF stops naturally; polling already pauses (existing behavior); tour resumes where it was on visibility return.

## Chrome & entry points

- **`AmbientToggle`** (DRIFT pill) lives in the `LayerControls` cluster — it is a view-behavior control and that is where those live. Glow tier 2: subtle glow only when active.
- **Fullscreen button** (`⛶`) next to the toggle calls `requestFullscreen()`. One-button wall-display path = DRIFT + ⛶. (`?ambient=1` + F11 equivalent.)
- **`?ambient=1`** arms ambient on load, **after** the normal boot/stream-curtain completes (`initialLoadComplete`) — the existing loading choreography is untouched.
- Everything else stays: heartbeat ticker, super-chips, scanner strip, export button. No chrome-hiding in v1 — the chrome is part of the demo. When ambient is **off**, the view is byte-for-byte the current Last 48: zero regression surface.

## Implementation map

New files (all additive):

| File | Responsibility |
|---|---|
| `src/views/Last48/ambient/useAmbientDirector.ts` | State machine + single-writer camera RAF loop (bearing drift, eased center/zoom targets, ramps) |
| `src/views/Last48/ambient/useAmbientTour.ts` | Pass snapshots, id-cursor advance, dwell timer, selection dispatch (replace-mode) |
| `src/views/Last48/ambient/tour.ts` | Pure pass/cursor logic (snapshot, next-id, eviction skip) — unit-tested |
| `src/views/Last48/ambient/AmbientToggle.tsx` | DRIFT pill + fullscreen button |

Touched: `Last48.tsx` (parse `?ambient=`, own ambient state, mount toggle), `Last48UnifiedView.tsx` (expose map instance + selection setter to the director — both already exist internally). **No changes** to `useLast48Window`, `FlowMapLayer`, `FlowRail`, `Last48EventCard`, or any layer component.

## Verification

Per project convention (no app-wide unit-test infra; pure logic gets tests next to `heartbeat/`'s pattern):

- `tour.ts` pure functions: unit tests (snapshot stability, id-cursor advance, eviction skip, filter respect).
- Everything else: `pnpm build` (ground truth), tarmac dev-server visual smoke, Vercel preview at PR boundary.
- Manual PR checklist: orbit smoothness; ramp-in/out feel; history stays clean after 10 min of touring (back button = one step); any-input stop; selection survives ramp-out; reduced-motion suppression; chips-off disables toggle; `?ambient=1` waits for boot.

## Delivery

Two PRs:

1. **Director + chrome:** state machine, camera ownership, ramps, toggle, fullscreen, `?ambient=1` — touring just orbits citywide with no per-event visits yet. Feel-tune the camera here.
2. **The tour:** pass/cursor logic + selection dispatch + dwell choreography + inter-pass breath.

(Collapse to one PR if PR 1 stays small after feel-tuning.)

## Deferred (explicitly out of scope for v1)

- Idle auto-start (any variant) — revisit after feel-testing.
- Chrome-hiding / dedicated kiosk layout — the normal chrome is a feature for now.
- Timelapse/scrubber scenes, HOTSPOTS scenes, headline-card scenes — the old director concept; only revive if DRIFT proves insufficient on a wall.
- Endurance hardening for multi-day runs (nightly reload watchdog, WebGL context-loss recovery, OLED static-chrome drift) — needed before a true 24/7 public installation, not for v1.
- Scanner audio integration — separate thread (Broadcastify outreach pending).
