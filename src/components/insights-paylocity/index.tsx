
import React, { useMemo, useRef, useState } from 'react'
import { Retool } from '@tryretool/custom-component-support'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import {
  ComposedChart, Line, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { AgGridReact } from 'ag-grid-react'
import type { ColDef } from 'ag-grid-community'
import { themeQuartz } from 'ag-grid-community'
import { ensureAgGridInitialized } from '../../utils/helpers'

// ── Types ─────────────────────────────────────────────────────────────────────

type RunStatus = 'running' | 'success' | 'failure'

type StageName =
  | 'employee-punch-details-v2'
  | 'employee-punch-details-v1'
  | 'actions-sync'

type StageStatus = 'success' | 'failure' | null

type StageMetadata = {
  failedPunchIds?: string[]
  durationSeconds?: number
  upsertedPunchCount?: number
  softDeletedPunchCount?: number
  emptyCompanyIds?: string[]
  failedCompanyIds?: string[]
  badPaylocityCostCenterNames?: string[]
  gapCount?: number
  punchCount?: number
  assignmentCount?: number
  deletedIndirectCount?: number
  locations?: Array<{
    locationId: number
    result: {
      gapCount: number
      punchCount: number
      assignmentCount: number
      durationSeconds: number
      deletedIndirectCount: number
    }
  }>
}

type RawRow = {
  workflowRunId: string
  runStatus: RunStatus
  startedAt: string
  completedAt: string | null
  runDurationSeconds: number | null
  stage: StageName | null
  stageStatus: StageStatus
  message: string | null
  metadata: StageMetadata | string | null
  stageCreatedAt: string | null
}

type StageDetail = {
  status: StageStatus
  durationSeconds: number | null
  createdAt: string | null
  message: string | null
  metadata: StageMetadata | null
}

type RunPoint = {
  runId: string
  startedAtRaw: number
  label: string

  duration: number
  runStatus: RunStatus

  employeeV2: number
  employeeV1: number
  actionsSync: number
  inProgress: number

  employeeV2Status: StageStatus
  employeeV1Status: StageStatus
  actionsSyncStatus: StageStatus

  primarySource: string | null

  upserted: number
  softDeleted: number
  failedPunches: number
  emptyCompanies: number
  failedCompanies: number
  badCostCenters: number

  actionsPunches: number
  actionsGaps: number
  actionsAssignments: number
  actionsIndirectDeleted: number

  stageDetails: {
    employeeV2:  StageDetail
    employeeV1:  StageDetail
    actionsSync: StageDetail
  }
}


// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = {
  success: '#16A34A',
  failure: '#DC2626',
  running: '#1D4ED8',
  total:   '#0F172A',
  bg:      '#FBFBFC',
  muted:   '#9b9a94',
  text:    '#1a1a1a',
  border:  'rgba(0,0,0,0.06)',
}

const STAGE_LABEL: Record<StageName, string> = {
  'employee-punch-details-v2': 'Employee Punch v2',
  'employee-punch-details-v1': 'Employee Punch v1',
  'actions-sync':              'Actions-Sync',
}

const STAGE_COLOR: Record<StageName, string> = {
  'employee-punch-details-v2': '#334155',
  'employee-punch-details-v1': '#94A3B8',
  'actions-sync':              '#0D9488',
}

type StageLineDef = {
  stage: StageName
  durationKey: 'employeeV2' | 'employeeV1' | 'actionsSync'
  statusKey:   'employeeV2Status' | 'employeeV1Status' | 'actionsSyncStatus'
}

const STAGE_LINES: StageLineDef[] = [
  { stage: 'employee-punch-details-v2', durationKey: 'employeeV2',  statusKey: 'employeeV2Status'  },
  { stage: 'employee-punch-details-v1', durationKey: 'employeeV1',  statusKey: 'employeeV1Status'  },
  { stage: 'actions-sync',              durationKey: 'actionsSync', statusKey: 'actionsSyncStatus' },
]

const PUNCH_STAGES: StageName[] = [
  'employee-punch-details-v2',
  'employee-punch-details-v1',
]
const ALL_STAGES: StageName[] = [...PUNCH_STAGES, 'actions-sync']

