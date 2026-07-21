// src/views/Last48/modes/FlowMapLayer.tsx
//
// Mapbox layer rendering one circle per NormalizedEvent.
// Older events fade in opacity across the 48h window.
//
// Interaction model (click-driven — no hover dwell):
//   onSelect — fired on click. Caller opens the detail panel with this event.
//              If the same event is clicked again, caller should deselect.
//   mouseenter/mouseleave — ONLY changes the cursor to 'pointer'.
//
// Selected event gets a cream stroke ring rendered via a second Mapbox
// circle layer filtered to the selected event id. No radar sweep yet
// (that arrives in PR 2); just a visible cream border circle.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import { useChronologicalReveal, hashId } from '@/hooks/useChronologicalReveal'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import { LAST48_DATASETS } from '@/types/last48'
import { useAppStore } from '@/stores/appStore'
import { mixHex } from '@/utils/colorMix'

// Inter-sweep buffer — once stream N completes, wait this long before
// stream N+1 is allowed to start. Gives the eye time to register "stream 1
// just finished, stream 2 is starting" rather than blurring into one event.
const INTER_SWEEP_BUFFER_MS = 1200

// Per-stream sweep durations, asymmetric by editorial weight:
//   911 Realtime (6s)  — the editorial spine of The Last 48: live emergency
//     response. Establishes the canvas with the most narrative weight, so
//     it gets the most generous reveal. Per-event rate stays low (~24 events
//     across 6s = ~4/s, easy for the eye to track).
//   Fire/EMS (3.5s)    — overlays onto already-populated map; brisker tempo.
//   311 Cases (3s)     — final layer; ~2,000 events across 3s = high rate
//     but reads as "ambient density" against the already-visible 911 + Fire/EMS
//     dots. The eye no longer needs to track individual arrivals.
//
// Total visual reveal arc (data-loaded case): 0 → ~14.5s
//   0s     → 911 starts sweep
//   6s     → 911 sweep ends
//   7.2s   → Fire/EMS starts (post-buffer)
//   10.7s  → Fire/EMS sweep ends
//   11.9s  → 311 starts (post-buffer)
//   14.9s  → 311 sweep ends, ambient pulse fades
const SWEEP_DURATIONS_MS: Record<DatasetId, number> = {
  '911-realtime':      6000,
  'fire-ems-dispatch': 3500,
  '311-cases':         3000,
}

const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',
  'fire-ems-dispatch': '#b85a33',
  '311-cases':         '#7a9954',
}

// ─────────────────────────────────────────────────────────────────────────────
// Tonal age ramp — within each pigment family, events fade toward a paper-tone
// anchor as they age. Preserves the dataset's pigment identity (so the eye
// still reads "this is 911" from a glance) while making age legible as a
// tonal shift. Four discrete buckets across the 48h window for clarity
// (continuous interpolation smears the gradient illegibly on a dark basemap).
// ─────────────────────────────────────────────────────────────────────────────

const PAPER_ANCHOR        = '#d4c8a8'  // paper-300 — the "drying-out" pigment target

// Effective-age bucket boundaries (hours since each dataset's natural
// freshness floor) and the corresponding mix coefficient. Both the fill
// (toward PAPER_ANCHOR) and the open-event stroke (cream → paper) use the
// same coefficient so they age in lockstep.
//
// Asymmetric curve: most of the tonal motion happens in the first 24 hours
// (where editorial differentiation matters — fresh news vs day-old news);
// the curve flattens in the second 24h so aged events still hold enough
// pigment identity to remain readable as their dataset.
const AGE_BUCKETS: Array<{ maxHours: number; mix: number }> = [
  { maxHours: 6,  mix: 0    },  // freshness floor → +6h     — fresh
  { maxHours: 18, mix: 0.45 },  // +6h → +18h                — recent
  { maxHours: 30, mix: 0.60 },  // +18h → +30h               — settling
  { maxHours: 48, mix: 0.70 },  // +30h → +48h               — aged
]

