import type { SFNeighborhood } from '@/utils/geo';
import { SCANNER_FEEDS, type ScannerFeed, type FeedService } from './scannerFeeds';

export interface DistrictMapping {
  policeDistrict: string;
  fireBattalion: string;
}

export const neighborhoodDistricts: Partial<Record<SFNeighborhood, DistrictMapping>> = {
  'Bayview Hunters Point': { policeDistrict: 'Bayview', fireBattalion: 'Battalion 10' },
  'Bernal Heights': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 6' },
  'Castro/Upper Market': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Chinatown': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },
  'Excelsior': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Financial District/South Beach': { policeDistrict: 'Central', fireBattalion: 'Battalion 1' },
  'Glen Park': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Haight Ashbury': { policeDistrict: 'Park', fireBattalion: 'Battalion 6' },
  'Hayes Valley': { policeDistrict: 'Northern', fireBattalion: 'Battalion 3' },
  'Inner Richmond': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 8' },
  'Inner Sunset': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },
  'Japantown': { policeDistrict: 'Northern', fireBattalion: 'Battalion 3' },
  'Lakeshore': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 9' },
  'Lone Mountain/USF': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 8' },
  'Marina': { policeDistrict: 'Northern', fireBattalion: 'Battalion 2' },
  'Mission': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'Mission Bay': { policeDistrict: 'Southern', fireBattalion: 'Battalion 1' },
  'Nob Hill': { policeDistrict: 'Central', fireBattalion: 'Battalion 4' },
  'Noe Valley': { policeDistrict: 'Mission', fireBattalion: 'Battalion 6' },
  'North Beach': { policeDistrict: 'Central', fireBattalion: 'Battalion 2' },
  'Oceanview/Merced/Ingleside': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Outer Mission': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Outer Richmond': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 8' },
  'Pacific Heights': { policeDistrict: 'Northern', fireBattalion: 'Battalion 4' },
  'Portola': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Presidio Heights': { policeDistrict: 'Richmond', fireBattalion: 'Battalion 4' },
  'Russian Hill': { policeDistrict: 'Central', fireBattalion: 'Battalion 4' },
  'South of Market': { policeDistrict: 'Southern', fireBattalion: 'Battalion 1' },
  'Sunset/Parkside': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 8' },
  'Tenderloin': { policeDistrict: 'Tenderloin', fireBattalion: 'Battalion 3' },
  'Twin Peaks': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 9' },
  'Visitacion Valley': { policeDistrict: 'Ingleside', fireBattalion: 'Battalion 10' },
  'West of Twin Peaks': { policeDistrict: 'Taraval', fireBattalion: 'Battalion 9' },
  'Western Addition': { policeDistrict: 'Northern', fireBattalion: 'Battalion 3' },
};

export const SFPD_DISTRICTS = [
  'Bayview', 'Central', 'Ingleside', 'Mission', 'Northern',
  'Park', 'Richmond', 'Southern', 'Taraval', 'Tenderloin',
] as const;

export const SFFD_BATTALIONS = [
  'Battalion 1', 'Battalion 2', 'Battalion 3', 'Battalion 4',
  'Battalion 6', 'Battalion 8', 'Battalion 9', 'Battalion 10',
] as const;

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
