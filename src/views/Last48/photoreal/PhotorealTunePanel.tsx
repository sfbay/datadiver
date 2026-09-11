// src/views/Last48/photoreal/PhotorealTunePanel.tsx
//
// Dev-only (?tune=1): the photoreal performance sliders + the tile gauge +
// a live frame-rate readout. Writes the module-level `quality` (quality.ts)
// and pushes it onto the viewer/tileset through applyQuality; the director
// picks up the orbit-detail value at its next phase change. Never
// discoverable in the UI — a sibling of the flat map's AmbientTunePanel.
import { useEffect, useState } from 'react'
import type * as Cesium from 'cesium'
import { quality, setQuality, QUALITY_RANGE, QUALITY_DEFAULT, type Quality } from './quality'

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset | null
  tileLoads: number
  onApply: (v: Cesium.Viewer, ts: Cesium.Cesium3DTileset | null, q: Quality) => void
}

const SLIDERS: Array<{ key: 'fpsCap' | 'sseOrbit' | 'resolution' | 'foveation'; label: string; hint: string }> = [
  { key: 'fpsCap', label: 'fps cap', hint: 'lower = cooler' },
  { key: 'sseOrbit', label: 'orbit detail', hint: 'higher = coarser tiles' },
  { key: 'resolution', label: 'resolution', hint: 'render-buffer scale' },
  { key: 'foveation', label: 'edge relax', hint: '0 = full detail everywhere' },
]

export default function PhotorealTunePanel({ viewer, tileset, tileLoads, onApply }: Props) {
  const [q, setQ] = useState<Quality>({ ...quality })
  const [fps, setFps] = useState(0)

  // Live frame-rate readout: count Cesium's postRender ticks per second.
  useEffect(() => {
    if (viewer.isDestroyed()) return
    let n = 0
    const tick = () => { n++ }
    viewer.scene.postRender.addEventListener(tick)
    const id = setInterval(() => { setFps(n); n = 0 }, 1000)
    return () => {
      clearInterval(id)
      if (!viewer.isDestroyed()) viewer.scene.postRender.removeEventListener(tick)
    }
  }, [viewer])

  // The tileset can land after the panel mounts — re-apply once it does.
  useEffect(() => { onApply(viewer, tileset, quality) }, [viewer, tileset, onApply])

  const edit = (patch: Partial<Quality>) => {
    const next = setQuality(patch)
    setQ({ ...next })
    onApply(viewer, tileset, next)
  }

  return (
    <div className="absolute right-4 top-4 z-20 w-56 rounded-md bg-espresso-900/85 px-3 py-2 font-mono text-micro text-paper-200 backdrop-blur-sm">
      <div className="flex justify-between text-nano uppercase tracking-widest text-paper-500">
        <span>photoreal tune</span>
        <span>{fps} fps · {tileLoads} tiles</span>
      </div>
      {SLIDERS.map(({ key, label, hint }) => (
        <label key={key} className="mt-2 block" title={hint}>
          <span className="flex justify-between"><span>{label}</span><span className="tabular-nums">{q[key]}</span></span>
          <input
            type="range"
            className="w-full accent-ochre-500"
            min={QUALITY_RANGE[key].min}
            max={QUALITY_RANGE[key].max}
            step={QUALITY_RANGE[key].step}
            value={q[key]}
            onChange={(e) => edit({ [key]: Number(e.target.value) })}
          />
        </label>
      ))}
      <label className="mt-2 flex items-center gap-2" title="coarser tiles toward the horizon">
        <input type="checkbox" checked={q.dynamicSse} onChange={(e) => edit({ dynamicSse: e.target.checked })} />
        <span>horizon relax</span>
      </label>
      <button
        type="button"
        onClick={() => edit({ ...QUALITY_DEFAULT })}
        className="mt-2 w-full rounded border border-paper-500/30 px-2 py-1 text-nano uppercase tracking-widest text-paper-400 hover:text-paper-100"
      >
        reset to defaults
      </button>
    </div>
  )
}
