// src/hooks/useDraggableSheet.ts
//
// Drag-to-resize bottom sheet with three snap points — peek / half / full.
// Shared by every mobile sheet (FlowRail list, detail popover, Neighborhood
// ranking) so they behave identically. The sheet element is rendered at FULL
// height and translated DOWN to reveal only the active snap, so resizing is a
// GPU transform (no layout), and the map stays visible behind it.
//
// Interaction:
//  - Drag the handle ↕ → live resize; release snaps to the nearest of
//    {peek, half, full}.
//  - Tap the handle (no movement) → cycle peek → half → full → peek.
//  - Drag below peek (with onDismiss) → dismiss (e.g. close the detail card).

import { useState, useEffect, useCallback, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

export type SheetSnap = 'peek' | 'half' | 'full'

const PEEK_PX = 72       // visible sliver when peeked — handle + a hint line
const HALF_VH = 0.45     // default open height
const FULL_VH = 0.9      // tallest snap
const TAP_PX = 6         // movement under this on release = a tap, not a drag
const DISMISS_PX = 40    // drag this far past peek to dismiss

function heights(halfFrac: number) {
  const H = typeof window !== 'undefined' ? window.innerHeight : 800
  return { full: H * FULL_VH, half: H * halfFrac, peek: PEEK_PX }
}

interface Options {
  /** Snap the sheet opens at. List sheets default 'peek' (map visible); detail
   *  popovers default 'half'. */
  initial?: SheetSnap
  /** If provided, dragging below peek dismisses (e.g. closes the detail card).
   *  Omit for persistent sheets (the list) — they bottom out at peek. */
  onDismiss?: () => void
  /** Fraction of viewport height for the 'half' snap (default 0.45). Lists pass
   *  a lower value so the first notch shows ~one fewer row. */
  halfVh?: number
}

export function useDraggableSheet({ initial = 'half', onDismiss, halfVh = HALF_VH }: Options = {}) {
  const [vh, setVh] = useState(() => heights(halfVh))
  const [snap, setSnap] = useState<SheetSnap>(initial)
  const [dragTy, setDragTy] = useState<number | null>(null)

  useEffect(() => {
    const onResize = () => setVh(heights(halfVh))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [halfVh])

  const tyFor = useCallback(
    (s: SheetSnap) => (s === 'full' ? 0 : s === 'half' ? vh.full - vh.half : vh.full - vh.peek),
    [vh],
  )

  const maxTy = vh.full - vh.peek
  const dragging = dragTy !== null
  const ty = dragging ? dragTy : tyFor(snap)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault()
      const startY = e.clientY
      const startSnap = snap
      const startTy = tyFor(snap)
      setDragTy(startTy)

      const onMove = (ev: PointerEvent) => {
        const next = startTy + (ev.clientY - startY)
        setDragTy(Math.max(0, Math.min(next, maxTy + 100))) // a little overscroll past peek for dismiss
      }
      const onUp = (ev: PointerEvent) => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        const delta = ev.clientY - startY
        const released = startTy + delta
        setDragTy(null)

        if (Math.abs(delta) < TAP_PX) {
          const order: SheetSnap[] = ['peek', 'half', 'full']
          setSnap(order[(order.indexOf(startSnap) + 1) % order.length])
          return
        }
        if (onDismiss && released > maxTy + DISMISS_PX) {
          onDismiss()
          return
        }
        const cands: [SheetSnap, number][] = [
          ['full', 0],
          ['half', vh.full - vh.half],
          ['peek', maxTy],
        ]
        setSnap(cands.reduce((a, b) => (Math.abs(b[1] - released) < Math.abs(a[1] - released) ? b : a))[0])
      }
      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [snap, tyFor, maxTy, vh, onDismiss],
  )

  const sheetStyle: CSSProperties = {
    height: `${vh.full}px`,
    transform: `translateY(${ty}px)`,
    transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.16,1,0.3,1)',
  }

  return { sheetStyle, handleProps: { onPointerDown }, snap, setSnap, dragging }
}
