import { useEffect, useRef, useState } from 'react'

interface StatCardProps {
  label: string
  value: string
  color: string
  subtitle?: string
  delay?: number
  trend?: 'up' | 'down' | 'neutral'
}

export default function StatCard({ label, value, color, subtitle, delay = 0 }: StatCardProps) {
  const [visible, setVisible] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

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
      <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5 whitespace-nowrap">
        {label}
      </p>
      <p
        className="text-2xl font-bold font-mono tracking-tight leading-none"
        style={{ color }}
      >
        {value}
      </p>
      {subtitle && (
        <p className="text-[10px] text-slate-500 mt-1 font-mono">{subtitle}</p>
      )}
      {/* Accent line */}
      <div
        className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full opacity-40"
        style={{ backgroundColor: color }}
      />
    </div>
  )
}