// Per-dataset "freshness floor" — SF data publishes with intrinsic lag, so
// the freshest event we ever fetch for each dataset is already several hours
// old. Subtracting the baseline before bucketing means "fresh" tone (0% mix)
// is reserved for events at the freshest end of each dataset's natural
// delivery range — not at literal age 0, which never occurs.
//
// Values are inferred from observed event-lag floors (see brief). These are
// static; if a dataset's typical lag drifts substantially, recalibrate.
//
// The original 7h floor for 911 Realtime was a measurement artifact of the
// SF-local-vs-UTC timestamp bug (exactly the PDT offset). With epochs parsed
// correctly (sfTime.ts) the feed's true floor is ~15–30 min — re-measured
// 2026-07-01: MAX(received_datetime) was 16 min behind the SF clock.
const LATENCY_BASELINE_MS: Record<DatasetId, number> = {
  '911-realtime':       30 * 60 * 1000,
  'fire-ems-dispatch': 12 * 60 * 60 * 1000,
  '311-cases':         15 * 60 * 60 * 1000,
}

/**
 * Resolve the bucket for an event's effective age — `rawAgeMs` minus the
 * dataset's freshness-floor baseline. An event right at the dataset's floor
 * (the freshest one we can practically see) lands in bucket 0.
 */
function ageBucket(datasetId: DatasetId, rawAgeMs: number) {
  const effectiveMs = Math.max(0, rawAgeMs - LATENCY_BASELINE_MS[datasetId])
  const hours = effectiveMs / (60 * 60 * 1000)
  return AGE_BUCKETS.find((b) => hours < b.maxHours) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1]
}

/** Resolve the dataset's pigment shifted by age toward the paper anchor. */
function ageColor(datasetId: DatasetId, rawAgeMs: number): string {
  const base = COLORS[datasetId]
  const bucket = ageBucket(datasetId, rawAgeMs)
  if (bucket.mix === 0) return base
  return mixHex(base, PAPER_ANCHOR, bucket.mix)
}

interface Ripple { id: string; lng: number; lat: number; bornAt: number }

interface Props {
  map: mapboxgl.Map | null
  events: NormalizedEvent[]
  /** ID of the currently selected event (for the cream ring overlay). */
  selectedId?: string
  /** Called on click — select this event. */
  onSelect?: (event: NormalizedEvent) => void
  /** Called when significant new events arrive (priority-A 911 or newly-open 911).
   *  Receives an array of ripple descriptors to forward to FlowArrivalRipples. */
  onNewRipples?: (ripples: Ripple[]) => void
  /** Per-dataset FULL-load flags from useLast48Window. The serialized Stream
   *  Curtain sweep gates on these — each stream sweeps only once its complete
   *  48h data has loaded, so the chronological reveal runs over the full data
   *  in one pass. Gating on full (not head) also makes the sweep order
   *  deterministic regardless of which Socrata query returns first: stream0
   *  (911) always leads because the gate is keyed to the fixed stream order,
   *  not data-arrival order. */
  fullyLoadedByDataset?: Record<DatasetId, boolean>
  /** Called on each stream's sweep phase transition: 'sweeping' the moment
   *  its chronological reveal is enabled (dots actively landing on the
   *  canvas), 'settled' when the sweep completes — including the
   *  fast-forward click and reduced-motion short-circuits. Drives the
   *  DatasetSuperChips arrival sheen: the streaming beacon lights exactly
   *  one chip at a time (the curtain serializes sweeps), so the chrome
   *  performs the same baton pass as the map. */
  onSweepPhase?: (id: DatasetId, phase: 'sweeping' | 'settled') => void
}

const SOURCE_ID        = 'last48-flow-events'
const LAYER_ID         = 'last48-flow-events-circles'
const SELECTED_RING_ID = 'last48-flow-events-selected-ring'

// ── Hollow-point paint model ────────────────────────────────────────────────
// Routine events render as HOLLOW RINGS — a pigment-colored stroke with NO
// fill. This is a deliberately light footprint that sits cleanly over
// choropleth fills (the old faint-fill + bright-stroke model read as ghost
// halos at high density and competed visually with underlays).
//
// Priority-A "key events" are the exception: they render SOLID (filled), so
// the genuinely urgent calls are the ONLY filled marks on a map of rings —
// instant focal points. (Editorial decision, May 2026.)
//
// All opacity is gated by feature-state.revealed so the Stream Curtain
// chronological reveal still works — unrevealed features are fully invisible
// (both fill AND stroke at 0), and the 400ms transitions give each event a
// soft fade-in when its revealed flag flips.

