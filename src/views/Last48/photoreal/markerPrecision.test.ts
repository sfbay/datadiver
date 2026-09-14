import { describe, it, expect } from 'vitest'
import { PRECISION, PRECISION_LABEL } from './markerPrecision'
import { LAST48_DATASETS } from '@/types/last48'

describe('markerPrecision', () => {
  it('every Last 48 stream declares its class (probe 2026-09-09)', () => {
    for (const id of LAST48_DATASETS) expect(PRECISION[id], id).toBeDefined()
    expect(PRECISION['911-realtime']).toBe('intersection')
    expect(PRECISION['fire-ems-dispatch']).toBe('intersection')
    expect(PRECISION['311-cases']).toBe('address')
  })
  it('labels are reader-facing words', () => {
    expect(PRECISION_LABEL.intersection).toBe('Nearest intersection')
    expect(PRECISION_LABEL.address).toBe('Address')
  })
})
