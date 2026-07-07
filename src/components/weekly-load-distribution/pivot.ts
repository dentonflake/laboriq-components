// Pure pivot + formatting config for the Weekly Load Distribution grid.
// Deliberately free of AG Grid / Retool imports so it stays unit-testable in
// isolation (same reasoning as inbound-planning-model/pivot.ts).

import {
  LoadDistributionLocation,
  LoadDistributionMetric,
  LoadDistributionPivotResult,
  LoadDistributionWideRow,
  RawLoadDistributionRow
} from '../../utils/types'

export const toNumber = (value: unknown) => Number(value) || 0

export const locationFieldFor = (locationId: number) => `loc-${locationId}`

// Single parameterized accessor per metric: where the cell value comes from
// and how to format it. Adding units/revenue later means the transformer
// starts sending those fields — nothing in the pivot or grid restructures.
export const METRICS: Record<LoadDistributionMetric, {
  valueOf: (row: RawLoadDistributionRow) => number | null
  format: (value: number) => string
}> = {
  loads: {
    valueOf: row => row.totalPlan ?? null,
    format: value => Math.round(value).toLocaleString('en-US')
  },
  units: {
    valueOf: row => row.units ?? null,
    format: value => Math.round(value).toLocaleString('en-US')
  },
  revenue: {
    valueOf: row => row.revenue ?? null,
    // Whole dollars — planning values, not accounting ones.
    format: value => value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    })
  }
}

export const normalizeMetric = (metric: string | undefined): LoadDistributionMetric =>
  metric === 'units' || metric === 'revenue' ? metric : 'loads'

// Locations order: explicit sortOrder first (when the lookup provides one),
// then id, then name — stable across data refreshes, never hardcoded.
const compareLocations = (a: LoadDistributionLocation, b: LoadDistributionLocation) => {
  if (a.sortOrder != null && b.sortOrder == null) return -1
  if (a.sortOrder == null && b.sortOrder != null) return 1
  if (a.sortOrder != null && b.sortOrder != null && a.sortOrder !== b.sortOrder) {
    return a.sortOrder - b.sortOrder
  }
  if (a.id !== b.id) return a.id - b.id
  return a.name.localeCompare(b.name)
}

// Pivot long-format program-location rows to wide: one row per program, one
// 'loc-{id}' field per distinct location in the data, plus per-program grand
// totals and a column-totals row. Missing (program × location) combos stay
// null — rendered blank, counted as 0 in every total. Duplicate combos are
// summed defensively.
export const pivotLoadDistribution = (
  rows: RawLoadDistributionRow[],
  metric: LoadDistributionMetric = 'loads'
): LoadDistributionPivotResult => {

  const { valueOf } = METRICS[metric]

  type ProgramFields = Pick<
    LoadDistributionWideRow,
    'programId' | 'program' | 'programProfile'
  >

  const locationById = new Map<number, LoadDistributionLocation>()
  const programById = new Map<number, ProgramFields>()
  const valueByCell = new Map<string, number>()
  let hasProfiles = false

  for (const row of rows) {
    const programId = row.program?.id
    const locationId = row.location?.id
    if (programId == null || locationId == null) continue

    if (!locationById.has(locationId)) {
      locationById.set(locationId, {
        id: locationId,
        name: row.location?.name ?? `Location ${locationId}`,
        sortOrder: row.location?.sortOrder ?? null
      })
    }

    if (!programById.has(programId)) {
      programById.set(programId, {
        programId,
        program: row.program?.name ?? `Program ${programId}`,
        programProfile: row.program?.programProfile ?? ''
      })
    }
    if (row.program?.programProfile) hasProfiles = true

    const value = valueOf(row)
    if (value != null) {
      const cellKey = `${programId}|${locationId}`
      valueByCell.set(cellKey, (valueByCell.get(cellKey) ?? 0) + toNumber(value))
    }
  }

  const locations = [...locationById.values()].sort(compareLocations)

  const rowData = [...programById.values()]
    .sort((a, b) => a.program.localeCompare(b.program))
    .map(programFields => {
      const wide: LoadDistributionWideRow = { ...programFields, grandTotal: 0 }
      let grandTotal = 0
      for (const location of locations) {
        const value = valueByCell.get(`${programFields.programId}|${location.id}`) ?? null
        wide[locationFieldFor(location.id)] = value
        grandTotal += value ?? 0
      }
      wide.grandTotal = grandTotal
      return wide
    })

  let totalsRow: LoadDistributionWideRow | null = null
  if (rowData.length > 0) {
    totalsRow = {
      programId: 0,
      program: 'Total',
      programProfile: '',
      grandTotal: rowData.reduce((sum, row) => sum + row.grandTotal, 0)
    }
    for (const location of locations) {
      const cellField = locationFieldFor(location.id)
      totalsRow[cellField] = rowData.reduce(
        (sum, row) => sum + toNumber(row[cellField]),
        0
      )
    }
  }

  return { rowData, locations, totalsRow, hasProfiles }
}
