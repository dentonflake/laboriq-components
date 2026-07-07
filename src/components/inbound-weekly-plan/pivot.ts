// Pure pivot + week math for the Inbound Weekly Plan grid. Deliberately
// free of AG Grid / Retool imports so it stays unit-testable in isolation
// (utils/helpers.ts pulls in AG Grid modules at the top, which is why these
// helpers live here instead).

import {
  RawWeeklyPlanRow,
  WeeklyPlanCellMeta,
  WeeklyPlanPivotResult,
  WeeklyPlanWeek,
  WeeklyPlanWideRow
} from '../../utils/types'

export const PLAN_FIELDS = ['baseline', 'backlog'] as const

const MS_PER_DAY = 86_400_000

export const toNumber = (value: unknown) => Number(value) || 0

// Normalize an ISO effectiveDate ('2026-07-06T00:00:00.000Z') to its date part.
export const weekKeyOf = (effectiveDate: string) => String(effectiveDate).slice(0, 10)

// Cell field naming: 'wk-YYYY-MM-DD_{suffix}' — same scheme as inbound-plan.
export const cellFieldFor = (weekKey: string, suffix: string) =>
  `wk-${weekKey}_${suffix}`

// Only matches the editable suffixes — the edit handler ignores everything else.
export const parseCellField = (field: string) => {
  const match = /^wk-(\d{4}-\d{2}-\d{2})_(baseline|backlog)$/.exec(field)
  if (!match) return null
  return { weekKey: match[1], field: match[2] as 'baseline' | 'backlog' }
}

export const cellMetaKeyFor = (programId: number, weekKey: string) =>
  `${programId}|${weekKey}`

const utcEpochOf = (weekKey: string) => Date.parse(`${weekKey}T00:00:00Z`)

const addDays = (weekKey: string, days: number) =>
  new Date(utcEpochOf(weekKey) + days * MS_PER_DAY).toISOString().slice(0, 10)

// ISO 8601 week number — weeks start Monday, week 1 contains the first
// Thursday of the year (handles year-boundary weeks correctly).
export const isoWeekNumber = (weekKey: string) => {
  const date = new Date(utcEpochOf(weekKey))
  const dayOfWeek = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayOfWeek)
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1)
  return Math.ceil(((date.getTime() - yearStart) / MS_PER_DAY + 1) / 7)
}

export const formatWeekGroupHeader = (weekKey: string) => {
  const [year, month, day] = weekKey.split('-').map(Number)
  return `Wk ${isoWeekNumber(weekKey)} · ${month}/${day}/${year}`
}

// ISO date keys compare correctly as strings, so week membership is plain
// string comparison against the week's start and end dates.
export const isPastWeek = (weekKey: string, todayKey: string) =>
  addDays(weekKey, 6) < todayKey

export const isCurrentWeek = (weekKey: string, todayKey: string) =>
  weekKey <= todayKey && todayKey <= addDays(weekKey, 6)

// Pivot long-format program-week rows to wide: one row per program, with
// 'wk-*' cell fields for every distinct week in the data. Weeks are derived
// from the data, never hardcoded. Cells the data doesn't mention default to 0.
export const pivotWeeklyPlanRows = (
  rows: RawWeeklyPlanRow[]
): WeeklyPlanPivotResult => {

  type ProgramFields = Pick<
    WeeklyPlanWideRow,
    'programId' | 'locationId' | 'program' | 'programProfile'
  >

  const weekKeySet = new Set<string>()
  const programById = new Map<number, ProgramFields>()
  const cellMeta = new Map<string, WeeklyPlanCellMeta>()
  const valuesByCell = new Map<
    string,
    { baseline: number, backlog: number }
  >()

  for (const row of rows) {
    const programId = row.program?.id
    if (programId == null || !row.effectiveDate) continue

    const weekKey = weekKeyOf(row.effectiveDate)
    weekKeySet.add(weekKey)

    if (!programById.has(programId)) {
      programById.set(programId, {
        programId,
        locationId: row.location?.id ?? 0,
        program: row.program?.name ?? `Program ${programId}`,
        programProfile: row.program?.programProfile ?? ''
      })
    }

    const metaKey = cellMetaKeyFor(programId, weekKey)
    cellMeta.set(metaKey, {
      rowKey: row.id,
      effectiveDate: String(row.effectiveDate),
      baseline: row.baseline ?? null
    })
    valuesByCell.set(metaKey, {
      baseline: row.baseline ?? 0,
      backlog: row.backlog ?? 0
    })
  }

  const weeks: WeeklyPlanWeek[] = [...weekKeySet].sort().map(key => ({
    key,
    header: formatWeekGroupHeader(key)
  }))

  const rowData = [...programById.values()]
    .sort((a, b) => a.program.localeCompare(b.program))
    .map(programFields => {
      const wide: WeeklyPlanWideRow = { ...programFields }
      for (const week of weeks) {
        const values = valuesByCell.get(
          cellMetaKeyFor(programFields.programId, week.key)
        )
        wide[cellFieldFor(week.key, 'baseline')] = values?.baseline ?? 0
        wide[cellFieldFor(week.key, 'backlog')] = values?.backlog ?? 0
      }
      return wide
    })

  return { rowData, weeks, cellMeta }
}

// Pinned-bottom totals row — sums every numeric week cell across programs.
// Total Plan is a valueGetter, so it computes itself for this row from the
// summed baseline + backlog fields.
export const buildTotalsRow = (
  rowData: WeeklyPlanWideRow[],
  weeks: WeeklyPlanWeek[]
): WeeklyPlanWideRow => {

  const totals: WeeklyPlanWideRow = {
    programId: 0,
    locationId: 0,
    program: 'Total',
    programProfile: ''
  }

  for (const week of weeks) {
    for (const suffix of PLAN_FIELDS) {
      const cellField = cellFieldFor(week.key, suffix)
      totals[cellField] = rowData.reduce(
        (sum, row) => sum + toNumber(row[cellField]),
        0
      )
    }
  }

  return totals
}
