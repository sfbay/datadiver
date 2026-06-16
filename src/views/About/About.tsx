import { type ReactNode, type CSSProperties } from 'react'

/**
 * About — authorship, AI disclosure, stack, data sources, and a public
 * distillation of everything we know about the data's limits.
 *
 * This page is the transparency commitment made concrete: every method,
 * every known bias, every judgment call that shapes a number on this site,
 * documented in one place a reader can cite. Editorial document layout —
 * no map, no queries, just the record.
 */

const PAPER = '#a8926a'

function SectionHead({ label, glow = PAPER }: { label: string; glow?: string }) {
  return (
    <div
      className="glow-host flex items-center gap-2.5 mb-5 py-1"
      style={{ '--glow': glow } as CSSProperties}
    >
      <div className="glow-corner is-sm" />
      <p className="relative text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <div className="relative flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
    </div>
  )
}

function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 max-w-[760px]">
      {children}
    </div>
  )
}

/** A distilled data-quality finding — the unit of the observations section. */
function Finding({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass-card rounded-xl px-5 py-4">
      <h3 className="font-display italic text-[17px] text-ink dark:text-white mb-2">{title}</h3>
      <div className="space-y-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
        {children}
      </div>
    </div>
  )
}

interface SourceRow {
  name: string
  id: string
  dateField?: string
  note?: string
}

// Mirrors src/api/datasets.ts — update both when the registry changes.
const SOURCES: SourceRow[] = [
  { name: 'Fire/EMS Dispatched Calls', id: 'nuek-vuh3', dateField: 'received_dttm', note: 'Publishes with ~12h intrinsic lag' },
  { name: 'Fire Incidents', id: 'wr8u-xric', dateField: 'alarm_dttm' },
  { name: '911 Dispatch (Real-Time)', id: 'gnap-fj3t', dateField: 'received_datetime', note: 'Rolling 48h window; ~7h lag; no coordinates' },
  { name: '911 Dispatch (Historical)', id: '2zdj-bwza', dateField: 'received_datetime', note: 'Closed law-enforcement calls; no coordinates' },
  { name: 'Police Incident Reports (2018+)', id: 'wg3w-h783', dateField: 'incident_datetime', note: '~39h publish lag' },
  { name: '311 Cases', id: 'vw6y-z8j6', dateField: 'requested_datetime', note: '~15h intrinsic lag' },
  { name: 'Traffic Crashes (TransBASE)', id: 'ubvf-ztfx', dateField: 'collision_datetime', note: 'Double lag: ~4–6wk publish + longer fatality coding (see findings)' },
  { name: 'High Injury Network (2024)', id: 'enwt-3u8m', note: 'Vision Zero street segments; updated annually' },
  { name: 'Speed Camera Citations', id: 'd5uh-bk84', dateField: 'date' },
  { name: 'Red Light Camera Citations', id: 'uzmr-g2uc' },
  { name: 'Parking Citations', id: 'ab4h-6ztd', dateField: 'citation_issued_datetime', note: 'No coordinates after ~Oct 2025 (see findings)' },
  { name: 'Parking Meter Revenue', id: 'imvp-dq3v', dateField: 'session_start_dt' },
  { name: 'Parking Meter Inventory', id: '8vzz-qzz9' },
  { name: 'Pavement Condition Index', id: '5aye-4rtt' },
  { name: 'Registered Business Locations', id: 'g8m3-pdis', dateField: 'dba_start_date', note: '~96% of new registrations lack NAICS codes (see findings)' },
  { name: 'Campaign Finance (SF Ethics)', id: 'pitq-e56w', dateField: 'calculated_date', note: 'SF filings only — excludes state FPPC/CAL-ACCESS' },
  { name: 'Budget', id: 'xdgd-c79v' },
  { name: 'Spending & Revenue', id: 'bpnb-jwfb' },
  { name: 'Vendor Payments (Vouchers)', id: 'n9pm-xkyq', note: '7.9M rows, FY2007+; basis of the ad-spend compliance work' },
  { name: 'Supplier Contracts', id: 'cqi5-hm2d', note: 'FY2018+' },
]

