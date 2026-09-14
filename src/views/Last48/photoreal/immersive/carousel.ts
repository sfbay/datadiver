// src/views/Last48/photoreal/immersive/carousel.ts
//
// PURE state math for the immersive lower third (Spec A2 §2). The ORDER is
// chainTour's nearest-neighbour chain (the tour's pass); the ACTIVE stop is
// the URL's ?event=. Everything here is index arithmetic over that order so
// the page, the band and the map agree on prev / next / queue by construction.
export const QUEUE_LEN = 6
/** The first QUEUE_DISCS of the queue are drawn on the map as dim discs. */
export const QUEUE_DISCS = 2

/** The active index for the URL's ?event=. Unknown or absent → 0 (the
 *  newest stop — chainTour starts there); empty order → -1. */
export function carouselIndex(order: readonly string[], activeId: string | null): number {
  if (order.length === 0) return -1
  const i = activeId ? order.indexOf(activeId) : -1
  return i < 0 ? 0 : i
}

export function stepIndex(order: readonly string[], index: number, delta: number): number {
  const n = order.length
  if (n === 0) return -1
  return (((index + delta) % n) + n) % n
}

/** The cards peeking either side of the active one. A two-stop order peeks
 *  next only — the same card must never appear twice in the band. */
export function peekIds(order: readonly string[], index: number): { prev: string | null; next: string | null } {
  const n = order.length
  return {
    prev: n >= 3 ? order[stepIndex(order, index, -1)] : null,
    next: n >= 2 ? order[stepIndex(order, index, 1)] : null,
  }
}

/** The next `n` stops after the active one, wrapping, never the active. */
export function queueIds(order: readonly string[], index: number, n: number = QUEUE_LEN): string[] {
  const count = Math.min(n, Math.max(0, order.length - 1))
  const out: string[] = []
  for (let k = 1; k <= count; k++) out.push(order[stepIndex(order, index, k)])
  return out
}

export function queueDiscIds(order: readonly string[], index: number): string[] {
  return queueIds(order, index, QUEUE_DISCS)
}