const SHADOW = '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)'

// ── Helpers ───────────────────────────────────────────────────────────────────

const parseMetadata = (raw: StageMetadata | string | null | undefined): StageMetadata | null => {
  if (raw == null) return null
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) as StageMetadata } catch { return null }
}

const fmtDuration = (sec: number | null | undefined) => {
  if (sec == null || isNaN(sec)) return '—'
  if (sec < 60) return `${Math.round(sec)}s`
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return s ? `${m}m ${s}s` : `${m}m`
}

// Parses 'YYYY-MM-DD HH:MM:SS' or ISO without applying the browser's timezone —
// the SQL is responsible for emitting the string in the desired local zone.
const parseDateParts = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/)
  if (!m) return null
  return { y: +m[1], mo: +m[2], d: +m[3], h: +m[4], mi: +m[5], s: +m[6] }
}

const fmtDateTime = (s: string) => {
  const p = parseDateParts(s)
  if (!p) return s
  const ampm = p.h >= 12 ? 'pm' : 'am'
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12
  return `${p.mo}/${p.d} ${h12}:${String(p.mi).padStart(2, '0')}${ampm}`
}

const toEpoch = (s: string) => {
  const p = parseDateParts(s)
  if (!p) return 0
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s)
}

const actionsTotals = (md: StageMetadata | null) => {
  if (!md) return { gapCount: 0, punchCount: 0, assignmentCount: 0, deletedIndirect: 0, durationSeconds: 0 }
  if (Array.isArray(md.locations)) {
    return md.locations.reduce(
      (acc, l) => ({
        gapCount:        acc.gapCount        + (l.result?.gapCount             ?? 0),
        punchCount:      acc.punchCount      + (l.result?.punchCount           ?? 0),
        assignmentCount: acc.assignmentCount + (l.result?.assignmentCount      ?? 0),
        deletedIndirect: acc.deletedIndirect + (l.result?.deletedIndirectCount ?? 0),
        durationSeconds: acc.durationSeconds + (l.result?.durationSeconds      ?? 0),
      }),
      { gapCount: 0, punchCount: 0, assignmentCount: 0, deletedIndirect: 0, durationSeconds: 0 },
    )
  }
  return {
    gapCount:        md.gapCount             ?? 0,
    punchCount:      md.punchCount           ?? 0,
    assignmentCount: md.assignmentCount      ?? 0,
    deletedIndirect: md.deletedIndirectCount ?? 0,
    durationSeconds: md.durationSeconds      ?? 0,
  }
}

// ── Custom dot for the total line ─────────────────────────────────────────────

type DotProps = {
  cx?: number
  cy?: number
  payload?: RunPoint
  r?: number
}

const StatusText = ({ status }: { status: 'success' | 'failure' | 'running' | null }) => {
  if (status == null) return <span style={{ color: '#cbd5e1', fontSize: 13 }}>—</span>
  const map = {
    success: { fg: COLORS.success, label: 'Success' },
    failure: { fg: COLORS.failure, label: 'Failed'  },
    running: { fg: COLORS.running, label: 'Running' },
  } as const
  const c = map[status]
  return <span style={{ color: c.fg, fontSize: 12, fontWeight: 600 }}>{c.label}</span>
}

const StatusDot = ({ cx, cy, payload, r = 5 }: DotProps) => {
  if (cx == null || cy == null || !payload) return null
  const fill = payload.runStatus === 'success' ? COLORS.success
             : payload.runStatus === 'failure' ? COLORS.failure
             : COLORS.running
  return <circle cx={cx} cy={cy} r={r} fill={fill} stroke="#fff" strokeWidth={1.5} />
}

const ActiveStatusDot = (props: DotProps) => <StatusDot {...props} r={7} />

// ── Tooltip ───────────────────────────────────────────────────────────────────

