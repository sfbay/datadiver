// src/utils/dateWindow.ts
// Pure position/duration arithmetic for the Era Track.
//
// The Era Track splits WHERE (the strip's brush) from HOW LONG (the duration
// pills). This module owns the "how long" half plus the clamping both halves
// need, so the component stays presentational.
//
// All dates are 'YYYY-MM-DD'. Parsing goes through Date.parse of the date part
// only, which the spec defines as UTC midnight — so every result is identical
// in every viewer timezone.

export interface Win { start: string; end: string }
export interface Domain { start: string; end: string }

const DAY = 86_400_000
const ms = (isoDate: string): number => Date.parse(isoDate.slice(0, 10))
const iso = (n: number): string => new Date(n).toISOString().slice(0, 10)

/** EXCLUSIVE day count (end − start), matching the existing picker's
 *  daysBetween: Jun 1 – Jun 30 reads as 29d. */
export function windowDays(w: Win): number {
  return Math.round((ms(w.end) - ms(w.start)) / DAY)
}

/** Slide a window back inside the domain, PRESERVING its length. Shortening
 *  would silently change what the user asked for. A window longer than the
 *  domain collapses to the domain itself. */
export function clampWindow(w: Win, d: Domain): Win {
  const ds = ms(d.start), de = ms(d.end)
  const len = Math.max(0, ms(w.end) - ms(w.start))
  if (len >= de - ds) return { start: d.start, end: d.end }
  let s = ms(w.start), e = ms(w.end)
  if (s < ds) { s = ds; e = ds + len }
  if (e > de) { e = de; s = de - len }
  return { start: iso(s), end: iso(e) }
}

/** Resize in place, END-anchored. With an end of today this is exactly what
 *  the preset pills do today — the compatibility guarantee. */
export function resizeToDays(w: Win, days: number, d: Domain): Win {
  return clampWindow({ start: iso(ms(w.end) - days * DAY), end: w.end }, d)
}

/** Shift the whole window by its own length. With a 30-day window this walks
 *  history a month at a time; with a 1Y window, a year at a time. */
export function stepWindow(w: Win, dir: 1 | -1, d: Domain): Win {
  const len = ms(w.end) - ms(w.start)
  return clampWindow({ start: iso(ms(w.start) + dir * len), end: iso(ms(w.end) + dir * len) }, d)
}

/** Same duration, ending today. */
export function moveToNow(w: Win, today: string, d: Domain): Win {
  const len = ms(w.end) - ms(w.start)
  return clampWindow({ start: iso(ms(today) - len), end: today }, d)
}
