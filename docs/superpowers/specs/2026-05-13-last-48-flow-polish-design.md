# The Last 48 · FLOW UI/UX Polish — Design Direction

**Date:** 2026-05-13
**Status:** Design recommendations (review before implementation)
**Brief:** `docs/superpowers/specs/2026-05-13-last-48-flow-polish-brief.md`
**Scope:** FLOW mode polish for `/live-feeds` Phase 2.5b
**Audience:** Implementer (controller + subagent dispatches) — will translate this into PRs after user approval

---

## Aesthetic stance — "Civic Observatory"

The Last 48 is editorial-journalistic, not corporate-dashboard. Its closest aesthetic ancestors aren't analytics tools — they're **a newsroom wall display, an observatory's monitoring screen, a fire-house tone board.** Things that *watch*.

The visual register: **calm attention with occasional gentle motion.** The map breathes. Open calls pulse softly. New events arrive with a brief ripple. The selected event becomes a radar target. Nothing is loud — but the screen is *alive*, the way a real wall-display is alive.

Three principles guide every decision below:

1. **Sparse motion, not constant motion.** Animation reserved for the *one thing currently happening* — newest arrival, selected target, open-call breathing. Everything else holds still.
2. **Hierarchy by frequency, inverted.** The rarest categories get the strongest visual punch. Police (35 events) should *catch the eye*, not vanish into 911 (thousands).
3. **The map is the canvas; the rail is the log; the peek is a glance.** Each surface has one job. The peek does not steal the rail's job.

---

## 1. Hover-box detail pattern

### Decision: cursor-anchored on desktop, item-anchored on mobile

Replace `Last48EventPeek`'s slide-in panel with a **floating popover**. Two interaction modes share one component:

- **Desktop:** opens on `mouseenter` after 350ms dwell (avoids flicker on dense map traversal). Stays open while cursor is over the dot OR over the popover itself. Click-to-pin keeps it open after mouseout. Esc dismisses.
- **Mobile:** opens on tap. Stays open until outside tap or Esc.

The popover is **anchored to the dot's screen position on the map** (or the row's position in the rail). It uses Mapbox's existing `Popup` for map anchoring and a custom positioning helper for rail anchoring.

### Visual treatment

Kraft-paper card style — warm umber shadow, espresso surface with subtle paper-grain inner border. Notched top-left corner with a dataset-pigment accent tab (consistent with the "notched corners with accent tab" differentiator in CLAUDE.md).

