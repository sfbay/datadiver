// src/components/maps/MapLabelTuner.tsx
//
// Dev-only overlay (opt-in via ?labeltune=1) — live controls for the basemap's
// LABEL paint, grouped by layer category. Mapbox's stock dark-v11 / light-v11
// styles color these groups differently AND differently per theme (e.g.
// light-v11 makes neighborhood labels lighter than street labels), so getting
// them to read consistently has to be done by eye, per mode.
//
// Mirrors the ?tune=1 ambient panel + ?debug=map camera readout patterns.
// Changes apply live via setPaintProperty and re-apply on style.load, so a
// Light/Dark toggle keeps your overrides. Settings are kept SEPARATELY per
// theme — flip the app's Light/Dark and the panel shows/edits that mode's set.
// Read the winning values off the readout at the bottom and bake them into
// softenBasemapLabels() in MapView (per-theme where needed). Nothing here
// ships to users; strip the ?labeltune param and this never mounts.

import { useCallback, useEffect, useRef, useState } from 'react'
import type mapboxgl from 'mapbox-gl'
import { useAppStore } from '@/stores/appStore'
import { classifyLabelLayer, type LabelGroup } from './labelGroups'

type Group = LabelGroup
const GROUPS: Group[] = ['place', 'road', 'other']
const GROUP_LABEL: Record<Group, string> = {
  place: 'Places & Neighborhoods',
  road: 'Streets & Roads',
  other: 'Other (water · POI · transit)',
}

interface GroupSettings {
  textColorOn: boolean
  textColor: string
  haloColorOn: boolean
  haloColor: string
  haloWidth: number
  haloBlur: number
  textOpacity: number
}

const makeDefaults = (): GroupSettings => ({
  textColorOn: false, textColor: '#2a1d13',
  haloColorOn: false, haloColor: '#f5ecd9',
  haloWidth: 1, haloBlur: 2, textOpacity: 1,
})

type PerGroup = Record<Group, GroupSettings>
const makePerGroup = (): PerGroup => ({ place: makeDefaults(), road: makeDefaults(), other: makeDefaults() })

/** All symbol layers that render text, tagged with their tuning group. */
function labelLayers(map: mapboxgl.Map): { id: string; group: Group }[] {
  let layers: mapboxgl.AnyLayer[] = []
  try {
    layers = (map.getStyle()?.layers as mapboxgl.AnyLayer[]) || []
  } catch {
    return [] // style mid-load — mapbox getStyle() throws "Style is not done loading"
  }
  const out: { id: string; group: Group }[] = []
  for (const l of layers) {
    if (l.type !== 'symbol') continue
    const layout = (l as mapboxgl.SymbolLayer).layout
    if (!layout || layout['text-field'] === undefined) continue
    out.push({ id: l.id, group: classifyLabelLayer(l.id) })
  }
  return out
}

function applyGroup(map: mapboxgl.Map, group: Group, s: GroupSettings) {
  for (const { id, group: g } of labelLayers(map)) {
    if (g !== group) continue
    try {
      map.setPaintProperty(id, 'text-halo-width', s.haloWidth)
      map.setPaintProperty(id, 'text-halo-blur', s.haloBlur)
      map.setPaintProperty(id, 'text-opacity', s.textOpacity)
      if (s.textColorOn) map.setPaintProperty(id, 'text-color', s.textColor)
      if (s.haloColorOn) map.setPaintProperty(id, 'text-halo-color', s.haloColor)
    } catch {
      // Layer/style mid-mutation — re-applied on the next change or style.load.
    }
  }
}

// ---------------------------------------------------------------------------