const STACK: { area: string; tools: string }[] = [
  { area: 'Framework', tools: 'React 18 · TypeScript · Vite' },
  { area: 'Styling', tools: 'Tailwind CSS v4 — custom earth-tone token system (espresso/cream + seven pigment ramps), Fraunces / Roboto Serif / Space Mono self-hosted via Fontsource' },
  { area: 'Maps', tools: 'Mapbox GL JS v3 (dark-v11 / light-v11 basemaps)' },
  { area: 'Charts', tools: 'D3.js — histograms, heatgrids, trend & breakdown charts' },
  { area: 'State', tools: 'Zustand, with URL-synchronized parameters so every view is shareable as a link' },
  { area: 'Data access', tools: 'Socrata SODA API, queried directly from the browser — no intermediary backend, no scraping, no cached copies of record-level data' },
  { area: 'Export', tools: 'html2canvas-pro for PNG snapshots of any visualization' },
  { area: 'Alerts backend', tools: 'Vercel serverless functions · Neon Postgres · Resend (double opt-in email, minimal PII, hard-deleted on unsubscribe)' },
  { area: 'Hosting', tools: 'Vercel, deployed from GitHub via pull-request workflow' },
  { area: 'AI tooling', tools: 'Claude Code (Anthropic) — agentic coding environment used throughout development; see disclosure above' },
]