```tsx
// src/views/Last48/detail/Last48EventHoverBox.tsx
//
// Cursor-anchored on desktop, item-anchored on mobile. Floats; does
// NOT consume rail real estate. Dismisses on outside click + Esc.

import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { NormalizedEvent, DatasetId } from '@/types/last48'

interface Props {
  event: NormalizedEvent
  anchor: { x: number; y: number }        // viewport coords
  preferredSide?: 'right' | 'left' | 'top' | 'bottom'
  onDismiss: () => void
  pinned?: boolean                         // true after click; false during hover
}

export default function Last48EventHoverBox({ event, anchor, preferredSide = 'right', onDismiss, pinned }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  // Esc + outside-click dismissal (only when pinned)
  useEffect(() => {
    if (!pinned) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss()
    }
    document.addEventListener('keydown', onKey)
    setTimeout(() => document.addEventListener('mousedown', onClick), 0)  // skip the click that opened it
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [pinned, onDismiss])

  // Position via translate3d (avoid layout thrash)
  const placement = computePlacement(anchor, ref.current, preferredSide)

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Event detail: ${event.headline}`}
      className="
        fixed z-30 pointer-events-auto
        w-[clamp(240px,22vw,320px)]
        bg-espresso-900/95 dark:bg-espresso-950/95
        border border-paper-300/30 dark:border-espresso-700
        rounded-md
        shadow-[0_24px_60px_-20px_rgba(60,40,20,0.6),0_8px_24px_-12px_rgba(0,0,0,0.5)]
        text-paper-300
        animate-[fadeSlideIn_180ms_cubic-bezier(0.16,1,0.3,1)_both]
      "
      style={{
        transform: `translate3d(${placement.x}px, ${placement.y}px, 0)`,
        // Kraft-paper inner border tone (warm umber on top, fade)
        backgroundImage: 'linear-gradient(180deg, rgba(168,146,106,0.04) 0%, transparent 30%)',
      }}
    >
      {/* Notched accent tab — dataset pigment */}
      <span
        aria-hidden
        className="absolute -top-px left-3 h-1 w-12 rounded-b"
        style={{ backgroundColor: DATASET_META[event.datasetId].color }}
      />

      <div className="px-4 pt-3 pb-2">
        {/* Eyebrow */}
        <div className="flex items-baseline justify-between font-mono text-[9px] tracking-[0.18em] uppercase">
          <span style={{ color: DATASET_META[event.datasetId].color }}>
            ── {DATASET_META[event.datasetId].label}
          </span>
          <span className="text-paper-500 tabular-nums">{formatTime(event.receivedAt)}</span>
        </div>

        {/* Headline (Fraunces italic at small scale — editorial register) */}
        <h3 className="font-display italic text-[15px] leading-tight text-paper-200 mt-1.5">
          {event.headline ?? 'Event'}
        </h3>

        {/* Location + state line */}
        {(event.neighborhood || event.state) && (
          <p className="font-mono text-[10px] text-paper-500 mt-1 flex items-center gap-2">
            {event.neighborhood && <span>{event.neighborhood}</span>}
            {event.state && (
              <>
                {event.neighborhood && <span aria-hidden>·</span>}
                <span className={event.state === 'open' ? 'text-moss-400' : 'text-paper-600'}>
                  {event.state === 'open' ? 'OPEN' : `CLOSED · ${event.disposition ?? '—'}`}
                </span>
              </>
            )}
          </p>
        )}

        {/* 2-3 key fields, dataset-adaptive (compact, no labels — values speak) */}
        <ul className="mt-2.5 flex flex-col gap-0.5 font-mono text-[10px] tabular-nums text-paper-400">
          {compactFields(event).map(([k, v]) => (
            <li key={k} className="flex justify-between gap-3">
              <span className="text-paper-600 tracking-wide">{k}</span>
              <span className="text-paper-300 text-right truncate">{v}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Footer link (double-rule above per DataDiver convention) */}
      <div className="border-t border-paper-700/40 mx-4" />
      <div className="border-t border-paper-700/20 mx-4 mt-px mb-2" />
      <Link
        to={DATASET_META[event.datasetId].exploreRoute(extractId(event))}
        className="
          block px-4 pb-3 font-mono text-[11px] tracking-wider
          text-ochre-400 hover:text-ochre-300 transition-colors
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500
        "
      >
        {DATASET_META[event.datasetId].exploreLabel} →
      </Link>
    </div>
  )
}
```

### Rationale points

- **Floating, fixed-positioned popover** preserves rail browsability (the user's #1 concern). No surface gets "taken over."
- **350ms dwell** before opening on hover prevents flicker on dense map panning — long enough that intentional hover is registered, short enough that it feels responsive. Borrowed from common map-tooltip patterns.
- **Click-to-pin** model: hovering is a glance; clicking commits. The pinned popover doesn't disappear on mouseout — only on outside click or Esc. This makes it a *quotable* surface (the journalist can copy text out of it).
- **Kraft-paper inner border + notched accent tab + double-rule footer** integrate three of CLAUDE.md's "differentiators" without inventing new vocabulary.
- **Fraunces italic headline** is the editorial voice — the same register used on `InvestigationCard`. It's small here (15px not hero-scale) but the italic still reads as *editorial* rather than *data*.

### Mobile

On viewports below 768px, the popover positions at the bottom edge of the screen (drawer-like), animating in via `slideUp`. Anchoring to a single tapped item is preserved — but the visual placement becomes a sheet rather than a floating card. The same component handles both.

---

## 2. Selected-item treatment — list and map

### Decision: spotlight metaphor

When the user selects an event from the rail OR clicks a map dot, **everything else dims slightly** and **the chosen one becomes a radar target.** This is the strongest "alive" moment in FLOW.

### Rail row — inversion + accent

```tsx
// FlowRail.tsx — selected row styling
className={`
  text-left px-2.5 py-2 rounded-sm
  font-mono text-[10px] leading-tight
  transition-colors duration-150
  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500
  ${isSel
    ? `
      bg-paper-200 dark:bg-paper-300/95
      text-espresso-900
      shadow-[inset_0_0_0_1px_rgba(184,90,51,0.4)]
      relative
    `
    : 'hover:bg-paper-100/40 dark:hover:bg-espresso-800/60'
  }
`}
// Plus a small accent tab on the left edge of the selected row:
{isSel && (
  <span
    aria-hidden
    className="absolute left-0 top-0 bottom-0 w-1 rounded-l"
    style={{ backgroundColor: DATASET_ABBREV[event.datasetId].color }}
  />
)}
```

The selected row **inverts** — cream background, espresso text — making it pop against the dark rail. A 1px dataset-pigment vertical accent tab on the left edge anchors the selection visually.

### Map dot — radar target

The selected dot gets a **radar ring overlay**, reusing the existing `radarSweep` keyframe from `index.css` (PR #21 precedent). Implementation via a second Mapbox layer that only renders the single selected feature.

```tsx
// Second circle layer driven by feature-state or filter
{
  id: 'last48-flow-events-selected',
  type: 'circle',
  source: SOURCE_ID,
  filter: ['==', ['get', 'id'], selectedEventId ?? '__none__'],
  paint: {
    'circle-color': 'transparent',
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      10, 14,
      14, 22,
    ],
    'circle-stroke-color': '#f5ecd9',  // cream
    'circle-stroke-width': 1.5,
    'circle-stroke-opacity': 0.65,
  },
}
```

The cream ring sits at ~3× the dot's normal radius. Then a CSS-driven animation in the parent map container *desaturates* everything else by 0.4 via a `filter: saturate(0.6) brightness(0.9)` overlay that lifts when the selection clears. This makes the selected event genuinely punch through.

For the *radar sweep* effect specifically — a single SVG element positioned over the selected dot (transform-tracked to its screen coordinate via `map.project()`), rendering a 90° gradient arc that rotates via `radarSweep` keyframe at 3.5s. This is the editorial flourish; subtle, slow, unmistakably "this one."

```tsx
// src/views/Last48/modes/FlowSelectedRadar.tsx
// Single SVG ring over the selected dot. Synced to map.project on every move.

