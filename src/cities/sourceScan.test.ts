import { describe, it, expect } from 'vitest'
import { scanFetchedKeys, scanCitePurposes } from './sourceScan'

const multiline = `
  const a = useDataset<Row>(
    'fireEMSDispatch',
    { $limit: 5 },
  )
  const b = useDataset<{ count: string }>('cases311', {})
  const c = await fetchDataset<Foo>('trafficCrashes', params)
  const d = fetchDataset(registryKey as Parameters<typeof fetchDataset>[0], q)
`

describe('scanFetchedKeys', () => {
  it('collects literal keys across the multiline generic form and reports variable keys', () => {
    const { keys, unresolved } = scanFetchedKeys([{ file: 'x.ts', text: multiline }], {})
    expect([...keys].sort()).toEqual(['cases311', 'fireEMSDispatch', 'trafficCrashes'])
    expect(unresolved).toEqual([{ file: 'x.ts', line: 8 }])
  })
  it('a variable-key site listed in `resolved` contributes its keys and is not unresolved', () => {
    const { keys, unresolved } = scanFetchedKeys(
      [{ file: 'x.ts', text: multiline }],
      { 'x.ts': ['dispatch911Realtime'] },
    )
    expect(keys.has('dispatch911Realtime')).toBe(true)
    expect(unresolved).toEqual([])
  })
  it('matches nested generics — the form that silently dropped keys before', () => {
    const text = `
      const a = useDataset<Record<CauseColumn, string>>('evictionNotices', {}, [], {})
      const b = useDataset<Record<string, string>>(
        'parkingCitations',
        params,
      )
    `
    const { keys, unresolved } = scanFetchedKeys([{ file: 'y.ts', text }], {})
    expect([...keys].sort()).toEqual(['evictionNotices', 'parkingCitations'])
    expect(unresolved).toEqual([])
  })
})

describe('scanCitePurposes', () => {
  it('collects every known purpose literal inside cite objects, ignoring viewIds and facets', () => {
    const text = `
      useDataset('k', p, [], { cite: { viewId: 'housing', purpose: 'map-sample' } })
      useDataFreshness('k', 'f', r, { cite: { viewId: 'housing', purpose: 'freshness', facet: 'with coordinates' } })
      useLast48Window({ datasets, cite: { viewId: 'live', sample: 'window-sample', count: 'window-count' } })
      const notACite = { purpose: 'ranking' }
    `
    const known = ['map-sample', 'freshness', 'window-sample', 'window-count', 'ranking']
    expect([...scanCitePurposes([{ file: 'x.ts', text }], known)].sort())
      .toEqual(['freshness', 'map-sample', 'window-count', 'window-sample'])
  })
  it('does not match properties ending in cite like recite', () => {
    const text = `
      const obj1 = { cite: { purpose: 'map-sample' } }
      const obj2 = { recite: { purpose: 'ranking' } }
    `
    const known = ['map-sample', 'ranking']
    expect([...scanCitePurposes([{ file: 'x.ts', text }], known)].sort())
      .toEqual(['map-sample'])
  })
})
