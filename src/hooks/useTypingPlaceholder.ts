import { useEffect, useRef, useState } from 'react'

interface UseTypingPlaceholderOptions {
  /** Pool of strings to cycle through. Pass a stable reference (module
   *  constant or useMemo) — a new array per render restarts the cycle. */
  samples: string[]
  /** ms per character while typing in. */
  typeSpeed?: number
  /** ms per character while erasing. */
  eraseSpeed?: number
  /** ms to hold the fully-typed sample before erasing. */
  holdDuration?: number
  /** ms to pause between samples (after erase, before next type). */
  betweenDuration?: number
  /** When true, the animation stops and the returned text stays empty.
   *  Use this to suppress the cycle while the input is focused or has
   *  user-typed content. */
  paused?: boolean
}

/**
 * Cycles through a list of sample strings, type-in / hold / erase /
 * advance — useful as an animated placeholder that demonstrates what
 * a search field can do without committing to a single static example.
 *
 * Returns the current visible substring. The owning component reads
 * this value into a `placeholder` attribute (or wherever).
 */
export function useTypingPlaceholder({
  samples,
  typeSpeed = 60,
  eraseSpeed = 30,
  holdDuration = 1800,
  betweenDuration = 400,
  paused = false,
}: UseTypingPlaceholderOptions): string {
  const [text, setText] = useState('')
  const indexRef = useRef(0)

  useEffect(() => {
    if (paused || samples.length === 0) {
      setText('')
      return
    }

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const schedule = (delay: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (!cancelled) fn()
      }, delay)
    }

    const eraseNext = (sample: string, charIdx: number) => {
      if (charIdx < 0) return
      setText(sample.slice(0, charIdx))
      if (charIdx === 0) {
        indexRef.current = (indexRef.current + 1) % samples.length
        schedule(betweenDuration, () => {
          const next = samples[indexRef.current]
          typeNext(next, 1)
        })
      } else {
        schedule(eraseSpeed, () => eraseNext(sample, charIdx - 1))
      }
    }

    const typeNext = (sample: string, charIdx: number) => {
      if (charIdx > sample.length) return
      setText(sample.slice(0, charIdx))
      if (charIdx === sample.length) {
        schedule(holdDuration, () => eraseNext(sample, sample.length - 1))
      } else {
        schedule(typeSpeed, () => typeNext(sample, charIdx + 1))
      }
    }

    typeNext(samples[indexRef.current], 1)

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [paused, samples, typeSpeed, eraseSpeed, holdDuration, betweenDuration])

  return text
}
