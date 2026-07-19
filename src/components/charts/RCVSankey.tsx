/**
 * RCV Sankey Diagram — Vote transfer flow visualization
 *
 * Shows how votes flow from eliminated candidates to remaining ones
 * across RCV rounds. Since the raw data only has per-candidate totals
 * per round (not source→destination mappings), we infer transfers:
 * when a candidate is eliminated, their lost votes are distributed
 * proportionally among candidates who gained votes that round.
 */
import { useMemo, useState } from 'react'
import type { RCVContest, RCVRound } from '@/types/elections'
import { ribbonPath } from './rcvFlow'
import { toSentenceCase } from '@/utils/format'

// Left gutter reserved for round-0 candidate labels — consistent with
// RCVRoundChart's labelWidth idiom. Without this, labels were drawn
// right-anchored at the panel/svg edge with no reserved space and got
// clipped to their last 1-2 letters ("SAUTER" rendered as "R", "JAMIL" as
// "IL" — diagnosed live 2026-07-18). Columns compress to make room; total
// width stays fixed.
const LABEL_GUTTER = 110

interface RCVSankeyProps {
  rcvData: RCVContest
  candidateColors: Map<string, string>
  width?: number
  height?: number
}

interface SankeyNode {
  name: string
  round: number
  x: number
  y: number
  height: number
  color: string
  votes: number
  eliminated: boolean
}

interface SankeyLink {
  source: SankeyNode
  target: SankeyNode
  value: number
  color: string
}

