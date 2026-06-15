// Compact scanner-radio launcher. Single row, h-12. The "Tune In"
// buttons open the Broadcastify feed page in a new browser tab — by
// design, scanner audio is not embedded (see spec: scanner-as-soundtrack;
// Broadcastify's TOS restricts embedded players to feed owners).

import { FEED_SOURCES } from '@/data/scannerFeeds'
import ScannerFeedLinks, { SCANNER_FEED_COUNT } from './ScannerFeedLinks'

export default function ScannerStrip() {
  if (SCANNER_FEED_COUNT === 0) return null

  return (
    <>
      {/* Double-rule top edge — newspaper-style section break */}
      <div className="border-t border-paper-300/40 dark:border-espresso-700 mx-[clamp(16px,3vw,64px)]" />
      <div className="border-t border-paper-300/20 dark:border-espresso-800 mx-[clamp(16px,3vw,64px)] mt-px" />

      <div className="h-12 px-[clamp(16px,3vw,64px)] flex items-center gap-3 font-mono text-[11px] text-paper-700 dark:text-paper-400 bg-paper-50/20 dark:bg-espresso-900/30">
        <span className="text-ochre-600 dark:text-ochre-500" aria-hidden>
          📡
        </span>
        <span className="tracking-wider">SCANNER</span>
        <span className="text-paper-500">·</span>
        <span className="hidden sm:inline truncate">Live dispatch audio</span>
        <span className="hidden sm:inline text-[9px] text-paper-500">
          via{' '}
          <a
            href={FEED_SOURCES.broadcastify.aboutUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-paper-400 underline-offset-2 hover:underline"
          >
            {FEED_SOURCES.broadcastify.label}
          </a>
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ScannerFeedLinks />
        </div>
      </div>
    </>
  )
}