export default function About() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-[clamp(16px,3vw,64px)] py-10">
        {/* ── Header ─────────────────────────────────────── */}
        <header className="mb-12">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400 mb-3">
            ── About
          </p>
          <h1 className="font-display italic text-ink dark:text-white tracking-tight leading-[1.05] mb-5"
              style={{ fontSize: 'clamp(2rem, 3vw + 1rem, 3.5rem)' }}>
            Public data, public methods.
          </h1>
          <Prose>
            <p>
              DataDiver turns San Francisco&rsquo;s open data into living, explorable
              visualizations — emergency response times, 311 patterns, crash analysis,
              campaign money, city spending. The premise is simple: the data is already
              public, so the insight should be too. And so should the methods. This page
              documents who built it, how, with what tools, and — most importantly —
              everything we have learned about where the data itself can mislead.
            </p>
          </Prose>
        </header>

        {/* ── Authorship & AI disclosure ─────────────────── */}
        <section className="mb-12">
          <SectionHead label="Authorship & AI Disclosure" glow="#b85a33" />
          <Prose>
            <p>
              DataDiver is developed and designed by{' '}
              <span className="text-ink dark:text-white font-semibold">Jesse Garnier</span>,
              Associate Professor of Journalism at San Francisco State University, as an
              applied journalism and civic-data project.
            </p>
            <p>
              It is built in sustained collaboration with{' '}
              <span className="text-ink dark:text-white font-semibold">Claude</span>, Anthropic&rsquo;s
              AI assistant, working through the Claude Code development environment. In this
              collaboration Claude writes most of the application code, performs exploratory
              data analysis, drafts visualizations, and surfaces data-quality findings; the
              author sets direction, makes every editorial and design decision, reviews each
              change through a pull-request workflow, independently verifies the analytical
              claims that matter, and is solely responsible for what is published. Methodology
              decisions are documented at the moment they are made, not reconstructed after.
            </p>
            <p>
              This disclosure is intentionally specific: an AI system is a tool with a
              substantial role here, not an author. Errors remain the author&rsquo;s
              responsibility — and corrections are welcome at{' '}
              <a href="mailto:jgarnier@sfsu.edu" className="underline decoration-slate-400/50 underline-offset-2 hover:text-ink dark:hover:text-white transition-colors">
                jgarnier@sfsu.edu
              </a>.
            </p>
          </Prose>
        </section>

        {/* ── Stack ──────────────────────────────────────── */}
        <section className="mb-12">
          <SectionHead label="Stack & Toolset" glow="#5c9693" />
          <div className="glass-card rounded-xl overflow-hidden max-w-[860px]">
            <table className="w-full text-left">
              <tbody>
                {STACK.map((row, i) => (
                  <tr key={row.area} className={i > 0 ? 'border-t border-slate-200/50 dark:border-white/[0.04]' : ''}>
                    <td className="px-5 py-3 align-top whitespace-nowrap text-[11px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 w-[140px]">
                      {row.area}
                    </td>
                    <td className="px-5 py-3 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
                      {row.tools}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Data sources ───────────────────────────────── */}
        <section className="mb-12">
          <SectionHead label="Data Sources" glow="#d4a435" />
          <Prose>
            <p className="mb-5">
              All data comes from{' '}
              <a href="https://data.sfgov.org" target="_blank" rel="noopener noreferrer"
                 className="underline decoration-slate-400/50 underline-offset-2 hover:text-ink dark:hover:text-white transition-colors">
                DataSF
              </a>{' '}
              (data.sfgov.org), the City &amp; County of San Francisco&rsquo;s open data portal,
              queried live via the Socrata SODA API. Dataset identifiers are listed so any
              figure on this site can be independently re-queried. Update frequency varies by
              dataset and is constrained by each publishing agency; no SF dataset is truly
              real-time.
            </p>
          </Prose>
          <div className="glass-card rounded-xl overflow-x-auto">
            <table className="w-full text-left min-w-[680px]">
              <thead>
                <tr className="border-b-2 border-slate-300/50 dark:border-white/[0.08]">
                  <th className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Dataset</th>
                  <th className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Socrata ID</th>
                  <th className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Date field</th>
                  <th className="px-4 py-2.5 text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-medium">Known limitations</th>
                </tr>
              </thead>
              <tbody>
                {SOURCES.map((s) => (
                  <tr key={s.id} className="border-t border-slate-200/40 dark:border-white/[0.03]">
                    <td className="px-4 py-2.5 text-[13px] text-slate-700 dark:text-slate-200">{s.name}</td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-slate-500 dark:text-slate-400">
                      <a href={`https://data.sfgov.org/d/${s.id}`} target="_blank" rel="noopener noreferrer"
                         className="hover:text-ink dark:hover:text-white underline decoration-slate-400/30 underline-offset-2 transition-colors">
                        {s.id}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-[12px] font-mono text-slate-500 dark:text-slate-400">{s.dateField ?? '—'}</td>
                    <td className="px-4 py-2.5 text-[12px] text-slate-500 dark:text-slate-400">{s.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Findings ───────────────────────────────────── */}
        <section className="mb-12">
          <SectionHead label="What We Know About the Data — Findings & Methods" glow="#7a9954" />
          <Prose>
            <p className="mb-5">
              These findings come from hands-on exploration of the datasets and shape how
              every number on this site is computed and presented. They are published here
              because anyone analyzing the same data will hit the same traps.
            </p>
          </Prose>
          <div className="grid gap-4 max-w-[860px]">
            <Finding title="Traffic crash data has two lags, and the second is invisible">
              <p>
                The TransBASE crash dataset (<span className="font-mono text-[12px]">ubvf-ztfx</span>) publishes
                roughly 4–6 weeks behind, but fatality coding trails further: deaths initially
                filed as injuries are upgraded only after certification under the federal
                died-within-30-days rule, so recent months systematically revise upward. In
                June 2026 we verified this against Walk SF&rsquo;s pedestrian-fatality count:
                a death that occurred April 13 appeared in the data at the exact intersection
                and time — coded as <span className="font-mono text-[12px]">Injury (Complaint of Pain)</span>,
                killed: 0. Our Vision Zero figures therefore anchor both year-over-year windows
                to the data&rsquo;s real coverage date and carry an explicit caveat.
              </p>
              <p>
                Related matching gotchas, for anyone cross-referencing news reports: overnight
                crashes shift calendar days; police code locations to the nearest major cross
                street (an alley address becomes the nearest arterial); and the severity value
                is the exact string <span className="font-mono text-[12px]">Injury (Severe)</span> —
                a plausible-looking <span className="font-mono text-[12px]">'Severe Injury'</span> matches
                nothing and silently undercounts by ~90%.
              </p>
            </Finding>

            <Finding title="New business registrations lack industry codes — every sector looks like it's declining">
              <p>
                ~96% of new business openings have no NAICS industry code; codes are assigned
                retroactively. Closures — older businesses — almost always have codes. Filter
                by any sector and you silently exclude almost all openings, producing a false
                &ldquo;everything is declining&rdquo; picture (Mar 2025–Mar 2026: categorized
                net −4,958; uncategorized net +4,959). The Business Activity view shows an
                explicit Uncategorized row and uses closure-trend z-scores against a 5-year
                baseline — not opening/closure ratios — as the per-sector health signal,
                because closure counts are the reliable side of the ledger.
              </p>
            </Finding>

            <Finding title="Parking citations lose their coordinates after October 2025">
              <p>
                Citations issued after ~October 2025 exist in the dataset but carry no
                latitude/longitude, so a map of recent citations looks like enforcement
                stopped. It didn&rsquo;t. The view detects when a selected date range extends
                past geographic coverage and offers a one-click adjustment rather than
                showing a misleadingly empty map.
              </p>
            </Finding>

            <Finding title="No SF dataset is real-time — freshness is designed around each feed's floor">
              <p>
                Every dataset publishes with intrinsic lag: roughly 7 hours for real-time 911
                dispatch, 12 for Fire/EMS, 15 for 311, ~39 for police incidents. &ldquo;The
                Last 48&rdquo; view names this honestly, and its recency color ramps are
                calibrated to each feed&rsquo;s natural floor — an event shown as
                &ldquo;fresh&rdquo; means <em>as fresh as this dataset gets</em>, with the
                absolute timestamp alongside.
              </p>
            </Finding>

            <Finding title="Server-side aggregation, never client-side sampling">
              <p>
                Socrata caps query results (default 1,000 rows, max 50,000). Fetching recent
                rows and totaling them client-side produces biased per-entity figures — the
                sample over-represents whatever sorted first. Every total, average, and
                ranking on this site is computed server-side with{' '}
                <span className="font-mono text-[12px]">GROUP BY</span> /{' '}
                <span className="font-mono text-[12px]">SUM()</span> /{' '}
                <span className="font-mono text-[12px]">COUNT()</span>; row-level fetches are
                used only to place dots on maps.
              </p>
              <p>
                A subtler variant: querying records matching on <em>either</em> of two date
                fields while sorting by only one lets the row cap silently drop everything
                matching on the other. We split such queries and merge client-side.
              </p>
            </Finding>

            <Finding title="Matched windows, or the comparison lies">
              <p>
                Year-over-year deltas compare equal periods anchored to the data&rsquo;s actual
                coverage — if data runs through April 30, this year&rsquo;s Jan 1–Apr 30 is
                compared to last year&rsquo;s Jan 1–Apr 30, never to a full prior year. Stat
                cards carry z-scores against a 12-month baseline where a single
                year-over-year delta would overstate noise.
              </p>
            </Finding>

            <Finding title="Insufficient data is shown, not hidden">
              <p>
                The interface distinguishes three states everywhere it can: data present,
                data suppressed as statistically meaningless (e.g., neighborhood rates in
                parks with a handful of residents — excluded by an explicit, named list, not
                a silent threshold), and data truly absent. Diagonal hatching is the
                house idiom for &ldquo;exists but is not comparable&rdquo; — used for publish-lag
                zones on sparklines and non-residential geography on demographic underlays.
              </p>
            </Finding>

            <Finding title="Campaign finance figures are SF-only">
              <p>
                The campaign finance dataset covers SF Ethics Commission filings only — not
                state-level FPPC/CAL-ACCESS filings. Totals here can differ substantially from
                statewide figures reported elsewhere (a committee&rsquo;s SF filings may show
                $14M where statewide reporting shows $32.5M). Spending categories use
                standardized FPPC transaction codes rather than free-text descriptions, and
                intermediary (&ldquo;earmarked&rdquo;) pass-throughs are identified by form
                type to avoid double-counting money that merely routed through a committee.
              </p>
            </Finding>
          </div>
        </section>

        {/* ── Case study: Resolution 240210 ──────────────── */}
        <section className="mb-12">
          <SectionHead label="Case Study — Community Media Spending (Resolution 240210)" glow="#8b6282" />
          <Prose>
            <p>
              The City Budget view&rsquo;s Advertising &amp; Media analysis measures city
              compliance with SF Board of Supervisors Resolution 240210, which directs at
              least 50% of discretionary city advertising toward ethnic and community media.
              It is the site&rsquo;s deepest methodology, documented here field by field.
            </p>
            <p>
              <span className="text-ink dark:text-white font-semibold">Detection.</span>{' '}
              City advertising spend hides in three places in the vendor payments data
              (<span className="font-mono text-[12px]">n9pm-xkyq</span>):{' '}
              <em>tagged</em> spend (<span className="font-mono text-[12px]">sub_object = 'Advertising'</span>),{' '}
              <em>agency-routed</em> spend (payments to known media-buying agencies whose
              line items are not tagged as advertising), and <em>P-card</em> purchases
              (procurement-card rows where the actual outlet is invisible — almost certainly
              direct-to-platform digital buys, since agencies, newspapers, and billboard
              companies all invoice). P-card rows can satisfy both the tagged and P-card
              predicates, so they are deduplicated by vendor and fiscal year. Department-level
              totals must sum all three layers — tagged-only queries wildly understate
              agency-heavy departments, where as much as 99% of media spend routes through
              an agency.
            </p>
            <p>
              <span className="text-ink dark:text-white font-semibold">The compliance basis.</span>{' '}
              Compliance % = community media spend ÷ discretionary advertising. The
              denominator uses only the city-classified (tagged) layer — agency contracts are
              excluded because they bundle non-advertising work, and P-card spend because the
              outlet is unknowable; including either would be speculation. Mandatory legal
              notices (public-hearing and bid publications, e.g. Daily Journal Corporation,
              $7.75M lifetime) are excluded from the denominator because they are not
              discretionary outreach. Both exclusions are visible in the interface, not
              silent.
            </p>
            <p>
              <span className="text-ink dark:text-white font-semibold">Classification.</span>{' '}
              The community/ethnic outlet registry (28+ outlets, organized by community
              served) is maintained as visible code, so any classification can be inspected
              and challenged. Every compliance figure links to its exact source records as
              exportable CSV.
            </p>
            <p>
              <span className="text-ink dark:text-white font-semibold">Known limits.</span>{' '}
              Agency pass-through is opaque — an agency contract may include ethnic-media
              buys we cannot see or credit. P-card outlets are unknowable. The registry
              covers known recipients; outlets paid under unmapped names would be missed.
              These limits are stated wherever the numbers appear.
            </p>
          </Prose>
        </section>

        {/* ── Colophon ───────────────────────────────────── */}
        <section className="mb-8">
          <SectionHead label="Colophon" />
          <Prose>
            <p>
              The visual system is an earth-tone palette — espresso and cream surfaces with
              pigment accents named for what they are (terracotta, ochre, moss, dusty teal,
              brick, indigo, plum) — set in Fraunces, Roboto Serif, and Space Mono. Dana,
              the data-diving harbor seal, is the project&rsquo;s mascot and conscience.
              DataDiver is a living project; this page is updated as methods evolve.
            </p>
            <p className="text-[12px] font-mono text-slate-500 dark:text-slate-400 pt-2">
              Development and Design by Assoc. Prof. Jesse Garnier, SF State Journalism ·
              built with Claude · data from DataSF
            </p>
          </Prose>
        </section>
      </div>
    </div>
  )
}
