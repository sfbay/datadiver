// src/views/Last48/chrome/LayerControls.tsx
//
// Composable layer controls for The Last 48:
//   • FLOW points on/off toggle
//   • Underlay dropdown — single menu containing None / Anomaly + the
//     Census variable presets. Internally this maps to (fill, variable);
//     the user just picks one option.
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
function currentLabel(fill: BaseFill, variable: CensusVariable | null): string {
  if (fill === 'anomaly') return 'Anomaly'
  if (fill === 'demographic' && variable) {
    const config = CENSUS_VARIABLES.find(v => v.key === variable)
    return config?.label ?? 'Demographic'
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
      {/* FLOW points toggle */}
      <button
        onClick={() => onPointsToggle(!pointsOn)}
        className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
          pointsOn
            ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100'
            : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
        aria-pressed={pointsOn}
      >
        {pointsOn ? '● flow' : '○ flow'}
      </button>

      {/* Unified underlay dropdown */}
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
            className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] rounded-lg bg-paper-50 dark:bg-espresso-900 border border-paper-200/50 dark:border-espresso-800 shadow-lg shadow-black/20 overflow-hidden py-1"
          >
            <MenuItem active={isCurrent('none')} onClick={() => handleSelect('none')}>
              None
            </MenuItem>
            <MenuItem active={isCurrent('anomaly')} onClick={() => handleSelect('anomaly')}>
              <span>Anomaly</span>
              <span className="ml-auto text-[8px] font-mono uppercase tracking-widest text-paper-500/60 dark:text-paper-600">
                z-score
              </span>
            </MenuItem>

            <div className="my-1 mx-3 h-px bg-paper-200/40 dark:bg-espresso-800" />
            <div className="px-3 pt-1 pb-0.5 text-[8px] font-mono uppercase tracking-[0.2em] text-paper-500/60 dark:text-paper-600">
              Demographic
            </div>

            {presetConfigs.map(config => (
              <MenuItem
                key={config.key}
                active={isCurrent(config.key as CensusVariable)}
                onClick={() => handleSelect(config.key as CensusVariable)}
              >
                {config.label}
              </MenuItem>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MenuItem — uniform row chrome for the dropdown
// ---------------------------------------------------------------------------

interface MenuItemProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function MenuItem({ active, onClick, children }: MenuItemProps) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex items-center w-full text-left px-3 py-1.5 text-[11px] font-mono transition-colors ${
        active
          ? 'bg-paper-200/60 dark:bg-espresso-800 text-ink dark:text-paper-100'
          : 'text-paper-700 dark:text-paper-300 hover:bg-paper-100/60 dark:hover:bg-espresso-800/50'
      }`}
    >
      {children}
    </button>
  )
}
