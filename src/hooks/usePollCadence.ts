// src/hooks/usePollCadence.ts
//
// Schedules a callback at a configurable cadence with:
//   - Random jitter (0-20% of interval) to avoid all datasets pinging
//     Socrata at the same second on a shared cadence
//   - Pause when tab is hidden (via useTabVisibility); on resume, fires
//     immediately once before resuming the schedule
//   - Exponential backoff on consecutive errors, capped at 30 min
//
// Caller is responsible for tracking the success/error of each call
// and notifying via the `onResult` callback so backoff can advance.

import { useEffect, useRef } from 'react'
import { useTabVisibility } from './useTabVisibility'

interface PollCadenceOpts {
  /** Base interval in milliseconds */
  intervalMs: number
  /** Maximum backoff ceiling (defaults to 30 min) */
  maxBackoffMs?: number
  /** Function to invoke on each tick */
  fetch: () => Promise<void>
  /** Optional debug label for console logs */
  label?: string
}

const DEFAULT_MAX_BACKOFF_MS = 30 * 60 * 1000

export function usePollCadence({
  intervalMs,
  maxBackoffMs = DEFAULT_MAX_BACKOFF_MS,
  fetch,
  label = 'poll',
}: PollCadenceOpts): void {
  const visible = useTabVisibility()
  const fetchRef = useRef(fetch)
  fetchRef.current = fetch
  const consecutiveErrorsRef = useRef(0)

  useEffect(() => {
    if (!visible) return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      if (cancelled) return
      try {
        await fetchRef.current()
        consecutiveErrorsRef.current = 0
      } catch (e) {
        consecutiveErrorsRef.current += 1
        if (typeof console !== 'undefined') {
          console.warn(`[${label}] poll error #${consecutiveErrorsRef.current}`, e)
        }
      }
      if (cancelled) return

      // Compute next delay with jitter + backoff
      const backoffMultiplier = Math.min(
        Math.pow(2, consecutiveErrorsRef.current),
        maxBackoffMs / intervalMs
      )
      const baseDelay = intervalMs * backoffMultiplier
      const jitter = baseDelay * Math.random() * 0.2
      const nextDelay = Math.min(baseDelay + jitter, maxBackoffMs)

      timeoutId = setTimeout(tick, nextDelay)
    }

    // Fire immediately on mount / visibility return, then schedule next
    void tick()

    return () => {
      cancelled = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [visible, intervalMs, maxBackoffMs, label])
}
