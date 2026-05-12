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
    <div className="h-12 px-[clamp(16px,3vw,64px)] flex items-center gap-3 font-mono text-[11px] text-paper-700 dark:text-paper-400 border-t border-paper-200/40 dark:border-espresso-700 bg-paper-50/30 dark:bg-espresso-900/40">
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
        className="ml-auto px-3 py-1 rounded bg-moss-500 text-espresso-900 hover:bg-moss-400 text-[10px] tracking-wider"
      >
        ▶ TUNE IN
      </a>
    </div>
  )
}
