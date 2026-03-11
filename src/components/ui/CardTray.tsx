import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import StatCard from '@/components/ui/StatCard'
import { useCompactViewport } from '@/hooks/useCompactViewport'

export interface CardDef {
  /** Unique id for persistence */
  id: string
  /** Full label shown on expanded card */
  label: string
  /** Short label for minimized pill (e.g., "Total" instead of "Total Incidents") */
  shortLabel?: string
  /** Computed display value */
  value: string
  /** Accent color */
  color: string
  /** Fade-in delay (ms) */
  delay?: number
  /** Optional subtitle (comparison delta text) */
  subtitle?: string
  /** Trend direction for subtitle arrow */
  trend?: 'up' | 'down' | 'neutral'
  /** YoY delta percentage */
  yoyDelta?: number | null
  /** Z-score for anomaly dot */
  zScore?: number | null
  /** Glossary key for info tooltip */
  info?: string
  /** If true, expanded by default on first visit */
  defaultExpanded?: boolean
}

type CardState = 'expanded' | 'minimized' | 'hidden'

interface CardTrayProps {
  /** Unique key for localStorage persistence (e.g., 'crimeIncidents') */
  viewId: string
  /** All available card definitions */
  cards: CardDef[]
  /** CSS class for the tray container */
  className?: string
}

function getStorageKey(viewId: string) {
  return `dd-cards-${viewId}`
}

