import { Retool } from '@tryretool/custom-component-support'
import React, { useMemo, useState, useRef, useCallback } from 'react'
import { ColDef, ModuleRegistry, AllCommunityModule, themeQuartz } from 'ag-grid-community'
import { LicenseManager, AllEnterpriseModule } from 'ag-grid-enterprise'
import { AgGridReact } from 'ag-grid-react'
import {
  ComposedChart, BarChart, PieChart, Pie, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell,
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'

// ── AG Grid init ──────────────────────────────────────────────────────────────

let appliedLicenseKey: string | null = null
let hasRegisteredModules = false

const ensureAgGridInitialized = (licenseKey?: string) => {
  const key = String(licenseKey ?? '').trim()
  if (key && key !== appliedLicenseKey) {
    LicenseManager.setLicenseKey(key)
    appliedLicenseKey = key
  }
  if (!hasRegisteredModules) {
    ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule])
    hasRegisteredModules = true
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type LocationOption = {
  id: number
  name: string
}

type CoachingLog = {
  id: number
  action: string
  cargoId: number
  content: Record<string, unknown> | null
  createdAt: string
  createdBy: string
  rank: number
}

type Coaching = {
  coachingId: number
  employeeId: number
  employeeStatus: string
  supervisorId: number
  createdAt: string
  type: string
  severity: number
  status: string
  lastAction: string
  content: Record<string, unknown> | null
  jobTitle: string
  tenure: number
  employee: string
  supervisor: string
  locationId: number
  location: string
  logs: CoachingLog[]
}

type WeeklyDataPoint = {
  week: string
  delivered: number
  improved: number
  exempted: number
  missed: number
  pending: number
  total: number
  completionPct: number
}


// ── Constants ─────────────────────────────────────────────────────────────────

const COMPLETED_ACTIONS = ['delivered']
const EXEMPTED_ACTIONS  = ['exempted']
const MISSED_ACTIONS    = ['missed']
const IMPROVED_ACTIONS  = ['improved']

const WEEKS = 13 // ~90 days

const SEVERITY_LEVELS: Record<number, { label: string, color: string }> = {
  1: { label: 'Coaching 1',              color: '#93C5FD' },
  2: { label: 'Coaching 2',              color: '#60A5FA' },
  3: { label: '1st Corrective Action',   color: '#FDE047' },
  4: { label: '2nd Corrective Action',   color: '#F59E0B' },
  5: { label: 'Final Corrective Action', color: '#F87171' },
  6: { label: 'Termination',             color: '#374151' },
}

const EXEMP_PALETTE = ['#378ADD', '#1D9E75', '#7C3AED', '#D85A30', '#E24B4A', '#854F0B', '#185FA5', '#3B6D11']


// ── Helpers ───────────────────────────────────────────────────────────────────

const isCompleted = (c: Coaching) => COMPLETED_ACTIONS.includes(c.lastAction)
const isImproved  = (c: Coaching) => IMPROVED_ACTIONS.includes(c.lastAction)
const isExempted  = (c: Coaching) => EXEMPTED_ACTIONS.includes(c.lastAction)
const isMissed    = (c: Coaching) => MISSED_ACTIONS.includes(c.lastAction)
const isPending        = (c: Coaching) => c.status === 'open'
const getExemptionType = (c: Coaching) => {
  const log = c.logs.find(l => l.action === 'exempted')
  return (log?.content?.exemptionType as string) || 'Unknown'
}

const getExemptionNote = (c: Coaching) => {
  const log = c.logs.find(l => l.action === 'exempted')
  return (log?.content?.note as string) || (log?.content?.notes as string) || (log?.content?.reason as string) || '—'
}

const fmtHours = (v: number | null) => {
  if (v == null) return '—'
  const n = Number(v)
  return isNaN(n) ? '—' : `${n.toFixed(1)}h`
}

const hoursFrom = (start: string, end: string) =>
  (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)

const firstActionHours = (c: Coaching, action: string) => {
  const log = c.logs.find(l => l.action === action)
  return log ? hoursFrom(c.createdAt, log.createdAt) : null
}

const firstAnyActionHours = (c: Coaching, actions: string[]) => {
  const times = c.logs
    .filter(l => actions.includes(l.action))
    .map(l => hoursFrom(c.createdAt, l.createdAt))
  return times.length ? Math.min(...times) : null
}

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr)
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

