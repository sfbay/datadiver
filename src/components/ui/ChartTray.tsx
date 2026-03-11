import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react'
import { useCompactViewport } from '@/hooks/useCompactViewport'

export interface ChartTileDef {
  /** Unique id for persistence */
  id: string
  /** Label shown on expanded tile and minimized pill */
  label: string
  /** Short label for minimized pill */
  shortLabel?: string
  /** Accent color for the pill dot */
  color?: string
  /** Render the chart content */
  render: () => ReactNode
  /** If true, expanded by default on first visit */
  defaultExpanded?: boolean
}

type TileState = 'expanded' | 'minimized' | 'hidden'

interface ChartTrayProps {
  /** Unique key for localStorage persistence */
  viewId: string
  /** All available chart tile definitions */
  tiles: ChartTileDef[]
  /** CSS class for the tray container */
  className?: string
}

function getStorageKey(viewId: string) {
  return `dd-charts-${viewId}`
}

function loadTileStates(viewId: string, tiles: ChartTileDef[]): Record<string, TileState> {
  try {
    const stored = localStorage.getItem(getStorageKey(viewId))
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  const states: Record<string, TileState> = {}
  tiles.forEach((t) => {
    states[t.id] = t.defaultExpanded !== false ? 'expanded' : 'minimized'
  })
  return states
}

function saveTileStates(viewId: string, states: Record<string, TileState>) {
  try {
    localStorage.setItem(getStorageKey(viewId), JSON.stringify(states))
  } catch { /* ignore */ }
}

export default function ChartTray({ viewId, tiles, className = '' }: ChartTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null)
  const compact = useCompactViewport(trayRef)
  const [states, setStates] = useState<Record<string, TileState>>(() =>
    loadTileStates(viewId, tiles)
  )
  const [menuOpen, setMenuOpen] = useState(false)

  // Persist on change
  useEffect(() => {
    saveTileStates(viewId, states)
  }, [viewId, states])

  // Ensure new tiles get a default state
  useEffect(() => {
    setStates((prev) => {
      const next = { ...prev }
      let changed = false
      tiles.forEach((t) => {
        if (!(t.id in next)) {
          next[t.id] = t.defaultExpanded !== false ? 'expanded' : 'minimized'
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [tiles])

  const toggleTile = useCallback((id: string) => {
    setStates((prev) => ({
      ...prev,
      [id]: prev[id] === 'expanded' ? 'minimized' : 'expanded',
    }))
  }, [])

  const setTileState = useCallback((id: string, state: TileState) => {
    setStates((prev) => ({ ...prev, [id]: state }))
  }, [])

  const minimizeAll = useCallback(() => {
    setStates((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((k) => {
        if (next[k] === 'expanded') next[k] = 'minimized'
      })
      return next
    })
  }, [])

  // When compact, treat expanded as minimized for rendering (state unchanged)
  const expandedTiles = useMemo(
    () => compact ? [] : tiles.filter((t) => states[t.id] === 'expanded'),
    [tiles, states, compact]
  )
  const minimizedTiles = useMemo(
    () => compact
      ? tiles.filter((t) => states[t.id] !== 'hidden')
      : tiles.filter((t) => states[t.id] === 'minimized'),
    [tiles, states, compact]
  )
  const hiddenTiles = useMemo(
    () => tiles.filter((t) => states[t.id] === 'hidden'),
    [tiles, states]
  )

  const hasExpanded = expandedTiles.length > 0

  return (
    <div ref={trayRef} className={`absolute bottom-0 left-0 right-0 z-10 flex flex-col-reverse ${className}`}>
      {/* Minimized pills — flush bottom bar */}
      {(minimizedTiles.length > 0 || hiddenTiles.length > 0 || hasExpanded) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2">
          {minimizedTiles.map((tile) => (
            <button
              key={tile.id}
              onClick={() => toggleTile(tile.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full
                bg-slate-900/70 backdrop-blur-sm border border-white/[0.06]
                hover:bg-slate-800/80 hover:border-white/[0.12]
                transition-all duration-150 cursor-pointer group/pill"
              title={`${tile.label} — click to expand`}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-60"
                style={{ backgroundColor: tile.color || '#94a3b8' }}
              />
              <span className="text-[9px] font-mono text-slate-400 group-hover/pill:text-slate-300 whitespace-nowrap">
                {tile.shortLabel || tile.label}
              </span>
              <svg className="w-2.5 h-2.5 text-slate-500 group-hover/pill:text-slate-300" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 6.5L5 3.5L8 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ))}

          {/* Minimize all button */}
          {hasExpanded && (
            <button
              onClick={minimizeAll}
              className="flex items-center gap-1 px-2 py-1 rounded-full
                bg-slate-900/50 border border-white/[0.04]
                hover:bg-slate-800/60 hover:border-white/[0.08]
                transition-all duration-150 cursor-pointer"
              title="Minimize all charts"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#64748b" strokeWidth="1.2">
                <path d="M2 3.5h6M2 6.5h6" strokeLinecap="round" />
              </svg>
              <span className="text-[8px] font-mono text-slate-500">all</span>
            </button>
          )}

          {/* Menu toggle for hidden tiles */}
          {hiddenTiles.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1 px-2 py-1 rounded-full
                  bg-slate-900/50 border border-white/[0.04]
                  hover:bg-slate-800/60 hover:border-white/[0.08]
                  transition-all duration-150 cursor-pointer"
                title="Show more charts"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#64748b" strokeWidth="1.2">
                  <circle cx="2" cy="5" r="0.8" fill="#64748b" />
                  <circle cx="5" cy="5" r="0.8" fill="#64748b" />
                  <circle cx="8" cy="5" r="0.8" fill="#64748b" />
                </svg>
                <span className="text-[8px] font-mono text-slate-500">+{hiddenTiles.length}</span>
              </button>

              {menuOpen && (
                <div className="absolute bottom-full left-0 mb-1.5 w-48 rounded-lg
                  bg-slate-900/95 backdrop-blur-sm border border-white/[0.08]
                  shadow-xl shadow-black/40 p-1.5 space-y-0.5 z-50"
                >
                  {hiddenTiles.map((tile) => (
                    <button
                      key={tile.id}
                      onClick={() => { setTileState(tile.id, 'minimized'); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md
                        hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tile.color || '#94a3b8' }}
                      />
                      <span className="text-[10px] text-slate-400">{tile.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded chart tiles — above the pill bar */}
      {hasExpanded && (
        <div className="flex gap-2.5 flex-wrap px-5 pb-1">
          {expandedTiles.map((tile) => (
            <div key={tile.id} className="group/tile relative">
              <div className="glass-card rounded-xl p-3">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  {tile.label}
                </p>
                {tile.render()}
              </div>
              {/* Minimize button — top-left on hover */}
              <button
                onClick={() => toggleTile(tile.id)}
                className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full
                  bg-slate-800/80 border border-slate-600/50
                  flex items-center justify-center
                  opacity-0 group-hover/tile:opacity-100 transition-opacity duration-150
                  cursor-pointer z-10"
                title="Minimize"
              >
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#94a3b8" strokeWidth="1.5">
                  <path d="M1.5 4h5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
