import { describe, it, expect } from 'vitest'
import { parseRoute, viewPath } from './routing'

describe('parseRoute', () => {
  it('parses SF root and single-segment views', () => {
    expect(parseRoute('/')).toEqual({ cityId: 'sf', viewId: 'home' })
    expect(parseRoute('/crime-incidents')).toEqual({ cityId: 'sf', viewId: 'crime-incidents' })
    expect(parseRoute('/live')).toEqual({ cityId: 'sf', viewId: 'live' })
    expect(parseRoute('/live-feeds')).toEqual({ cityId: 'sf', viewId: 'live-feeds' })
  })
  it('parses SF multi-segment detail routes as their view family', () => {
    expect(parseRoute('/business/chain/abc')).toEqual({ cityId: 'sf', viewId: 'business' })
    expect(parseRoute('/business/1234')).toEqual({ cityId: 'sf', viewId: 'business' })
  })
  it('parses city-prefixed routes', () => {
    expect(parseRoute('/oakland')).toEqual({ cityId: 'oakland', viewId: 'home' })
    expect(parseRoute('/oakland/')).toEqual({ cityId: 'oakland', viewId: 'home' })
    expect(parseRoute('/oakland/crime-incidents')).toEqual({ cityId: 'oakland', viewId: 'crime-incidents' })
    expect(parseRoute('/oakland/a/b')).toEqual({ cityId: 'oakland', viewId: 'a' })
  })
  it('treats unknown first segments as SF views (catch-all is the router, not the parser)', () => {
    expect(parseRoute('/nosuchcity/whatever')).toEqual({ cityId: 'sf', viewId: 'nosuchcity' })
  })
})

describe('viewPath', () => {
  it('never prefixes SF', () => {
    expect(viewPath('sf', 'home')).toBe('/')
    expect(viewPath('sf', 'crime-incidents')).toBe('/crime-incidents')
  })
  it('prefixes other cities', () => {
    expect(viewPath('oakland', 'home')).toBe('/oakland')
    expect(viewPath('oakland', 'crime-incidents')).toBe('/oakland/crime-incidents')
  })
  it('round-trips with parseRoute', () => {
    for (const [c, v] of [['sf', 'housing'], ['oakland', 'crime-incidents']] as const) {
      expect(parseRoute(viewPath(c, v))).toEqual({ cityId: c, viewId: v })
    }
  })
})
