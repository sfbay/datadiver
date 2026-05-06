import { useEffect, useRef, useState, type CSSProperties } from 'react'
import InfoTip from '@/components/ui/InfoTip'
import SparkBars from '@/components/charts/SparkBars'

interface StatCardProps {
  label: string
  value: string
  color: string
  subtitle?: string
  delay?: number
  trend?: 'up' | 'down' | 'neutral'
  yoyDelta?: number | null
  zScore?: number | null
  /** Glossary key for an explanatory tooltip on the label */
  info?: string
  /** Optional annual spark data: values for the last N years, last value = current period */
  sparkData?: { values: number[]; labels?: string[] }
}

export default function StatCard({ label, value, color, subtitle, delay = 0, trend, yoyDelta, zScore, info, sparkData }: StatCardProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  const yoyText = yoyDelta != null
    ? `${yoyDelta >= 0 ? '+' : ''}${yoyDelta.toFixed(1)}%`
    : null

  const zScoreDot = zScore != null && Math.abs(zScore) > 1
    ? zScore > 1 ? '#963e30' : '#474e74'  // brick-600 for high, indigo-600 for low
    : null

  return (
    <div
      ref={ref}
      className={`
        relative min-w-[120px]
        transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {/* Card visual — glow-host clips the corner blur to its rounded bounds.
          Sibling-positioned tooltip below escapes this clip. */}
      <div
        className="glass-card glow-host rounded-xl px-4 py-3"
        style={{ '--glow': color } as CSSProperties}
      >
        <div className="glow-corner" />
        <p className="relative text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5 whitespace-nowrap flex items-center">
          {label}
          {info && <InfoTip term={info} size={11} />}
        </p>
        <p
          className="relative text-2xl font-bold font-mono tracking-tight leading-none"
          style={{ color }}
        >
          {value}
        </p>
        {subtitle && (
          <p className="relative text-[11px] mt-1.5 font-mono flex items-center gap-1">
            {trend === 'up' && (
              <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
                <path d="M5 2 L8 6 L2 6 Z" fill="#963e30" />
              </svg>
            )}
            {trend === 'down' && (
              <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
                <path d="M5 8 L8 4 L2 4 Z" fill="#5c7a3d" />
              </svg>
            )}
            <span className={trend === 'up' ? 'text-[#963e30]' : trend === 'down' ? 'text-[#5c7a3d]' : 'text-slate-500 dark:text-slate-400'}>
              {subtitle}
            </span>
          </p>
        )}
        {yoyText && !subtitle && (
          <p className="relative text-[11px] mt-1.5 font-mono flex items-center gap-1">
            <span className={yoyDelta! > 0 ? 'text-[#963e30]' : yoyDelta! < 0 ? 'text-[#5c7a3d]' : 'text-slate-500 dark:text-slate-400'}>
              {yoyText}
            </span>
          </p>
        )}
        {sparkData && sparkData.values.length > 0 && (
          <div className="relative mt-2">
            <SparkBars
              values={sparkData.values}
              labels={sparkData.labels}
              height={14}
              accentColor={color}
              className="w-full"
            />
          </div>
        )}
      </div>

      {/* Z-score anomaly dot + tooltip — rendered outside the glow-host so the
          hover tooltip (which extends past the card's bottom edge) doesn't get
          clipped. Anchored to the outer wrapper at top-2 right-2. */}
      {zScoreDot && (
        <div className="absolute top-2 right-2 group cursor-help z-10">
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: zScoreDot }}
          />
          <div className="hidden group-hover:block absolute top-full right-0 mt-1 w-48 px-2.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] shadow-xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-300" style={{ zIndex: 999 }}>
            <span className="font-mono font-semibold" style={{ color: zScoreDot }}>{zScore! >= 0 ? '+' : ''}{zScore!.toFixed(1)}σ</span>
            {' — '}This value is {Math.abs(zScore!) > 2 ? 'very ' : ''}{zScore! > 0 ? 'high' : 'low'} compared to the 12-month average for this area.
          </div>
        </div>
      )}
    </div>
  )
}
