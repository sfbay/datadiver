import type { SFNeighborhood } from '@/utils/geo';
import { SCANNER_FEEDS, type ScannerFeed, type FeedService } from './scannerFeeds';

export interface DistrictMapping {
  policeDistrict: string;
  fireBattalion: string;
}

// Verified against SFFD battalion maps (public/*.pdf) — B01 through B10.
// Neighborhoods straddling boundaries use majority-coverage battalion.
export const neighborhoodDistricts: Partial<Record<SFNeighborhood, DistrictMapping>> = {
  'Bayview Hunters Point': { policeDistrict: 'Bayview', fireBattalion: 'Battalion 10' },
  'Bernal Heights': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 6' },
  'Castro/Upper Market': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Chinatown': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },
  'Excelsior': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Financial District/South Beach': { policeDistrict: 'Central', fireBattalion: 'Battalion 3' },  // B03 map
  'Glen Park': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 6' },  // B06 map
  'Haight Ashbury': { policeDistrict: 'Park', fireBattalion: 'Battalion 2' },  // B02 map
  'Hayes Valley': { policeDistrict: 'Northern', fireBattalion: 'Battalion 2' },  // B02 map
  'Inner Richmond': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 7' },  // B07 map
  'Inner Sunset': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 7' },  // B07 map (north) / B08 (south)
  'Japantown': { policeDistrict: 'Northern', fireBattalion: 'Battalion 4' },  // B04 map
  'Lakeshore': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },  // B08 map
  'Lone Mountain/USF': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 7' },  // B07 map
  'Marina': { policeDistrict: 'Northern', fireBattalion: 'Battalion 4' },  // B04 map
  'Mission': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Mission Bay': { policeDistrict: 'Southern', fireBattalion: 'Battalion 3' },  // B03 map
  'Nob Hill': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },  // B01 map
  'Noe Valley': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'North Beach': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },  // B01 map
  'Oceanview/Merced/Ingleside': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Outer Mission': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Outer Richmond': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 7' },  // B07 map
  'Pacific Heights': { policeDistrict: 'Northern', fireBattalion: 'Battalion 4' },
  'Portola': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Presidio Heights': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 4' },
  'Potrero Hill': { policeDistrict: 'Bayview', fireBattalion: 'Battalion 3' },  // B03/B10 border, B03 majority
  'Russian Hill': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },  // B01 map
  'South of Market': { policeDistrict: 'Southern', fireBattalion: 'Battalion 3' },  // B03 map (east) / B02 (west)
  'Sunset/Parkside': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },
  'Tenderloin': { policeDistrict: 'Tenderloin', fireBattalion: 'Battalion 2' },  // B02 map
  'Twin Peaks': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 6' },  // B06 map
  'Visitacion Valley': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 10' },
  'West of Twin Peaks': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },  // B08 map
  'Western Addition': { policeDistrict: 'Northern', fireBattalion: 'Battalion 2' },  // B02 map
};

export const SFPD_DISTRICTS = [
  'Bayview', 'Central', 'Ingleside', 'Mission', 'Northern',
  'Park', 'Richmond', 'Southern', 'Taraval', 'Tenderloin',
] as const;

export const SFFD_BATTALIONS = [
  'Battalion 1', 'Battalion 2', 'Battalion 3', 'Battalion 4',
  'Battalion 6', 'Battalion 7', 'Battalion 8', 'Battalion 9', 'Battalion 10',
] as const;
// Note: Battalion 5 not present in SFFD maps — may be reserve/special ops.

export type SFPDDistrict = (typeof SFPD_DISTRICTS)[number];
export type SFFDBattalion = (typeof SFFD_BATTALIONS)[number];

export function getFeedsForNeighborhood(
  neighborhood: string,
  serviceFilter?: FeedService | FeedService[],
): ScannerFeed[] {
  const mapping = neighborhoodDistricts[neighborhood as SFNeighborhood];
  const services = serviceFilter
    ? Array.isArray(serviceFilter) ? serviceFilter : [serviceFilter]
    : undefined;

  return SCANNER_FEEDS.filter((feed) => {
    if (services && !services.includes(feed.service)) return false;
    if (feed.coverage.type === 'citywide') return true;
    if (!mapping) return false;
    const cov = feed.coverage;
    const matchesPolice = cov.policeDistricts?.includes(mapping.policeDistrict);
    const matchesFire = cov.fireBattalions?.includes(mapping.fireBattalion);
    return matchesPolice || matchesFire;
  });
}

export function getFeedsForDistrict(district: string): ScannerFeed[] {
  return SCANNER_FEEDS.filter((feed) => {
    if (feed.coverage.type === 'citywide') return true;
    return feed.coverage.policeDistricts?.includes(district);
  });
}

export function getFeedsForBattalion(battalion: string): ScannerFeed[] {
  return SCANNER_FEEDS.filter((feed) => {
    if (feed.coverage.type === 'citywide') return true;
    return feed.coverage.fireBattalions?.includes(battalion);
  });
}
