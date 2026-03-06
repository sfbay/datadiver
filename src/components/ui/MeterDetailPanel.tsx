import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { ParkingMeter, ParkingTransaction } from '@/types/datasets'
import { formatCurrency, formatNumber, formatDate, diffMinutes, formatDuration } from '@/utils/time'
import { CAP_COLORS } from '@/utils/colors'
import ShareLinkButton from '@/components/ui/ShareLinkButton'

interface MeterDetail {
  postId: string
  streetAddress: string
  neighborhood: string
  district: string
  capColor: string
  meterType: string
  onOffStreet: string
  vendor: string | null
  model: string | null
  active: boolean
}

interface RecentTransaction {
  sessionStart: string
  sessionEnd: string
  amount: number
  paymentType: string
  durationMinutes: number | null
}

function buildDetail(meter: ParkingMeter): MeterDetail {
  const streetAddr = [meter.street_num, meter.street_name].filter(Boolean).join(' ')
  return {
    postId: meter.post_id,
    streetAddress: streetAddr || 'Unknown',
    neighborhood: meter.analysis_neighborhood || 'Unknown',
    district: meter.supervisor_district || 'Unknown',
    capColor: meter.cap_color || 'Grey',
    meterType: meter.meter_type || 'Unknown',
    onOffStreet: meter.on_offstreet_type || 'Unknown',
    vendor: meter.meter_vendor || null,
    model: meter.meter_model || null,
    active: meter.active_meter_flag === 'Y',
  }
}

function buildTransaction(tx: ParkingTransaction): RecentTransaction {
  const dur = tx.session_start_dt && tx.session_end_dt
    ? diffMinutes(tx.session_start_dt, tx.session_end_dt)
    : null
  return {
    sessionStart: tx.session_start_dt,
    sessionEnd: tx.session_end_dt,
    amount: parseFloat(tx.gross_paid_amt) || 0,
    paymentType: tx.payment_type || 'Unknown',
    durationMinutes: dur !== null && dur > 0 ? dur : null,
  }
}

