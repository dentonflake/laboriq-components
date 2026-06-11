import { Retool } from '@tryretool/custom-component-support'
import { GridState } from 'ag-grid-enterprise'

export type AdvancedRow = {
  year: number
  month: string
  week: string
  day: string
  hour: string
  date: string
  location: string
  cargoId: number
  paylocityId: string
  status: string
  jobTitle?: string
  employee: string
  supervisor?: string
  supervisorSecond?: string
  supervisorThird?: string
  supervisorFourth?: string
  type: string
  job?: string
  department?: string
  area?: string
  jobType?: string
  hours: number
  points?: number
  actions?: number
  jobActions?: number
  nonJobActions?: number
  totalAssignments?: number
  kioskAssignments?: number
  proactiveAssignments?: number
  reactiveAssignments?: number
}

export type AdvancedInsightsGridProps = {
  rowData: AdvancedRow[]
  gridState: GridState
  agGridLicenseKey?: string
  setState?: (updates: Retool.SerializableObject) => void
}

export type ActionRow = {
  year?: string
  month?: string
  week?: string
  day?: string
  date?: string
  hour?: string
  createdAt?: string
  location?: string
  cargoId?: number
  paylocityId?: string
  status?: string
  jobTitle?: string
  employee?: string
  supervisor?: string
  supervisorSecond?: string
  supervisorThird?: string
  supervisorFourth?: string
  logType?: string
  itemId?: number
  action?: string
  program?: string
  programType?: string
  size?: string
}

export type ActionInsightsGridProps = {
  rowData: ActionRow[]
  gridState: GridState
  agGridLicenseKey?: string
  setState?: (updates: Retool.SerializableObject) => void
}

export type LocationRow = {
  year?: number
  month?: string
  week?: string
  day?: string
  date?: string
  locationId: number
  location: string
  type: string
  jobId?: number
  job?: string
  jobTypeId?: number
  jobType?: string
  laborType?: string
  teamId?: number
  departmentId?: number
  department?: string
  areaId?: number
  area?: string
  supportGoalPointsPerHour?: number
  hours: number
  directHours: number
  supportHours: number
  gapHours: number
  points: number
}

export type LocationInsightsGridProps = {
  rowData: LocationRow[]
  gridState: GridState
  agGridLicenseKey?: string
  setState?: (updates: Retool.SerializableObject) => void
}

// Tall row shape the grid builds internally from `plans` + `programs`.
// AG Grid's pivot mode widens this into the visible spreadsheet layout.
export type InboundPlanRow = {
  programId: number
  program: string
  weekStart: string                   // 'YYYY-MM-DD'
  loadType: 'baseline' | 'backlog'
  loadCount: number
}

// Wide row shape the InboundPlan grid builds for column-group rendering —
// one row per program with dynamic cell fields keyed by week (e.g.
// 'wk-2026-05-18_baseline' / 'wk-2026-05-18_backlog'). The non-cell fields
// (program, source, programProfile) are constant per program and render in
// the pinned-left columns.
export type WideRow = {
  programId: number
  program: string
  source: string
  programProfile: string
  [cellField: string]: number | string
}

// Unified row shape the InboundPlan grid takes — one row per (week × program)
// for programs assigned to the current building. Cells with no plan data come
// through with loadType = null and loadCount = null. Built by the Retool
// transformer from the main SQL query + the BQ programs name lookup.
export type RawInboundRow = {
  weekStart: string | Date
  programId: number
  program: string
  source: string | null              // 'budget' | 'revision' (from locationToPrograms)
  programProfile: string | null      // e.g. 'RC Sortable', 'FC Non-Sort'
  loadType: 'baseline' | 'backlog' | null
  loadCount: number | null
}

export type EditedCell = {
  programId: number
  weekStart: string
  loadType: 'baseline' | 'backlog'
  loadCount: number
}

export type InboundPlanGridProps = {
  rows: RawInboundRow[]
  agGridLicenseKey?: string
}