export default function FlowSelectedRadar({ map, event }: { map: mapboxgl.Map | null; event: NormalizedEvent | null }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    if (!map || !event || event.longitude == null || event.latitude == null) {
      setPos(null)
      return
    }
    const sync = () => {
      const p = map.project([event.longitude!, event.latitude!])
      setPos({ x: p.x, y: p.y })
    }
    sync()
    map.on('move', sync)
    map.on('zoom', sync)
    return () => {
      map.off('move', sync)
      map.off('zoom', sync)
    }
  }, [map, event])

  if (!pos || !event) return null

  return (
    <svg
      className="pointer-events-none fixed z-20 motion-reduce:hidden"
      width="80" height="80" viewBox="0 0 80 80"
      style={{ left: pos.x - 40, top: pos.y - 40 }}
    >
      <defs>
        <radialGradient id="radar-grad" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="rgba(245,236,217,0)" />
          <stop offset="85%" stopColor="rgba(245,236,217,0.45)" />
          <stop offset="100%" stopColor="rgba(245,236,217,0)" />
        </radialGradient>
      </defs>
      <circle cx="40" cy="40" r="28" fill="none" stroke="rgba(245,236,217,0.5)" strokeWidth="1" />
      <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(245,236,217,0.25)" strokeWidth="0.5" />
      {/* Sweep wedge */}
      <g className="origin-center radar-sweep">
        <path
          d="M40,40 L40,4 A36,36 0 0,1 71,22 Z"
          fill="url(#radar-grad)"
        />
      </g>
    </svg>
  )
}
```

`motion-reduce:hidden` removes the animation for users who prefer reduced motion (and the rest of the selection treatment remains — the radar is decoration, not function).

### Rationale points

- **Inversion + cream surface** for the selected rail row is much stronger than the current `ring-1 ring-ochre-500`. The user wanted "much more specialized treatment" — inversion delivers that without screaming.
- **Radar sweep on the map dot** is the project's existing animation vocabulary (PR #21), now repurposed for selection. Familiar to users who've seen the loading skeletons.
- **Desaturation overlay on non-selected dots** is editorially powerful — selecting one event *quiets the rest*. This is the "spotlight" metaphor.

---

## 3. Dot vocabulary — circles for density, distinct marks for sparse

### Decision: hybrid — circles + diamonds + thick-ring marks

The current "all circles" approach fails when one dataset has 5000 events and another has 35. Switch the **two sparse datasets to distinct mark shapes** so they're recognizable even when surrounded by circles.

| Dataset | Mark | Why |
|---|---|---|
| 911 Realtime | Filled circle | Dominant volume, established convention |
| Fire/EMS Dispatch | Filled circle | Same — high volume |
| 311 Cases | Filled circle | High volume |
| 911 Historical (opt-in) | Hollow circle (ring) | Same shape as 911 but visually clearly *historical* |
| Police Incidents (opt-in) | Diamond | Distinct, geometric, "severity" semantic |
| Parking Revenue (opt-in) | Small ochre tick / cross | Transactional, non-emergency, visually quiet |

**Mapbox implementation:** `circle` layer can't render diamonds. Use **`symbol` layer with a custom SVG sprite** for the non-circle marks. Three sprites (`ring`, `diamond`, `tick`) suffice — they share a single icon-color paint property so they pick up dataset pigment correctly.

```tsx
// Sprite definitions (sprite.json + sprite.png loaded at map init OR inline SVG via data URI)
const FLOW_SYMBOL_ICONS = {
  ring:    'data:image/svg+xml;utf8,<svg ...>',  // hollow circle, stroke 1.5px
  diamond: 'data:image/svg+xml;utf8,<svg ...>',  // 8x8 rotated square, stroke + fill
  tick:    'data:image/svg+xml;utf8,<svg ...>',  // small + cross mark
}
```

In FlowMapLayer, replace the single circle layer with a layered approach:

```tsx
const layers: mapboxgl.AnyLayer[] = useMemo(() => [
  // Layer 1: filled circles for density datasets (911, Fire, 311) — render FIRST (below)
  {
    id: 'last48-flow-circles',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['in', ['get', 'datasetId'], ['literal', ['911-realtime', 'fire-ems-dispatch', '311-cases']]],
    paint: { /* existing circle paint */ },
  },
  // Layer 2: hollow rings for 911 Historical
  {
    id: 'last48-flow-rings',
    type: 'circle',
    source: SOURCE_ID,
    filter: ['==', ['get', 'datasetId'], '911-historical'],
    paint: {
      'circle-color': 'transparent',
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': 1.5,
      'circle-radius': [/* ... */],
    },
  },
  // Layer 3: symbol marks for Police diamond + Parking tick — render LAST (on top)
  {
    id: 'last48-flow-marks',
    type: 'symbol',
    source: SOURCE_ID,
    filter: ['in', ['get', 'datasetId'], ['literal', ['police-incidents', 'parking-revenue']]],
    layout: {
      'icon-image': ['match', ['get', 'datasetId'],
        'police-incidents', 'diamond',
        'parking-revenue', 'tick',
        'ring',
      ],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 1.0],
      'icon-allow-overlap': true,
    },
    paint: {
      'icon-color': ['get', 'color'],
      'icon-halo-color': '#1e140d',
      'icon-halo-width': 1,
    },
  },
] as mapboxgl.AnyLayer[], [])
```

### Rationale points

- **Density datasets stay as circles** so the eye can read patterns and clusters naturally. We don't break what works.
- **Diamond for Police** is the editorially right choice — diamonds carry "severity / warning" semantics in cartographic convention (USGS earthquake symbols are diamonds). Police events in The Last 48 are usually crime reports; the geometric distinctness matches.
- **Hollow ring for 911 Historical** signals "completed" visually — same dataset family as Realtime (still 911), but visually marked as *done*. Reinforces the open/closed lifecycle model.
- **Small tick for Parking** is the quietest treatment — Parking is a money/transaction dataset, not a public-safety dataset, and shouldn't visually compete with emergencies.

### Performance note

`symbol` layers with `icon-allow-overlap: true` are more expensive than `circle` layers at high feature counts. We expect <500 features total in the symbol layer (Police + Parking combined never approach 911's volume), so this is fine. Keeping the dense datasets on the cheap `circle` layer preserves render performance.

---

## 4. Sparse-layer visual hierarchy

### Decision: z-order by frequency, inverted; halo for sparse

The user's observation: Police (35 events) disappears into 11k other dots. The fix is **frequency-inverted z-order + a subtle pigment halo** on sparse marks.

The layer-ordering above already addresses z-order: circles render first (bottom), rings second, symbols last (top). Police diamonds will always sit on top of 911 circles.

For halos, the `symbol` layer's `icon-halo-color` and `icon-halo-width` paint properties give us a soft glow per symbol. Set the halo to a slight pigment-tinted color (a lightened version of the dataset's pigment) to give sparse marks a subtle aura:

```tsx
paint: {
  'icon-color': ['get', 'color'],
  // Halo is a low-opacity bright version of the dataset color
  'icon-halo-color': [
    'match', ['get', 'datasetId'],
    'police-incidents', 'rgba(212,113,73,0.45)',   // terracotta halo on brick mark
    'parking-revenue', 'rgba(232,192,107,0.4)',     // pale ochre halo
    'rgba(0,0,0,0)',
  ],
  'icon-halo-width': 2,
  'icon-halo-blur': 1,
}
```

This creates the **"punch through" effect** without adding new artwork — Mapbox's built-in halo paint handles it.

For Mapbox `circle` layers (the hollow-ring 911 Historical), there's no halo equivalent, but a doubled `circle-stroke-width` gives a similar effect at zoom-out levels.

---

## 5. "Feels alive" — three discrete animations + one map gesture

### Decision: four distinct moments of motion

1. **Newest event arrival** — 600ms pulse on arrival, then settle
2. **Open call breathing** — very subtle 4-second cycle on open 911 calls
3. **Selected dot radar sweep** — continuous (covered in §2)
4. **Mode transition cross-fade** — 200ms when toggling FLOW ↔ HOTSPOTS

All respect `prefers-reduced-motion: reduce`. Implementation strategy below.

### Newest-event arrival pulse

When `useLast48Window`'s buffer gains an event with `receivedAt` newer than the previous max, that event renders with a *temporary* `isNew: true` property. The map's paint expression uses `isNew` to add an outer ring that fades over 600ms.

Implementation: a per-event "age since seen" computed in `useMemo`, with a CSS-style animation simulated via Mapbox paint interpolation. Since Mapbox doesn't have CSS animations, we drive this via React state with a `setTimeout(() => clearIsNew(id), 600)` clearance.

```tsx
// In useLast48Window or a thin layer atop it:
const newEventIds = useRef<Set<string>>(new Set())