function loadCardStates(viewId: string, cards: CardDef[]): Record<string, CardState> {
  try {
    const stored = localStorage.getItem(getStorageKey(viewId))
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  // Default: cards with defaultExpanded are expanded, rest minimized
  const states: Record<string, CardState> = {}
  cards.forEach((c) => {
    states[c.id] = c.defaultExpanded ? 'expanded' : 'minimized'
  })
  return states
}

function saveCardStates(viewId: string, states: Record<string, CardState>) {
  try {
    localStorage.setItem(getStorageKey(viewId), JSON.stringify(states))
  } catch { /* ignore */ }
}

export default function CardTray({ viewId, cards, className = '' }: CardTrayProps) {
  const trayRef = useRef<HTMLDivElement>(null)
  const compact = useCompactViewport(trayRef)
  const [states, setStates] = useState<Record<string, CardState>>(() =>
    loadCardStates(viewId, cards)
  )
  const [menuOpen, setMenuOpen] = useState(false)

  // Persist on change
  useEffect(() => {
    saveCardStates(viewId, states)
  }, [viewId, states])

  // Ensure new cards get a default state
  useEffect(() => {
    setStates((prev) => {
      const next = { ...prev }
      let changed = false
      cards.forEach((c) => {
        if (!(c.id in next)) {
          next[c.id] = c.defaultExpanded ? 'expanded' : 'minimized'
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [cards])

  const toggleCard = useCallback((id: string) => {
    setStates((prev) => ({
      ...prev,
      [id]: prev[id] === 'expanded' ? 'minimized' : 'expanded',
    }))
  }, [])

  const setCardState = useCallback((id: string, state: CardState) => {
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
  const expandedCards = useMemo(
    () => compact ? [] : cards.filter((c) => states[c.id] === 'expanded'),
    [cards, states, compact]
  )
  const minimizedCards = useMemo(
    () => compact
      ? cards.filter((c) => states[c.id] !== 'hidden')
      : cards.filter((c) => states[c.id] === 'minimized'),
    [cards, states, compact]
  )
  const hiddenCards = useMemo(
    () => cards.filter((c) => states[c.id] === 'hidden'),
    [cards, states]
  )

  const hasExpanded = expandedCards.length > 0

  return (
    <div ref={trayRef} className={`absolute top-0 left-0 right-0 bottom-0 z-10 flex flex-col overflow-hidden pointer-events-none ${className}`}>
      {/* Minimized pills — flush top bar */}
      {(minimizedCards.length > 0 || hiddenCards.length > 0 || hasExpanded) && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2 pointer-events-auto">
          {minimizedCards.map((card) => {
            const trendArrow = card.yoyDelta != null
              ? card.yoyDelta > 0 ? '↑' : card.yoyDelta < 0 ? '↓' : '→'
              : card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : null
            const trendColor = card.yoyDelta != null
              ? card.yoyDelta > 0 ? '#ef4444' : card.yoyDelta < 0 ? '#10b981' : '#64748b'
              : card.trend === 'up' ? '#ef4444' : card.trend === 'down' ? '#10b981' : null

            return (
              <button
                key={card.id}
                onClick={() => toggleCard(card.id)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full
                  bg-slate-900/70 backdrop-blur-sm border border-white/[0.06]
                  hover:bg-slate-800/80 hover:border-white/[0.12]
                  transition-all duration-150 cursor-pointer group/pill"
                title={`${card.label}: ${card.value} — click to expand`}
              >
                {trendArrow && (
                  <span className="text-[9px] font-mono font-bold" style={{ color: trendColor ?? undefined }}>
                    {trendArrow}
                  </span>
                )}
                {!trendArrow && card.zScore != null && Math.abs(card.zScore) > 1 && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: card.zScore > 1 ? '#ef4444' : '#3b82f6' }}
                  />
                )}
                {!trendArrow && (card.zScore == null || Math.abs(card.zScore) <= 1) && (
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0 opacity-60"
                    style={{ backgroundColor: card.color }}
                  />
                )}
                <span className="text-[9px] font-mono text-slate-400 group-hover/pill:text-slate-300 whitespace-nowrap">
                  {card.shortLabel || card.label}
                </span>
                <span className="text-[9px] font-mono font-semibold text-slate-300 tabular-nums">
                  {card.value}
                </span>
              </button>
            )
          })}

          {/* Minimize all button */}
          {hasExpanded && (
            <button
              onClick={minimizeAll}
              className="flex items-center gap-1 px-2 py-1 rounded-full
                bg-slate-900/50 border border-white/[0.04]
                hover:bg-slate-800/60 hover:border-white/[0.08]
                transition-all duration-150 cursor-pointer"
              title="Minimize all cards"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#64748b" strokeWidth="1.2">
                <path d="M2 3.5h6M2 6.5h6" strokeLinecap="round" />
              </svg>
              <span className="text-[8px] font-mono text-slate-500">all</span>
            </button>
          )}

          {/* Menu toggle for hidden cards */}
          {hiddenCards.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-1 px-2 py-1 rounded-full
                  bg-slate-900/50 border border-white/[0.04]
                  hover:bg-slate-800/60 hover:border-white/[0.08]
                  transition-all duration-150 cursor-pointer"
                title="Show more metrics"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="#64748b" strokeWidth="1.2">
                  <circle cx="2" cy="5" r="0.8" fill="#64748b" />
                  <circle cx="5" cy="5" r="0.8" fill="#64748b" />
                  <circle cx="8" cy="5" r="0.8" fill="#64748b" />
                </svg>
                <span className="text-[8px] font-mono text-slate-500">+{hiddenCards.length}</span>
              </button>

              {menuOpen && (
                <div className="absolute top-full left-0 mt-1.5 w-48 rounded-lg
                  bg-slate-900/95 backdrop-blur-sm border border-white/[0.08]
                  shadow-xl shadow-black/40 p-1.5 space-y-0.5 z-50"
                >
                  {hiddenCards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => { setCardState(card.id, 'minimized'); setMenuOpen(false) }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md
                        hover:bg-white/[0.06] transition-colors cursor-pointer text-left"
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: card.color }}
                      />
                      <span className="text-[10px] text-slate-400">{card.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expanded stat cards — below the pill bar */}
      {hasExpanded && (
        <div className="flex gap-2.5 flex-wrap px-5 pb-2 pointer-events-auto">
          {expandedCards.map((card) => (
            <div key={card.id} className="group/card relative">
              <StatCard
                label={card.label}
                value={card.value}
                color={card.color}
                delay={card.delay ?? 0}
                subtitle={card.subtitle}
                trend={card.trend}
                yoyDelta={card.yoyDelta}
                zScore={card.zScore}
                info={card.info}
              />
              {/* Minimize button — top-left on hover */}
              <button
                onClick={() => toggleCard(card.id)}
                className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full
                  bg-slate-800/80 border border-slate-600/50
                  flex items-center justify-center
                  opacity-0 group-hover/card:opacity-100 transition-opacity duration-150
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
