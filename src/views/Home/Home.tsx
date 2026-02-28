import { useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef } from 'react'

const VISUALIZATIONS = [
  {
    path: '/emergency-response',
    title: 'Emergency Response Times',
    subtitle: 'SFFD / EMS Dispatch Analysis',
    description:
      'How fast do first responders reach you? Map response time inequities across 41 neighborhoods.',
    stats: [
      { label: 'Timestamps', value: '7 per call' },
      { label: 'Records/yr', value: '~600K' },
      { label: 'Neighborhoods', value: '41' },
    ],
    gradient: 'from-red-500/20 via-orange-500/10 to-transparent',
    borderGlow: 'hover:shadow-[0_0_40px_rgba(255,77,77,0.08)]',
    accentColor: '#ff4d4d',
    number: '01',
  },
  {
    path: '/parking-revenue',
    title: 'Parking Meter Revenue',
    subtitle: 'SFMTA Revenue Patterns',
    description:
      'Where does the city earn from parking? Uncover revenue flows, payment trends, and meter utilization.',
    stats: [
      { label: 'Active meters', value: '~37K' },
      { label: 'Granularity', value: 'Per txn' },
      { label: 'Meter types', value: '6' },
    ],
    gradient: 'from-blue-500/20 via-cyan-500/10 to-transparent',
    borderGlow: 'hover:shadow-[0_0_40px_rgba(96,165,250,0.08)]',
    accentColor: '#60a5fa',
    number: '02',
  },
] as const

function DataMotif() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = 400
    const h = 300
    canvas.width = w * dpr
    canvas.height = h * dpr
    ctx.scale(dpr, dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'

    // Draw abstract data visualization motif
    const bars = 40
    for (let i = 0; i < bars; i++) {
      const x = (i / bars) * w
      const barH = Math.sin(i * 0.2) * 40 + Math.random() * 60 + 20
      const hue = 220 + (i / bars) * 30
      ctx.fillStyle = `hsla(${hue}, 80%, 65%, ${0.06 + Math.random() * 0.04})`
      ctx.fillRect(x, h - barH, w / bars - 1, barH)
    }

    // Scatter some data points
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * w
      const y = Math.random() * h * 0.7 + h * 0.1
      const r = Math.random() * 2.5 + 0.5
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = `hsla(${200 + Math.random() * 40}, 80%, 65%, ${0.08 + Math.random() * 0.06})`
      ctx.fill()
    }

    // Draw a trend line
    ctx.beginPath()
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.1)'
    ctx.lineWidth = 1.5
    for (let i = 0; i < w; i++) {
      const y = h * 0.4 + Math.sin(i * 0.015) * 50 + Math.sin(i * 0.04) * 20
      if (i === 0) ctx.moveTo(i, y)
      else ctx.lineTo(i, y)
    }
    ctx.stroke()
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute right-0 top-0 opacity-60 pointer-events-none"
      style={{ mixBlendMode: 'screen' }}
    />
  )
}

export default function Home() {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-16 relative">
        <DataMotif />

        {/* Hero */}
        <header className="mb-20 relative z-10">
          <div className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="h-[1px] w-8 bg-signal-blue/60" />
              <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-signal-blue">
                San Francisco Open Data
              </p>
            </div>
          </div>

          <h1
            className={`font-display text-6xl md:text-[5.5rem] text-ink dark:text-white leading-[0.95] mb-6 transition-all duration-1000 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
          >
            <em className="not-italic">Dive beneath</em>
            <br />
            <span className="text-slate-300 dark:text-slate-600">the data.</span>
          </h1>

          <p
            className={`text-lg text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
          >
            Civic data made visible. Explore emergency response patterns, revenue flows,
            and the stories hidden in San Francisco's public datasets.
          </p>

          <div className={`flex items-center gap-4 mt-6 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-signal-emerald/80">
              <span className="w-1.5 h-1.5 rounded-full bg-signal-emerald pulse-live" />
              Live data from data.sfgov.org
            </span>
          </div>
        </header>

        {/* Visualization Cards */}
        <section className="relative z-10">
          <div
            className={`flex items-center gap-2.5 mb-6 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100' : 'opacity-0'}`}
          >
            <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-400/60 dark:text-slate-600">
              Explorations
            </p>
            <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {VISUALIZATIONS.map((viz, idx) => (
              <button
                key={viz.path}
                onClick={() => navigate(viz.path)}
                className={`
                  group text-left rounded-2xl overflow-hidden relative
                  border border-slate-200/60 dark:border-white/[0.04]
                  bg-white/60 dark:bg-white/[0.02]
                  backdrop-blur-sm
                  ${viz.borderGlow}
                  hover:border-slate-300/80 dark:hover:border-white/[0.08]
                  transition-all duration-500
                  ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
                `}
                style={{ transitionDelay: `${600 + idx * 100}ms` }}
              >
                {/* Background gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${viz.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                <div className="relative p-6">
                  {/* Number + Title */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span
                        className="text-[10px] font-mono tracking-widest block mb-2"
                        style={{ color: viz.accentColor + '80' }}
                      >
                        {viz.number}
                      </span>
                      <h3 className="font-display text-xl italic text-ink dark:text-white leading-tight">
                        {viz.title}
                      </h3>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">
                        {viz.subtitle}
                      </p>
                    </div>
                    <span
                      className="text-slate-300 dark:text-slate-700
                        group-hover:translate-x-1 transition-transform duration-300 text-lg mt-1"
                      style={{ color: viz.accentColor + '60' }}
                    >
                      &rarr;
                    </span>
                  </div>

                  <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
                    {viz.description}
                  </p>

                  {/* Data stats as a mini-table */}
                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-200/50 dark:border-white/[0.04]">
                    {viz.stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-[9px] font-mono uppercase tracking-wider text-slate-400/60 dark:text-slate-600">
                          {stat.label}
                        </p>
                        <p className="text-sm font-mono font-semibold text-ink dark:text-white mt-0.5">
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Attribution */}
        <footer className={`mt-20 pt-6 border-t border-slate-200/50 dark:border-white/[0.04] transition-all duration-1000 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-[10px] text-slate-400/60 dark:text-slate-600 font-mono">
            Data sourced from{' '}
            <a
              href="https://data.sfgov.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              data.sfgov.org
            </a>{' '}
            via the Socrata SODA API
          </p>
        </footer>
      </div>
    </div>
  )
}