// Inside the merge logic:
for (const row of rows) {
  const event = normalizeEvent(datasetId, row)
  if (!event) continue
  if (!state.byId.has(event.id)) {
    newEventIds.current.add(event.id)
    setTimeout(() => {
      newEventIds.current.delete(event.id)
      notify()
    }, 600)
  }
  newById.set(event.id, event)
}

// In the GeoJSON feature properties:
properties: {
  ...,
  isNew: newEventIds.current.has(event.id),
}

// In the paint expression (added as a secondary circle layer for new events):
{
  id: 'last48-flow-new-events',
  type: 'circle',
  source: SOURCE_ID,
  filter: ['==', ['get', 'isNew'], true],
  paint: {
    'circle-color': 'transparent',
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 10, 14, 16],
    'circle-stroke-color': '#f5ecd9',
    'circle-stroke-width': 1,
    'circle-stroke-opacity': 0.8,
  },
}
```

The opacity decay isn't truly animated frame-by-frame here — it's a single ring that vanishes after 600ms. For a smoother fade, we could trigger an inline CSS animation on the parent map container using a `key`-based mount/unmount strategy with `animate-fadeSlideIn`, but the discrete ring-then-gone is editorially fine and cheap.

### Open call breathing

For the small population of *open* 911 calls (no disposition yet), we want a *very subtle* 4-second breathing cycle on opacity — to convey "still active" without becoming visually noisy.

Implementation: extend the existing `pulse-subtle` keyframe (already in `index.css`) to a CSS class applied via a *fixed-position SVG overlay* — same technique as the selected-dot radar, but anchored to every open 911 dot on screen.

Alternatively, Mapbox paint can simulate this via a time-based expression: but Mapbox doesn't support time-based animations natively. The simplest path: a single SVG overlay rendering one circle per open 911 event, all sharing the same `pulse-subtle` animation. With <500 open calls at any moment, this is performant.

**Caveat:** this is the *one* animation that risks "alive becomes annoying" if turned up. Keep amplitude very gentle — opacity oscillates 0.85 ↔ 1.0, no radius change. **Respects `prefers-reduced-motion`.**

### Mode transition cross-fade

The current toggle is instant. A 200ms cross-fade between `<FlowMode />` and `<HotspotsMode />` would be a small but meaningful polish moment. Implementation: wrap both modes in a parent that uses CSS `transition: opacity 200ms` with the inactive mode at `opacity: 0; pointer-events: none`.

This is the cheapest of the four motions and the highest leverage — it makes the mode toggle feel intentional rather than abrupt.

### Future (Phase 3): drone circle shot

Not implemented now. But the architecture above (selected-event tracking, map-project synced overlays) sets up the camera-orbit pattern naturally: when entering timelapse playback, the map camera could `easeTo` a slow rotation around the busiest neighborhood centroid. Note for Phase 3.

---

## 6. Keyboard navigability

### Decision: rail as an `aria-listbox`

The FlowRail becomes a proper listbox. Arrow keys navigate; Enter selects; Esc deselects. The selected row matches the selected event in the map (single-source-of-truth in `FlowMode`'s state).

```tsx
// FlowRail.tsx — listbox container + roving tabindex
<div
  role="listbox"
  aria-label="48-hour event log"
  aria-activedescendant={selectedId ? `flow-row-${selectedId}` : undefined}
  tabIndex={0}
  onKeyDown={handleKeyDown}
  className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500"
