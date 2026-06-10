/**
 * Lightweight loading progress tracker for views with multiple parallel queries.
 *
 * Each view calls useProgressScope() on mount to reset the tracker.
 * useDataset() automatically calls registerQuery/completeQuery.
 * MapProgressBar reads from useLoadingProgress() to show real progress.
 */

import { useSyncExternalStore, useEffect, useRef } from 'react'

interface ProgressState {
  total: number
  completed: number
  active: boolean
}

let state: ProgressState = { total: 0, completed: 0, active: false }
// Epoch token: bumped on every reset (i.e., on view navigation). Completions
// carry the epoch they registered under; a completion from a previous epoch
// (a fetch cancelled by navigating away) is discarded instead of corrupting
// the new view's tally — without this, fast navigation produced a false
// "100% loaded" flash on the destination view.
let epoch = 0
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

function getSnapshot(): ProgressState {
  return state
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** Reset progress for a new loading cycle (new epoch — see above). */
function reset() {
  epoch += 1
  state = { total: 0, completed: 0, active: true }
  notify()
}

/** Register a query (increment total). Called by useDataset.
 *  Returns the epoch token to pass back to completeQuery. */
export function registerQuery(): number {
  state = { ...state, total: state.total + 1, active: true }
  notify()
  return epoch
}

/** Mark a query as complete. Called by useDataset. Pass the token from
 *  registerQuery — completions from a stale epoch are ignored. */
export function completeQuery(token: number) {
  if (token !== epoch) return
  const completed = state.completed + 1
  const done = completed >= state.total
  state = { ...state, completed, active: !done }
  notify()
}

/** Mark loading as finished */
function finish() {
  if (state.active) {
    state = { ...state, active: false }
    notify()
  }
}

/**
 * Hook for views to create a loading progress scope.
 * Resets the tracker on mount, finishes on unmount.
 */
export function useProgressScope() {
  const initialized = useRef(false)

  useEffect(() => {
    if (!initialized.current) {
      reset()
      initialized.current = true
    }
    return () => {
      finish()
      initialized.current = false
    }
  }, [])
}

/**
 * Hook for the progress bar component to read current progress.
 */
export function useLoadingProgress() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot)
  const fraction = snapshot.total > 0 ? snapshot.completed / snapshot.total : 0
  return {
    fraction,
    active: snapshot.active,
    completed: snapshot.completed,
    total: snapshot.total,
  }
}