// FILL opacity — priority-A ONLY. Routine events have zero fill (hollow).
const FILL_OPACITY: mapboxgl.ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'revealed'], false],
  ['case',
    ['get', 'isPriorityA'],
    // Priority-A solid fill: full at age 0, slow decay across 48h
    ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.85],
    0,  // routine: no fill
  ],
  0,  // unrevealed: invisible
]

// STROKE opacity — the ring. Routine events: pigment ring, age-faded.
// Priority-A: full-opacity ring (indigo-300) wrapping the solid fill.
const STROKE_OPACITY: mapboxgl.ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'revealed'], false],
  ['case',
    ['get', 'isPriorityA'],
    1,
    ['case',
      ['get', 'isOpen'],
      // Open routine ring: bright, fades to 0.6 by 48h
      ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.6],
      // Closed routine ring: slightly dimmer, fades to 0.45 by 48h
      ['interpolate', ['linear'], ['get', 'age'], 0, 0.85, 172800000, 0.45],
    ],
  ],
  0,  // unrevealed: invisible
]

export default function FlowMapLayer({ map, events, selectedId, onSelect, onNewRipples, fullyLoadedByDataset, onSweepPhase }: Props) {
  // Stable refs so event handlers don't need to re-attach when props change.
  const eventsRef      = useRef(events)
  const onSelectRef    = useRef(onSelect)
  const selectedIdRef  = useRef(selectedId)
  const onNewRipplesRef = useRef(onNewRipples)
  eventsRef.current     = events
  onSelectRef.current   = onSelect
  onNewRipplesRef.current = onNewRipples
  selectedIdRef.current = selectedId

  // ── Per-stream chronological reveal — serialized ────────────────────────
  // Each stream's sweep waits for the previous stream's sweep to complete
  // (plus INTER_SWEEP_BUFFER_MS). Without this, with warm Socrata caches
  // all three fetches return within a 2-4s window and the sweeps overlap
  // into one indistinct swarm. The data lands whenever; the *visual reveal*
  // runs on its own clock with deliberate cadence.
  //
  // Order: 911 → Fire/EMS → 311 (LAST48_DATASETS index order).
  const eventsByStream = useMemo(() => {
    const groups: Record<DatasetId, NormalizedEvent[]> = {
      '911-realtime':      [],
      'fire-ems-dispatch': [],
      '311-cases':         [],
    }
    for (const e of events) {
      if (e.longitude == null || e.latitude == null) continue
      groups[e.datasetId].push(e)
    }
    return groups
  }, [events])

  // Tracks which streams have finished sweeping (post-buffer). Each entry
  // is added INTER_SWEEP_BUFFER_MS *after* its sweep onComplete fires —
  // so dependent streams are gated on the buffer, not just on raw completion.
  const [sweepReleased, setSweepReleased] = useState<Set<DatasetId>>(new Set())

  // Fast-forward state — clicking the map during loading flips this true
  // and short-circuits all three hooks. See the click handler effect below.
  const [forceCompleteAll, setForceCompleteAll] = useState(false)

  const releaseSweep = useCallback((id: DatasetId) => {
    setTimeout(() => {
      setSweepReleased((prev) => {
        if (prev.has(id)) return prev
        const next = new Set(prev)
        next.add(id)
        return next
      })
    }, INTER_SWEEP_BUFFER_MS)
  }, [])

  // Stream N is enabled when:
  //   1. its own FULL (head + backfill) fetch has completed — so the sweep
  //      runs over complete data in one chronological pass,
  //   2. all earlier streams in the fixed order have had their sweep released.
  //
  // Gating on FULL load (not head) is what makes the order deterministic:
  // stream0 (911) always leads even though it's the largest dataset and its
  // Socrata query returns LAST. Previously the sweep gated on head-load, so
  // whichever stream's data arrived first (Fire/EMS, smallest) effectively
  // led and the serialized stagger collapsed.
  const stream0 = LAST48_DATASETS[0]
  const stream1 = LAST48_DATASETS[1]
  const stream2 = LAST48_DATASETS[2]

  const enabled0 = !!fullyLoadedByDataset?.[stream0]
  const enabled1 = !!fullyLoadedByDataset?.[stream1] && sweepReleased.has(stream0)
  const enabled2 = !!fullyLoadedByDataset?.[stream2] && sweepReleased.has(stream1)

  // Sweep-START notifications — the moment each stream's reveal becomes
  // enabled its dots start landing, so its chip flips to the streaming
  // beacon. Effects (not inline calls) so each fires exactly once on the
  // false → true transition.
  useEffect(() => { if (enabled0) onSweepPhase?.(stream0, 'sweeping') }, [enabled0, stream0, onSweepPhase])
  useEffect(() => { if (enabled1) onSweepPhase?.(stream1, 'sweeping') }, [enabled1, stream1, onSweepPhase])
  useEffect(() => { if (enabled2) onSweepPhase?.(stream2, 'sweeping') }, [enabled2, stream2, onSweepPhase])

  // Memoized onComplete handlers — stable identity to keep the hook's deps
  // clean. Each release advances the chain after the buffer delay; the
  // settle notification fires immediately (the chip sheen should fade the
  // moment the stream's last dot lands, not after the inter-sweep buffer).
  const onComplete0 = useCallback(() => { releaseSweep(stream0); onSweepPhase?.(stream0, 'settled') }, [releaseSweep, stream0, onSweepPhase])
  const onComplete1 = useCallback(() => { releaseSweep(stream1); onSweepPhase?.(stream1, 'settled') }, [releaseSweep, stream1, onSweepPhase])
  const onComplete2 = useCallback(() => { releaseSweep(stream2); onSweepPhase?.(stream2, 'settled') }, [releaseSweep, stream2, onSweepPhase])

  useChronologicalReveal({
    map,
    sourceId: SOURCE_ID,
    events: eventsByStream[stream0],
    enabled: enabled0,
    durationMs: SWEEP_DURATIONS_MS[stream0],
    forceComplete: forceCompleteAll,
    onComplete: onComplete0,
  })
  useChronologicalReveal({
    map,
    sourceId: SOURCE_ID,
    events: eventsByStream[stream1],
    enabled: enabled1,
    durationMs: SWEEP_DURATIONS_MS[stream1],
    forceComplete: forceCompleteAll,
    onComplete: onComplete1,
  })
  useChronologicalReveal({
    map,
    sourceId: SOURCE_ID,
    events: eventsByStream[stream2],
    enabled: enabled2,
    durationMs: SWEEP_DURATIONS_MS[stream2],
    forceComplete: forceCompleteAll,
    onComplete: onComplete2,
  })

  // ── Fast-forward: click anywhere on the map to skip the reveal ───────────
  // While any stream is still mid-sweep or queued, a click on the Mapbox
  // canvas fast-forwards: bumps sweepReleased to contain ALL streams (so
  // each hook becomes "enabled") and flips forceCompleteAll which makes the
  // hooks short-circuit their sweep. The result: every event currently
  // loaded reveals at once, the scheduler unlocks downstream streams which
  // also short-circuit if their data has landed, and the user is dropped
  // straight into "settled" state.
  //
  // The ambient BootEmanation pulse stays controlled by isLoadingAny (data
  // fetching) — if a slow stream is still mid-fetch when the user clicks,
  // the pulse keeps going until that data lands. That's correct: clicking
  // "skips the animation" but doesn't fake-skip the network.
  //
  // Uses a ref so the handler reads current eligibility on each click
  // without re-attaching the listener every render.
  const fastForwardEligibleRef = useRef(false)
  fastForwardEligibleRef.current =
    !forceCompleteAll && sweepReleased.size < LAST48_DATASETS.length

  useEffect(() => {
    if (!map) return
    const handler = () => {
      if (!fastForwardEligibleRef.current) return
      setForceCompleteAll(true)
      setSweepReleased(new Set(LAST48_DATASETS))
    }
    map.on('click', handler)
    return () => {
      map.off('click', handler)
    }
  }, [map])

  // ── Significant-arrivals tracking ────────────────────────────────────────
  // seenIds accumulates all event IDs we have ever rendered. On each `events`
  // update we check for newcomers that pass the significance gate; the first
  // poll seeds the set (no false-positive burst on mount).
  const seenIdsRef = useRef<Set<string>>(new Set())
  const isFirstPollRef = useRef(true)

  // Build GeoJSON from events that have coordinates.
  //
  // The dot's `color` is age-shifted: dataset pigment mixed toward the paper
  // anchor by age bucket. Fresh events render in full pigment; older events
  // visually "dry out" toward paper tone. Re-evaluated whenever `events`
  // changes (every poll), which is sufficient — bucket boundaries are wider
  // than any poll interval.
  const geojson = useMemo<GeoJSON.FeatureCollection>(() => {
    const now = Date.now()
    const features: GeoJSON.Feature[] = events
      .filter((e) => e.longitude != null && e.latitude != null)
      .map((e) => {
        const age = now - e.receivedAt
        const isOpen = e.state === undefined || e.state === 'open'
        // historical excluded — backfilled data; priority-A urgency cue
        // is only meaningful on the realtime stream
        const isPriorityA = e.datasetId === '911-realtime' && e.priority === 'A'
        return {
          type: 'Feature',
          // Top-level `id` is required for map.setFeatureState — Mapbox uses
          // it as the lookup key. Use NUMERIC hash of the string id because
          // Mapbox's feature-state lookup is unreliable for string IDs across
          // setData calls (state can be silently dropped). Same hash is used
          // by useChronologicalReveal so both ends agree. Keep `properties.id`
          // as the original string for click handlers + selected-ring filter.
          id: hashId(e.id),
          properties: {
            id: e.id,
            datasetId: e.datasetId,
            // Priority-A keeps full pigment regardless of age — the age
            // tonal ramp was bleaching priority-A toward paper at the same
            // rate as routine, erasing visual hierarchy at the back of the
            // 48h window. Routine events still fade with age.
            color: isPriorityA ? COLORS[e.datasetId] : ageColor(e.datasetId, age),
            age,
            isOpen,
            isPriorityA,
            headline: e.headline ?? '',
          },
          geometry: { type: 'Point', coordinates: [e.longitude!, e.latitude!] },
        }
      })
    return { type: 'FeatureCollection', features }
  }, [events])

  // ── Significant-arrivals detection ───────────────────────────────────────
  // Runs on every `events` update.
  //
  // Cold-load behavior: on the FIRST time we have non-empty events, seed
  // every event as already-seen. NO RIPPLES fire on cold load — the
  // progressive chronological reveal (Stream Curtain) is the signal; ripples
  // would compete with it. The priority-A *static* dot treatment (2.5px
  // indigo-300 stroke, age-fade-immune fill, larger radius) still
  // differentiates them visually without transient emanation.
  //
  // Subsequent renders (live polls): newcomer priority-A 911 events DO fire
  // ripples — that's the editorial signal of a genuinely new urgent call.
  //
  // Bug-fix note (from earlier in PR #52): the previous version flipped
  // isFirstPollRef.current on the very first effect run, BEFORE any data
  // had arrived (events was []). That meant the second run (when data
  // actually landed) treated every event as a newcomer. The seeding now
  // only fires once events.length > 0.
  useEffect(() => {
    if (isFirstPollRef.current) {
      if (events.length === 0) return  // wait for actual data
      for (const ev of events) seenIdsRef.current.add(ev.id)
      isFirstPollRef.current = false
      return
    }

    const newRipples: Ripple[] = []
    const bornAt = Date.now()
    for (const ev of events) {
      if (seenIdsRef.current.has(ev.id)) continue
      seenIdsRef.current.add(ev.id)
      // Priority-A 911 only — narrowed from the previous gate which also
      // included `state === 'open'`. Open-but-routine calls don't deserve
      // the visual emphasis; reserve ripples for the genuinely urgent.
      const isSignificant =
        ev.datasetId === '911-realtime' && ev.priority === 'A'
      if (isSignificant && ev.longitude != null && ev.latitude != null) {
        newRipples.push({ id: ev.id, lng: ev.longitude!, lat: ev.latitude!, bornAt })
      }
    }
    if (newRipples.length > 0) {
      onNewRipplesRef.current?.(newRipples)
    }
  }, [events])  // intentional — seenIdsRef + onNewRipplesRef are stable

  // Base circles layer + selected-ring overlay.
  // The ring is filtered to the selected id at the Mapbox expression level —
  // no React re-render needed when selection changes (see useEffect below).
  // Selection ring inverts with the basemap: cream on dark-v11, espresso on light-v11.
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  const layers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        // Fill color — used only by priority-A (the solid marks). Routine
        // events have FILL_OPACITY 0, so this is effectively inert for them.
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, ['case',
            ['get', 'isPriorityA'], ['case', ['get', 'isOpen'], 6, 5],
            ['case', ['get', 'isOpen'], 4, 3],
          ],
          14, ['case',
            ['get', 'isPriorityA'], ['case', ['get', 'isOpen'], 10, 9],
            ['case', ['get', 'isOpen'], 7, 6],
          ],
        ],
        // Fill: priority-A only (see FILL_OPACITY). Routine = hollow.
        'circle-opacity': FILL_OPACITY,
        'circle-opacity-transition': { duration: 400, delay: 0 },
        // Stroke carries the dataset pigment for routine events (the ring IS
        // the dot). Priority-A uses indigo-300 as a key-event accent ring
        // around its solid fill.
        'circle-stroke-color': [
          'case',
          ['get', 'isPriorityA'],
          '#aab3d4',          // indigo-300 — key-event accent
          ['get', 'color'],   // dataset pigment (age-shifted)
        ],
        'circle-stroke-width': [
          'case',
          // Priority-A: definition ring around the solid fill.
          ['get', 'isPriorityA'], 1.5,
          // Routine hollow rings: open slightly heavier than closed.
          ['case', ['get', 'isOpen'], 1.5, 1],
        ],
        // Stroke gated by revealed (Stream Curtain). For routine events this
        // is the PRIMARY visual; for priority-A it wraps the fill.
        'circle-stroke-opacity': STROKE_OPACITY,
        'circle-stroke-opacity-transition': { duration: 400, delay: 0 },
      },
    } as mapboxgl.AnyLayer,
    {
      // Selected-event ring — cream stroke circle, larger than the base dot.
      // Rendered above the base circles so it acts as a visible selection ring.
      // Filter is set to match no features initially; updated via setFilter below.
      id: SELECTED_RING_ID,
      type: 'circle',
      source: SOURCE_ID,
      filter: ['==', ['get', 'id'], ''],   // empty string → nothing selected
      paint: {
        'circle-color': 'transparent',
        'circle-radius': [
          'interpolate', ['linear'], ['zoom'],
          10, 8,
          14, 13,
        ],
        'circle-opacity': 1,
        'circle-stroke-color': isDarkMode ? '#f5ecd9' : '#1e140d',  // cream on dark basemap, espresso on light
        'circle-stroke-width': 2,
      },
    } as mapboxgl.AnyLayer,
  ], [isDarkMode])

  useMapLayer(map, SOURCE_ID, geojson, layers)

  // -------------------------------------------------------------------------
  // Sync the selected-ring filter to selectedId without a full layer rebuild.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return
    // Poll until the layer is available (useMapLayer may still be retrying).
    const trySet = () => {
      try {
        if (map.getLayer(SELECTED_RING_ID)) {
          map.setFilter(SELECTED_RING_ID, [
            '==', ['get', 'id'], selectedId ?? '',
          ])
          return true
        }
      } catch (_err) {
        // Layer not yet registered — retry below.
      }
      return false
    }
    if (!trySet()) {
      const t = setTimeout(trySet, 300)
      return () => clearTimeout(t)
    }
  }, [map, selectedId])

  // -------------------------------------------------------------------------
  // Cursor + click handlers (no hover dwell)
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!map) return

    const onMouseEnter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = ''
    }

    const onClick = (
      e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] },
    ) => {
      const feature = e.features?.[0]
      if (!feature) return
      const id = feature.properties?.id as string | undefined
      if (!id) return
      const ev = eventsRef.current.find((x) => x.id === id)
      if (!ev) return
      onSelectRef.current?.(ev)
    }

    map.on('mouseenter', LAYER_ID, onMouseEnter)
    map.on('mouseleave', LAYER_ID, onMouseLeave)
    map.on('click',      LAYER_ID, onClick)

    return () => {
      map.off('mouseenter', LAYER_ID, onMouseEnter)
      map.off('mouseleave', LAYER_ID, onMouseLeave)
      map.off('click',      LAYER_ID, onClick)
    }
  }, [map])  // intentionally stable — refs handle live props

  return null
}