>
  {limited.map((ev) => (
    <div
      key={ev.id}
      id={`flow-row-${ev.id}`}
      role="option"
      aria-selected={ev.id === selectedId}
      className={/* row classes */}
      onClick={() => onSelect(ev)}
    >
      {/* row content */}
    </div>
  ))}
</div>

// Keyboard handler:
function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', 'Escape'].includes(e.key)) return
  e.preventDefault()

  const idx = limited.findIndex((ev) => ev.id === selectedId)
  if (e.key === 'ArrowDown') onSelect(limited[Math.min(idx + 1, limited.length - 1)])
  if (e.key === 'ArrowUp')   onSelect(limited[Math.max(idx - 1, 0)])
  if (e.key === 'Home')      onSelect(limited[0])
  if (e.key === 'End')       onSelect(limited[limited.length - 1])
  if (e.key === 'Enter')     onPin(selectedId)         // hover-box becomes pinned
  if (e.key === 'Escape')    onSelect(null)
}
```

Selection state is hoisted in `FlowMode`. The map's selected-event ring (§2) updates in lockstep with the rail's selected row. Pressing Enter "pins" the hover-box (so it stays open without hovering).

### Focus visibility

The listbox container gets a 1px ochre ring when focused (consistent with the existing focus pattern). Each row's selected style (the cream-inversion from §2) doubles as the active-descendant indicator.

---

## 7. Chrome polish

### Decision: minimal, surgical — pull the editorial register through every chrome element

Current chrome is *adequate* but doesn't yet earn the "civic newsroom surface" feeling. Six targeted moves:

### 7a. Header — pull-quote margin note

Add a short italic editorial line to the right of the header title — a "pull-quote margin note" in CLAUDE.md's vocabulary. Explains *what this view is*:

```tsx
// Last48.tsx header
<header className="px-[clamp(16px,3vw,64px)] pt-6 pb-3 flex items-baseline gap-6 flex-wrap z-20">
  <div className="flex-1 min-w-[200px] max-w-[640px]">
    <h1 className="font-display text-xl md:text-2xl tracking-tight">
      <span className="text-paper-500">── LIVE · </span>
      <span>The Last 48</span>
    </h1>
    <p className="font-mono text-[11px] text-paper-600 mt-1">
      What's flowed in across SF in the past 48 hours
    </p>
  </div>

  {/* NEW: pull-quote margin note */}
  <aside className="hidden lg:block max-w-[280px] font-display italic text-[11px] leading-snug text-paper-500 dark:text-paper-400 border-l border-paper-300 dark:border-espresso-700 pl-3">
    A retrospective view — public data carries an honest lag. The chips
    below tell you exactly how old each stream is.
  </aside>

  <div className="flex items-center gap-3 ml-auto">
    <ModeToggle mode={mode} onChange={setMode} />
    <KioskLauncher />
  </div>
</header>
```

### 7b. Freshness chip strip — eyebrow + double rule

```tsx
// FreshnessChipStrip.tsx
<div className="flex flex-col gap-1 font-mono text-[10px] leading-tight">
  {/* Eyebrow with double-rule under */}
  <div className="flex items-baseline gap-2">
    <span className="font-display italic text-[10px] text-paper-500 tracking-normal">
      Per-source freshness
    </span>
    <span className="flex-1 border-t border-paper-300/50 dark:border-espresso-700 mb-1" />
  </div>
  {/* Rows ... */}
