/**
 * BallotMeasureExplorer — browse ballot propositions by topic and era
 *
 * Shows all SF ballot measures with pass/fail status, yes % bars,
 * and topic filtering. Integrated into Elections sidebar.
 */
import { useMemo, useState } from 'react'
import type { BallotProposition } from '@/types/elections'

interface BallotMeasureExplorerProps {
  measures: BallotProposition[]
}

// Topic categories (approximate — based on common SF measure themes)
const TOPICS: Record<string, string[]> = {
  Housing: ['housing', 'rent', 'tenant', 'eviction', 'afford', 'building', 'development'],
  Transit: ['transit', 'muni', 'transportation', 'bike', 'parking', 'traffic', 'bart', 'street'],
  Taxes: ['tax', 'bond', 'revenue', 'fee', 'assessment', 'budget'],
  Safety: ['police', 'fire', 'safety', 'crime', 'gun', 'emergency'],
  Labor: ['wage', 'worker', 'employee', 'labor', 'sick leave', 'health'],
  Elections: ['election', 'voting', 'campaign', 'recall', 'ranked'],
}

function categorizeMeasure(title: string): string {
  const lower = title.toLowerCase()
  for (const [topic, keywords] of Object.entries(TOPICS)) {
    if (keywords.some((kw) => lower.includes(kw))) return topic
  }
  return 'Other'
}

export default function BallotMeasureExplorer({ measures }: BallotMeasureExplorerProps) {
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null)
  const [selectedDecade, setSelectedDecade] = useState<string | null>(null)

  // Categorize all measures
  const categorized = useMemo(() => {
    return measures.map((m) => ({
      ...m,
      topic: categorizeMeasure(m.title),
      decade: `${Math.floor(new Date(m.date).getFullYear() / 10) * 10}s`,
    }))
  }, [measures])

  // Available topics and decades
  const topics = useMemo(() => {
    const topicCounts = new Map<string, number>()
    for (const m of categorized) {
      topicCounts.set(m.topic, (topicCounts.get(m.topic) || 0) + 1)
    }
    return Array.from(topicCounts.entries())
      .sort((a, b) => b[1] - a[1])
  }, [categorized])

  const decades = useMemo(() => {
    const ds = new Set(categorized.map((m) => m.decade))
    return Array.from(ds).sort().reverse()
  }, [categorized])

  // Filtered measures
  const filtered = useMemo(() => {
    let result = categorized
    if (selectedTopic) result = result.filter((m) => m.topic === selectedTopic)
    if (selectedDecade) result = result.filter((m) => m.decade === selectedDecade)
    return result.sort((a, b) => b.date.localeCompare(a.date))
  }, [categorized, selectedTopic, selectedDecade])

  // Summary stats
  const passRate = filtered.length > 0
    ? (filtered.filter((m) => m.passed).length / filtered.length * 100).toFixed(0)
    : '0'

  return (
    <div>
      {/* Summary */}
      <div className="flex items-center gap-3 mb-3">
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
          {filtered.length} Measures
        </p>
        <span className="text-[9px] font-mono text-emerald-500">
          {passRate}% passed
        </span>
      </div>

      {/* Topic filter pills */}
      <div className="flex flex-wrap gap-1 mb-3">
        <button
          onClick={() => setSelectedTopic(null)}
          className={`px-2 py-0.5 rounded-full text-[9px] font-mono transition-all ${
            !selectedTopic
              ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
              : 'text-slate-500 hover:text-slate-300 border border-transparent'
          }`}
        >
          All
        </button>
        {topics.map(([topic, count]) => (
          <button
            key={topic}
            onClick={() => setSelectedTopic(selectedTopic === topic ? null : topic)}
            className={`px-2 py-0.5 rounded-full text-[9px] font-mono transition-all ${
              selectedTopic === topic
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300 border border-transparent'
            }`}
          >
            {topic} ({count})
          </button>
        ))}
      </div>

      {/* Decade filter */}
      <div className="flex gap-1 mb-4">
        {decades.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDecade(selectedDecade === d ? null : d)}
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono transition-all ${
              selectedDecade === d
                ? 'bg-indigo-500/20 text-indigo-400'
                : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {d}
          </button>
        ))}
      </div>

      {/* Measures list */}
      <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
        {filtered.slice(0, 200).map((m, i) => {
          const year = new Date(m.date).getFullYear()
          return (
            <div
              key={`${m.date}-${m.letter}-${i}`}
              className="group py-1.5 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                  m.passed
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}>
                  {m.passed ? 'PASS' : 'FAIL'}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{year}</span>
                <span className="text-[10px] font-mono text-indigo-400">{m.letter}</span>
              </div>
              <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 leading-tight">
                {m.title}
              </p>
              {/* Yes % bar */}
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${m.yesPct * 100}%`,
                      backgroundColor: m.passed ? '#10b981' : '#ef4444',
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono text-slate-500 tabular-nums">
                  {(m.yesPct * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          )
        })}
        {filtered.length > 200 && (
          <p className="text-[9px] font-mono text-slate-500 text-center py-2">
            Showing 200 of {filtered.length} measures
          </p>
        )}
      </div>
    </div>
  )
}
