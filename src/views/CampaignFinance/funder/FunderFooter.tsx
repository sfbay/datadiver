// Funder card footer (spec §4G) — one serif paragraph (prose meant to be
// READ stays body serif, never mono — house rule) disclosing filing scope,
// the $100 itemization floor, name-merged identity, notice timing, and
// stance parsing, followed by a link to the About page's methodology.
import { Link } from 'react-router-dom'

export default function FunderFooter() {
  return (
    <div className="mt-5 pt-3 border-t border-slate-200/50 dark:border-white/[0.06]">
      <p className="font-serif text-[0.8125rem] leading-relaxed text-slate-600 dark:text-slate-300">
        SF Ethics Commission filings only — money to state committees is not here. Gifts under $100
        are never itemized and are not counted. Identities are merged on name; see Filed as.
        Late-contribution notices are excluded from totals until they appear on a statement. Stance
        is read from each committee's registered name.
      </p>
      <Link
        to="/about"
        className="inline-block mt-1.5 text-micro font-mono text-plum-500 hover:text-plum-600 dark:hover:text-plum-400 transition-colors"
      >
        How we read these filings →
      </Link>
    </div>
  )
}