// Returns the Monday of the week containing the given date, at midnight.
const getMondayOf = (date: Date): Date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun, 1=Mon … 6=Sat
  d.setDate(d.getDate() - (day + 6) % 7)
  return d
}

const buildWeeklyData = (coachings: Coaching[]): WeeklyDataPoint[] =>
  Array.from({ length: WEEKS }, (_, i) => {
    const currentMonday = getMondayOf(new Date())
    const weekStart = new Date(currentMonday)
    weekStart.setDate(weekStart.getDate() - (WEEKS - 1 - i) * 7)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const inWeek = coachings.filter(c => {
      const d = new Date(c.createdAt)
      return d >= weekStart && d < weekEnd
    })

    const delivered = inWeek.filter(isCompleted).length
    const improved  = inWeek.filter(isImproved).length
    const exempted  = inWeek.filter(isExempted).length
    const missed    = inWeek.filter(isMissed).length
    const pending   = inWeek.filter(isPending).length
    const total     = inWeek.length
    const completionPct = total ? Math.round(delivered / total * 100) : 0

    return {
      week: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      delivered, improved, exempted, missed, pending, total, completionPct,
    }
  })

// ── Sub-components ────────────────────────────────────────────────────────────

const Card = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
  <div style={{
    background: '#fff', borderRadius: 10, padding: '20px',
    boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
    ...style,
  }}>
    {children}
  </div>
)

