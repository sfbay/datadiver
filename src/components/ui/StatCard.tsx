import { useEffect, useRef, useState } from 'react'
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
    ? zScore > 1 ? '#ef4444' : '#3b82f6'
    : null

  return (
    <div
      ref={ref}
      className={`
        glass-card rounded-xl px-4 py-3 min-w-[120px]
        transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
      `}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {zScoreDot && (
        <div
          className="absolute top-2 right-2 group cursor-help"
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: zScoreDot }}
          />
          <div className="hidden group-hover:block absolute top-full right-0 mt-1 z-50 w-48 px-2.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/[0.08] shadow-xl text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-mono font-semibold" style={{ color: zScoreDot }}>{zScore! >= 0 ? '+' : ''}{zScore!.toFixed(1)}σ</span>
            {' — '}This value is {Math.abs(zScore!) > 2 ? 'very ' : ''}{zScore! > 0 ? 'high' : 'low'} compared to the 12-month average for this area.
          </div>
        </div>
      )}
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 whitespace-nowrap flex items-center">
        {label}
        {info && <InfoTip term={info} size={10} />}
      </p>
      <p
        className="text-2xl font-bold font-mono tracking-tight leading-none"
        style={{ color }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] mt-1 font-mono flex items-center gap-1">
          {trend === 'up' && (
            <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
              <path d="M5 2 L8 6 L2 6 Z" fill="#ef4444" />
            </svg>
          )}
          {trend === 'down' && (
            <svg width="10" height="10" viewBox="0 0 10 10" className="flex-shrink-0">
              <path d="M5 8 L8 4 L2 4 Z" fill="#10b981" />
            </svg>
          )}
          <span className={trend === 'up' ? 'text-red-400' : trend === 'down' ? 'text-emerald-400' : 'text-slate-500'}>
            {subtitle}
          </span>
        </p>
      )}
      {yoyText && !subtitle && (
        <p className="text-[10px] mt-1 font-mono flex items-center gap-1">
          <span className={yoyDelta! > 0 ? 'text-red-400' : yoyDelta! < 0 ? 'text-emerald-400' : 'text-slate-500'}>
            {yoyText}
          </span>
        </p>
      )}
      {sparkData && sparkData.values.length > 0 && (
        <div className="mt-2">
          <SparkBars
            values={sparkData.values}
            labels={sparkData.labels}
            height={14}
            accentColor={color}
            className="w-full"
          />
        </div>
      )}
      {/* Accent line */}
      <div
        className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full opacity-40"
        style={{ backgroundColor: color }}
      />
    </div>
  )
}
