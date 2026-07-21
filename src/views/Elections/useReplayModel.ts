import { useMemo } from 'react'
import type { CVRBallotArtifact, RCVContest } from '@/types/elections'
import { decodeBallots } from '@/lib/rcv/ballots'
import { computeReplayRounds } from '@/lib/rcv/replay'
import { tabulate } from '@/lib/rcv/tabulate'

/** decode → tabulate → project, once per race artifact (~30ms for mayor).
 *  The reconciliation test proves tab.contest === the committed rcvData,
 *  so the chart keeps rendering rcvData while the map consumes states. */
export function useReplayModel(artifact: CVRBallotArtifact | null, rcvData: RCVContest | null) {
  return useMemo(() => {
    if (!artifact || !rcvData || artifact.raceId !== rcvData.raceId) return null
    try {
      const ballots = decodeBallots(artifact)
      const tab = tabulate(ballots, { raceId: artifact.raceId, title: artifact.title, candidates: artifact.candidates })
      return { ballots, tab, states: computeReplayRounds(ballots, tab) }
    } catch (err) {
      console.error('[replay] model build failed', err)
      return null
    }
  }, [artifact, rcvData])
}
