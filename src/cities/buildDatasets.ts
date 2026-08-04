import type { DatasetConfig, RawDatasetConfig } from './types'

export function buildDatasets(
  host: string,
  raw: Record<string, RawDatasetConfig>,
): Record<string, DatasetConfig> {
  const out: Record<string, DatasetConfig> = {}
  for (const [key, cfg] of Object.entries(raw)) {
    out[key] = { ...cfg, endpoint: `https://${host}/resource/${cfg.id}.${cfg.ext ?? 'json'}` }
  }
  return out
}
