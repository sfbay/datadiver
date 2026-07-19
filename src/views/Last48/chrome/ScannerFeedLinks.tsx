// The two live SF dispatch feed buttons (Fire/EMS, Police), shared by the
// desktop ScannerStrip and the mobile rail footer. Pigments follow the dataset
// vocabulary: Fire/EMS = terracotta (emergency), Police = indigo (sensitive).
// New-tab only — Broadcastify's TOS restricts embedded players to feed owners.

import { SCANNER_FEEDS } from '@/data/scannerFeeds'

const FEEDS = [
  { id: 'broadcastify-sf-fire', label: 'FIRE/EMS', classes: 'border-terracotta-500/60 text-terracotta-600 dark:text-terracotta-400 hover:bg-terracotta-500/10 hover:border-terracotta-500' },
  { id: 'broadcastify-sf-police', label: 'POLICE', classes: 'border-indigo-500/60 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500' },
]
  .map(({ id, label, classes }) => {
    const feed = SCANNER_FEEDS.find((f) => f.id === id)
    return feed ? { feed, label, classes } : null
  })
  .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

export const SCANNER_FEED_COUNT = FEEDS.length

export default function ScannerFeedLinks() {
  return (
    <>
      {FEEDS.map(({ feed, label, classes }) => (
        <a
          key={feed.id}
          href={feed.url}
          target="_blank"
          rel="noopener noreferrer"
          title={feed.description}
          className={`px-3 py-1 rounded border text-micro tracking-wider transition-colors ${classes}`}
        >
          ▶ {label} →
        </a>
      ))}
    </>
  )
}
