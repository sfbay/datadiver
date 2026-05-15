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

import { useEffect, useMemo, useRef } from 'react'
import mapboxgl from 'mapbox-gl'
import { useMapLayer } from '@/hooks/useMapLayer'
import type { NormalizedEvent, DatasetId } from '@/types/last48'

const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',
  'fire-ems-dispatch': '#b85a33',
  '311-cases':         '#7a9954',
  '911-historical':    '#5c9693',
  'parking-revenue':   '#d4a435',
  'police-incidents':  '#963e30',
}

// ─────────────────────────────────────────────────────────────────────────────
// Tonal age ramp — within each pigment family, events fade toward a paper-tone
// anchor as they age. Preserves the dataset's pigment identity (so the eye
// still reads "this is 911" from a glance) while making age legible as a
// tonal shift. Four discrete buckets across the 48h window for clarity
// (continuous interpolation smears the gradient illegibly on a dark basemap).
// ─────────────────────────────────────────────────────────────────────────────

const PAPER_ANCHOR        = '#d4c8a8'  // paper-300 — the "drying-out" fill target
const STROKE_FRESH_OPEN   = '#f5ecd9'  // cream — open-event stroke at age 0
const STROKE_AGED_OPEN    = '#a8926a'  // paper-500 — open-event stroke at full age

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
const LATENCY_BASELINE_MS: Record<DatasetId, number> = {
  '911-realtime':       7 * 60 * 60 * 1000,
  'fire-ems-dispatch': 12 * 60 * 60 * 1000,
  '311-cases':         15 * 60 * 60 * 1000,
  '911-historical':    15 * 60 * 60 * 1000,
  'parking-revenue':   17 * 60 * 60 * 1000,
  'police-incidents':  39 * 60 * 60 * 1000,
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex(
    ar + (br - ar) * t,
    ag + (bg - ag) * t,
    ab + (bb - ab) * t,
  )
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

/**
 * Open-event stroke color, aged toward paper. Fresh = bright cream; aged =
 * paper-tone. Closed events render a dark espresso stroke regardless of age
 * (their stroke recedes by virtue of low contrast against the basemap).
 */
function ageStrokeOpen(datasetId: DatasetId, rawAgeMs: number): string {
  const bucket = ageBucket(datasetId, rawAgeMs)
  if (bucket.mix === 0) return STROKE_FRESH_OPEN
  return mixHex(STROKE_FRESH_OPEN, STROKE_AGED_OPEN, bucket.mix)
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
  /** Per-dataset initial-load flags from useLast48Window. When a flag flips
   *  false → true, the layer runs a brief fade-in (circle-opacity 0 → expression)
   *  via Mapbox's circle-opacity-transition. */
  initialLoadedByDataset?: Record<DatasetId, boolean>
}

const SOURCE_ID        = 'last48-flow-events'
const LAYER_ID         = 'last48-flow-events-circles'
const SELECTED_RING_ID = 'last48-flow-events-selected-ring'

// The circle-opacity expression — extracted as a constant so the stream-batch
// fade-in effect can restore it after briefly zeroing the opacity.
const OPACITY_EXPRESSION: mapboxgl.ExpressionSpecification = [
  'case',
  ['get', 'isPriorityA'],
  // Priority-A: full opacity at age 0, slower decay
  ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.8],
  ['case',
    ['get', 'isOpen'],
    ['interpolate', ['linear'], ['get', 'age'], 0, 1.0, 172800000, 0.55],
    ['interpolate', ['linear'], ['get', 'age'], 0, 0.7, 172800000, 0.25],
  ],
]