</div>
```

A small, italic-Fraunces eyebrow ("Per-source freshness") above the two chip rows replaces the current bare `DATA REFRESH` / `EVENT LAG` labels. The labels themselves stay (Space Mono), but now sit *under* an editorial header.

### 7c. Mode toggle — corner-glow on active mode

The Mode toggle's active button currently uses solid ochre bg. Add a subtle corner-glow (DataDiver's signature) using `glow-host` + `glow-corner`:

```tsx
<button
  type="button"
  aria-pressed={mode === 'flow'}
  onClick={() => onChange('flow')}
  className={`
    relative px-3 py-1.5 transition-colors overflow-hidden
    ${mode === 'flow'
      ? 'bg-ochre-500 text-espresso-900 glow-host'
      : 'text-paper-600 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-espresso-700'}
  `}
  style={mode === 'flow' ? { ['--glow' as string]: '#f5ecd9' } : undefined}
>
  {mode === 'flow' && <span className="glow-corner is-sm" aria-hidden />}
  <span className="relative">FLOW</span>
</button>
```

This is the **single, deliberate** use of the corner-glow on this view (per the CLAUDE.md discipline — corner-glow is for special moments, not buttons in general; the mode toggle's active state qualifies because it represents *which lens you're currently looking through*).

### 7d. Dataset filter chips — quieter inactive state, stronger active

Current inactive chips have `opacity-60` for Tier-2 and full opacity for Tier-1 inactives. Simpler: all inactives → opacity-50, all actives → 100%, active pigment + 1px paper-300 stroke. Reduces visual noise.

### 7e. Scanner strip — moss double-rule, retire green pill

The scanner strip currently has a `bg-moss-500` "▶ TUNE IN" pill — the only green on the page, feels arbitrary. Replace with:

- Double-rule (a key CLAUDE.md differentiator) along the strip's top edge
- Pill becomes a transparent button with a moss stroke + moss text + small `→` arrow (matches "Explore →" pattern from the hover-box footer)
- Strip background lightens 5% to feel more "footer" than "another bar"

### 7f. Tabular figures everywhere

Where data values appear in the chrome (lag values, event counts, timestamps), enforce `tabular-nums` consistently. Currently inconsistent. Small but the visual rhythm matters.

---

## 8. Earth-tone integration

### Decision: leverage what exists, no new tokens

The view already uses the palette tokens correctly. What's missing is the use of the *signature* elements — corner-glow, kraft-paper edges, pull-quote margin notes, double-rule dividers, oldstyle figures (which Roboto Serif already provides in `font-body italic`).

The recommendations in §7 do this work explicitly:
- Pull-quote in header (§7a)
- Italic-Fraunces eyebrows on freshness strip (§7b)
- Corner-glow on active mode toggle (§7c)
- Double-rule on scanner strip (§7e)

The hover-box (§1) leverages kraft-paper inner border + notched accent tab.

**Two cross-cutting additions** that reinforce earth-tone integration:

1. **Map area gradient overlay** — a very subtle top-edge gradient (espresso → transparent) under the chrome, anchoring the chrome to the map without a hard line. Already implemented as `MapView`'s top-fade overlay; verify it's active here.

2. **Rail header double-rule** — the rail's "FRESHEST" header gets the same `── EYEBROW` rule-leading treatment that other DataDiver section heads use, with a thin double-rule directly under it.

---

## Implementation roadmap

Recommended PR sequence. Each PR ships independently, is reviewable in <15 min, and leaves the system in a working state.

### PR 1: Hover-box pattern (replaces EventPeek slide-in)
**~300 lines · 2 new files · 2 modified**

- New: `src/views/Last48/detail/Last48EventHoverBox.tsx` (component)
- New: `src/views/Last48/detail/useHoverBoxPosition.ts` (placement helper)
- Modify: `src/views/Last48/modes/FlowMode.tsx` (replace EventPeek import)
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx` (350ms dwell hover detection)
- Delete (or keep for HOTSPOTS only): `src/views/Last48/detail/Last48EventPeek.tsx`

Acceptance: hovering a dot opens the popover after 350ms; click pins; outside click / Esc dismisses; rail remains fully visible and scrollable.

### PR 2: Selected-event treatment (rail + map)
**~200 lines · 1 new file · 3 modified**

- New: `src/views/Last48/modes/FlowSelectedRadar.tsx` (SVG radar overlay)
- Modify: `src/views/Last48/modes/FlowMode.tsx` (mount FlowSelectedRadar)
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx` (add selected circle layer; desaturation overlay)
- Modify: `src/views/Last48/modes/FlowRail.tsx` (inversion styling on selected row + accent tab)

Acceptance: selecting a row visibly inverts the row, highlights the matching map dot with a cream ring + radar sweep, and dims the rest of the map subtly.

### PR 3: Keyboard browsability
**~80 lines · 1 modified**

- Modify: `src/views/Last48/modes/FlowRail.tsx` (listbox role, key handlers, roving focus)
- Modify: `src/views/Last48/modes/FlowMode.tsx` (Esc handler hoists to deselect)

Acceptance: rail receives focus on Tab; arrow keys navigate; Enter pins the hover-box; Esc deselects.

### PR 4: Dot vocabulary — sparse-layer marks
**~150 lines · 1 modified, sprite assets**

- New: 3 SVG sprite files (or inline data URIs) — `diamond`, `tick`, `ring`
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx` (replace single circle layer with 3 layers: circles for density, rings for 911 Historical, symbols for Police+Parking)

