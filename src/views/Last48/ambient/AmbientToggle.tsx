// src/views/Last48/ambient/AmbientToggle.tsx
//
// DRIFT pill — arms/disarms ambient mode — plus a fullscreen button.
// Sits in the Last 48 header cluster next to LayerControls. Visual idiom
// matches LayerControls' FLOW toggle (mono uppercase pill, filled when
// active). Hidden entirely under prefers-reduced-motion: the feature is
// motion, so it must not exist for users who opted out of motion.
//
// data-ambient-toggle marks the subtree so AmbientConductor's exit-on-input
// listener can ignore clicks on the control itself (otherwise pressing the
// pill to turn DRIFT off would first trigger the "any input exits" path and
// the toggle would read stale state).

import { useSyncExternalStore } from 'react'

interface Props {
  on: boolean
  /** Disabled while streams are still booting or no events have geo. */
  disabled: boolean
  onToggle: (next: boolean) => void
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

export default function AmbientToggle({ on, disabled, onToggle }: Props) {
  const reducedMotion = useSyncExternalStore(subscribeReducedMotion, prefersReducedMotion)
  if (reducedMotion) return null

  return (
    <div className="flex items-center gap-1" data-ambient-toggle>
      <button
        onClick={() => onToggle(!on)}
        disabled={disabled}
        aria-pressed={on}
        title={
          disabled
            ? 'Drift starts once events finish loading'
            : 'Ambient drift — slow orbit touring the freshest events. Any input stops it.'
        }
        className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
          on
            ? disabled
              ? 'bg-teal-500/10 text-teal-600/50 dark:text-teal-400/50 cursor-not-allowed' // armed via ?ambient=1, waiting for boot
              : 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
            : disabled
              ? 'text-paper-400 dark:text-paper-700 cursor-not-allowed'
              : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
      >
        {on ? '◉ drift' : '○ drift'}
      </button>
      <button
        onClick={() => {
          // Both calls are best-effort: requestFullscreen rejects under
          // permissions-policy/iframe sandboxing; exitFullscreen can reject on an
          // Escape-press race. Failing silently is the intended kiosk behavior.
          if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
          else document.documentElement.requestFullscreen().catch(() => {})
        }}
        title="Fullscreen — pairs with drift for an unattended display"
        className="px-2 py-1.5 rounded-md text-[12px] font-mono text-paper-500 dark:text-paper-600 hover:text-paper-300 transition-colors"
        aria-label="Toggle fullscreen"
      >
        ⛶
      </button>
    </div>
  )
}
