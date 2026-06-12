// Scanner feed registry — static data, no API calls.
// All feeds are community-operated external services.

export type FeedSource = 'openmhz' | 'broadcastify' | 'somafm';
export type FeedService = 'police' | 'fire' | 'ems' | 'mixed';

export interface ScannerFeed {
  id: string;
  name: string;
  source: FeedSource;
  service: FeedService;
  url: string;
  coverage:
    | { type: 'citywide' }
    | { type: 'district'; policeDistricts?: string[]; fireBattalions?: string[] };
  description: string;
  donateUrl?: string;
}

// Source metadata for attribution links
export const FEED_SOURCES: Record<FeedSource, { label: string; aboutUrl: string; donateUrl?: string }> = {
  openmhz: {
    label: 'OpenMHz',
    aboutUrl: 'https://openmhz.com',
  },
  broadcastify: {
    label: 'Broadcastify',
    aboutUrl: 'https://www.broadcastify.com',
    donateUrl: 'https://www.broadcastify.com/premium/',
  },
  somafm: {
    label: 'SomaFM',
    aboutUrl: 'https://somafm.com',
    donateUrl: 'https://somafm.com/support/',
  },
};

export const SCANNER_FEEDS: ScannerFeed[] = [
  {
    id: 'broadcastify-sf-fire',
    name: 'SF Fire & EMS',
    source: 'broadcastify',
    service: 'fire',
    url: 'https://www.broadcastify.com/listen/feed/6336',
    coverage: { type: 'citywide' },
    description: 'San Francisco City Fire and EMS — live dispatch audio',
  },
  {
    id: 'broadcastify-sf-police',
    name: 'SF Police',
    source: 'broadcastify',
    service: 'police',
    url: 'https://www.broadcastify.com/listen/feed/46180',
    coverage: { type: 'citywide' },
    description: 'San Francisco City Police dispatch — base/mobile traffic (portables are encrypted)',
  },
  {
    id: 'openmhz-sfpd',
    name: 'SFPD Trunked Radio',
    source: 'openmhz',
    service: 'police',
    url: 'https://openmhz.com/system/sfp25',
    coverage: { type: 'citywide' },
    description: 'Full SFPD trunked radio system — live + archived calls',
  },
  {
    id: 'broadcastify-sf-hub',
    name: 'SF County Scanner Hub',
    source: 'broadcastify',
    service: 'mixed',
    url: 'https://www.broadcastify.com/listen/ctid/220',
    coverage: { type: 'citywide' },
    description: 'All San Francisco scanner channels — police, fire, EMS',
  },
  {
    id: 'somafm-scanner',
    name: 'SomaFM Scanner',
    source: 'somafm',
    service: 'mixed',
    url: 'https://somafm.com/scanner/',
    coverage: { type: 'citywide' },
    description: 'Curated SF scanner audio — ambient listening',
  },
];

export function getFeedsByService(serviceFilter?: FeedService | FeedService[]): ScannerFeed[] {
  if (!serviceFilter) return SCANNER_FEEDS;
  const services = Array.isArray(serviceFilter) ? serviceFilter : [serviceFilter];
  return SCANNER_FEEDS.filter((f) => services.includes(f.service));
}

export function getFeedsGroupedByService(): Record<string, ScannerFeed[]> {
  const groups: Record<string, ScannerFeed[]> = {
    'Police': [],
    'Fire / EMS': [],
    'Mixed / Ambient': [],
  };
  for (const feed of SCANNER_FEEDS) {
    if (feed.service === 'police') groups['Police'].push(feed);
    else if (feed.service === 'fire' || feed.service === 'ems') groups['Fire / EMS'].push(feed);
    else groups['Mixed / Ambient'].push(feed);
  }
  return groups;
}

export function getUniqueSources(feeds: ScannerFeed[]): FeedSource[] {
  return [...new Set(feeds.map((f) => f.source))];
}