Acceptance: Police events render as diamonds, on top of other layers, with a subtle terracotta halo. Parking renders as small ochre ticks. 911 Historical renders as hollow rings.

### PR 5: "Feels alive" animations
**~120 lines · 1 new file · 2 modified**

- New: `src/views/Last48/modes/FlowNewEventRipple.tsx` (or paint-expression based)
- Modify: `src/hooks/useLast48Window.ts` (track `newEventIds` for ~600ms)
- Modify: `src/views/Last48/modes/FlowMapLayer.tsx` (new-event ring filter expression)
- Modify: `src/views/Last48/Last48.tsx` (mode-transition cross-fade wrapper)

Acceptance: new events arrive with a brief cream ring that fades over 600ms; switching modes cross-fades smoothly. All animations respect `prefers-reduced-motion`.

### PR 6: Chrome polish
**~150 lines · 5 modified**

- Modify: `src/views/Last48/Last48.tsx` (header pull-quote margin note)
- Modify: `src/views/Last48/chrome/FreshnessChipStrip.tsx` (italic Fraunces eyebrow + double-rule)
- Modify: `src/views/Last48/chrome/ModeToggle.tsx` (corner-glow on active)
- Modify: `src/views/Last48/chrome/DatasetFilterChips.tsx` (consistent opacity)
- Modify: `src/views/Last48/chrome/ScannerStrip.tsx` (double-rule + transparent moss button)

Acceptance: header has the italic editorial margin note; freshness strip has the new eyebrow; active mode toggle has corner-glow; scanner strip feels footer-like.

### PR 7 (optional): Open-call subtle breathing
**~80 lines · 1 new file**

- New: `src/views/Last48/modes/FlowOpenCallBreath.tsx` (SVG overlay)
- Modify: `src/views/Last48/modes/FlowMode.tsx` (mount it conditionally on motion preference)

Acceptance: open 911 calls gently breathe at 4s cycle; reduced-motion users see no animation.

This one is **explicitly optional** — if it feels noisy after PR 1-6 ship, drop it. The other animations carry the "alive" feeling already.

---

## Accessibility annotations

- **Keyboard:** PR 3 makes the rail a proper listbox. The hover-box is `role="dialog"` with focus management on pin. Escape consistently dismisses.
- **Focus visibility:** every interactive element gets a `focus-visible:ring-1 focus-visible:ring-ochre-500` treatment (existing pattern in the codebase).
- **Reduced motion:** `motion-reduce:` Tailwind variants on every animation overlay. The radar sweep, new-event ripple, and open-call breathing all disappear under `prefers-reduced-motion: reduce`. The mode cross-fade reduces to an instant swap. Hover-box arrival animation uses `motion-reduce:animate-none`.
- **Color contrast:** the cream-on-espresso inversion meets WCAG AA at all text sizes. The dataset-pigment accent tabs and ring strokes are decorative; their contrast doesn't need to meet text contrast.
- **Screen readers:** the hover-box has a descriptive `aria-label`. Map dots are not currently exposed to screen readers — the rail's listbox is the screen-reader-accessible path to the same information. This is an acceptable trade-off given the rail's completeness.
- **`aria-live`:** the rail's "X events · 48h window" counter could be wrapped in `aria-live="polite"` so screen reader users get a soft notification when new events arrive. Worth doing in PR 3.

## Performance annotations

- **Mapbox paint expressions** are zero-cost at runtime — they evaluate per-feature on the GPU. The three-layer split (circles + rings + symbols) has no measurable perf impact vs the single-layer current state.
- **Symbol layer cost:** `icon-allow-overlap: true` is the expensive flag. We're using it on a <500-feature layer (Police + Parking combined), so the cost is bounded.
- **New-event ring fade-out** via React `setTimeout`-driven re-render is fine at the cadence we're polling (every 2 min for 911 Realtime, slower for others). The volume of "new" events between polls rarely exceeds 30; the 600ms timeout fires per event but the re-render is debounced via `useSyncExternalStore`.
- **Selected-dot radar sweep** uses CSS `transform: rotate()` on a single SVG element — GPU-accelerated, ~1ms/frame.
- **Map.project on every move** in `FlowSelectedRadar` happens at 60fps during panning. Mapbox emits `move` ~once per frame, and the `setPos` updates a single tiny SVG element. Cheap.
- **Bundle size:** no new dependencies. Two new SVG sprite assets (~2 KB combined) and a few hundred lines of TSX.

## Mobile annotations

