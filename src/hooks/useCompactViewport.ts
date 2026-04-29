import { useState, useEffect, useRef, type RefObject } from 'react'

/**
 * Observes the dimensions of the tray's positioned ancestor (the map container)
 * and returns whether that container is too small for expanded overlays.
 *
 * The tray itself is `position: absolute` and shrinks to fit its rendered pills,
 * so observing it directly produces a tiny height that always reads as compact.
 * We always climb to `offsetParent` — the nearest positioned ancestor — so the
 * measurement reflects the real available canvas (the map area).
 *
 * Thresholds:
 *  - compact: height < 500px OR width < 600px → force-minimize expanded items
 */
export function useCompactViewport(
  elRef: RefObject<HTMLElement | null>,
  heightThreshold = 500,
  widthThreshold = 600,
): boolean {
  const [compact, setCompact] = useState(false)
  const observerRef = useRef<ResizeObserver | null>(null)

  useEffect(() => {
    const el = elRef.current
    if (!el) return

    const container = (el.offsetParent as HTMLElement | null) ?? document.documentElement
    if (!container) return

    const check = () => {
      const { height, width } = container.getBoundingClientRect()
      setCompact(height < heightThreshold || width < widthThreshold)
    }

    check()
    observerRef.current = new ResizeObserver(check)
    observerRef.current.observe(container)

    return () => {
      observerRef.current?.disconnect()
    }
  }, [elRef, heightThreshold, widthThreshold])

  return compact
}
