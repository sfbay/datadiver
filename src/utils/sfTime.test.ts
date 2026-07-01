// Guards the SF floating-timestamp conversion in both directions.
//
// Every assertion here is an EXACT epoch, so the suite is host-timezone-
// independent for the Intl-based implementation — and fails loudly on any
// non-Pacific host (CI, a Vercel build step) if someone regresses to
// Date.parse / toISOString, which only look correct on a Pacific laptop.

import { describe, it, expect } from 'vitest'
import { parseSfLocal, sfLocalCutoff } from './sfTime'

describe('parseSfLocal', () => {
  it('interprets winter (PST, UTC-8) wall time correctly', () => {
    expect(parseSfLocal('2026-01-15T12:00:00')).toBe(Date.UTC(2026, 0, 15, 20, 0, 0))
  })

  it('interprets summer (PDT, UTC-7) wall time correctly', () => {
    expect(parseSfLocal('2026-07-01T16:10:21')).toBe(Date.UTC(2026, 6, 1, 23, 10, 21))
  })

  it('carries fractional seconds (the .000 DataSF publishes)', () => {
    expect(parseSfLocal('2026-07-01T16:10:21.500')).toBe(Date.UTC(2026, 6, 1, 23, 10, 21, 500))
  })

  it('accepts a space separator (some Socrata exports)', () => {
    expect(parseSfLocal('2026-07-01 16:10:21')).toBe(Date.UTC(2026, 6, 1, 23, 10, 21))
  })

  it('leaves offset-carrying strings to standard parsing', () => {
    expect(parseSfLocal('2026-07-01T16:10:21Z')).toBe(Date.UTC(2026, 6, 1, 16, 10, 21))
    expect(parseSfLocal('2026-07-01T16:10:21-04:00')).toBe(Date.UTC(2026, 6, 1, 20, 10, 21))
  })

  it('returns NaN for garbage (mirrors Date.parse)', () => {
    expect(parseSfLocal('not a time')).toBeNaN()
  })

  it('resolves the nonexistent spring-forward hour to an adjacent instant', () => {
    // 2026-03-08 02:30 SF wall time does not exist (clocks jump 02:00→03:00).
    const epoch = parseSfLocal('2026-03-08T02:30:00')
    expect(epoch).toBeGreaterThanOrEqual(Date.UTC(2026, 2, 8, 9, 30)) // 01:30 PST
    expect(epoch).toBeLessThanOrEqual(Date.UTC(2026, 2, 8, 10, 30)) // 03:30 PDT
  })

  it('resolves the ambiguous fall-back hour to one of its two real instants', () => {
    // 2026-11-01 01:30 SF wall time occurs twice (PDT then PST).
    const epoch = parseSfLocal('2026-11-01T01:30:00')
    const asPdt = Date.UTC(2026, 10, 1, 8, 30)
    const asPst = Date.UTC(2026, 10, 1, 9, 30)
    expect([asPdt, asPst]).toContain(epoch)
  })
})

describe('sfLocalCutoff', () => {
  it('formats a PDT epoch as SF wall digits, no offset, no Z', () => {
    expect(sfLocalCutoff(Date.UTC(2026, 6, 1, 23, 10, 21))).toBe('2026-07-01T16:10:21')
  })

  it('formats a PST epoch as SF wall digits', () => {
    expect(sfLocalCutoff(Date.UTC(2026, 0, 15, 20, 0, 0))).toBe('2026-01-15T12:00:00')
  })

  it('crosses the date line correctly (UTC evening = same SF day)', () => {
    // 2026-07-02T02:00Z is still 2026-07-01 19:00 in SF.
    expect(sfLocalCutoff(Date.UTC(2026, 6, 2, 2, 0, 0))).toBe('2026-07-01T19:00:00')
  })

  it('round-trips with parseSfLocal in both seasons', () => {
    for (const e of [Date.UTC(2026, 0, 15, 20, 0, 0), Date.UTC(2026, 6, 1, 23, 10, 21)]) {
      expect(parseSfLocal(sfLocalCutoff(e))).toBe(e)
    }
  })
})
