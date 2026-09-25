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
import { DEFAULT_MAP_TUNE, serializeMapTune, type MapTune } from './mapLayers'

interface Props {
  map: mapboxgl.Map | null
  values: MapTune
  onChange: (next: MapTune) => void
}

interface SliderSpec {
  key: keyof MapTune
  label: string
  min: number
  max: number
  step: number
}

const SLIDERS: SliderSpec[] = [
  { key: 'ringScale', label: 'RING SIZE ×', min: 0.5, max: 3.5, step: 0.1 },
  { key: 'dotScale', label: 'DOT SIZE ×', min: 0.5, max: 3.5, step: 0.1 },
  { key: 'floor3', label: '3 NAMES · CLOSED FROM ZOOM', min: 0, max: 14.5, step: 0.5 },
  { key: 'floor2', label: '2 NAMES · YELLOW FROM ZOOM', min: 0, max: 14.5, step: 0.5 },
  { key: 'floor1', label: '1 NAME · PASS FROM ZOOM', min: 0, max: 14.5, step: 0.5 },
]

export default function MapTunePanel({ map, values, onChange }: Props) {
  const [copied, setCopied] = useState(false)
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
            <span className="text-paper-200 tabular-nums">{values[s.key]}</span>
          </span>
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
        dev only (?tune=1) · copy → DEFAULT_MAP_TUNE
      </div>
    </div>
  )
}
