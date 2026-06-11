// src/components/home/AlertsRibbon.tsx
//
// Home page promotional ribbon for the Alerts builder. Lives between the
// Hero and the Dana Comic ribbon — same horizontal-card composition family,
// but with a clear-action register (terracotta pigment + notched accent
// tab pointing to /alerts). The Dana ribbon is a content tile; this is a
// CTA.
//
// The three small stream chips communicate scope (911 / Fire&EMS / 311)
// without forcing a screenshot of the form. The eyebrow reads "DAILY
// NEWSLETTER · NEW" so it's both labelled and surfaced as freshly shipped.

import type { CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'

const STREAMS = [
  { dot: '#616a96', label: '911 calls' },        // indigo
  { dot: '#b85a33', label: 'Fire & EMS' },        // terracotta
  { dot: '#7a9954', label: '311 reports' },       // moss
]

interface AlertsRibbonProps {
  /** Mounted flag from Home for staggered entrance animation. */
  mounted: boolean
}

export default function AlertsRibbon({ mounted }: AlertsRibbonProps) {
  const navigate = useNavigate()

  return (
    <section
      className={`relative z-10 h-full transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <button
        type="button"
        onClick={() => navigate('/alerts')}
        className="
          group glow-host glass-card
          w-full h-full text-left
          rounded-[28px] rounded-bl-none
          relative overflow-hidden
          pl-[clamp(20px,2vw,40px)] pr-[clamp(52px,4vw,72px)] py-[clamp(18px,1.8vw,28px)]
          hover:bg-white/[0.04] transition-all duration-300
          isolate
        "
        style={{ '--glow': '#b85a33' } as CSSProperties}
      >
        {/* Two large corner glows — top-left (signature) + top-right (warm light)
            create a wide morning-light wash that ties the eye to the call-to-action
            notch in the upper right. Subtle, not noisy. */}
        <span className="glow-corner is-lg" style={{ opacity: 0.5 }} aria-hidden />
        <span
          className="glow-corner is-lg is-tr"
          style={{ opacity: 0.28, right: -100 }}
          aria-hidden
        />

        <div className="relative grid gap-[clamp(16px,2vw,32px)] lg:grid-cols-[1fr,auto] lg:items-center">
          {/* ── Left: editorial content ─────────────────────────────── */}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 mb-3">
              <span
                className="w-[5px] h-[5px] rounded-full"
                style={{
                  backgroundColor: '#b85a33',
                  animation: 'pulse 2.5s ease-in-out infinite',
                }}
              />
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-terracotta-500">
                Daily Newsletter
              </p>
              <span className="text-[9px] font-mono uppercase tracking-[0.22em] px-1.5 py-0.5 rounded bg-terracotta-500/12 text-terracotta-500">
                New
              </span>
              <div className="flex-1 h-px bg-ink/[0.08] dark:bg-white/[0.06]" />
            </div>

            <h2
              className="font-display text-ink dark:text-paper-100 leading-[1] mb-3"
              style={{ fontSize: 'clamp(1.5rem, 1.8vw + 0.6rem, 2.5rem)' }}
            >
              <em>Get the morning brief</em>{' '}
              <span className="text-ink/55 dark:text-slate-400">from your block.</span>
            </h2>

            <p
              className="text-ink/65 dark:text-slate-300 leading-relaxed max-w-[42rem]"
              style={{ fontSize: 'clamp(0.85rem, 0.5vw + 0.55rem, 1rem)' }}
            >
              A daily email when something on 911, Fire&nbsp;&amp;&nbsp;EMS, or 311
              happens near the corners you watch. Quiet days send nothing.
            </p>

            {/* Stream chips — identity, not toggles. Each shows what's
                available on the builder. */}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              {STREAMS.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-ink/55 dark:text-slate-400"
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: s.dot }}
                    aria-hidden
                  />
                  {s.label}
                </span>
              ))}
              <span className="text-ink/30 dark:text-slate-600" aria-hidden>·</span>
              <span className="text-[11px] font-mono text-ink/40 dark:text-slate-500 italic">
                Double opt-in, one-click unsubscribe.
              </span>
            </div>
          </div>

          {/* ── Right: call to action ───────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="font-display italic text-[18px] text-ink dark:text-paper-100 leading-tight">
                Set up alerts
              </p>
              <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-ink/45 dark:text-slate-500">
                ~60 seconds
              </p>
            </div>
          </div>
        </div>

        {/* Notched corner accent tab — same idiom as VizCard.
            Terracotta plate with an arrow. Scales on hover. */}
        <span
          className="
            absolute top-0 right-0 grid place-items-center z-10
            w-[44px] h-[44px] rounded-tr-[28px] rounded-bl-[20px]
            transition-[width,height] duration-300 ease-[cubic-bezier(0.22,0.8,0.3,1)]
            group-hover:w-[52px] group-hover:h-[52px]
          "
          style={{ backgroundColor: '#b85a33' }}
          aria-hidden
        >
          <svg
            width="14" height="14" viewBox="0 0 16 16" fill="none"
            stroke="#fbf6ea" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform duration-300 group-hover:translate-x-0.5"
          >
            <path d="M5 3 L11 8 L5 13" />
          </svg>
        </span>
      </button>
    </section>
  )
}
