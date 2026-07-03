// src/views/Last48/chrome/LayerControls.tsx
//
// Composable layer controls for The Last 48. Row order: underlay dropdown,
// then the DOTS toggle (AmbientToggle's AUTO pill sits to the right of both).
//   • Underlay dropdown — single menu containing None / Anomaly + the
//     Census variable presets. Internally this maps to (fill, variable);
//     the user just picks one option.
//   • DOTS toggle — shows/hides the FLOW event dots (label is "dots"; the
//     internal mode is still FLOW).
//
// The dropdown unifies what used to be a pill picker + a separate
// UnderlayPicker. Mental model: "what's painting the neighborhoods?"
// One question, one menu, one click.

import { useState, useRef, useEffect } from 'react'
import { CENSUS_VARIABLES, UNDERLAY_PRESETS } from '@/utils/censusVariables'
import type { CensusVariable } from '@/types/census'

export type BaseFill = 'none' | 'anomaly' | 'demographic'

interface Props {
  pointsOn: boolean
  onPointsToggle: (next: boolean) => void
  fill: BaseFill
  onFillChange: (next: BaseFill) => void
  underlayVariable: CensusVariable | null
  onUnderlayChange: (v: CensusVariable | null) => void
}

// Resolve the current selection's display label for the dropdown button.
// The anomaly fill is LABELLED "Pulse" — it's the evidence view The Pulse's
// cards land on, and the shared name makes that one system legible. The
// internal fill id (and the ?fill=anomaly URL param Pulse links depend on)
// stays 'anomaly'.
function currentLabel(fill: BaseFill, variable: CensusVariable | null): string {
  if (fill === 'anomaly') return 'Pulse'
  if (fill === 'demographic' && variable) {
    const config = CENSUS_VARIABLES.find(v => v.key === variable)
    return config?.shortLabel ?? config?.label ?? 'Demographic'
  }
  return 'None'
}

export default function LayerControls({
  pointsOn,
  onPointsToggle,
  fill,
  onFillChange,
  underlayVariable,
  onUnderlayChange,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Click-outside dismiss for the dropdown
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    // Tiny delay so the click that opened the menu doesn't immediately close it
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [menuOpen])

  // Resolve the preset Census variables into display configs (label + key)
  const presetVars = UNDERLAY_PRESETS['last48'] ?? []
  const presetConfigs = presetVars
    .map(key => CENSUS_VARIABLES.find(v => v.key === key))
    .filter((c): c is NonNullable<typeof c> => c != null)

  // Map a unified user choice → the (fill, variable) state pair
  const handleSelect = (selection: 'none' | 'anomaly' | CensusVariable) => {
    if (selection === 'none') {
      onFillChange('none')
      onUnderlayChange(null)
    } else if (selection === 'anomaly') {
      onFillChange('anomaly')
      onUnderlayChange(null)
    } else {
      onFillChange('demographic')
      onUnderlayChange(selection)
    }
    setMenuOpen(false)
  }

  const isCurrent = (key: 'none' | 'anomaly' | CensusVariable): boolean => {
    if (key === 'none') return fill === 'none'
    if (key === 'anomaly') return fill === 'anomaly'
    return fill === 'demographic' && underlayVariable === key
  }

  return (
    <div className="flex items-center gap-2">
      {/* Unified underlay dropdown — leads the control row (what's painting
          the neighborhoods?), with the DOTS toggle to its right. */}
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider bg-paper-100/40 dark:bg-espresso-900/40 text-paper-600 dark:text-paper-400 hover:text-paper-800 dark:hover:text-paper-200 transition-colors"
        >
          {/* Stacked-layers icon */}
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round" aria-hidden>
            <path d="M6 1.5 11 4 6 6.5 1 4z" />
            <path d="M1 7 6 9.5 11 7" />
          </svg>
          <span>{currentLabel(fill, underlayVariable)}</span>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M2 4l3 3 3-3" />
          </svg>
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 z-50 min-w-[220px] rounded-lg bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl shadow-black/20 p-2"
          >
            <MenuItem
              active={isCurrent('none')}
              onClick={() => handleSelect('none')}
              swatch={null}
              label="None"
            />
            <MenuItem
              active={isCurrent('anomaly')}
              onClick={() => handleSelect('anomaly')}
              swatch="#d4a435"
              label="Pulse"
              hint="vs typical"
            />

            <div className="my-1.5 mx-1 h-px bg-paper-200/40 dark:bg-espresso-800" />
            <div className="px-2 pb-1 text-[9px] font-mono uppercase tracking-[0.2em] text-paper-500/70 dark:text-paper-600">
              Demographic underlay
            </div>

            {presetConfigs.map(config => (
              <MenuItem
                key={config.key}
                active={isCurrent(config.key as CensusVariable)}
                onClick={() => handleSelect(config.key as CensusVariable)}
                swatch={swatchColor(config)}
                label={config.shortLabel ?? config.label}
              />
            ))}
          </div>
        )}
      </div>

      {/* DOTS toggle — shows/hides the FLOW event dots (renamed from "flow";
          the control toggles the dots, so "dots" reads clearer). */}
      <button
        onClick={() => onPointsToggle(!pointsOn)}
        className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
          pointsOn
            ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100'
            : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
        aria-pressed={pointsOn}
      >
        {pointsOn ? '● dots' : '○ dots'}
      </button>
    </div>
  )
}

// Representative swatch color = middle stop of the variable's color ramp.
// Reads as "this variable's pigment" in the dropdown without committing to
// a specific value's color.
function swatchColor(config: { colorRamp?: string[] }): string {
  const ramp = config.colorRamp
  if (!ramp || ramp.length === 0) return '#a8926a'
  return ramp[Math.floor(ramp.length / 2)] ?? ramp[ramp.length - 1] ?? '#a8926a'
}

// ---------------------------------------------------------------------------
// MenuItem — uniform row chrome for the dropdown
//
// Body serif (Roboto Serif via the global font stack — NOT mono) for the
// option name, small mono uppercase hint, optional rounded swatch dot, ochre
// check on the active row. Matches the EmergencyResponse UnderlayPicker's
// warmer human-readable feel.
// ---------------------------------------------------------------------------

interface MenuItemProps {
  active: boolean
  onClick: () => void
  swatch: string | null
  label: string
  hint?: string
}

function MenuItem({ active, onClick, swatch, label, hint }: MenuItemProps) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${
        active
          ? 'bg-ochre-500/15 text-ink dark:text-paper-100'
          : 'text-paper-800 dark:text-paper-300 hover:bg-paper-100/60 dark:hover:bg-espresso-800/60'
      }`}
    >
      {swatch ? (
        <span
          className="flex-shrink-0 w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: swatch }}
          aria-hidden
        />
      ) : (
        <span
          className="flex-shrink-0 w-2.5 h-2.5 rounded-full border border-paper-300/60 dark:border-espresso-700"
          aria-hidden
        />
      )}
      <span className="flex-1 leading-tight">{label}</span>
      {hint && (
        <span className="ml-auto text-[8px] font-mono uppercase tracking-widest text-paper-500/70 dark:text-paper-600">
          {hint}
        </span>
      )}
      {active && (
        <svg className="w-3 h-3 flex-shrink-0 text-ochre-600 dark:text-ochre-500" fill="none" viewBox="0 0 12 12" aria-hidden>
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
}
