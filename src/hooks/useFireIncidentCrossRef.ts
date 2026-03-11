import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import type { FireIncident } from '@/types/datasets'

interface FireIncidentCrossRefResult {
  fireIncident: FireIncident | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches a Fire Incident record by call_number for cross-referencing
 * with Fire/EMS dispatch records. Only fetches when callNumber is non-null.
 * Dataset: wr8u-xric (Fire Incidents)
 */
export function useFireIncidentCrossRef(callNumber: string | null): FireIncidentCrossRefResult {
  const [fireIncident, setFireIncident] = useState<FireIncident | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!callNumber) {
      setFireIncident(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchDataset<FireIncident>('fireIncidents', {
      $where: `call_number = '${callNumber}'`,
      $limit: 1,
    })
      .then((records) => {
        if (!cancelled) {
          setFireIncident(records.length > 0 ? records[0] : null)
          if (records.length === 0) setError('No matching fire incident record')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFireIncident(null)
          setError(err instanceof Error ? err.message : 'Failed to fetch fire incident data')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [callNumber])

  return { fireIncident, isLoading, error }
}
