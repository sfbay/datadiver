import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectiveViewportWidth, syncViewportMode, MOBILE_BREAKPOINT } from './effectiveViewport'

function stubViewport(innerWidth: number, typeScaleAttr: string | null) {
  const setAttribute = vi.fn()
  vi.stubGlobal('window', { innerWidth })
  vi.stubGlobal('document', {
    documentElement: { getAttribute: () => typeScaleAttr, setAttribute },
  })
  return setAttribute
}

describe('effectiveViewportWidth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns raw innerWidth at default scale', () => {
    stubViewport(1180, 'default')
    expect(effectiveViewportWidth()).toBe(1180)
  })

  it('divides by 1.18 under large', () => {
    stubViewport(1180, 'large')
    expect(effectiveViewportWidth()).toBeCloseTo(1000)
  })

  it('divides by 1.33 under xl', () => {
    stubViewport(1330, 'xl')
    expect(effectiveViewportWidth()).toBeCloseTo(1000)
  })

  it('treats a missing or garbage attribute as default', () => {
    stubViewport(900, null)
    expect(effectiveViewportWidth()).toBe(900)
    stubViewport(900, 'huge')
    expect(effectiveViewportWidth()).toBe(900)
  })

  it('is SSR-safe (no window → 0)', () => {
    vi.stubGlobal('window', undefined)
    expect(effectiveViewportWidth()).toBe(0)
  })
})

describe('syncViewportMode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stamps desk at/above the effective breakpoint', () => {
    const setAttribute = stubViewport(MOBILE_BREAKPOINT, 'default')
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'desk')
  })

  it('stamps mobile below it', () => {
    const setAttribute = stubViewport(MOBILE_BREAKPOINT - 1, 'default')
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'mobile')
  })

  it('large type flips a 900px viewport to mobile (900 ÷ 1.18 ≈ 763)', () => {
    const setAttribute = stubViewport(900, 'large')
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'mobile')
  })

  it('stamps desk when width is unreadable (0) — matches the old SSR-desktop default', () => {
    vi.stubGlobal('window', { innerWidth: 0 })
    const setAttribute = vi.fn()
    vi.stubGlobal('document', {
      documentElement: { getAttribute: () => 'default', setAttribute },
    })
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'desk')
  })
})
