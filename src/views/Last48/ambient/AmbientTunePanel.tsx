// src/views/Last48/ambient/AmbientTunePanel.tsx
//
// DEV-ONLY pace tuning panel, revealed by ?tune=1 — never discoverable in
// the UI. Sliders bind live to the active pace's values (the director and
// tour read them through refs, so changes apply mid-orbit / on the next
// beat). "COPY" puts the current values on the clipboard as JSON, ready to
// paste into PACE_PRESETS in pace.ts — this panel exists to FIND preset
// values without a redeploy per adjustment, not to ship knobs to users.
//
// data-ambient-toggle: interacting with the panel must not trip the
// conductor's exit-on-input listener, or every slider drag would stop the
// very drift being tuned.

import { useState } from 'react'
import type { PaceValues } from './pace'

interface Props {
  values: PaceValues
  onChange: (patch: Partial<PaceValues>) => void
  onReset: () => void
}

interface SliderSpec {
  key: keyof PaceValues
  label: string
  min: number
  max: number
  step: number
  /** Render the value for the readout (e.g. ms → s). */
  fmt: (v: number) => string
}

const SLIDERS: SliderSpec[] = [
  { key: 'orbitDegPerS', label: 'ORBIT °/S', min: 0.2, max: 4, step: 0.1, fmt: (v) => v.toFixed(1) },
  { key: 'dwellMs', label: 'DWELL', min: 3000, max: 30000, step: 1000, fmt: (v) => `${v / 1000}s` },
  { key: 'breathMs', label: 'BREATH', min: 3000, max: 30000, step: 1000, fmt: (v) => `${v / 1000}s` },
  { key: 'tweenMs', label: 'FLIGHT', min: 800, max: 5000, step: 100, fmt: (v) => `${(v / 1000).toFixed(1)}s` },
  { key: 'pitchMin', label: 'PITCH ≥', min: 0, max: 63, step: 1, fmt: (v) => `${v}°` },
]

export default function AmbientTunePanel({ values, onChange, onReset }: Props) {
  const [copied, setCopied] = useState(false)

  return (
    <div
      data-ambient-toggle
      className="absolute bottom-4 left-4 z-30 w-56 rounded-lg bg-espresso-950/90 backdrop-blur-md border border-espresso-700 p-3 font-mono text-[10px] text-paper-400 shadow-xl shadow-black/30"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="tracking-[0.2em] text-paper-500">── TUNE</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              navigator.clipboard
                .writeText(JSON.stringify(values, null, 2))
                .then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                })
                .catch(() => {})
            }}
            className="px-1.5 py-0.5 rounded border border-teal-500/40 text-teal-500 hover:bg-teal-500/10 text-[9px] tracking-wider"
          >
            {copied ? 'COPIED' : 'COPY'}
          </button>
          <button
            onClick={onReset}
            title="Back to the active preset's values"
            className="px-1.5 py-0.5 rounded border border-paper-500/30 hover:bg-paper-500/10 text-[9px] tracking-wider"
          >
            RESET
          </button>
        </div>
      </div>
      {SLIDERS.map((s) => (
        <label key={s.key} className="block mb-1.5">
          <span className="flex justify-between">
            <span className="tracking-wider">{s.label}</span>
            <span className="text-paper-200 tabular-nums">{s.fmt(values[s.key])}</span>
          </span>
          <input
            type="range"
            min={s.min}
            max={s.max}
            step={s.step}
            value={values[s.key]}
            onChange={(e) => onChange({ [s.key]: Number(e.target.value) })}
            className="w-full accent-teal-500 h-1"
          />
        </label>
      ))}
      <div className="mt-1 text-[8px] text-paper-600 leading-snug">
        dev only (?tune=1) · copy → pace.ts preset
      </div>
    </div>
  )
}
