// src/components/maps/UnderlayPicker.tsx
// Compact header-bar dropdown for selecting a demographic underlay variable.
// Renders as a small trigger button that opens a popover panel below.

import { useState, useRef, useEffect } from 'react'
import type { CensusVariable, CensusCategory, CensusVariableConfig } from '../../types/census'
import { CENSUS_VARIABLES, getVariablesByCategory, getSubPickerVariables } from '../../utils/censusVariables'

interface UnderlayPickerProps {
  presets: CensusVariable[]
  activeVariable: CensusVariable | null
  onSelect: (variable: CensusVariable | null) => void
}

const CATEGORY_LABELS: Record<CensusCategory, string> = {
  population: 'Population',
  income: 'Income & Housing',
  race: 'Race / Ethnicity',
  language: 'Language',
  age: 'Age',
  education: 'Education',
  employment: 'Employment & Commute',
}

function getSwatchColor(config: CensusVariableConfig): string {
  return config.colorRamp[config.colorRamp.length - 1] ?? '#7c3aed'
}

export default function UnderlayPicker({ presets, activeVariable, onSelect }: UnderlayPickerProps) {
  const [open, setOpen] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [subPickerGroup, setSubPickerGroup] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowMore(false)
        setSubPickerGroup(null)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const presetConfigs = presets
    .map(key => CENSUS_VARIABLES.find(v => v.key === key))
    .filter((v): v is CensusVariableConfig => v !== undefined)

  const activeConfig = activeVariable
    ? CENSUS_VARIABLES.find(v => v.key === activeVariable) ?? null
    : null

  function handlePresetClick(key: CensusVariable, config: CensusVariableConfig) {
    if (activeVariable === key) {
      onSelect(null)
      return
    }
    if (config.parentGroup) {
      setSubPickerGroup(prev => (prev === config.parentGroup ? null : config.parentGroup!))
      return
    }
    onSelect(key)
    setOpen(false)
  }

  function handleSubPickerClick(key: CensusVariable) {
    if (activeVariable === key) {
      onSelect(null)
    } else {
      onSelect(key)
    }
    setOpen(false)
    setSubPickerGroup(null)
  }

  function handleMoreVariable(config: CensusVariableConfig) {
    if (activeVariable === config.key) {
      onSelect(null)
    } else if (config.parentGroup) {
      setSubPickerGroup(prev => (prev === config.parentGroup ? null : config.parentGroup!))
      return
    } else {
      onSelect(config.key)
    }
    setOpen(false)
    setShowMore(false)
    setSubPickerGroup(null)
  }

  const presetKeys = new Set(presets)
  const categories = Array.from(
    new Set(CENSUS_VARIABLES.map(v => v.category))
  ) as CensusCategory[]

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Trigger button. Adds an explicit text label ("Underlay" or the
          active variable's shortLabel) and a chevron to make the control
          visually weighty enough to match its power — previously it was
          icon-only and easily missed in the toolbar. */}
      <button
        onClick={() => { setOpen(prev => !prev); if (open) { setShowMore(false); setSubPickerGroup(null) } }}
        title={activeConfig ? `Demographic underlay: ${activeConfig.label}` : 'Add a demographic underlay'}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
          activeVariable
            ? 'bg-plum-500/15 text-plum-400 dark:text-plum-400 ring-1 ring-plum-500/30'
            : open
            ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100/50 dark:hover:bg-white/[0.04]'
        }`}
      >
        {/* Layers icon */}
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 2L2 5.5 8 9l6-3.5L8 2z" />
          <path d="M2 8.5L8 12l6-3.5" />
          <path d="M2 11.5L8 15l6-3.5" />
        </svg>
        <span className="whitespace-nowrap">
          {activeConfig ? activeConfig.shortLabel : 'Underlay'}
        </span>
        {activeConfig && (
          <span
            className="w-2 h-2 rounded-sm flex-shrink-0"
            style={{ backgroundColor: getSwatchColor(activeConfig) }}
          />
        )}
        <svg
          width="9" height="9" viewBox="0 0 9 9"
          fill="none" stroke="currentColor"
          strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`flex-shrink-0 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3.5l2.5 2.5 2.5-2.5" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full right-0 mt-1.5 w-52 bg-slate-900/95 backdrop-blur-lg border border-white/10 rounded-lg p-2 shadow-xl z-50">
          {/* Header */}
          <div className="text-[9px] font-semibold uppercase tracking-widest text-slate-400 mb-1.5 px-0.5">
            Demographic Underlay
          </div>

          {/* Preset items */}
          <div className="space-y-0.5">
            {presetConfigs.map(config => {
              const isActive = activeVariable === config.key ||
                (config.parentGroup != null &&
                  CENSUS_VARIABLES.some(v => v.parentGroup === config.parentGroup && v.key === activeVariable))
              const showSubPicker = config.parentGroup != null && subPickerGroup === config.parentGroup

              return (
                <div key={config.key}>
                  <button
                    onClick={() => handlePresetClick(config.key, config)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-plum-600/25 text-plum-400'
                        : 'text-slate-300 hover:bg-white/5'
                    }`}
                  >
                    <span
                      className="flex-shrink-0 w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: getSwatchColor(config) }}
                    />
                    <span className="flex-1 leading-tight">{config.shortLabel}</span>
                    {isActive && !config.parentGroup && (
                      <svg className="w-3 h-3 flex-shrink-0 text-plum-500" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                    {config.parentGroup && (
                      <svg
                        className={`w-3 h-3 flex-shrink-0 transition-transform ${showSubPicker ? 'rotate-90' : ''} ${isActive ? 'text-plum-500' : 'text-slate-500'}`}
                        fill="none"
                        viewBox="0 0 12 12"
                      >
                        <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>

                  {showSubPicker && (
                    <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                      {getSubPickerVariables(config.parentGroup!).map(sub => (
                        <button
                          key={sub.key}
                          onClick={() => handleSubPickerClick(sub.key)}
                          className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                            activeVariable === sub.key
                              ? 'bg-plum-600/25 text-plum-400'
                              : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                          }`}
                        >
                          <span
                            className="flex-shrink-0 w-2 h-2 rounded-sm"
                            style={{ backgroundColor: getSwatchColor(sub) }}
                          />
                          <span className="flex-1 leading-tight">{sub.shortLabel}</span>
                          {activeVariable === sub.key && (
                            <svg className="w-3 h-3 flex-shrink-0 text-plum-500" fill="none" viewBox="0 0 12 12">
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

          {/* None / clear */}
          {activeVariable !== null && (
            <button
              onClick={() => { onSelect(null); setSubPickerGroup(null); setOpen(false) }}
              className="w-full flex items-center gap-2 px-2 py-1 mt-1 rounded text-left text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors border-t border-white/5 pt-1.5"
            >
              <span className="flex-shrink-0 w-2.5 h-2.5" />
              None
            </button>
          )}

          {/* More variables expander */}
          <button
            onClick={() => { setShowMore(prev => !prev); setSubPickerGroup(null) }}
            className="w-full flex items-center justify-between px-2 py-1.5 mt-1 rounded text-[11px] text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-colors border-t border-white/5 pt-1.5"
          >
            <span>More variables</span>
            <svg
              className={`w-3 h-3 transition-transform ${showMore ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 12 12"
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showMore && (
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
                                }
                              }}
                              className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                                isActive
                                  ? 'bg-plum-600/25 text-plum-400'
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
                                <svg className="w-3 h-3 flex-shrink-0 text-plum-500" fill="none" viewBox="0 0 12 12">
                                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                              {config.parentGroup && (
                                <svg
                                  className={`w-3 h-3 flex-shrink-0 transition-transform ${showSubPicker ? 'rotate-90' : ''} ${isActive ? 'text-plum-500' : 'text-slate-500'}`}
                                  fill="none"
                                  viewBox="0 0 12 12"
                                >
                                  <path d="M4 3l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </button>
                            {showSubPicker && config.parentGroup && (
                              <div className="ml-4 mt-0.5 space-y-0.5 border-l border-white/10 pl-2">
                                {getSubPickerVariables(config.parentGroup).map(sub => (
                                  <button
                                    key={sub.key}
                                    onClick={() => {
                                      handleSubPickerClick(sub.key)
                                      setShowMore(false)
                                    }}
                                    className={`w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] transition-colors ${
                                      activeVariable === sub.key
                                        ? 'bg-plum-600/25 text-plum-400'
                                        : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                                    }`}
                                  >
                                    <span
                                      className="flex-shrink-0 w-2 h-2 rounded-sm"
                                      style={{ backgroundColor: getSwatchColor(sub) }}
                                    />
                                    <span className="flex-1 leading-tight">{sub.shortLabel}</span>
                                    {activeVariable === sub.key && (
                                      <svg className="w-3 h-3 flex-shrink-0 text-plum-500" fill="none" viewBox="0 0 12 12">
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
      )}
    </div>
  )
}
