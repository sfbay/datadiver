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

/** Reset progress for a new loading cycle */
function reset() {
  state = { total: 0, completed: 0, active: true }
  notify()
}

/** Register a query (increment total). Called by useDataset. */
export function registerQuery() {
  state = { ...state, total: state.total + 1, active: true }
  notify()
}

/** Mark a query as complete. Called by useDataset. */
export function completeQuery() {
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
