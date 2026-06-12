// Compact scanner-radio launcher. Single row, h-12. The "Tune In"
// buttons open the Broadcastify feed page in a new browser tab — by
// design, scanner audio is not embedded (see spec: scanner-as-soundtrack;
// Broadcastify's TOS restricts embedded players to feed owners).

import { FEED_SOURCES, SCANNER_FEEDS } from '@/data/scannerFeeds'

// The two live SF dispatch streams. Pigments follow the dataset vocabulary:
// Fire/EMS = terracotta (emergency), Police = indigo (sensitive calls).
const STRIP_FEEDS = [
  { id: 'broadcastify-sf-fire', label: 'FIRE/EMS', classes: 'border-terracotta-500/60 text-terracotta-600 dark:text-terracotta-400 hover:bg-terracotta-500/10 hover:border-terracotta-500' },
  { id: 'broadcastify-sf-police', label: 'POLICE', classes: 'border-indigo-500/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500' },
]
  .map(({ id, label, classes }) => {
    const feed = SCANNER_FEEDS.find((f) => f.id === id)
    return feed ? { feed, label, classes } : null
  })
  .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

export default function ScannerStrip() {
  if (STRIP_FEEDS.length === 0) return null

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
          {STRIP_FEEDS.map(({ feed, label, classes }) => (
            <a
              key={feed.id}
              href={feed.url}
              target="_blank"
              rel="noopener noreferrer"
              title={feed.description}
              className={`px-3 py-1 rounded border text-[10px] tracking-wider transition-colors ${classes}`}
            >
              ▶ {label} →
            </a>
          ))}
        </div>
      </div>
    </>
  )
}