export default function FlowMapLayer({ map, events, selectedId, onSelect, onNewRipples, initialLoadedByDataset }: Props) {
  // Stable refs so event handlers don't need to re-attach when props change.
  const eventsRef      = useRef(events)
  const onSelectRef    = useRef(onSelect)
  const selectedIdRef  = useRef(selectedId)
  const onNewRipplesRef = useRef(onNewRipples)
  eventsRef.current     = events
  onSelectRef.current   = onSelect
  onNewRipplesRef.current = onNewRipples
  selectedIdRef.current = selectedId

  // ── Stream-batch fade-in ─────────────────────────────────────────────────
  // Track which datasets have completed their initial load. When a dataset
  // flips false → true, briefly set the layer opacity to 0, then restore the
  // expression. Mapbox's circle-opacity-transition handles the smooth fade-in.
  const prevLoadedRef = useRef<Record<DatasetId, boolean>>(
    Object.fromEntries(
      Object.keys(initialLoadedByDataset ?? {}).map((id) => [id, false])
    ) as Record<DatasetId, boolean>
  )

  useEffect(() => {
    if (!map || !initialLoadedByDataset) return

    // Check for any false → true flips
    let hadFlip = false
    for (const [id, loaded] of Object.entries(initialLoadedByDataset) as [DatasetId, boolean][]) {
      if (loaded && !prevLoadedRef.current[id]) {
        hadFlip = true
        prevLoadedRef.current[id] = true
      }
    }

    if (!hadFlip) return

    // Briefly set opacity to 0, then restore expression via rAF.
    // The transition (400ms) is set on the layer in the paint config below.
    // Store the rAF id so cleanup can cancel it if the component unmounts
    // between the zero call and the frame fire — prevents setPaintProperty
    // against a destroyed layer.
    let frameId: number | undefined
    try {
      if (map.getLayer(LAYER_ID)) {
        map.setPaintProperty(LAYER_ID, 'circle-opacity', 0)
        frameId = requestAnimationFrame(() => {
          try {
            if (map.getLayer(LAYER_ID)) {
              map.setPaintProperty(LAYER_ID, 'circle-opacity', OPACITY_EXPRESSION as unknown as mapboxgl.Expression)
            }
          } catch { /* layer may have been removed */ }
        })
      }
    } catch { /* layer not yet registered */ }

    return () => { if (frameId !== undefined) cancelAnimationFrame(frameId) }
  }, [map, initialLoadedByDataset])

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
          properties: {
            id: e.id,
            datasetId: e.datasetId,
            // Priority-A keeps full pigment regardless of age — the age
            // tonal ramp was bleaching priority-A toward paper at the same
            // rate as routine, erasing visual hierarchy at the back of the
            // 48h window. Routine events still fade with age.
            color: isPriorityA ? COLORS[e.datasetId] : ageColor(e.datasetId, age),
            // Priority-A gets a bright indigo-300 halo via circle-stroke
            // (extends OUTSIDE the radius in Mapbox), regardless of state
            // or age. Routine: open events age cream → paper; closed
            // events get the dark espresso stroke that recedes naturally.
            strokeColor: isPriorityA
              ? '#aab3d4'
              : isOpen
                ? ageStrokeOpen(e.datasetId, age)
                : '#1e140d',
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
  // Runs on every `events` update. Seeds seenIds on the first poll (no burst
  // on mount); on subsequent polls, flags newcomers that pass the significance
  // gate and calls onNewRipples with their screen-projectable descriptors.
  useEffect(() => {
    if (isFirstPollRef.current) {
      // Seed: mark all current events as already-seen so the initial batch
      // doesn't trigger a wall of ripples.
      for (const ev of events) seenIdsRef.current.add(ev.id)
      isFirstPollRef.current = false
      return
    }

    const newRipples: Ripple[] = []
    const bornAt = Date.now()
    for (const ev of events) {
      if (seenIdsRef.current.has(ev.id)) continue
      seenIdsRef.current.add(ev.id)
      const isSignificant =
        (ev.datasetId === '911-realtime' && ev.priority === 'A') ||
        (ev.datasetId === '911-realtime' && ev.state === 'open')
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
  const layers: mapboxgl.AnyLayer[] = useMemo(() => [
    {
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
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
        'circle-opacity': OPACITY_EXPRESSION,
        'circle-opacity-transition': { duration: 400, delay: 0 },
        'circle-stroke-color': ['get', 'strokeColor'],
        'circle-stroke-width': [
          'case',
          // Priority-A: 2.5px halo extending outside the dot.
          ['get', 'isPriorityA'], 2.5,
          // Routine: thin open-event stroke, thinner closed-event stroke.
          ['case', ['get', 'isOpen'], 1, 0.5],
        ],
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
        'circle-stroke-color': '#f5ecd9',  // cream
        'circle-stroke-width': 2,
      },
    } as mapboxgl.AnyLayer,
  ], [])

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
