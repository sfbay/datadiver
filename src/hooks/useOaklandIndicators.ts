import { useEffect, useRef, useState } from 'react'
import { fetchDataset } from '@/api/client'
import { viewPath } from '@/cities/routing'
import { OAKLAND_CRIME_COUNT } from '@/views/CrimeIncidents/crimeDialect'
import { fppcBuildersFor, dw } from '@/views/CampaignFinance/fppcDialect'
import { cityElections, getDefaultCycle } from '@/utils/electionCycles'
import type { TickerItem } from '@/types/ticker'
import {
  OAK_TICKER_EDGES,
  completeWindow,
  isStaleLocal,
  crimeCopy,
  threeOneOneCopy,
  citationsCopy,
  cfCopy,
} from '@/views/Home/oaklandIndicators'

/**
 * The Oakland landing's four ticker items (spec §B2). Every direct
 * fetchDataset call passes cityId: 'oakland' explicitly — these run from
 * plain async functions where the route-derived default is unreadable.
 * Windows end at measured completeness edges (leaf docblock has the
 * curves); crime + 311 SUPPRESS when their max is stale, citations + CF
 * DISCLOSE (dated copy / named cycle) because their lag is structural.
 */

// timeoutMs is load-bearing: a query without it cannot be aborted at all
// and holds one of the browser's ~6 per-host connection slots for its life.
const OAK = { cityId: 'oakland' as const, timeoutMs: 15_000, retries: 1 }

async function probeMax(datasetKey: string, dateField: string): Promise<string | null> {
  const rows = await fetchDataset<Record<string, string>>(datasetKey, {
    $select: `max(${dateField}) as max_d`,
    $limit: 1,
  }, OAK)
  return rows[0]?.max_d ?? null
}

async function fetchCrime(nowMs: number, nowYear: number): Promise<TickerItem | null> {
  const max = await probeMax('policeIncidents', 'datetime')
  if (!max || isStaleLocal(max, OAK_TICKER_EDGES.crimeSuppressMaxAgeDays, nowMs)) return null
  const w = completeWindow(max, OAK_TICKER_EDGES.crimeEdgeDays, 7)
  const rows = await fetchDataset<{ total: string }>('policeIncidents', {
    $select: `${OAKLAND_CRIME_COUNT} as total`,
    $where: dw('datetime', w.start, w.end),
  }, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null
  const copy = crimeCopy(total, w.end, nowYear)
  return {
    id: 'oak-crime',
    headline: copy.headline,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', 'crime-incidents'),
      label: 'Crime Incidents · OPD',
      datasetId: 'ppgh-7dqv',
    },
    value: copy.value,
    freshness: 'daily',
    computedAt: new Date(),
    priority: 70,
  }
}

async function fetch311(nowMs: number, nowYear: number): Promise<TickerItem | null> {
  const max = await probeMax('cases311', 'datetimeinit')
  if (!max || isStaleLocal(max, OAK_TICKER_EDGES.threeOneOneSuppressMaxAgeDays, nowMs)) return null
  const w = completeWindow(max, OAK_TICKER_EDGES.threeOneOneEdgeDays, 7)
  const rows = await fetchDataset<{ total: string }>('cases311', {
    $select: 'count(*) as total',
    $where: dw('datetimeinit', w.start, w.end),
  }, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null
  const copy = threeOneOneCopy(total, w.end, nowYear)
  return {
    id: 'oak-311',
    headline: copy.headline,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', '311-cases'),
      label: '311 Cases · OAK 311',
      datasetId: 'quth-gb8e',
    },
    value: copy.value,
    freshness: 'daily',
    computedAt: new Date(),
    priority: 60,
  }
}

async function fetchCitations(nowYear: number): Promise<TickerItem | null> {
  const max = await probeMax('parkingCitations', 'ticket_iss')
  if (!max) return null
  // DISCLOSE mode: the ~11-week base lag would permanently fail any gate;
  // the item is true, it just carries its date.
  const w = completeWindow(max, OAK_TICKER_EDGES.citationsEdgeDays, 30)
  const rows = await fetchDataset<{ total: string }>('parkingCitations', {
    $select: 'count(*) as total',
    $where: dw('ticket_iss', w.start, w.end),
  }, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null
  const copy = citationsCopy(total, w.end, nowYear)
  return {
    id: 'oak-citations',
    headline: copy.headline,
    category: 'trend',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', 'parking-citations'),
      label: 'Parking Citations',
      datasetId: '58em-y96b',
    },
    value: copy.value,
    freshness: 'weekly',
    computedAt: new Date(),
    priority: 50,
  }
}

async function fetchCampaignFinance(): Promise<TickerItem | null> {
  // The CONCLUDED cycle — complete by construction, and the same cycle the
  // view opens on. getDefaultCycle defaults to SF_ELECTIONS: passing
  // Oakland's cycles explicitly is load-bearing.
  const cycle = getDefaultCycle(cityElections('oakland'))
  const spec = fppcBuildersFor('oakland').totals(cycle.start, cycle.end)
  const rows = await fetchDataset<{ total: string }>(spec.datasetKey, spec.params, OAK)
  const total = Number(rows[0]?.total ?? 0)
  if (!total) return null // absence guard — never render $0 as a fact
  const copy = cfCopy(total, cycle.label)
  return {
    id: 'oak-cf',
    headline: copy.headline,
    category: 'milestone',
    severity: 'neutral',
    source: {
      view: viewPath('oakland', 'campaign-finance'),
      label: `Campaign Finance · ${cycle.label}`,
      datasetId: '3xq4-ermg',
    },
    value: copy.value,
    freshness: 'monthly',
    computedAt: new Date(),
    priority: 40,
  }
}

export function useOaklandIndicators({ enabled }: { enabled: boolean }) {
  const [items, setItems] = useState<TickerItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const ran = useRef(false)

  useEffect(() => {
    if (!enabled || ran.current) return
    ran.current = true
    let cancelled = false
    setIsLoading(true)
    const nowMs = Date.now()
    const nowYear = new Date().getFullYear()
    Promise.allSettled([
      fetchCrime(nowMs, nowYear),
      fetch311(nowMs, nowYear),
      fetchCitations(nowYear),
      fetchCampaignFinance(),
    ]).then((settled) => {
      if (cancelled) return
      const ok = settled
        .filter((s): s is PromiseFulfilledResult<TickerItem | null> => s.status === 'fulfilled')
        .map((s) => s.value)
        .filter((v): v is TickerItem => v !== null)
        .sort((a, b) => b.priority - a.priority)
      setItems(ok)
      setLastUpdated(new Date())
      setIsLoading(false)
    })
    return () => { cancelled = true }
  }, [enabled])

  // items:[] with isLoading:false is HONEST ABSENCE (every stream
  // suppressed/failed) — the landing renders its empty-state note, never
  // the ticker (whose skeleton would spin forever on an empty array).
  return { items, isLoading, lastUpdated }
}
