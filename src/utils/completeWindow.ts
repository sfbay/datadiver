/** Date-only window [end − spanDays + 1, end] where end = max − edgeDays.
 *  All math on UTC day numbers of the FLOATING local date — never string
 *  slicing across month boundaries, never toISOString on a local now. */
export function completeWindow(
  maxLocal: string,
  edgeDays: number,
  spanDays: number
): { start: string; end: string } {
  const day = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
    return Date.UTC(y, m - 1, d)
  }
  const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const DAY = 86_400_000
  const end = day(maxLocal) - edgeDays * DAY
  return { start: fmt(end - (spanDays - 1) * DAY), end: fmt(end) }
}
