import { describe, it, expect } from 'vitest'
import { parseMapEngine, effectiveMapEngine, STANDARD_SHIPPED, MAP_ENGINE_STORAGE_KEY, PHOTOREAL_OFFERED } from './mapEngine'

describe('parseMapEngine', () => {
  it('accepts the three engines', () => {
    expect(parseMapEngine('classic')).toBe('classic')
    expect(parseMapEngine('standard')).toBe('standard')
    expect(parseMapEngine('photoreal')).toBe('photoreal')
  })
  it('defaults to classic for null, empty, or stale values', () => {
    expect(parseMapEngine(null)).toBe('classic')
    expect(parseMapEngine('')).toBe('classic')
    expect(parseMapEngine('satellite')).toBe('classic')
  })
  it('storage key follows the dd- convention', () => {
    expect(MAP_ENGINE_STORAGE_KEY).toBe('dd-map-engine')
  })
})

describe('effectiveMapEngine', () => {
  const ok = { isMobile: false, viewId: 'live' as const, hasKey: true }
  it('photoreal survives only on /live, desktop, with a key', () => {
    expect(effectiveMapEngine('photoreal', ok)).toBe('photoreal')
    expect(effectiveMapEngine('photoreal', { ...ok, isMobile: true })).toBe('classic')
    expect(effectiveMapEngine('photoreal', { ...ok, viewId: 'crime-incidents' })).toBe('classic')
    expect(effectiveMapEngine('photoreal', { ...ok, viewId: null })).toBe('classic')
    expect(effectiveMapEngine('photoreal', { ...ok, hasKey: false })).toBe('classic')
  })
  it('standard is coerced to classic until Spec B ships', () => {
    expect(STANDARD_SHIPPED).toBe(false)
    expect(effectiveMapEngine('standard', ok)).toBe('classic')
  })
  it('classic passes through', () => {
    expect(effectiveMapEngine('classic', ok)).toBe('classic')
  })
})

describe('photoreal offered (Spec A2 §7)', () => {
  it('the picker offers Photoreal now that the immersive route ships', () => {
    expect(PHOTOREAL_OFFERED).toBe(true)
  })
})
