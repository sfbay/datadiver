// src/components/ui/NeighborhoodCensusContext.tsx
// Collapsible sidebar section showing Census stats for a selected neighborhood.

import React, { useState } from 'react'
import type { CensusVariable } from '../../types/census'
import type { NeighborhoodCensusData } from '../../types/census'
import DataSourceLine from './DataSourceLine'

interface NeighborhoodCensusContextProps {
  neighborhood: string
  censusData: NeighborhoodCensusData | undefined
  cityAverages: Partial<Record<CensusVariable, number>> | undefined
  civicCount?: number
  civicLabel?: string  // e.g., "Incidents"
  className?: string
}

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatNumber(value: number): string {
  return value.toLocaleString()
}

// ── Color helpers ─────────────────────────────────────────────────────────

function incomeColor(value: number, cityAvg: number | undefined): string {
  if (cityAvg == null) return 'text-slate-200'
  const ratio = value / cityAvg
  if (ratio < 0.5) return 'text-brick-400'
  if (ratio < 0.7) return 'text-ochre-500'
  return 'text-moss-400'
}

function rentBurdenColor(value: number): string {
  if (value > 50) return 'text-brick-400'
  if (value > 40) return 'text-ochre-500'
  return 'text-slate-200'
}

// ── Comparison bar ────────────────────────────────────────────────────────

interface ComparisonBarProps {
  label: string
  value: number | undefined
  cityAvg: number | undefined
  maxValue: number
  formatFn: (v: number) => string
  higherIsBetter: boolean
}

function ComparisonBar({ label, value, cityAvg, maxValue, formatFn, higherIsBetter }: ComparisonBarProps) {
  if (value == null || cityAvg == null || maxValue <= 0) return null

  const neighborhoodPct = Math.min(100, (value / maxValue) * 100)
  const cityPct = Math.min(100, (cityAvg / maxValue) * 100)

  // Determine bar color: green if above avg and higher is better, or below avg and lower is better
  const aboveAvg = value > cityAvg
  const isGood = higherIsBetter ? aboveAvg : !aboveAvg
  const barColor = isGood ? '#7a9954' : '#d4a435'

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-300 font-mono">{formatFn(value)}</span>
      </div>
      <div className="relative h-2 bg-slate-700/60 rounded-full overflow-hidden">
        {/* Neighborhood fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${neighborhoodPct}%`, backgroundColor: barColor }}
        />
        {/* City average tick */}
        <div
          className="absolute inset-y-0 w-0.5 bg-slate-300/70"
          style={{ left: `${cityPct}%` }}
          title={`City avg: ${formatFn(cityAvg)}`}
        />
      </div>
      <div className="text-[10px] text-slate-500">
        City avg: {formatFn(cityAvg)}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function NeighborhoodCensusContext({
  neighborhood,
  censusData,
  cityAverages,
  civicCount,
  civicLabel = 'Incidents',
  className = '',
}: NeighborhoodCensusContextProps) {
  const [isOpen, setIsOpen] = useState(true)

  return (
    <div className={`${className}`}>
      {/* Section header */}
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-white/5 transition-colors rounded"
      >
        <div className="flex items-center gap-1.5">
          {/* Purple circle icon */}
          <span className="w-2 h-2 rounded-full bg-plum-500 flex-shrink-0" />
          <span className="text-xs font-semibold text-plum-400 uppercase tracking-wide">
            Census Context
          </span>
        </div>
        <svg
          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${isOpen ? '' : '-rotate-90'}`}
          fill="none"
          viewBox="0 0 14 14"
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 space-y-3">
          {censusData == null ? (
            <p className="text-[11px] text-slate-500 italic">No Census data available for {neighborhood}.</p>
          ) : (
            <>
              {/* Population row */}
              <div>
                <div className="text-xl font-bold font-mono text-slate-100 leading-none">
                  {formatNumber(censusData.population)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Population</div>

                {/* Per-capita line — de-emphasized */}
                {civicCount != null && censusData.population > 0 && (
                  <div className="text-[11px] text-slate-500 mt-1">
                    {civicCount.toLocaleString()} {civicLabel} &nbsp;/&nbsp;
                    10K res. ={' '}
                    <span className="font-mono text-slate-400">
                      {((civicCount / censusData.population) * 10_000).toFixed(1)}
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-white/8" />

              {/* Key metrics */}
              <div className="space-y-2">
                {/* Median Income */}
                {censusData.medianIncome != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Median Income</span>
                    <span className={`font-mono font-semibold ${incomeColor(censusData.medianIncome, cityAverages?.medianIncome)}`}>
                      {formatCurrency(censusData.medianIncome)}
                    </span>
                  </div>
                )}

                {/* Rent Burden */}
                {censusData.rentBurden != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Rent Burden</span>
                    <span className={`font-mono font-semibold ${rentBurdenColor(censusData.rentBurden)}`}>
                      {formatPercent(censusData.rentBurden)}
                    </span>
                  </div>
                )}

                {/* LEP Rate */}
                {censusData.lepRate != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">LEP Rate</span>
                    <span className="font-mono text-slate-200">
                      {formatPercent(censusData.lepRate)}
                    </span>
                  </div>
                )}

                {/* Renter % */}
                {censusData.renterPct != null && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Renter %</span>
                    <span className="font-mono text-slate-200">
                      {formatPercent(censusData.renterPct)}
                    </span>
                  </div>
                )}
              </div>

              {/* Comparison bars — only if city averages available */}
              {cityAverages != null && (
                censusData.medianIncome != null || censusData.povertyRate != null
              ) && (
                <>
                  <div className="border-t border-white/8" />
                  <div className="space-y-3">
                    <div className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                      vs. City Average
                    </div>

                    {censusData.medianIncome != null && cityAverages.medianIncome != null && (
                      <ComparisonBar
                        label="Income"
                        value={censusData.medianIncome}
                        cityAvg={cityAverages.medianIncome}
                        maxValue={Math.max(censusData.medianIncome, cityAverages.medianIncome) * 1.2}
                        formatFn={formatCurrency}
                        higherIsBetter={true}
                      />
                    )}

                    {censusData.povertyRate != null && cityAverages.povertyRate != null && (
                      <ComparisonBar
                        label="Poverty"
                        value={censusData.povertyRate}
                        cityAvg={cityAverages.povertyRate}
                        maxValue={Math.max(censusData.povertyRate, cityAverages.povertyRate) * 1.5}
                        formatFn={formatPercent}
                        higherIsBetter={false}
                      />
                    )}
                  </div>
                </>
              )}

              {/* Attribution */}
              <div className="border-t border-white/8 pt-2">
                <DataSourceLine
                  dataset="ACS 5-Year Estimates"
                  source="Census Bureau"
                  vintage="2020-2024"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
