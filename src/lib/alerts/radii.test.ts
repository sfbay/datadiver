// src/lib/alerts/radii.test.ts
//
// Regression guard for the "invalid radius" subscribe bug: the ⅛-mi (0.125)
// pill the client offers MUST be in the shared allow-list the server validates
// against. Because both sides now import ALERT_RADII, pinning this value here
// guards both — a drift like the original (⅛ on the client, missing on the
// server) can no longer happen silently.

import { describe, it, expect } from 'vitest'
import { ALERT_RADII } from './radii'

describe('ALERT_RADII — shared client/server radius allow-list', () => {
  it('is the canonical set of subscribable radii', () => {
    expect([...ALERT_RADII]).toEqual([0.125, 0.25, 0.5, 1, 2])
  })

  it('includes the ⅛-mi (0.125) radius the subscribe validator used to reject', () => {
    expect(ALERT_RADII).toContain(0.125)
  })
})
