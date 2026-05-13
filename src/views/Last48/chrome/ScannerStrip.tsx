// Compact scanner-radio launcher. Single row, h-12. The "Tune In"
// button opens the audio stream URL in a new browser tab — by design,
// scanner audio is not embedded (see spec: scanner-as-soundtrack).

import { SCANNER_FEEDS } from '@/data/scannerFeeds'

// Citywide default: the first feed labeled 'mixed' service if available;
// else the first feed in the list.
const DEFAULT_FEED = SCANNER_FEEDS.find((f) => f.service === 'mixed') ?? SCANNER_FEEDS[0]

export default function ScannerStrip() {
  if (!DEFAULT_FEED) return null

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
        <span className="truncate">{DEFAULT_FEED.name}</span>
        <a
          href={DEFAULT_FEED.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto px-3 py-1 rounded border border-moss-500/60 text-moss-600 dark:text-moss-400 hover:bg-moss-500/10 hover:border-moss-500 text-[10px] tracking-wider transition-colors"
        >
          ▶ TUNE IN →
        </a>
      </div>
    </>
  )
}
