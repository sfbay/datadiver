import { describe, it, expect } from 'vitest'
import { resolveQuery } from './client'

const cfg = { endpoint: 'https://data.sfgov.org/resource/wg3w-h783.json', defaultSort: 'incident_datetime DESC' }

describe('resolveQuery', () => {
  it('injects the default sort and limit for a row query', () => {
    const r = resolveQuery(cfg, { $where: "a = 'b'", $limit: 5000 })
    expect(r.queryParams).toEqual({ $order: 'incident_datetime DESC', $limit: 5000, $where: "a = 'b'" })
    expect(r.url).toBe("https://data.sfgov.org/resource/wg3w-h783.json?%24order=incident_datetime+DESC&%24limit=5000&%24where=a+%3D+%27b%27")
  })
  it('skips the default sort for an aggregate', () => {
    const r = resolveQuery(cfg, { $select: 'count(*) as n' })
    expect(r.queryParams.$order).toBeUndefined()
    expect(r.queryParams.$limit).toBe(1000)
  })
  it('never carries a token', () => {
    expect(resolveQuery(cfg, { $q: 'x' }).url).not.toMatch(/app_token/i)
  })
})