const TipKV = ({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
    <span style={{ color: COLORS.muted }}>{label}</span>
    <span style={{ color: color ?? COLORS.text, fontWeight: 500, textAlign: 'right' }}>{value}</span>
  </div>
)

const TipSection = ({ title }: { title: string }) => (
  <div style={{ fontSize: 10, fontWeight: 600, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 10, marginBottom: 6 }}>
    {title}
  </div>
)

const RunTooltip = ({ active, payload }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as RunPoint

  const statusFg    = d.runStatus === 'success' ? COLORS.success : d.runStatus === 'failure' ? COLORS.failure : COLORS.running
  const statusLabel = d.runStatus === 'success' ? 'Success'      : d.runStatus === 'failure' ? 'Failed'       : 'Running'

  return (
    <div style={{
      background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
      borderRadius: 10, padding: '14px 16px', fontSize: 12, minWidth: 300, maxWidth: 360, boxShadow: SHADOW,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{d.label}</span>
        <span style={{ color: statusFg, fontSize: 12, fontWeight: 600 }}>{statusLabel}</span>
      </div>

      <TipKV label="Total duration" value={fmtDuration(d.duration)} />
      <TipKV label="Primary source" value={d.primarySource ?? '—'} />

      <TipSection title="Stages" />
      {STAGE_LINES.map(({ stage, durationKey, statusKey }) => {
        const status   = d[statusKey] as StageStatus
        const duration = d[durationKey] as number
        const fg = status === 'failure' ? COLORS.failure : status === 'success' ? COLORS.text : COLORS.muted
        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 10, height: 2, borderRadius: 1,
                background: STAGE_COLOR[stage],
                opacity: status == null ? 0.25 : 1,
              }} />
              <span style={{ color: status == null ? COLORS.muted : COLORS.text }}>{STAGE_LABEL[stage]}</span>
            </span>
            <span style={{ display: 'flex', gap: 8, alignItems: 'baseline', color: fg }}>
              <span style={{ fontSize: 10, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {status === 'success' ? 'ok' : status === 'failure' ? 'failed' : 'skipped'}
              </span>
              <span style={{ fontWeight: 500 }}>{status == null ? '—' : fmtDuration(duration)}</span>
            </span>
          </div>
        )
      })}

      <TipSection title="Punches" />
      <TipKV label="Upserted punches"  value={d.upserted.toLocaleString()} />
      <TipKV label="Soft deleted"      value={d.softDeleted.toLocaleString()} />
      <TipKV label="Failed punches"    value={d.failedPunches}    color={d.failedPunches    > 0 ? COLORS.failure : undefined} />
      <TipKV label="Empty companies"   value={d.emptyCompanies} />
      <TipKV label="Failed companies"  value={d.failedCompanies}  color={d.failedCompanies  > 0 ? COLORS.failure : undefined} />
      <TipKV label="Bad cost centers"  value={d.badCostCenters}   color={d.badCostCenters   > 0 ? COLORS.failure : undefined} />

      <TipSection title="Actions-Sync" />
      <TipKV label="Punches"           value={d.actionsPunches.toLocaleString()} />
      <TipKV label="Gaps"              value={d.actionsGaps.toLocaleString()} />
      <TipKV label="Assignments"       value={d.actionsAssignments.toLocaleString()} />
      <TipKV label="Indirect deleted"  value={d.actionsIndirectDeleted} />
    </div>
  )
}

// ── Runs grid ─────────────────────────────────────────────────────────────────

const statusCellRenderer = (params: { value: 'success' | 'failure' | 'running' | null }) => (
  <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
    <StatusText status={params.value} />
  </div>
)

const stageStatusCellRenderer = (params: { value: 'success' | 'failure' | null }) => {
  if (params.value == null) {
    return <div style={{ display: 'flex', alignItems: 'center', height: '100%', color: '#cbd5e1', fontSize: 13 }}>—</div>
  }
  const fg = params.value === 'success' ? COLORS.success : COLORS.failure
  const label = params.value === 'success' ? 'OK' : 'Failed'
  return (
    <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
      <span style={{ color: fg, fontSize: 12, fontWeight: 600 }}>{label}</span>
    </div>
  )
}

const fmtDurationCell = (p: { value: unknown }) => {
  const n = p.value as number | null | undefined
  return n == null || n === 0 ? '—' : fmtDuration(n)
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Reconstructs the original local-time digits from the epoch produced by toEpoch().
// Format: "May 6, 2026 3:34:52 PM"
const fmtStartedFromEpoch = (epoch: number) => {
  const x = new Date(epoch)
  const mo  = MONTHS_SHORT[x.getUTCMonth()]
  const d   = x.getUTCDate()
  const y   = x.getUTCFullYear()
  const h   = x.getUTCHours()
  const mi  = String(x.getUTCMinutes()).padStart(2, '0')
  const s   = String(x.getUTCSeconds()).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${mo} ${d}, ${y} ${h12}:${mi}:${s} ${ampm}`
}

const runColDefs: ColDef<RunPoint>[] = [
  { headerName: '', cellRenderer: 'agGroupCellRenderer', width: 56, pinned: 'left',
    sortable: false, filter: false, resizable: false, suppressMovable: true },
  { field: 'startedAtRaw', headerName: 'Started', pinned: 'left', sort: 'desc', sortIndex: 0, width: 250,
    valueFormatter: p => fmtStartedFromEpoch(p.value as number) },
  { field: 'runStatus',         headerName: 'Status',                      cellRenderer: statusCellRenderer,      width: 120 },
  { field: 'duration',          headerName: 'Duration',                    valueFormatter: fmtDurationCell,       width: 140 },
  { field: 'employeeV2Status',  headerName: 'Employee Punch v2: Status',   cellRenderer: stageStatusCellRenderer, width: 230 },
  { field: 'employeeV2',        headerName: 'Employee Punch v2: Duration', valueFormatter: fmtDurationCell,       width: 250 },
  { field: 'employeeV1Status',  headerName: 'Employee Punch v1: Status',   cellRenderer: stageStatusCellRenderer, width: 230 },
  { field: 'employeeV1',        headerName: 'Employee Punch v1: Duration', valueFormatter: fmtDurationCell,       width: 250 },
  { field: 'actionsSyncStatus', headerName: 'Actions-Sync: Status',        cellRenderer: stageStatusCellRenderer, width: 190 },
  { field: 'actionsSync',       headerName: 'Actions-Sync: Duration',      valueFormatter: fmtDurationCell,       width: 210 },
]

// ── Master/detail expanded panel ─────────────────────────────────────────────

const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
    {children}
  </div>
)

const DetailRow = ({ label, value, list, error }: {
  label: string
  value: React.ReactNode
  list?: string[]
  error?: boolean
}) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: COLORS.muted, fontSize: 12 }}>{label}</span>
      <span style={{ fontWeight: 500, fontSize: 12, color: error ? COLORS.failure : COLORS.text, textAlign: 'right' }}>
        {value}
      </span>
    </div>
    {list && list.length > 0 && (
      <ul style={{
        margin: '6px 0 0 0', padding: '8px 12px', listStyle: 'none',
        background: '#F9FAFB', borderRadius: 6,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 11, color: COLORS.text, lineHeight: 1.6,
      }}>
        {list.map((item, i) => <li key={i} style={{ wordBreak: 'break-all' }}>{item}</li>)}
      </ul>
    )}
  </div>
)

const PunchStageDetail = ({ detail }: { detail: StageDetail }) => {
  const md = detail.metadata
  const upserted    = md?.upsertedPunchCount             ?? 0
  const softDeleted = md?.softDeletedPunchCount          ?? 0
  const failed      = md?.failedPunchIds                 ?? []
  const emptyCos    = md?.emptyCompanyIds                ?? []
  const failedCos   = md?.failedCompanyIds               ?? []
  const badCCs      = md?.badPaylocityCostCenterNames    ?? []
  return (
    <div>
      <DetailRow label="Created at"         value={detail.createdAt ?? '—'} />
      <DetailRow label="Upserted punches"   value={upserted.toLocaleString()} />
      <DetailRow label="Soft deleted"       value={softDeleted.toLocaleString()} />
      <DetailRow label="Failed punches"     value={failed.length}    list={failed}   error={failed.length > 0} />
      <DetailRow label="Empty companies"    value={emptyCos.length}  list={emptyCos} />
      <DetailRow label="Failed companies"   value={failedCos.length} list={failedCos} error={failedCos.length > 0} />
      <DetailRow label="Bad cost centers"   value={badCCs.length}    list={badCCs}    error={badCCs.length > 0} />
      <DetailRow label="Message"            value={detail.message ?? '—'} />
    </div>
  )
}

const ActionsSyncDetail = ({ detail }: { detail: StageDetail }) => {
  const md = detail.metadata
  const t = actionsTotals(md)
  const locations = md?.locations ?? []
  return (
    <div>
      <DetailRow label="Created at"        value={detail.createdAt ?? '—'} />
      <DetailRow label="Punches"           value={t.punchCount.toLocaleString()} />
      <DetailRow label="Gaps"              value={t.gapCount.toLocaleString()} />
      <DetailRow label="Assignments"       value={t.assignmentCount.toLocaleString()} />
      <DetailRow label="Indirect deleted"  value={t.deletedIndirect} />
      <DetailRow label="Message"           value={detail.message ?? '—'} />

      {locations.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <SectionHeader>Per-location breakdown</SectionHeader>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                <th style={{ textAlign: 'left',  padding: '6px 8px', color: COLORS.muted, fontWeight: 500 }}>Location</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: COLORS.muted, fontWeight: 500 }}>Punches</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: COLORS.muted, fontWeight: 500 }}>Gaps</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: COLORS.muted, fontWeight: 500 }}>Assignments</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: COLORS.muted, fontWeight: 500 }}>Indirect deleted</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', color: COLORS.muted, fontWeight: 500 }}>Duration</th>
              </tr>
            </thead>
            <tbody>
              {locations.map(l => (
                <tr key={l.locationId} style={{ borderBottom: `1px solid ${COLORS.border}` }}>
                  <td style={{ padding: '6px 8px' }}>Location {l.locationId}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{l.result.punchCount.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{l.result.gapCount.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{l.result.assignmentCount.toLocaleString()}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{l.result.deletedIndirectCount}</td>
                  <td style={{ textAlign: 'right', padding: '6px 8px' }}>{fmtDuration(l.result.durationSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const StageCard = ({ stage, detail }: { stage: StageName; detail: StageDetail }) => {
  if (detail.status == null) return null
  const isActions = stage === 'actions-sync'
  return (
    <div style={{
      background: '#fff', borderRadius: 8, padding: 16, marginBottom: 12,
      boxShadow: SHADOW,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${COLORS.border}` }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>
          {STAGE_LABEL[stage]}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
          <StatusText status={detail.status} />
          <span style={{ color: COLORS.muted, fontSize: 12 }}>{fmtDuration(detail.durationSeconds)}</span>
        </span>
      </div>
      {isActions ? <ActionsSyncDetail detail={detail} /> : <PunchStageDetail detail={detail} />}
    </div>
  )
}

const DetailRenderer = (params: { data?: RunPoint }) => {
  const data = params.data
  if (!data) return null
  return (
    <div style={{ padding: 16, background: '#F3F4F6' }}>
      <StageCard stage="employee-punch-details-v2" detail={data.stageDetails.employeeV2} />
      <StageCard stage="employee-punch-details-v1" detail={data.stageDetails.employeeV1} />
      <StageCard stage="actions-sync"              detail={data.stageDetails.actionsSync} />
    </div>
  )
}

// ── Error heat map ────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmtHour = (h: number) => {
  if (h === 0) return '12a'
  if (h === 12) return '12p'
  return h < 12 ? `${h}a` : `${h - 12}p`
}