const SectionTitle = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
  <div style={{ fontSize: 11, fontWeight: 500, color: '#9b9a94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 14, ...style }}>
    {children}
  </div>
)

type StatProps = {
  label: string
  value: number
  pct?: number
  sub: string
  accent: string
}

const StatCard = ({ label, value, pct, sub, accent }: StatProps) => (
  <div style={{
    background: '#fff', borderRadius: 10, padding: '16px 18px',
    boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
  }}>
    <div style={{ fontSize: 11, fontWeight: 500, color: '#9b9a94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <div style={{ fontSize: 32, fontWeight: 600, color: accent, lineHeight: 1 }}>{value}</div>
      {pct !== undefined && (
        <div style={{ fontSize: 13, fontWeight: 500, color: accent, opacity: 0.6 }}>{pct}%</div>
      )}
    </div>
    <div style={{ fontSize: 12, color: '#b8b7b0', marginTop: 7 }}>{sub}</div>
  </div>
)

const STATUS_COLORS = {
  delivered: '#3B6D11',
  improved:  '#1D9E75',
  exempted:  '#854F0B',
  missed:    '#E24B4A',
  pending:   '#185FA5',
}

const TruncatedTick = ({ x, y, payload }: { x?: number, y?: number, payload?: { value: string } }) => {
  const text = payload?.value ?? ''
  const truncated = text.length > 22 ? text.slice(0, 21) + '…' : text
  return <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="#444">{truncated}</text>
}

const ChartTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  const total = payload.find(p => p.name === 'total')?.value as number ?? 0
  const rows = payload.filter(p => p.name !== 'total' && p.name !== 'Delivery %')
  return (
    <div style={{
      background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
      borderRadius: 8, padding: '14px 24px', fontSize: 12, minWidth: 200,
      boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontWeight: 600, marginBottom: 10, color: '#1a1a1a' }}>Week of {label}</div>
      {rows.map(p => (
        <div key={p.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 24, color: '#444', marginBottom: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color as string, display: 'inline-block' }} />
            {p.name}
          </span>
          <span style={{ fontWeight: 500 }}>{p.value}</span>
        </div>
      ))}
      <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', color: '#1a1a1a' }}>
        <span style={{ fontWeight: 500 }}>Total</span>
        <span style={{ fontWeight: 600 }}>{total}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', color: '#7C3AED', marginTop: 6 }}>
        <span>Delivery %</span>
        <span style={{ fontWeight: 500 }}>{payload.find(p => p.name === 'Delivery %')?.value}%</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export const CoachingInsights = () => {
  const [rawData] = Retool.useStateArray({ name: 'data', label: 'Data Source' })
  const [rawLocations] = Retool.useStateArray({ name: 'locations', label: 'Locations' })
  const [, setSelectedLocationIds] = Retool.useStateArray({ name: 'selectedLocationIds', initialValue: [] })
  const triggerFiltersChanged = Retool.useEventCallback({ name: 'filtersChanged' })
  const [, setRetoolDateFrom] = Retool.useStateString({ name: 'dateFrom', initialValue: '' })
  const [, setRetoolDateTo]   = Retool.useStateString({ name: 'dateTo',   initialValue: '' })
  const [rawLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  const agGridLicenseKey = rawLicenseKey as string
  ensureAgGridInitialized(agGridLicenseKey)

  const coachings  = useMemo(() => rawData  as Coaching[],       [JSON.stringify(rawData)])
  const locations  = useMemo(() => rawLocations as LocationOption[], [JSON.stringify(rawLocations)])

  const [selectedLocationId, setSelectedLocationId] = useState<number | null>(null)
  const [supervisorFilter,   setSupervisorFilter]   = useState('all')
  const [dateFrom,           setDateFrom]           = useState('')
  const [dateTo,             setDateTo]             = useState('')

  const handleLocationChange = (id: number | null) => {
    setSelectedLocationId(id)
    setSupervisorFilter('all')
  }

  const applyFilters = () => {
    setSelectedLocationIds(selectedLocationId != null ? [selectedLocationId] : [])
    setRetoolDateFrom(dateFrom)
    setRetoolDateTo(dateTo)
    triggerFiltersChanged()
  }

  const [typeFilter, setTypeFilter] = useState('all')
  const gridRef = useRef<AgGridReact>(null)
  const onFirstDataRendered = useCallback(() => gridRef.current?.api.autoSizeAllColumns(), [])

  const perfGridRef = useRef<AgGridReact>(null)
  const onPerfFirstDataRendered = useCallback(() => perfGridRef.current?.api.autoSizeAllColumns(), [])

  const supervisors = useMemo(
    () => [...new Set(coachings.map(c => c.supervisor).filter(Boolean))].sort(),
    [coachings],
  )

  const filteredCoachings = useMemo(
    () => supervisorFilter === 'all' ? coachings : coachings.filter(c => c.supervisor === supervisorFilter),
    [coachings, supervisorFilter],
  )

  const coachingTypes = useMemo(
    () => [...new Set(filteredCoachings.map(c => c.type).filter(Boolean))].sort(),
    [filteredCoachings],
  )

  const filteredForChart = useMemo(
    () => typeFilter === 'all' ? filteredCoachings : filteredCoachings.filter(c => c.type === typeFilter),
    [filteredCoachings, typeFilter],
  )

  const totals = useMemo(() => {
    const total     = filteredCoachings.length
    const completed = filteredCoachings.filter(isCompleted).length
    const improved  = filteredCoachings.filter(isImproved).length
    const exempted  = filteredCoachings.filter(isExempted).length
    const missed    = filteredCoachings.filter(isMissed).length
    const pending   = filteredCoachings.filter(isPending).length
    const pct = (n: number) => total ? Math.round(n / total * 100) : 0
    return {
      total, completed, improved, exempted, missed, pending,
      completedPct: pct(completed),
      improvedPct:  pct(improved),
      exemptedPct:  pct(exempted),
      missedPct:    pct(missed),
      pendingPct:   pct(pending),
    }
  }, [filteredCoachings])

  const weeklyData = useMemo(() => buildWeeklyData(filteredForChart), [filteredForChart])

  const severityData = useMemo(() =>
    Object.entries(SEVERITY_LEVELS)
      .map(([sev, { label, color }]) => ({
        name:  label,
        value: filteredCoachings.filter(c => c.severity === Number(sev)).length,
        fill:  color,
      }))
      .filter(d => d.value > 0),
    [filteredCoachings],
  )

  const performanceRows = useMemo(() =>
    filteredCoachings.map(c => ({
      location:   c.location   || 'Unknown',
      supervisor: c.supervisor || 'Unknown',
      employee:   c.employee,
      total:      1,
      delivered:  isCompleted(c) ? 1 : 0,
      improved:   isImproved(c)  ? 1 : 0,
      exempted:   isExempted(c)  ? 1 : 0,
      missed:     isMissed(c)    ? 1 : 0,
      pending:    isPending(c)   ? 1 : 0,
      timeToViewed:    firstActionHours(c, 'viewed'),
      timeToReviewed:  firstActionHours(c, 'reviewed'),
      timeToRequested: firstAnyActionHours(c, ['override requested', 'exemption requested']),
      timeToDelivered: firstActionHours(c, 'delivered'),
      timeToExempted:  firstActionHours(c, 'exempted'),
    })),
    [filteredCoachings],
  )

  const performanceColDefs = useMemo<ColDef[]>(() => [
    { field: 'location',   rowGroup: true, hide: true },
    { field: 'supervisor', rowGroup: true, hide: true },
    { field: 'employee',   headerName: 'Employee' },
    { field: 'total',      headerName: 'Total',     aggFunc: 'sum' },
    { field: 'delivered',  headerName: 'Delivered', aggFunc: 'sum', cellStyle: { color: STATUS_COLORS.delivered } },
    { field: 'improved',   headerName: 'Improved',  aggFunc: 'sum', cellStyle: { color: STATUS_COLORS.improved } },
    { field: 'exempted',   headerName: 'Exempted',  aggFunc: 'sum', cellStyle: { color: STATUS_COLORS.exempted } },
    { field: 'missed',     headerName: 'Missed',    aggFunc: 'sum', cellStyle: { color: STATUS_COLORS.missed } },
    { field: 'pending',    headerName: 'Pending',   aggFunc: 'sum', cellStyle: { color: STATUS_COLORS.pending } },
    {
      headerName: 'Delivery %',
      valueGetter: params => {
        const delivered = params.node?.group ? (params.node.aggData?.delivered ?? 0) : (params.data?.delivered ?? 0)
        const total     = params.node?.group ? (params.node.aggData?.total     ?? 0) : (params.data?.total     ?? 1)
        return total ? Math.round(delivered / total * 100) : 0
      },
      valueFormatter: params => `${params.value}%`,
    },
    { field: 'timeToViewed',    headerName: 'Time to Viewed',    aggFunc: 'avg', valueFormatter: (p: { value: number | null }) => fmtHours(p.value) },
    { field: 'timeToReviewed',  headerName: 'Time to Reviewed',  aggFunc: 'avg', valueFormatter: (p: { value: number | null }) => fmtHours(p.value) },
    { field: 'timeToRequested', headerName: 'Time to Requested', aggFunc: 'avg', valueFormatter: (p: { value: number | null }) => fmtHours(p.value) },
    { field: 'timeToDelivered', headerName: 'Time to Delivered', aggFunc: 'avg', valueFormatter: (p: { value: number | null }) => fmtHours(p.value) },
    { field: 'timeToExempted',  headerName: 'Time to Exempted',  aggFunc: 'avg', valueFormatter: (p: { value: number | null }) => fmtHours(p.value) },
  ], [])

  const exemptionRows = useMemo(() =>
    filteredCoachings
      .filter(isExempted)
      .map(c => ({
        date:          formatDate(c.logs.find(l => l.action === 'exempted')?.createdAt || c.createdAt),
        employee:      c.employee,
        supervisor:    c.supervisor,
        location:      c.location,
        severityLabel: SEVERITY_LEVELS[c.severity]?.label ?? `Level ${c.severity}`,
        exemptionType: getExemptionType(c),
        notes:         getExemptionNote(c),
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [filteredCoachings],
  )

  const exemptionColDefs = useMemo<ColDef[]>(() => [
    { field: 'date',          headerName: 'Date',           pinned: 'left', sort: 'desc', sortIndex: 0 },
    { field: 'supervisor',    headerName: 'Supervisor',     pinned: 'left', sort: 'asc',  sortIndex: 1 },
    { field: 'employee',      headerName: 'Employee' },
    { field: 'location',      headerName: 'Location' },
    { field: 'severityLabel', headerName: 'Severity' },
    { field: 'exemptionType', headerName: 'Exemption Type' },
    { field: 'notes',         headerName: 'Notes', wrapText: true, autoHeight: true, cellStyle: { whiteSpace: 'normal', lineHeight: '1.4' } },
  ], [])


  const exemptionData = useMemo(() => {
    const map: Record<string, number> = {}
    for (const c of filteredCoachings.filter(isExempted)) {
      const type = getExemptionType(c)
      map[type] = (map[type] || 0) + 1
    }
    return Object.entries(map)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
  }, [filteredCoachings])

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#FBFBFC', minHeight: '100vh', padding: '20px 20px' }}>

      {/* Title + filters */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>Coaching Insights</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Left filter group: location, dates, apply */}
          <select
            value={selectedLocationId ?? ''}
            onChange={e => handleLocationChange(e.target.value ? Number(e.target.value) : null)}
            style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff', color: '#1a1a1a', cursor: 'pointer' }}
          >
            <option value="">All locations</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff', color: dateFrom ? '#1a1a1a' : '#9b9a94', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 12, color: '#9b9a94' }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff', color: dateTo ? '#1a1a1a' : '#9b9a94', cursor: 'pointer' }}
          />
          <button
            onClick={applyFilters}
            style={{ fontSize: 12, padding: '5px 12px', border: 'none', borderRadius: 6, background: '#1a1a1a', color: '#fff', cursor: 'pointer', fontWeight: 500 }}
          >
            Apply
          </button>
          {/* Right filter: supervisor */}
          <div style={{ width: 1, height: 20, background: 'rgba(0,0,0,0.12)', margin: '0 4px' }} />
          <select
            value={supervisorFilter}
            onChange={e => setSupervisorFilter(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff', color: '#1a1a1a', cursor: 'pointer' }}
          >
            <option value="all">All supervisors</option>
            {supervisors.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
        <StatCard label="Total"     value={totals.total}     sub="All coachings"        accent="#6B7280" />
        <StatCard label="Delivered" value={totals.completed} pct={totals.completedPct}  sub="Coaching delivered"    accent={STATUS_COLORS.delivered} />
        <StatCard label="Exempted"  value={totals.exempted}  pct={totals.exemptedPct}   sub="Override or exemption" accent={STATUS_COLORS.exempted} />
        <StatCard label="Missed"    value={totals.missed}    pct={totals.missedPct}     sub="No delivery recorded"  accent={STATUS_COLORS.missed} />
        <StatCard label="Pending"   value={totals.pending}   pct={totals.pendingPct}    sub="Awaiting action"       accent={STATUS_COLORS.pending} />
      </div>

      {/* Weekly trend */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <SectionTitle style={{ marginBottom: 0 }}>Weekly trend — last 12 weeks</SectionTitle>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            style={{ fontSize: 12, padding: '5px 8px', border: '0.5px solid rgba(0,0,0,0.15)', borderRadius: 6, background: '#fff', color: '#1a1a1a', cursor: 'pointer' }}
          >
            <option value="all">All types</option>
            {coachingTypes.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={weeklyData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9b9a94' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="count" width={40} tick={{ fontSize: 11, fill: '#9b9a94' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="pct" width={44} orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#7C3AED' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="square" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#9b9a94', paddingTop: 12 }} />
            {/* Hidden bar for total — used in tooltip only */}
            <Bar yAxisId="count" dataKey="total"     name="total"     stackId="a" fill="transparent" legendType="none" />
            <Bar yAxisId="count" dataKey="delivered" name="Delivered" stackId="s" fill={STATUS_COLORS.delivered} opacity={0.85} radius={[0,0,0,0]} />
            <Bar yAxisId="count" dataKey="improved"  name="Improved"  stackId="s" fill={STATUS_COLORS.improved}  opacity={0.85} />
            <Bar yAxisId="count" dataKey="exempted"  name="Exempted"  stackId="s" fill={STATUS_COLORS.exempted}  opacity={0.85} />
            <Bar yAxisId="count" dataKey="missed"    name="Missed"    stackId="s" fill={STATUS_COLORS.missed}    opacity={0.85} />
            <Bar yAxisId="count" dataKey="pending"   name="Pending"   stackId="s" fill={STATUS_COLORS.pending}   opacity={0.85} radius={[3,3,0,0]} />
            <Line yAxisId="pct" type="monotone" dataKey="completionPct" name="Delivery %" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3, fill: '#7C3AED' }} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Severity + Exemptions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>

        {/* Severity pie */}
        <Card>
          <SectionTitle>Coachings by severity</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={48}
              >
                {severityData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip
                formatter={(value: number, name: string) => [value, name]}
                contentStyle={{
                  background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                  borderRadius: 8, fontSize: 12,
                  boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
                }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#444', paddingTop: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Exemptions by type */}
        <Card>
          <SectionTitle>Exemptions by type</SectionTitle>
          {exemptionData.length === 0
            ? <div style={{ fontSize: 13, color: '#b8b7b0', paddingTop: 8 }}>No exemptions in data</div>
            : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart layout="vertical" data={exemptionData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#9b9a94' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="type" width={140} tick={<TruncatedTick />} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value: number) => [value, 'Count']}
                    contentStyle={{
                      background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                      borderRadius: 8, fontSize: 12,
                      boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {exemptionData.map((_, i) => (
                      <Cell key={i} fill={EXEMP_PALETTE[i % EXEMP_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </Card>

      </div>

      {/* Performance by location & supervisor */}
      <Card style={{ marginTop: 16 }}>
        <SectionTitle>Performance by location & supervisor</SectionTitle>
        <div style={{ height: 400 }}>
          <AgGridReact
            ref={perfGridRef}
            rowData={performanceRows}
            columnDefs={performanceColDefs}
            theme={themeQuartz}
            defaultColDef={{ resizable: true, filter: true, sortable: true }}
            autoGroupColumnDef={{ headerName: 'Location / Supervisor', minWidth: 220, pinned: 'left' }}
            suppressAggFuncInHeader
            groupDefaultExpanded={1}
            onFirstDataRendered={onPerfFirstDataRendered}
          />
        </div>
      </Card>

      {/* Exemption log */}
      <Card style={{ marginTop: 16 }}>
        <SectionTitle>Exemption log</SectionTitle>
        <div style={{ height: 400 }}>
          <AgGridReact
            ref={gridRef}
            rowData={exemptionRows}
            columnDefs={exemptionColDefs}
            theme={themeQuartz}
            defaultColDef={{ resizable: true, filter: true, sortable: true }}
            onFirstDataRendered={onFirstDataRendered}
          />
        </div>
      </Card>


    </div>
  )
}
