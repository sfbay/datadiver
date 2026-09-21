// src/views/Last48/photoreal/immersive/nextIn.ts
//
// The time-to-next-stop FIGURE (Round B §4). One string, mono in the band's
// status line. Whole seconds, rounded UP: a reader watching "next in 1 s"
// should see the stop change on the beat, not a second after it says 0.
// `null` = the clock is not running (the flight, the settle gate, explore),
// and the figure says so with a dash rather than pretending.

/** `next in 48 s` / `next in —`. */
export function formatNextIn(remainingMs: number | null): string {
  if (remainingMs == null) return 'next in —'
  const s = Math.max(0, Math.ceil(remainingMs / 1000))
  return `next in ${s} s`
}
