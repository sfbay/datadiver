/**
 * useElectionTimeline — cross-election playback controller
 *
 * Manages the "Time Machine" state: which election is being shown,
 * play/pause/speed controls, and preloading results for smooth playback.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useElectionManifest, useElectionResults } from '@/hooks/useElectionResults'
import type { ElectionMeta, ElectionResults } from '@/types/elections'

interface UseElectionTimelineOptions {
  /** Filter elections to a specific type */
  electionType?: 'general' | 'primary' | 'special' | 'all'
  /** Enable playback */
  enabled?: boolean
}

export function useElectionTimeline(options: UseElectionTimelineOptions = {}) {
  const { electionType = 'all', enabled = false } = options

  const { data: manifest } = useElectionManifest()

  // Filter and sort elections chronologically (oldest first for playback)
  const timelineElections = useMemo((): ElectionMeta[] => {
    if (!manifest) return []
    const filtered = electionType === 'all'
      ? manifest.elections
      : manifest.elections.filter((e) => e.type === electionType)
    return [...filtered].reverse() // oldest first
  }, [manifest, electionType])

  const [activeIndex, setActiveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-play
  useEffect(() => {
    if (!isPlaying || !enabled) {
      if (playTimer.current) clearInterval(playTimer.current)
      return
    }

    const interval = 2000 / speed
    playTimer.current = setInterval(() => {
      setActiveIndex((prev) => {
        if (prev >= timelineElections.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, interval)

    return () => {
      if (playTimer.current) clearInterval(playTimer.current)
    }
  }, [isPlaying, speed, timelineElections.length, enabled])

  const togglePlay = useCallback(() => {
    setIsPlaying((prev) => {
      if (!prev && activeIndex >= timelineElections.length - 1) {
        setActiveIndex(0)
      }
      return !prev
    })
  }, [activeIndex, timelineElections.length])

  // Preload results for the active election
  const activeElection = timelineElections[activeIndex] ?? null
  const { data: activeResults, isLoading } = useElectionResults(
    enabled && activeElection ? activeElection.dateCode : null
  )

  // Preload next election for smooth transitions
  const nextElection = timelineElections[activeIndex + 1] ?? null
  useElectionResults(
    enabled && nextElection ? nextElection.dateCode : null
  )

  return {
    elections: timelineElections,
    activeIndex,
    setActiveIndex,
    activeElection,
    activeResults,
    isLoading,
    isPlaying,
    togglePlay,
    speed,
    setSpeed,
  }
}