export default function MeterDetailPanel() {
  const { selectedMeter, setSelectedMeter, dateRange } = useAppStore()
  const [detail, setDetail] = useState<MeterDetail | null>(null)
  const [transactions, setTransactions] = useState<RecentTransaction[]>([])
  const [serverTotal, setServerTotal] = useState<{ revenue: number; count: number } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch meter metadata + recent transactions on selection
  useEffect(() => {
    if (!selectedMeter) {
      setDetail(null)
      setTransactions([])
      setServerTotal(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    const meterFetch = fetchDataset<ParkingMeter>('parkingMeters', {
      $where: `post_id = '${selectedMeter}'`,
      $limit: 1,
    })

    const meterWhere = `post_id = '${selectedMeter}' AND session_start_dt >= '${dateRange.start}T00:00:00' AND session_start_dt <= '${dateRange.end}T23:59:59'`

    const txFetch = fetchDataset<ParkingTransaction>('parkingRevenue', {
      $where: meterWhere,
      $order: 'session_start_dt DESC',
      $limit: 8,
    })

    // Server-side accurate totals for this meter
    const aggFetch = fetchDataset<{ total_revenue: string; tx_count: string; avg_dur: string }>('parkingRevenue', {
      $select: 'SUM(gross_paid_amt) as total_revenue, COUNT(*) as tx_count',
      $where: meterWhere,
      $limit: 1,
    })

    Promise.all([meterFetch, txFetch, aggFetch])
      .then(([meters, txs, agg]) => {
        if (cancelled) return
        if (meters.length > 0) {
          setDetail(buildDetail(meters[0]))
        }
        setTransactions(txs.map(buildTransaction))
        if (agg.length > 0) {
          setServerTotal({
            revenue: parseFloat(agg[0].total_revenue) || 0,
            count: parseInt(agg[0].tx_count, 10) || 0,
          })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDetail(null)
          setTransactions([])
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedMeter, dateRange])

  // Close on outside click
  useEffect(() => {
    if (!selectedMeter) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedMeter(null)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [selectedMeter, setSelectedMeter])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedMeter) url.searchParams.set('detail', selectedMeter)
    return url.toString()
  }, [selectedMeter])

  if (!selectedMeter) return null

  const capInfo = detail ? CAP_COLORS[detail.capColor] || { color: '#6b7280', label: 'Unknown' } : null

  // Use server-side totals for revenue/count, client-side for avg duration
  const txStats = serverTotal
    ? {
        total: serverTotal.revenue,
        count: serverTotal.count,
        avgDuration: transactions.filter((t) => t.durationMinutes).reduce((s, t) => s + (t.durationMinutes || 0), 0) / (transactions.filter((t) => t.durationMinutes).length || 1),
      }
    : null

  return (
    <div
      ref={panelRef}
      className="absolute top-5 right-5 z-30 rounded-xl p-4 w-72 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-xl shadow-black/20"
    >
      {/* Top-right actions */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <ShareLinkButton buildUrl={buildShareUrl} accentClass="text-cyan-500" />
        <button
          onClick={() => setSelectedMeter(null)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {detail && !isLoading && (
        <>
          {/* Header */}
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Meter {detail.postId}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
            {detail.streetAddress}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            {detail.neighborhood} &middot; District {detail.district}
          </p>

          {/* Cap color + status badges */}
          <div className="flex items-center gap-1.5 mt-2 mb-3">
            {capInfo && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full"
                style={{ backgroundColor: capInfo.color + '18', color: capInfo.color }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: capInfo.color }} />
                {detail.capColor} &middot; {capInfo.label}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
              detail.active
                ? 'bg-emerald-500/10 text-emerald-500'
                : 'bg-slate-500/10 text-slate-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${detail.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
              {detail.active ? 'Active' : 'Inactive'}
            </span>
          </div>

          {/* Meter hardware section */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Hardware
            </p>
            <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
          </div>
          <div className="space-y-1.5 mb-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</p>
              <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.meterType}</p>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Location</p>
              <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.onOffStreet === 'ON' ? 'On-Street' : detail.onOffStreet === 'OFF' ? 'Off-Street' : detail.onOffStreet}</p>
            </div>
            {detail.vendor && (
              <div className="flex items-baseline justify-between">
                <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Vendor</p>
                <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.vendor}{detail.model ? ` ${detail.model}` : ''}</p>
              </div>
            )}
          </div>

          {/* Revenue stats for current period */}
          {txStats && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Period Stats
                </p>
                <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="text-center">
                  <p className="text-sm font-bold font-mono text-cyan-400">{formatCurrency(txStats.total)}</p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Revenue</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold font-mono text-emerald-400">{formatNumber(txStats.count)}</p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Sessions</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold font-mono text-amber-400">
                    {txStats.avgDuration > 0 ? formatDuration(txStats.avgDuration) : '—'}
                  </p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500">Avg Dur</p>
                </div>
              </div>
            </>
          )}

          {/* Recent transactions */}
          {transactions.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                  Recent Sessions
                </p>
                <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
              </div>
              <div className="space-y-1">
                {transactions.map((tx, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md bg-slate-50 dark:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                        {formatDate(tx.sessionStart, 'short')}{' '}
                        {new Date(tx.sessionStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                      <p className="text-[9px] text-slate-500 dark:text-slate-500">
                        {tx.paymentType === 'COIN' ? 'Coin' : tx.paymentType === 'CREDIT CARD' ? 'Card' : tx.paymentType === 'SMRT' ? 'App' : tx.paymentType}
                        {tx.durationMinutes ? ` · ${formatDuration(tx.durationMinutes)}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-cyan-400 ml-2 tabular-nums">
                      {formatCurrency(tx.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {transactions.length === 0 && !isLoading && (
            <div className="text-center py-3">
              <p className="text-[10px] text-slate-500">No transactions in selected period</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
