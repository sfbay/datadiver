// src/views/Last48/modes/HotspotsMode.tsx

import { useMemo, useState } from 'react'
import { useAnomalyBaseline } from '@/hooks/useAnomalyBaseline'
import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId } from '@/types/last48'
import Last48Map from './Last48Map'
import HotspotsChoropleth from './HotspotsChoropleth'
import AnomalyRail from './AnomalyRail'
import Last48NeighborhoodPeek from '../detail/Last48NeighborhoodPeek'

interface Props {
  window48: Last48WindowResult
  datasets: DatasetId[]
}

export default function HotspotsMode({ window48, datasets }: Props) {
  const [selectedNh, setSelectedNh] = useState<string | null>(null)

  const eventsForBaseline = useMemo(
    () => window48.events.filter((e) => datasets.includes(e.datasetId)),
    [window48.events, datasets]
  )

  const { anomalies, isLoading } = useAnomalyBaseline({
    datasets,
    currentEvents: eventsForBaseline,
  })

  // Combine per-(nh × dataset) z-scores into a single per-nh number,
  // averaged across selected datasets. (Inverse-variance weighting is
  // documented as a future enhancement in the spec.)
  const combined = useMemo(() => {
    const sums: Record<string, { total: number; n: number }> = {}
    for (const a of anomalies) {
      if (!sums[a.neighborhood]) sums[a.neighborhood] = { total: 0, n: 0 }
      sums[a.neighborhood].total += a.zScore
      sums[a.neighborhood].n += 1
    }
    const result: Record<string, number> = {}
    for (const [nh, s] of Object.entries(sums)) {
      result[nh] = s.n > 0 ? s.total / s.n : 0
    }
    return result
  }, [anomalies])

  return (
    <Last48Map
      rail={() => (
        <>
          <AnomalyRail
            combinedAnomalies={combined}
            selectedNeighborhood={selectedNh ?? undefined}
            onSelect={setSelectedNh}
          />
          {/* Positioned absolute against Last48Map's outer flex container — don't add position:relative to AnomalyRail or this peek will reposition. */}
          {selectedNh && (
            <Last48NeighborhoodPeek
              neighborhood={selectedNh}
              anomalies={anomalies.filter((a) => a.neighborhood === selectedNh)}
              events={window48.events.filter((e) => e.neighborhood === selectedNh && datasets.includes(e.datasetId))}
              onClose={() => setSelectedNh(null)}
            />
          )}
        </>
      )}
      mapOverlay={(map) => (
        <>
          <HotspotsChoropleth
            map={map}
            combinedAnomalies={combined}
            onNeighborhoodClick={setSelectedNh}
          />

          {isLoading && (
            <div className="absolute top-3 left-3 font-mono text-[10px] text-paper-500 bg-espresso-900/70 px-2 py-1 rounded">
              computing 12-week baseline…
            </div>
          )}
        </>
      )}
    />
  )
}