type HeatCell = { counts: Record<StageName, number> }

const ErrorHeatMap = ({ runPoints }: { runPoints: RunPoint[] }) => {
  const [selected, setSelected] = useState<Set<StageName>>(
    () => new Set(STAGE_LINES.map(s => s.stage)),
  )
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null)

  const matrix = useMemo<HeatCell[][]>(() => {
    const grid: HeatCell[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 24 }, () => ({
        counts: {
          'employee-punch-details-v2': 0,
          'employee-punch-details-v1': 0,
          'actions-sync': 0,
        },
      })),
    )
    for (const r of runPoints) {
      const d = new Date(r.startedAtRaw)
      const day  = d.getUTCDay()
      const hour = d.getUTCHours()
      for (const { stage, statusKey } of STAGE_LINES) {
        if (r[statusKey] === 'failure') grid[day][hour].counts[stage]++
      }
    }
    return grid
  }, [runPoints])

  const cellCount = (cell: HeatCell) => {
    let n = 0
    for (const { stage } of STAGE_LINES) {
      if (selected.has(stage)) n += cell.counts[stage]
    }
    return n
  }

  const { totalSelected, maxSelectedCount } = useMemo(() => {
    let total = 0
    let max = 0
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        let n = 0
        for (const { stage } of STAGE_LINES) {
          if (selected.has(stage)) n += matrix[day][hour].counts[stage]
        }
        total += n
        if (n > max) max = n
      }
    }
    return { totalSelected: total, maxSelectedCount: max }
  }, [matrix, selected])

  const cellBackground = (count: number) => {
    if (count === 0) return '#FAFAFA'
    const alpha = 0.15 + 0.7 * (count / Math.max(1, maxSelectedCount))
    return `rgba(220, 38, 38, ${alpha.toFixed(3)})`
  }

  const toggle = (s: StageName) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(s)) next.delete(s)
    else next.add(s)
    return next
  })

  const hoveredCell = hover ? matrix[hover.day][hover.hour] : null
  const hoveredHasErrors = hoveredCell
    ? STAGE_LINES.some(({ stage }) => selected.has(stage) && hoveredCell.counts[stage] > 0)
    : false

  return (
    <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: SHADOW, marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Errors by hour and day
        </div>
        <div style={{ fontSize: 11, color: COLORS.muted }}>
          {totalSelected} error{totalSelected === 1 ? '' : 's'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STAGE_LINES.map(({ stage }) => {
          const isSelected = selected.has(stage)
          return (
            <button
              key={stage}
              type="button"
              onClick={() => toggle(stage)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${isSelected ? STAGE_COLOR[stage] : COLORS.border}`,
                background: isSelected ? `${STAGE_COLOR[stage]}14` : '#fff',
                color: isSelected ? COLORS.text : COLORS.muted,
                fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                transition: 'background 120ms ease, border-color 120ms ease',
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: 4,
                background: STAGE_COLOR[stage],
                opacity: isSelected ? 1 : 0.35,
              }} />
              {STAGE_LABEL[stage]}
            </button>
          )
        })}
      </div>

      {runPoints.length === 0 ? (
        <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 13 }}>
          No completed runs in the selected range
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '36px repeat(24, 1fr)',
            columnGap: 2, rowGap: 2,
            alignItems: 'stretch',
          }}>
            {DAYS_SHORT.map((dayLabel, day) => (
              <React.Fragment key={day}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                  paddingRight: 8, fontSize: 11, color: COLORS.muted, fontWeight: 500,
                }}>
                  {dayLabel}
                </div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const count = cellCount(matrix[day][hour])
                  const isHovered = hover?.day === day && hover?.hour === hour
                  return (
                    <div
                      key={hour}
                      onMouseEnter={() => setHover({ day, hour })}
                      onMouseLeave={() => setHover(null)}
                      style={{
                        background: cellBackground(count),
                        borderRadius: 4,
                        minHeight: 28,
                        outline: isHovered ? `1px solid ${COLORS.text}` : 'none',
                        outlineOffset: -1,
                        transition: 'background 80ms ease',
                      }}
                    />
                  )
                })}
              </React.Fragment>
            ))}

            <div />
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} style={{
                textAlign: 'center', fontSize: 10, color: COLORS.muted, paddingTop: 6,
              }}>
                {h % 3 === 0 ? fmtHour(h) : ''}
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 14, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`,
            minHeight: 28, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            fontSize: 12, color: COLORS.muted,
          }}>
            {hover && hoveredCell ? (
              <>
                <span style={{ color: COLORS.text, fontWeight: 600 }}>
                  {DAYS_SHORT[hover.day]} {fmtHour(hover.hour)}
                </span>
                {hoveredHasErrors ? (
                  STAGE_LINES.map(({ stage }) => {
                    const count = hoveredCell.counts[stage]
                    if (count === 0 || !selected.has(stage)) return null
                    return (
                      <span key={stage} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: COLORS.text }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: STAGE_COLOR[stage] }} />
                        {STAGE_LABEL[stage]}: <strong style={{ color: COLORS.failure, fontWeight: 600 }}>{count}</strong>
                      </span>
                    )
                  })
                ) : (
                  <span>No errors</span>
                )}
              </>
            ) : (
              <span>Hover a cell to see details</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const PaylocityInsights = () => {
  const [rawRows = []] = Retool.useStateArray({ name: 'data', label: 'Data Source' })
  const [rawLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  ensureAgGridInitialized(rawLicenseKey as string)

  const runPoints = useMemo<RunPoint[]>(() => {
    type Agg = {
      runId: string
      startedAtRaw: number
      label: string
      duration: number
      runStatus: RunStatus
      stages: Record<StageName, {
        status: StageStatus
        metadata: StageMetadata | null
        createdAt: string | null
        message: string | null
      }>
    }

    const map = new Map<string, Agg>()

    for (const r of rawRows as unknown as RawRow[]) {
      if (!r?.workflowRunId) continue

      let agg = map.get(r.workflowRunId)
      if (!agg) {
        agg = {
          runId:        r.workflowRunId,
          startedAtRaw: toEpoch(r.startedAt),
          label:        fmtDateTime(r.startedAt),
          duration:     r.runDurationSeconds ?? 0,
          runStatus:    r.runStatus,
          stages: {
            'employee-punch-details-v2': { status: null, metadata: null, createdAt: null, message: null },
            'employee-punch-details-v1': { status: null, metadata: null, createdAt: null, message: null },
            'actions-sync':              { status: null, metadata: null, createdAt: null, message: null },
          },
        }
        map.set(r.workflowRunId, agg)
      }

      if (r.stage && ALL_STAGES.includes(r.stage)) {
        agg.stages[r.stage] = {
          status:    r.stageStatus,
          metadata:  parseMetadata(r.metadata),
          createdAt: r.stageCreatedAt,
          message:   r.message,
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.startedAtRaw - b.startedAtRaw)
      .map(a => {
        const eV2 = a.stages['employee-punch-details-v2']
        const eV1 = a.stages['employee-punch-details-v1']
        const acs = a.stages['actions-sync']

        const primary = PUNCH_STAGES.find(s => a.stages[s].status === 'success') ?? null
        const primaryMd = primary ? a.stages[primary].metadata : null

        // Sum upserted/softDeleted/failedPunches across all successful punch stages
        let upserted = 0, softDeleted = 0, failedPunches = 0
        for (const s of PUNCH_STAGES) {
          const md = a.stages[s].metadata
          if (a.stages[s].status === 'success' && md) {
            upserted      += md.upsertedPunchCount    ?? 0
            softDeleted   += md.softDeletedPunchCount ?? 0
            failedPunches += md.failedPunchIds?.length ?? 0
          }
        }

        const t = actionsTotals(acs.metadata)

        return {
          runId:        a.runId,
          startedAtRaw: a.startedAtRaw,
          label:        a.label,
          duration:     a.duration,
          runStatus:    a.runStatus,

          employeeV2:       eV2.metadata?.durationSeconds ?? 0,
          employeeV1:       eV1.metadata?.durationSeconds ?? 0,
          actionsSync:      t.durationSeconds,
          inProgress:       a.runStatus === 'running'
            ? Math.max(0, a.duration - ((eV2.metadata?.durationSeconds ?? 0) + (eV1.metadata?.durationSeconds ?? 0) + (t.durationSeconds || 0)))
            : 0,

          employeeV2Status:  eV2.status,
          employeeV1Status:  eV1.status,
          actionsSyncStatus: acs.status,

          primarySource: primary ? STAGE_LABEL[primary] : null,

          upserted,
          softDeleted,
          failedPunches,
          emptyCompanies:  primaryMd?.emptyCompanyIds?.length             ?? 0,
          failedCompanies: primaryMd?.failedCompanyIds?.length            ?? 0,
          badCostCenters:  primaryMd?.badPaylocityCostCenterNames?.length ?? 0,

          actionsPunches:         t.punchCount,
          actionsGaps:            t.gapCount,
          actionsAssignments:     t.assignmentCount,
          actionsIndirectDeleted: t.deletedIndirect,

          stageDetails: {
            employeeV2: {
              status:          eV2.status,
              durationSeconds: eV2.metadata?.durationSeconds ?? null,
              createdAt:       eV2.createdAt,
              message:         eV2.message,
              metadata:        eV2.metadata,
            },
            employeeV1: {
              status:          eV1.status,
              durationSeconds: eV1.metadata?.durationSeconds ?? null,
              createdAt:       eV1.createdAt,
              message:         eV1.message,
              metadata:        eV1.metadata,
            },
            actionsSync: {
              status:          acs.status,
              durationSeconds: t.durationSeconds || null,
              createdAt:       acs.createdAt,
              message:         acs.message,
              metadata:        acs.metadata,
            },
          },
        }
      })
  }, [rawRows])

  const runGridRef = useRef<AgGridReact<RunPoint>>(null)

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: COLORS.bg, minHeight: '100vh', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: SHADOW }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Run duration
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>
            {runPoints.length} run{runPoints.length === 1 ? '' : 's'}
          </div>
        </div>

        {runPoints.length === 0 ? (
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.muted, fontSize: 13 }}>
            No completed runs in the selected range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={runPoints} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: COLORS.muted }}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd" minTickGap={48}
              />
              <YAxis
                tick={{ fontSize: 11, fill: COLORS.muted }}
                axisLine={false} tickLine={false}
                tickFormatter={v => fmtDuration(v as number)}
                width={56}
              />
              <Tooltip content={<RunTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />

              {/* Stacked stage duration bars (failed segments turn red) */}
              {STAGE_LINES.map(({ stage, durationKey, statusKey }) => (
                <Bar
                  key={stage}
                  name={STAGE_LABEL[stage]}
                  dataKey={durationKey}
                  stackId="run"
                  fill={STAGE_COLOR[stage]}
                  isAnimationActive={false}
                >
                  {runPoints.map((d, i) => (
                    <Cell
                      key={i}
                      fill={d[statusKey] === 'failure' ? COLORS.failure : STAGE_COLOR[stage]}
                    />
                  ))}
                </Bar>
              ))}

              {/* "In progress" segment: fills total - sum(logged stages) for running runs */}
              <Bar
                name="In progress"
                dataKey="inProgress"
                stackId="run"
                fill={COLORS.running}
                fillOpacity={0.35}
                stroke={COLORS.running}
                strokeWidth={1}
                strokeDasharray="3 3"
                isAnimationActive={false}
              />

              {/* Total duration line on top, with status dots */}
              <Line
                type="monotone"
                name="Total"
                dataKey="duration"
                stroke={COLORS.total}
                strokeWidth={2}
                dot={<StatusDot />}
                activeDot={<ActiveStatusDot />}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      <ErrorHeatMap runPoints={runPoints} />

      <div style={{ background: '#fff', borderRadius: 10, padding: 20, boxShadow: SHADOW, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: COLORS.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Run details
          </div>
          <div style={{ fontSize: 11, color: COLORS.muted }}>
            {runPoints.length} run{runPoints.length === 1 ? '' : 's'}
          </div>
        </div>
        <div style={{ height: 600 }}>
          <AgGridReact<RunPoint>
            ref={runGridRef}
            rowData={runPoints}
            columnDefs={runColDefs}
            theme={themeQuartz}
            defaultColDef={{ resizable: true, filter: true, sortable: true, cellStyle: { display: 'flex', alignItems: 'center' } }}
            cellSelection
            masterDetail
            detailCellRenderer={DetailRenderer}
            detailRowAutoHeight
          />
        </div>
      </div>
    </div>
  )
}

export { PaylocityInsights }
