// src/views/Last48/ambient/AmbientToggle.tsx
//
// AUTO pill — arms/disarms ambient mode (internally still "drift"/ambient) —
// plus a pace-preset chevron menu
// and a fullscreen button. Sits in the Last 48 header cluster next to
// LayerControls; the menu reuses LayerControls' dropdown idiom (one menu,
// one question: "how fast should the city drift?"). Hidden entirely under
// prefers-reduced-motion: the feature is motion, so it must not exist for
// users who opted out of motion.
//
// data-ambient-toggle marks the subtree so AmbientConductor's exit-on-input
// listener ignores clicks on the control itself — including the open menu,
// which is how a pace can be switched live mid-drift without stopping it.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { PACE_PRESETS, type PaceId } from './pace'

interface Props {
  on: boolean
  /** Disabled while streams are still booting or no events have geo. */
  disabled: boolean
  /** The pace that is (or would be) driving the drift. */
  activePaceId: PaceId
  onToggle: (next: boolean) => void
  /** Choose a pace: switches live when on, arms at that pace when off. */
  onPaceSelect: (id: PaceId) => void
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(cb: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export default function AmbientToggle({ on, disabled, activePaceId, onToggle, onPaceSelect }: Props) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Click-outside dismiss for the dropdown (LayerControls pattern — the
  // tiny delay keeps the opening click from immediately closing it).
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [menuOpen])

  if (reducedMotion) return null

  return (
    <div ref={menuRef} className="relative flex items-center gap-1" data-ambient-toggle>
      <button
        onClick={() => onToggle(!on)}
        disabled={disabled}
        aria-pressed={on}
        title={
          disabled
            ? 'Auto-tour starts once events finish loading'
            : 'Auto — a slow orbit touring the freshest events. Any input stops it.'
        }
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-mono uppercase tracking-wider transition-all duration-200 ${
          on && !disabled
            ? 'bg-moss-500/20 text-moss-600 dark:text-moss-400 ring-1 ring-moss-500/40' // actively touring → green/live
            : disabled
              ? 'text-paper-400 dark:text-paper-700 cursor-not-allowed' // armed via ?ambient=, waiting for boot
              : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
      >
        {/* Traffic-light idiom (one dot in every state → constant pill width):
            actively touring = green + pulseGlow halo (currentColor = moss,
            the site's live-pulse), stopped/booting = a solid red dot. Green =
            motion, red = stopped — clearer than the DOTS toggle's neutral
            on/off, since auto implies action. */}
        <span
          aria-hidden
          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            on && !disabled ? 'bg-current pulse-live' : 'bg-terracotta-500'
          }`}
        />
        auto
      </button>

      {/* Pace chevron — opens the preset menu */}
      <button
        onClick={() => setMenuOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Auto-tour pace"
        title={`Pace: ${PACE_PRESETS[activePaceId].label}`}
        className={`px-1 py-1.5 rounded-md transition-colors ${
          disabled
            ? 'text-paper-400 dark:text-paper-700 cursor-not-allowed'
            : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
      >
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M2 4l3 3 3-3" />
        </svg>
      </button>

      <button
        onClick={() => {
          // Both calls are best-effort: requestFullscreen rejects under
          // permissions-policy/iframe sandboxing; exitFullscreen can reject on an
          // Escape-press race. Failing silently is the intended kiosk behavior.
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          else document.documentElement.requestFullscreen().catch(() => {})
        }}
        title="Fullscreen — pairs with auto for an unattended display"
        className="px-2 py-1.5 rounded-md text-[12px] font-mono text-paper-500 dark:text-paper-600 hover:text-paper-300 transition-colors"
        aria-label="Toggle fullscreen"
      >
        ⛶
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-50 min-w-[180px] rounded-lg bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl shadow-black/20 p-2"
        >
          <div className="px-2 pb-1 text-nano font-mono uppercase tracking-[0.2em] text-paper-500/70 dark:text-paper-600">
            Auto-tour pace
          </div>
          {Object.values(PACE_PRESETS).map((preset) => {
            const active = preset.id === activePaceId
            return (
              <button
                key={preset.id}
                role="menuitem"
                onClick={() => {
                  onPaceSelect(preset.id)
                  setMenuOpen(false)
                }}
                className={`flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                  active
                    ? 'bg-ochre-500/15 text-ink dark:text-paper-100'
                    : 'text-paper-800 dark:text-paper-300 hover:bg-paper-100/60 dark:hover:bg-espresso-800/60'
                }`}
              >
                <span className="flex-1 leading-tight">{preset.label}</span>
                <span className="ml-auto text-[8px] font-mono uppercase tracking-widest text-paper-500/70 dark:text-paper-600">
                  {preset.hint}
                </span>
                {active && (
                  <svg className="w-3 h-3 flex-shrink-0 text-ochre-600 dark:text-ochre-500" fill="none" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
