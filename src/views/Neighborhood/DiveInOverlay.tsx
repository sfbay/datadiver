/** Progressive loading overlay for Dive In data portrait */

import { DOMAINS, type MetricDomain } from './types'

interface DiveInOverlayProps {
  loadedDomains: Set<MetricDomain>
  loading: boolean
}

const STEPS: { domain: MetricDomain; label: string }[] = [
  { domain: 'emergency', label: 'Analyzing emergency response...' },
  { domain: 'crime', label: 'Mapping crime patterns...' },
  { domain: 'cases311', label: 'Scanning 311 complaints...' },
  { domain: 'crashes', label: 'Identifying crash sites...' },
  { domain: 'citations', label: 'Reviewing citation hotspots...' },
]

export default function DiveInOverlay({ loadedDomains, loading }: DiveInOverlayProps) {
  if (!loading) return null

  const allDone = loadedDomains.size >= 5

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
      <div className="glass-card rounded-2xl px-6 py-5 shadow-2xl max-w-xs">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-slate-400 mb-3">
          {allDone ? 'Portrait complete' : 'Building data portrait'}
        </p>
        <div className="space-y-2">
          {STEPS.map(({ domain, label }) => {
            const done = loadedDomains.has(domain)
            const domainConfig = DOMAINS.find((d) => d.key === domain)
            const color = domainConfig?.color || '#64748b'
            return (
              <div key={domain} className="flex items-center gap-2.5">
                <div
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${done ? '' : 'animate-pulse'}`}
                  style={{ backgroundColor: done ? color : `${color}40` }}
                />
                <span
                  className={`text-[11px] font-mono transition-colors duration-300 ${done ? 'text-slate-300' : 'text-slate-500'}`}
                >
                  {done ? label.replace('...', ' \u2713') : label}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