- **Hover-box → bottom sheet on <768px width:** the component detects viewport and switches presentation. Anchored to the tapped item conceptually (a small arrow indicator on the sheet points to the tapped position via a top-edge marker), but visually a full-width sheet at the bottom — drawer-like.
- **Rail collapses to chevron at <1024px:** existing `MapSidebar` primitive already handles this. When collapsed, the hover-box's "show event detail" path is the only way to inspect an event — so the hover-box mobile UX needs to be polished. The bottom-sheet presentation handles this well.
- **Touch targets:** all interactive elements meet 44×44 minimum. Map dots at zoom 14 are 14px (radius 7) — too small for thumb tapping. We could add a transparent "hit area" expansion via Mapbox's `circle-radius` with a low-opacity outer ring, OR encourage zoom-to-tap. Add a "tap a dot to inspect" hint at first load on mobile?
- **Reduced motion + mobile:** mobile users on low-power devices benefit from reduced motion. The animation cap (one selected target at a time) prevents perf cliffs.

---

## Aesthetic check: "civic observatory"

A reviewer should verify, after PR 1-6 land, that the view *feels like*:

- **A newsroom wall display:** chrome is calm and editorial; pull-quote tells you what you're watching; data is exact and tabular.
- **An observatory:** the selected event is a radar target; the map dims around it; new arrivals pulse briefly.
- **An honest log:** the freshness chip strip is prominent and transparent; closed 911 calls visibly *recede* compared to active ones; the "Stands Out" rail (in HOTSPOTS) shows methodology in its footer.

If the view feels like *another analytics dashboard*, something has gone wrong. Bring it back to civic-observatory through one of the seven concrete moves (especially the pull-quote, the corner-glow on the active mode, and the cream-inversion selection state).

---

## Decisions (locked 2026-05-13)

1. **Header italic editorial line:** *"Public data update on different cycles with varying latency, as shown."* — terser, journalistic, factual. The "as shown" phrase ties the line directly to the freshness chip strip below it.
2. **Police mark:** Diamond. Ship and judge in production.
3. **Open-call breathing (PR 7):** Skipped. The static visual distinction already in main (open events: cream stroke + larger radius + gentler fade; closed events: dark stroke + smaller + faster fade) carries the lifecycle signal without ongoing motion. PR 7 dropped from the roadmap.
4. **Mode cross-fade duration:** 200ms.

---

**End of design direction.** Roadmap above lists PRs in dependency-safe order — implement PR 1 first; everything else can follow in any order after.

---

## Implementation status (updated 2026-05-13)

Phase 2.5b shipped across PRs #34–#39. The design direction document above was the authoritative spec; this section records what shipped vs. what was revised in flight.

### Shipped as designed
- PR 1: click-driven `DetailPanelShell` card (hover-dwell concept replaced with click-only, matching DataDiver convention)
- PR 2: selected-event ring + rail tint treatment; paper-* `@theme` token gap discovered and fixed
- PR 3: keyboard browsability — FlowRail as `role="listbox"`, page-level Esc deselect
- PR 4a: tonal age ramp with per-dataset `LATENCY_BASELINE_MS` floors
- PR 6: chrome polish — italic Fraunces freshness eyebrow, corner-glow on active mode toggle, double-rule on scanner strip, transparent moss TUNE IN button

### Design decisions reversed in flight

**Hover-dwell detail panel (§1):** The 350ms dwell pattern was designed in §1 and implemented in PR 1, then abandoned in favor of click-only. Click matches the convention established across every other DataDiver view and avoids the mobile/complexity tradeoffs. The component was renamed from `Last48EventHoverBox` to `Last48EventCard` to reflect its click-driven nature.

**Dim-mask "spotlight by dimming others" (§2):** The `filter: saturate(0.6) brightness(0.9)` overlay on non-selected dots was implemented in PR 2 and removed in PR 6. At citywide zoom with 5k–15k dots, per-feature espresso overlays stacked into dark blots rather than subtle dimming. The selected event's sonar-ping emanation provides sufficient differentiation without a dim overlay.

**Rotating radar-wedge animation (§2):** Replaced by sonar-ping emanation (two staggered concentric rings). Emanation reads as "this is alive" vs. radar sweep's "this is being scanned" — the former matches the civic-observatory register better.

**Pull-quote header margin note (§7a):** Designed and added in PR 6, then removed by user request. The italic editorial aside didn't earn its real estate at The Last 48's compact header height.

**Open-call breathing (PR 7):** Not shipped. The static visual distinction (open events: cream stroke + larger radius; closed events: dark espresso stroke + smaller radius) carries the lifecycle signal without ongoing animation. PR 7 dropped per the §"Decisions (locked)" note.

### Gotchas discovered during implementation

- Tailwind v4 `@theme` gap: `bg-paper-200` and related classes produced no CSS until the paper-* scale was added to `src/index.css`'s `@theme` block. See `[[tailwind-v4-theme-tokens-required]]`.
- SVG `transform-origin` defaults to element bbox: sonar-ping circles required `transform-box: view-box` to rotate around the SVG center. See `[[svg-transform-box-view-box]]`.
- `map.project()` returns canvas-relative coords — SVG overlays use `position: absolute` inside the map's `relative` container, not `position: fixed`.
- Socrata SoQL rejects `.000Z` in ISO strings — strip with `.slice(0, 19)` before passing date values in WHERE clauses.
