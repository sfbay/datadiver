import { useState, useEffect } from 'react'
import { fetchDataset } from '@/api/client'
import type { DispatchCall } from '@/types/datasets'

interface DispatchCrossRefResult {
  dispatch: DispatchCall | null
  isLoading: boolean
  error: string | null
}

/**
 * Fetches a 911 dispatch record by CAD number for cross-referencing
 * with police incident reports. Only fetches when cadNumber is non-null.
 */
export function useDispatchCrossRef(cadNumber: string | null): DispatchCrossRefResult {
  const [dispatch, setDispatch] = useState<DispatchCall | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cadNumber) {
      setDispatch(null)
      setError(null)
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError(null)

    fetchDataset<DispatchCall>('dispatch911Historical', {
      $where: `cad_number = '${cadNumber}'`,
      $limit: 1,
    })
      .then((records) => {
        if (!cancelled) {
          setDispatch(records.length > 0 ? records[0] : null)
          if (records.length === 0) setError('No matching dispatch record')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setDispatch(null)
          setError(err instanceof Error ? err.message : 'Failed to fetch dispatch data')
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [cadNumber])

  return { dispatch, isLoading, error }
}
