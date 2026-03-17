// src/components/maps/UnderlayPicker.tsx
// Glass-card dropdown for selecting a demographic underlay variable on map views.

import React, { useState, useRef, useEffect, useCallback } from 'react'
import type { CensusVariable, CensusCategory, CensusVariableConfig } from '../../types/census'
import { CENSUS_VARIABLES, getVariablesByCategory, getSubPickerVariables } from '../../utils/censusVariables'

interface UnderlayPickerProps {
  presets: CensusVariable[]
  activeVariable: CensusVariable | null
  onSelect: (variable: CensusVariable | null) => void
}

// Category display labels
const CATEGORY_LABELS: Record<CensusCategory, string> = {
  population: 'Population',
  income: 'Income & Housing',
  race: 'Race / Ethnicity',
  language: 'Language',
  age: 'Age',
  education: 'Education',
  employment: 'Employment & Commute',
}

// Get first color from a variable's ramp for swatches
function getSwatchColor(config: CensusVariableConfig): string {
  return config.colorRamp[config.colorRamp.length - 1] ?? '#7c3aed'
}

export default function UnderlayPicker({ presets, activeVariable, onSelect }: UnderlayPickerProps) {
  const [expanded, setExpanded] = useState(false)
  const [subPickerGroup, setSubPickerGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!expanded) return
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setExpanded(false)
        setSubPickerGroup(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [expanded])

  const presetConfigs = presets
    .map(key => CENSUS_VARIABLES.find(v => v.key === key))
    .filter((v): v is CensusVariableConfig => v !== undefined)

  function handlePresetClick(key: CensusVariable, config: CensusVariableConfig) {
    // If already active, deselect
    if (activeVariable === key) {
      onSelect(null)
      return
    }
    // If this variable has a sub-picker group, toggle inline sub-picker
    if (config.parentGroup) {
      setSubPickerGroup(prev => (prev === config.parentGroup ? null : config.parentGroup!))
      return
    }
    onSelect(key)
  }

  function handleSubPickerClick(key: CensusVariable) {
    if (activeVariable === key) {
      onSelect(null)
    } else {
      onSelect(key)
    }
  }

  function handleMoreVariable(config: CensusVariableConfig) {
    if (activeVariable === config.key) {
      onSelect(null)
    } else if (config.parentGroup) {
      setSubPickerGroup(prev => (prev === config.parentGroup ? null : config.parentGroup!))
    } else {
      onSelect(config.key)
    }
  }

  // Build grouped variable list for expanded panel (exclude variables already shown as presets)
  const presetKeys = new Set(presets)
  const categories = Array.from(
    new Set(CENSUS_VARIABLES.map(v => v.category))
  ) as CensusCategory[]

  return (
    <div ref={containerRef} className="w-52 select-none">
      {/* Main card */}
      <div className="bg-slate-900/90 backdrop-blur-lg border border-white/10 rounded-lg p-2 shadow-xl">
        {/* Header */}
        <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 px-0.5">
          Demographic Underlay
        </div>

        {/* Preset items */}
        <div className="space-y-0.5">
          {presetConfigs.map(config => {
            const isActive = activeVariable === config.key ||
              // Mark preset as "active" if a sub-variable from its group is active
              (config.parentGroup != null &&
                CENSUS_VARIABLES.some(v => v.parentGroup === config.parentGroup && v.key === activeVariable))
            const showSubPicker = config.parentGroup != null && subPickerGroup === config.parentGroup

            return (
              <div key={config.key}>
                <button
                  onClick={() => handlePresetClick(config.key, config)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                    isActive
                      ? 'bg-violet-600/25 text-violet-200'
                      : 'text-slate-300 hover:bg-white/5'
                  }`}
                >
                  {/* Color swatch */}
                  <span
                    className="flex-shrink-0 w-2.5 h-2.5 rounded-sm"
                    style={{ backgroundColor: getSwatchColor(config) }}
                  />
                  <span className="flex-1 leading-tight">{config.shortLabel}</span>
                  {/* Checkmark or sub-picker arrow */}
                  {isActive && !config.parentGroup && (
                    <svg className="w-3 h-3 flex-shrink-0 text-violet-400" fill="none" viewBox="0 0 12 12">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {config.parentGroup && (
                    <svg
                      className={`w-3 h-3 flex-shrink-0 transition-transform ${showSubPicker ? 'rotate-90' : ''} ${isActive ? 'text-violet-400' : 'text-slate-500'}`}
                      fill="none"
                      viewBox="0 0 12 12"
                    >
                      <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {/* Inline sub-picker */}
                {showSubPicker && (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                    {getSubPickerVariables(config.parentGroup!).map(sub => (
                      <button
                        key={sub.key}
                        onClick={() => handleSubPickerClick(sub.key)}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                          activeVariable === sub.key
                            ? 'bg-violet-600/25 text-violet-200'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                        }`}
                      >
                        <span
                          className="flex-shrink-0 w-2 h-2 rounded-sm"
                          style={{ backgroundColor: getSwatchColor(sub) }}
                        />
                        <span className="flex-1 leading-tight">{sub.shortLabel}</span>
                        {activeVariable === sub.key && (
                          <svg className="w-3 h-3 flex-shrink-0 text-violet-400" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* None / clear option when active */}
        {activeVariable !== null && (
          <button
            onClick={() => { onSelect(null); setSubPickerGroup(null) }}
            className="w-full flex items-center gap-2 px-2 py-1 mt-1 rounded text-left text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors border-t border-white/5 pt-1.5"
          >
            <span className="flex-shrink-0 w-2.5 h-2.5" />
            None
          </button>
        )}

        {/* More variables expander */}
        <button
          onClick={() => { setExpanded(prev => !prev); setSubPickerGroup(null) }}
          className="w-full flex items-center justify-between px-2 py-1.5 mt-1 rounded text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors border-t border-white/5 pt-1.5"
        >
          <span>More variables</span>
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 12 12"
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Expanded variable list grouped by category */}
        {expanded && (
          <div className="mt-1.5 space-y-2 border-t border-white/10 pt-2 max-h-72 overflow-y-auto">
            {categories.map(cat => {
              const vars = getVariablesByCategory(cat).filter(v => !v.parentGroup)
              if (vars.length === 0) return null
              return (
                <div key={cat}>
                  <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-500 px-1 mb-0.5">
                    {CATEGORY_LABELS[cat]}
                  </div>
                  <div className="space-y-0.5">
                    {vars.map(config => {
                      const isActive = activeVariable === config.key ||
                        (config.parentGroup != null &&
                          CENSUS_VARIABLES.some(v => v.parentGroup === config.parentGroup && v.key === activeVariable))
                      const showSubPicker = config.parentGroup != null && subPickerGroup === `expanded-${config.parentGroup}`
                      return (
                        <div key={config.key}>
                          <button
                            onClick={() => {
                              if (config.parentGroup) {
                                setSubPickerGroup(prev =>
                                  prev === `expanded-${config.parentGroup}` ? null : `expanded-${config.parentGroup}`
                                )
                              } else {
                                handleMoreVariable(config)
                                setExpanded(false)
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                              isActive
                                ? 'bg-violet-600/25 text-violet-200'
                                : presetKeys.has(config.key)
                                ? 'text-slate-400 hover:bg-white/5'
                                : 'text-slate-300 hover:bg-white/5'
                            }`}
                          >
                            <span
                              className="flex-shrink-0 w-2 h-2 rounded-sm"
                              style={{ backgroundColor: getSwatchColor(config) }}
                            />
                            <span className="flex-1 leading-tight">{config.shortLabel}</span>
                            {isActive && !config.parentGroup && (
                              <svg className="w-3 h-3 flex-shrink-0 text-violet-400" fill="none" viewBox="0 0 12 12">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                            {config.parentGroup && (
                              <svg
                                className={`w-3 h-3 flex-shrink-0 transition-transform ${showSubPicker ? 'rotate-90' : ''} ${isActive ? 'text-violet-400' : 'text-slate-500'}`}
                                fill="none"
                                viewBox="0 0 12 12"
                              >
                                <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </button>
                          {/* Expanded panel sub-picker */}
                          {showSubPicker && config.parentGroup && (
                            <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                              {getSubPickerVariables(config.parentGroup).map(sub => (
                                <button
                                  key={sub.key}
                                  onClick={() => {
                                    handleSubPickerClick(sub.key)
                                    setExpanded(false)
                                    setSubPickerGroup(null)
                                  }}
                                  className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                                    activeVariable === sub.key
                                      ? 'bg-violet-600/25 text-violet-200'
                                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                                  }`}
                                >
                                  <span
                                    className="flex-shrink-0 w-2 h-2 rounded-sm"
                                    style={{ backgroundColor: getSwatchColor(sub) }}
                                  />
                                  <span className="flex-1 leading-tight">{sub.shortLabel}</span>
                                  {activeVariable === sub.key && (
                                    <svg className="w-3 h-3 flex-shrink-0 text-violet-400" fill="none" viewBox="0 0 12 12">
                                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