export default function RCVSankey({
  rcvData,
  candidateColors,
  width = 600,
  height = 400,
}: RCVSankeyProps) {
  const [hoveredCandidate, setHoveredCandidate] = useState<string | null>(null)

  const { nodes, links, roundLabels, maxLinkValue, colWidth, gutterLeft } = useMemo(() => {
    const rounds = rcvData.rounds
    if (rounds.length < 2) {
      return { nodes: [], links: [], roundLabels: [], maxLinkValue: 1, colWidth: 0, gutterLeft: 0 }
    }

    // Only show rounds where something meaningful happens (elimination)
    // Limit to 8 rounds max for readability
    const significantRounds: number[] = [0]
    for (let i = 1; i < rounds.length; i++) {
      const hasElimination = rounds[i].candidates.some((c) => c.isEliminated)
      if (hasElimination || i === rounds.length - 1) {
        significantRounds.push(i)
      }
    }
    const displayRounds = significantRounds.slice(0, 8)

    const padding = { top: 20, bottom: 20, left: 10 + LABEL_GUTTER, right: 10 }
    const colWidth = (width - padding.left - padding.right) / displayRounds.length
    const nodeWidth = 12
    const nodeGap = 4
    const maxVotes = Math.max(...rounds[0].candidates.map((c) => c.votes))

    // Build active candidates per display round (exclude eliminated with 0 votes)
    const activePerRound = displayRounds.map((ri) => {
      return rounds[ri].candidates
        .filter((c) => c.votes > 0 || c.isEliminated)
        .sort((a, b) => b.votes - a.votes)
    })

    // Create nodes
    const allNodes: SankeyNode[] = []
    const nodeMap = new Map<string, SankeyNode>() // key: "name|roundIdx"

    for (let di = 0; di < displayRounds.length; di++) {
      const candidates = activePerRound[di]
      const totalHeight = height - padding.top - padding.bottom
      const totalVotesInRound = candidates.reduce((s, c) => s + c.votes, 0)
      let yOffset = padding.top

      for (const c of candidates) {
        const nodeH = Math.max((c.votes / totalVotesInRound) * totalHeight - nodeGap, 2)
        const node: SankeyNode = {
          name: c.name,
          round: di,
          x: padding.left + di * colWidth,
          y: yOffset,
          height: nodeH,
          color: candidateColors.get(c.name) || 'var(--color-slate-500)',
          votes: c.votes,
          eliminated: c.isEliminated,
        }
        allNodes.push(node)
        nodeMap.set(`${c.name}|${di}`, node)
        yOffset += nodeH + nodeGap
      }
    }

    // Add exhausted ballot node at each round
    for (let di = 0; di < displayRounds.length; di++) {
      const ri = displayRounds[di]
      const exhausted = rounds[ri].exhausted
      if (exhausted > 0) {
        const totalVotesInRound = activePerRound[di].reduce((s, c) => s + c.votes, 0) + exhausted
        const totalHeight = height - padding.top - padding.bottom
        const nodeH = Math.max((exhausted / totalVotesInRound) * totalHeight - nodeGap, 2)
        const node: SankeyNode = {
          name: '__exhausted__',
          round: di,
          x: padding.left + di * colWidth,
          y: height - padding.bottom - nodeH,
          height: nodeH,
          color: 'var(--color-paper-500)',
          votes: exhausted,
          eliminated: false,
        }
        allNodes.push(node)
        nodeMap.set(`__exhausted__|${di}`, node)
      }
    }

    // Create links between consecutive display rounds
    const allLinks: SankeyLink[] = []

    for (let di = 0; di < displayRounds.length - 1; di++) {
      const currRoundIdx = displayRounds[di]
      const nextRoundIdx = displayRounds[di + 1]
      const currCandidates = rounds[currRoundIdx].candidates
      const nextCandidates = rounds[nextRoundIdx].candidates

      for (const curr of currCandidates) {
        const sourceNode = nodeMap.get(`${curr.name}|${di}`)
        if (!sourceNode || sourceNode.votes === 0) continue

        // Find this candidate in the next round
        const next = nextCandidates.find((c) => c.name === curr.name)

        if (next && next.votes > 0) {
          // Candidate continues: link from curr to next
          const targetNode = nodeMap.get(`${curr.name}|${di + 1}`)
          if (targetNode) {
            allLinks.push({
              source: sourceNode,
              target: targetNode,
              value: Math.min(curr.votes, next.votes),
              color: sourceNode.color,
            })
          }
        } else {
          // Candidate eliminated or has 0 votes — distribute to gainers
          const gainers = nextCandidates
            .filter((c) => {
              const prevC = currCandidates.find((cc) => cc.name === c.name)
              return prevC && c.votes > prevC.votes
            })
          const totalGain = gainers.reduce((s, c) => {
            const prevC = currCandidates.find((cc) => cc.name === c.name)
            return s + (c.votes - (prevC?.votes || 0))
          }, 0)

          for (const gainer of gainers) {
            const prevC = currCandidates.find((cc) => cc.name === gainer.name)
            const gain = gainer.votes - (prevC?.votes || 0)
            const proportion = totalGain > 0 ? gain / totalGain : 0
            const transferAmount = Math.round(curr.votes * proportion)

            if (transferAmount > 0) {
              const targetNode = nodeMap.get(`${gainer.name}|${di + 1}`)
              if (targetNode) {
                allLinks.push({
                  source: sourceNode,
                  target: targetNode,
                  value: transferAmount,
                  color: sourceNode.color,
                })
              }
            }
          }

          // Exhausted portion
          const exhaustedNode = nodeMap.get(`__exhausted__|${di + 1}`)
          const totalTransferred = allLinks
            .filter((l) => l.source === sourceNode)
            .reduce((s, l) => s + l.value, 0)
          const exhaustedAmount = curr.votes - totalTransferred
          if (exhaustedAmount > 0 && exhaustedNode) {
            allLinks.push({
              source: sourceNode,
              target: exhaustedNode,
              value: exhaustedAmount,
              color: 'var(--color-paper-500)',
            })
          }
        }
      }
    }

    const labels = displayRounds.map((ri) => `R${ri + 1}`)
    const maxLink = Math.max(...allLinks.map((l) => l.value), 1)

    return { nodes: allNodes, links: allLinks, roundLabels: labels, maxLinkValue: maxLink, colWidth, gutterLeft: padding.left }
  }, [rcvData, candidateColors, width, height])

  if (nodes.length === 0) {
    return <p className="text-micro text-slate-500 font-mono">No RCV rounds to visualize</p>
  }

  // Build SVG path for Sankey links (cubic bezier) — shared with
  // RCVRoundChart's per-round flow ribbons via rcvFlow.ts.
  const linkPath = (link: SankeyLink): string =>
    ribbonPath(
      { x: link.source.x + 12, y: link.source.y + link.source.height / 2 },
      { x: link.target.x, y: link.target.y + link.target.height / 2 },
    )

  return (
    <div className="relative" style={{ width }}>
      <svg width={width} height={height}>
        {/* Links */}
        {links.map((link, i) => {
          const isHovered = hoveredCandidate === link.source.name || hoveredCandidate === link.target.name
          const opacity = hoveredCandidate
            ? isHovered ? 0.5 : 0.05
            : 0.25
          return (
            <path
              key={i}
              d={linkPath(link)}
              fill="none"
              stroke={link.color}
              strokeWidth={Math.max((link.value / maxLinkValue) * 20, 1)}
              strokeOpacity={opacity}
              style={{ transition: 'stroke-opacity 0.2s' }}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const isHovered = hoveredCandidate === node.name
          const dimmed = hoveredCandidate && !isHovered
          return (
            <g
              key={i}
              onMouseEnter={() => node.name !== '__exhausted__' && setHoveredCandidate(node.name)}
              onMouseLeave={() => setHoveredCandidate(null)}
              style={{ cursor: node.name !== '__exhausted__' ? 'pointer' : 'default' }}
            >
              <rect
                x={node.x}
                y={node.y}
                width={12}
                height={node.height}
                rx={2}
                fill={node.color}
                opacity={dimmed ? 0.2 : node.eliminated ? 0.4 : 0.9}
                style={{ transition: 'opacity 0.2s' }}
              />
              {/* Label on first round */}
              {node.round === 0 && node.name !== '__exhausted__' && node.height > 12 && (
                <text
                  x={node.x - 4}
                  y={node.y + node.height / 2}
                  textAnchor="end"
                  fill={dimmed ? 'var(--color-slate-700)' : 'var(--color-slate-400)'}
                  fontSize={9}
                  fontFamily="Inter, system-ui, sans-serif"
                  dominantBaseline="middle"
                  style={{ transition: 'fill 0.2s' }}
                >
                  {toSentenceCase(node.name.split(' ').pop() || node.name)}
                </text>
              )}
            </g>
          )
        })}

        {/* Round labels — share the SAME padding/colWidth the node columns
            use (previously recomputed with a stale hardcoded 20px total
            padding that predates the label gutter and ignored it). */}
        {roundLabels.map((label, i) => (
          <text
            key={label}
            x={gutterLeft + i * colWidth + 6}
            y={12}
            fill="var(--color-slate-500)"
            fontSize={9}
            fontFamily="var(--font-mono)"
          >
            {label}
          </text>
        ))}
      </svg>

      {/* Hovered candidate info */}
      {hoveredCandidate && (
        <div className="absolute top-2 right-2 glass-card rounded-lg px-3 py-2 text-micro font-mono">
          <span style={{ color: candidateColors.get(hoveredCandidate) || 'var(--color-slate-400)' }}>
            {hoveredCandidate}
          </span>
        </div>
      )}
    </div>
  )
}