export default function MapLabelTuner({ map }: { map: mapboxgl.Map }) {
  const isDark = useAppStore((s) => s.isDarkMode)
  const mode: 'light' | 'dark' = isDark ? 'dark' : 'light'

  const [both, setBoth] = useState<{ light: PerGroup; dark: PerGroup }>(
    () => ({ light: makePerGroup(), dark: makePerGroup() }),
  )
  const [open, setOpen] = useState(true)
  const [counts, setCounts] = useState<Record<Group, number>>({ place: 0, road: 0, other: 0 })

  const bothRef = useRef(both); bothRef.current = both
  const modeRef = useRef(mode); modeRef.current = mode

  const applyAll = useCallback(() => {
    // Mapbox throws "Style is not done loading" if we touch it too early; the
    // idle / style.load hooks below re-run this once it's ready.
    if (!map.isStyleLoaded()) return
    const pg = bothRef.current[modeRef.current]
    for (const g of GROUPS) applyGroup(map, g, pg[g])
  }, [map])

  const refreshCounts = useCallback(() => {
    const c: Record<Group, number> = { place: 0, road: 0, other: 0 }
    for (const { group } of labelLayers(map)) c[group]++
    setCounts(c)
  }, [map])

  // Apply once the style is genuinely ready (first `idle`, which — unlike
  // style.load — can't have already fired before we subscribed), and re-apply
  // on every style.load (a theme toggle calls setStyle, resetting the basemap
  // to stock label paint and wiping our overrides).
  useEffect(() => {
    const kick = () => { applyAll(); refreshCounts() }
    const onStyle = () => setTimeout(kick, 160)
    map.on('style.load', onStyle)
    if (map.isStyleLoaded()) kick()
    else map.once('idle', kick)
    return () => { try { map.off('style.load', onStyle) } catch { /* map disposed */ } }
  }, [map, applyAll, refreshCounts])

  // Re-apply whenever settings or the active mode changes.
  useEffect(() => {
    const t = setTimeout(applyAll, 40)
    return () => clearTimeout(t)
  }, [both, mode, applyAll])

  const cur = both[mode]
  const update = (g: Group, patch: Partial<GroupSettings>) =>
    setBoth((prev) => ({ ...prev, [mode]: { ...prev[mode], [g]: { ...prev[mode][g], ...patch } } }))
  const resetGroup = (g: Group) => update(g, makeDefaults())

  // Compact readout the user can paste back to me to bake in.
  const readout = (['light', 'dark'] as const).map((m) => {
    const rows = GROUPS.map((g) => {
      const s = both[m][g]
      const parts = [`w${s.haloWidth}`, `b${s.haloBlur}`, `o${s.textOpacity}`]
      if (s.textColorOn) parts.push(`text ${s.textColor}`)
      if (s.haloColorOn) parts.push(`halo ${s.haloColor}`)
      return `  ${g.padEnd(6)} ${parts.join(' · ')}`
    })
    return `${m.toUpperCase()}\n${rows.join('\n')}`
  }).join('\n\n')

  return (
    <div
      className="absolute top-16 right-2 z-[60] w-[264px] max-h-[80vh] overflow-y-auto
        rounded-xl bg-slate-900/92 backdrop-blur-md border border-ochre-500/30
        shadow-xl shadow-black/50 text-slate-200 pointer-events-auto select-none"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 sticky top-0 bg-slate-900/95 backdrop-blur-md">
        <div className="text-micro font-mono uppercase tracking-[0.18em] text-ochre-400">
          label tuner · <span className={mode === 'dark' ? 'text-indigo-300' : 'text-ochre-300'}>{mode}</span>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="text-micro font-mono text-slate-400 hover:text-white">
          {open ? '– hide' : '+ show'}
        </button>
      </div>

      {open && (
        <div className="p-3 space-y-3">
          <p className="text-nano leading-relaxed font-mono text-slate-400">
            Toggle the app's Light/Dark to tune each mode; settings persist per theme.
            <br />Enable a color to override the stock (theme-dependent) value.
          </p>

          {GROUPS.map((g) => {
            const s = cur[g]
            return (
              <div key={g} className="rounded-lg bg-white/[0.04] border border-white/10 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-micro font-mono font-semibold text-slate-100">{GROUP_LABEL[g]}</span>
                  <span className="text-[8px] font-mono text-slate-500">{counts[g]} layers</span>
                </div>

                <Slider label="halo width" min={0} max={3} step={0.1} value={s.haloWidth}
                  onChange={(v) => update(g, { haloWidth: v })} />
                <Slider label="halo blur" min={0} max={4} step={0.1} value={s.haloBlur}
                  onChange={(v) => update(g, { haloBlur: v })} />
                <Slider label="text opacity" min={0} max={1} step={0.05} value={s.textOpacity}
                  onChange={(v) => update(g, { textOpacity: v })} />

                <ColorRow label="text color" on={s.textColorOn} color={s.textColor}
                  onToggle={(on) => update(g, { textColorOn: on })}
                  onColor={(c) => update(g, { textColor: c, textColorOn: true })} />
                <ColorRow label="halo color" on={s.haloColorOn} color={s.haloColor}
                  onToggle={(on) => update(g, { haloColorOn: on })}
                  onColor={(c) => update(g, { haloColor: c, haloColorOn: true })} />

                <button onClick={() => resetGroup(g)}
                  className="text-[8px] font-mono text-slate-500 hover:text-slate-300 uppercase tracking-wider">
                  reset group
                </button>
              </div>
            )
          })}

          <div className="rounded-lg bg-black/40 border border-white/10 p-2">
            <div className="text-[8px] font-mono uppercase tracking-[0.2em] text-ochre-500/70 mb-1">
              readout — paste to bake
            </div>
            <pre className="text-nano leading-snug font-mono text-moss-300 whitespace-pre-wrap">{readout}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tiny controls
// ---------------------------------------------------------------------------

function Slider({ label, min, max, step, value, onChange }: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-nano font-mono text-slate-400 mb-0.5">
        <span>{label}</span>
        <span className="text-slate-200 tabular-nums">{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-ochre-500 cursor-pointer" />
    </label>
  )
}

function ColorRow({ label, on, color, onToggle, onColor }: {
  label: string; on: boolean; color: string; onToggle: (on: boolean) => void; onColor: (c: string) => void
}) {
  return (
    <div className="flex items-center gap-2 text-nano font-mono text-slate-400">
      <input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)}
        className="accent-ochre-500 cursor-pointer" />
      <span className="flex-1">{label}</span>
      <input type="color" value={color} onChange={(e) => onColor(e.target.value)}
        className="w-6 h-5 rounded cursor-pointer bg-transparent border border-white/20" />
      <span className={`tabular-nums ${on ? 'text-slate-200' : 'text-slate-600'}`}>{color}</span>
    </div>
  )
}
