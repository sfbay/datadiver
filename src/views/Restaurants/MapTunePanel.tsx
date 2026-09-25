// src/views/Restaurants/MapTunePanel.tsx
//
// DEV-ONLY map tuning panel, revealed by ?tune=1 — never discoverable in the
// UI (sibling of Last 48's AmbientTunePanel). Sliders re-paint the live map
// through `applyMapTune`; "COPY" puts the values on the clipboard as the
// `?maptune=` string AND the object literal to paste into DEFAULT_MAP_TUNE
// in mapLayers.ts. It exists to FIND the shipped sizes without a redeploy per
// adjustment (Jesse, Sept. 24 2026: the first cut's rings were too small and
// hid too much), not to ship knobs to readers.

import { useEffect, useState } from 'react'
import type mapboxgl from 'mapbox-gl'
import { DEFAULT_MAP_TUNE, effectiveFloors, serializeMapTune, type MapTune } from './mapLayers'

interface Props {
  map: mapboxgl.Map | null
  values: MapTune
  onChange: (next: MapTune) => void
}

interface SliderSpec {
  key: keyof MapTune
  label: string
  /** What the slider moves, per lens — shown under the label. */
  hint?: string
  /** The effective-floor key, when a rank rule can override the slider. */
  floor?: 'f1' | 'f2' | 'f3'
  min: number
  max: number
  step: number
}

// Zoom floors: the zoom where a group FIRST appears (below it, hidden).
// The map opens near 12; 11 ≈ whole city, 13 ≈ a neighborhood, 15 ≈ blocks.
const SLIDERS: SliderSpec[] = [
  { key: 'ringScale', label: 'RING SIZE ×', min: 0.5, max: 3.5, step: 0.1 },
  { key: 'dotScale', label: 'DOT SIZE ×', min: 0.5, max: 3.5, step: 0.1 },
  { key: 'floor3', label: 'MOST IMPORTANT · APPEAR AT ZOOM', hint: 'turnover: 3+ names · closures: closed now', floor: 'f3', min: 0, max: 14.5, step: 0.5 },
  { key: 'floor2', label: 'MIDDLE · APPEAR AT ZOOM', hint: 'turnover: 2 names · closures: yellow', floor: 'f2', min: 0, max: 14.5, step: 0.5 },
  { key: 'floor1', label: 'PLAINEST · APPEAR AT ZOOM', hint: 'turnover: 1 name · closures: green', floor: 'f1', min: 0, max: 14.5, step: 0.5 },
]

export default function MapTunePanel({ map, values, onChange }: Props) {
  const [copied, setCopied] = useState(false)
  const used = effectiveFloors(values)
  const [zoom, setZoom] = useState<number | null>(null)

  useEffect(() => {
    if (!map) return
    const read = () => setZoom(map.getZoom())
    read()
    map.on('zoom', read)
    return () => { map.off('zoom', read) }
  }, [map])

  return (
    <div className="absolute left-4 bottom-28 z-30 w-60 rounded-lg bg-espresso-950/90 backdrop-blur-md border border-espresso-700 p-3 font-mono text-micro text-paper-400 shadow-xl shadow-black/30">
      <div className="flex items-center justify-between mb-2">
        <span className="tracking-[0.2em] text-paper-500">── TUNE</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              const text = `?maptune=${serializeMapTune(values)}\n${JSON.stringify(values)}`
              navigator.clipboard.writeText(text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }).catch(() => {})
            }}
            className="px-1.5 py-0.5 rounded border border-teal-500/40 text-teal-500 hover:bg-teal-500/10 text-nano tracking-wider"
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <button
            onClick={() => onChange({ ...DEFAULT_MAP_TUNE })}
            title="Back to the shipped values"
            className="px-1.5 py-0.5 rounded border border-paper-500/30 hover:bg-paper-500/10 text-nano tracking-wider"
          >
            RESET
          </button>
        </div>
      </div>
      <div className="flex justify-between mb-2 text-paper-500">
        <span className="tracking-wider">MAP ZOOM NOW</span>
        <span className="text-paper-200 tabular-nums">{zoom == null ? '—' : zoom.toFixed(1)}</span>
      </div>
      {SLIDERS.map((s) => (
        <label key={s.key} className="block mb-1.5">
          <span className="flex justify-between gap-2">
            <span className="tracking-wider">{s.label}</span>
            <span className="text-paper-200 tabular-nums">
              {values[s.key]}
              {s.floor && used[s.floor] !== values[s.key] && (
                <span className="text-ochre-500" title="A plainer group can never appear before a more important one"> → {used[s.floor]}</span>
              )}
            </span>
          </span>
          {s.hint && <span className="block text-nano text-paper-600">{s.hint}</span>}
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={values[s.key]}
            onChange={(e) => onChange({ ...values, [s.key]: Number(e.target.value) })}
            className="w-full accent-teal-500 h-1"
          />
        </label>
      ))}
      <div className="mt-1 text-nano text-paper-600 leading-snug">
        Zoom: 11 whole city · 12 opening view · 13 neighborhood · 15 blocks. Below its number a group hides.
        An ochre → shows the zoom actually used: a plainer group never appears before a more important one.
      </div>
      <div className="mt-1 text-nano text-paper-600 leading-snug">
        dev only (?tune=1) · copy → DEFAULT_MAP_TUNE
      </div>
    </div>
  )
}
