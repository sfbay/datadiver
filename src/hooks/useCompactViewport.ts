import { useState, useEffect, useRef, type RefObject } from 'react'

/**
 * Observes a container's dimensions and returns whether the viewport
 * is too small for expanded overlays. Uses the tray element's
 * offsetParent (the nearest positioned ancestor, i.e. the map container).
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

    // Observe the offsetParent (map container) not the tray itself
    const container = el.offsetParent as HTMLElement | null
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
