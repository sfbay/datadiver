import { Link } from 'react-router-dom'
import type { PrecinctTurnoutFile } from '@/types/elections'

interface CoverageChipProps {
  turnout: PrecinctTurnoutFile | null
  geometryCount: number | null
}

/** Corner pill explaining coverage gaps. Two data-driven cases, one chip:
 *  1. Legacy elections: N precincts have no published geometry anywhere
 *     (numbers from _turnout.unmapped — ids.length + registered; the file
 *     has NO precincts/ballots fields in that summary).
 *  2. Sparse elections (Nov 2025: 100 of 514): SF reported results for only
 *     a fraction of precincts. Threshold: fewer than half painted.
 *  Renders nothing when coverage is essentially full. */
export default function CoverageChip({ turnout, geometryCount }: CoverageChipProps) {
  if (!turnout) return null

  const unmappedCount = turnout.unmapped.ids.length
  const mappedRows = Object.values(turnout.precincts).filter((r) => !r.unmapped).length

  let text: string | null = null
  if (unmappedCount > 0) {
    text = `${unmappedCount} precincts (${turnout.unmapped.registered.toLocaleString()} voters) can't be drawn for this election`
  } else if (geometryCount && mappedRows < geometryCount / 2) {
    text = `S.F. reported results for ${mappedRows} of ${geometryCount} precincts in this election`
  }
  if (!text) return null

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <Link
        to="/about#elections"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm border border-slate-200/60 dark:border-white/[0.08] text-[10px] font-mono text-slate-500 dark:text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-500 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#a8926a" strokeWidth="1.5">
          <circle cx="6" cy="6" r="4.5" />
          <path d="M6 4v3M6 8.5v.01" strokeLinecap="round" />
        </svg>
        {text}
        <span className="text-indigo-500/70">why?</span>
      </Link>
    </div>
  )
}
