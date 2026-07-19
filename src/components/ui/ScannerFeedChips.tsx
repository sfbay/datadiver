import { getFeedsForNeighborhood } from '@/data/neighborhoodDistricts';
import { FEED_SOURCES, getUniqueSources, type FeedService } from '@/data/scannerFeeds';

interface ScannerFeedChipsProps {
  neighborhood: string;
  serviceFilter?: FeedService | FeedService[];
}

export default function ScannerFeedChips({ neighborhood, serviceFilter }: ScannerFeedChipsProps) {
  // Only show district-specific feeds (exclude citywide to keep chips thin)
  const allFeeds = getFeedsForNeighborhood(neighborhood, serviceFilter);
  const districtFeeds = allFeeds.filter((f) => f.coverage.type === 'district');

  // If no district-specific feeds, don't render anything
  if (districtFeeds.length === 0) return null;

  const sources = getUniqueSources(districtFeeds);

  return (
    <div className="mt-2 mb-3">
      <div className="flex flex-wrap gap-1.5">
        {districtFeeds.map((feed) => (
          <a
            key={feed.id}
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-teal-500/10 dark:bg-teal-400/10 text-teal-600 dark:text-teal-400 text-micro font-mono hover:bg-teal-500/20 dark:hover:bg-teal-400/20 transition-colors"
            title={feed.description}
          >
            <svg className="w-2.5 h-2.5 flex-shrink-0" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3 1a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H3zm5 4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H8zm5 3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h.5a.5.5 0 0 0 .5-.5V9a1 1 0 0 0-1-1h-.5z" />
            </svg>
            {feed.name}
            <span className="opacity-60">↗</span>
          </a>
        ))}
      </div>
      <div className="mt-1 text-nano text-slate-400 dark:text-slate-500">
        via{' '}
        {sources.map((source, i) => (
          <span key={source}>
            {i > 0 && ' · '}
            <a
              href={FEED_SOURCES[source].donateUrl || FEED_SOURCES[source].aboutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              {FEED_SOURCES[source].label}
            </a>
          </span>
        ))}
      </div>
    </div>
  );
}
