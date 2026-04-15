
import { AgGridReact } from 'ag-grid-react'
import type { TooltipProps } from 'recharts'
import React, { useMemo, useRef, useCallback } from 'react'
import { Retool } from '@tryretool/custom-component-support'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { ColDef, themeQuartz } from 'ag-grid-community'
import { ComposedChart, BarChart, PieChart, Pie, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { CheckCircleIcon, XCircleIcon, ClockIcon, ShieldExclamationIcon, ClipboardDocumentListIcon, ArrowTrendingUpIcon } from '@heroicons/react/24/outline'
import { ensureAgGridInitialized } from '../../utils/helpers'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionConfig    = { value: string; label: string; chartColor: string }
type SeverityConfig  = { value: number; label: string; color: string }
type ExemptionConfig = { value: string; color: string }

type Config = {
  actions: ActionConfig[]
  severities: SeverityConfig[]
  exemptionTypes: ExemptionConfig[]
}

type WeeklyDataPoint = {
  week: string
  total: number
  completionPct: number
  [key: string]: number | string
}

type Totals = {
  total: number
  completed: number
  improved: number
  exempted: number
  missed: number
  pending: number
  completedPct: number
  improvedPct: number
  exemptedPct: number
  missedPct: number
  pendingPct: number
}

type PerformanceRow = {
  location: string
  supervisor: string
  employee: string
  total: number
  delivered: number
  improved: number
  exempted: number
  missed: number
  pending: number
  timeToViewed: number | null
  timeToReviewed: number | null
  timeToRequested: number | null
  timeToDelivered: number | null
  timeToExempted: number | null
}

type ExemptionRow = {
  date: string
  employee: string
  supervisor: string
  location: string
  severityLabel: string
  exemptionType: string
  requesterNotes: string
  notes: string
}

type InsightsState = {
  config: Config
  totals: Totals
  weeklyData: WeeklyDataPoint[]
  severityData: { severity: number; value: number }[]
  performanceRows: PerformanceRow[]
  exemptionRows: ExemptionRow[]
  exemptionData: { type: string; count: number }[]
}

// ── Constants (component display only) ───────────────────────────────────────

const EMPTY_STATE: InsightsState = {
  config: { actions: [], severities: [], exemptionTypes: [] },
  totals: { total: 0, completed: 0, improved: 0, exempted: 0, missed: 0, pending: 0, completedPct: 0, improvedPct: 0, exemptedPct: 0, missedPct: 0, pendingPct: 0 },
  weeklyData: [],
  severityData: [],
  performanceRows: [],
  exemptionRows: [],
  exemptionData: [],
}

const STATUS_COLORS = {
  delivered: '#3B6D11',
  improved:  '#1D9E75',
  exempted:  '#854F0B',
  missed:    '#E24B4A',
  pending:   '#185FA5',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtHours = (v: number | null) => {
  if (v == null) return '—'
  const n = Number(v)
  return isNaN(n) ? '—' : `${n.toFixed(1)}h`
}

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

const StatCard = ({ label, value, pct, sub, accent, icon: Icon }: { label: string, value: number, pct?: number, sub: string, accent: string, icon: React.ElementType }) => (
  <div style={{
    background: '#fff', borderRadius: 10, padding: '16px 18px',
    boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10 }}>
      <Icon style={{ width: 13, height: 13, color: accent, opacity: 0.7, flexShrink: 0 }} />
      <div style={{ fontSize: 11, fontWeight: 500, color: '#9b9a94', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
      <div style={{ fontSize: 32, fontWeight: 600, color: accent, lineHeight: 1 }}>{value}</div>
      {pct !== undefined && (
        <div style={{ fontSize: 13, fontWeight: 500, color: accent, opacity: 0.6 }}>{pct}%</div>
      )}
    </div>
    <div style={{ fontSize: 12, color: '#b8b7b0', marginTop: 7 }}>{sub}</div>
  </div>
)

const TruncatedTick = ({ x, y, payload }: { x?: number, y?: number, payload?: { value: string } }) => {
  const text = payload?.value ?? ''
  const truncated = text.length > 22 ? text.slice(0, 21) + '…' : text
  return <text x={x} y={y} dy={4} textAnchor="end" fontSize={11} fill="#444">{truncated}</text>
}

const ChartTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  const total = payload.find(p => p.name === 'total')?.value as number ?? 0
  const rows = payload.filter(p => p.name !== 'total' && p.name !== 'Delivery %' && (p.value as number) > 0)
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

const ChartLegend = ({ payload }: { payload?: { value: string, color: string }[] }) => {
  if (!payload?.length) return null
  const items = payload.filter(p => p.value !== 'total' && p.value !== 'Delivery %')
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 32px', paddingTop: 14, justifyContent: 'center' }}>
      {items.map(item => (
        <div key={item.value} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0, display: 'inline-block' }} />
          {item.value}
        </div>
      ))}
    </div>
  )
}

// ── Column definitions ────────────────────────────────────────────────────────

const performanceColDefs: ColDef[] = [
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
]

const exemptionColDefs: ColDef[] = [
  { field: 'date',           headerName: 'Date',              pinned: 'left', sort: 'desc', sortIndex: 0 },
  { field: 'supervisor',     headerName: 'Supervisor',        pinned: 'left', sort: 'asc',  sortIndex: 1 },
  { field: 'employee',       headerName: 'Employee' },
  { field: 'location',       headerName: 'Location' },
  { field: 'severityLabel',  headerName: 'Severity' },
  { field: 'exemptionType',  headerName: 'Exemption Type' },
  { field: 'requesterNotes', headerName: "Requester's Notes", wrapText: true, autoHeight: true, maxWidth: 320, cellStyle: { display: 'flex', alignItems: 'flex-start', whiteSpace: 'normal', lineHeight: '1.4', paddingTop: 8, paddingBottom: 8 } },
  { field: 'notes',          headerName: "Approver's Notes",  wrapText: true, autoHeight: true, maxWidth: 320, cellStyle: { display: 'flex', alignItems: 'flex-start', whiteSpace: 'normal', lineHeight: '1.4', paddingTop: 8, paddingBottom: 8 } },
]

// ── Main component ────────────────────────────────────────────────────────────

const CoachingInsights = () => {
  const [state] = Retool.useStateObject({ name: 'data', label: 'Data Source' })
  const [rawLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  ensureAgGridInitialized(rawLicenseKey as string)

  const {
    config          = EMPTY_STATE.config,
    totals          = EMPTY_STATE.totals,
    weeklyData      = [],
    severityData    = [],
    performanceRows = [],
    exemptionRows   = [],
    exemptionData   = [],
  } = (state as InsightsState) ?? EMPTY_STATE

  const gridRef = useRef<AgGridReact>(null)
  const onFirstDataRendered = useCallback(() => gridRef.current?.api.autoSizeAllColumns(), [])

  const perfGridRef = useRef<AgGridReact>(null)
  const onPerfFirstDataRendered = useCallback(() => perfGridRef.current?.api.autoSizeAllColumns(), [])

  const severityChartData = useMemo(() =>
    severityData
      .map(({ severity, value }) => {
        const cfg = config.severities.find(s => s.value === severity)
        return {
          name: cfg?.label ?? `Level ${severity}`,
          value,
          fill: cfg?.color ?? '#94A3B8',
        }
      })
      .filter(d => d.value > 0),
    [severityData, config.severities],
  )

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', background: '#FBFBFC', minHeight: '100vh', padding: '20px 20px' }}>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0,1fr))', gap: 10, marginBottom: 16 }}>
        <StatCard label="Total"     value={totals.total}     sub="All coachings"       accent="#6B7280"             icon={ClipboardDocumentListIcon} />
        <StatCard label="Delivered" value={totals.completed} pct={totals.completedPct} sub="Coaching delivered"     accent={STATUS_COLORS.delivered} icon={CheckCircleIcon} />
        <StatCard label="Improved"  value={totals.improved}  pct={totals.improvedPct}  sub="Performance improved"   accent={STATUS_COLORS.improved}  icon={ArrowTrendingUpIcon} />
        <StatCard label="Exempted"  value={totals.exempted}  pct={totals.exemptedPct}  sub="Override or exemption"  accent={STATUS_COLORS.exempted}  icon={ShieldExclamationIcon} />
        <StatCard label="Missed"    value={totals.missed}    pct={totals.missedPct}    sub="No delivery recorded"   accent={STATUS_COLORS.missed}    icon={XCircleIcon} />
        <StatCard label="Pending"   value={totals.pending}   pct={totals.pendingPct}   sub="Awaiting action"        accent={STATUS_COLORS.pending}   icon={ClockIcon} />
      </div>

      {/* Weekly trend */}
      <Card>
        <SectionTitle>Weekly trend</SectionTitle>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={weeklyData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11, fill: '#9b9a94' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="count" width={40} tick={{ fontSize: 11, fill: '#9b9a94' }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="pct" width={44} orientation="right" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#7C3AED' }} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTooltip />} />
            <Legend content={<ChartLegend />} />
            <Bar yAxisId="count" dataKey="total" name="total" stackId="a" fill="transparent" legendType="none" />
            {config.actions.map((action, i) => {
              const field = action.value.replace(/ /g, '_')
              const isLast = i === config.actions.length - 1
              return (
                <Bar key={field} yAxisId="count" dataKey={field} name={action.label} stackId="s" fill={action.chartColor} opacity={0.9} radius={isLast ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
              )
            })}
            <Line yAxisId="pct" type="monotone" dataKey="completionPct" name="Delivery %" stroke="#7C3AED" strokeWidth={2} dot={{ r: 3, fill: '#7C3AED' }} legendType="none" />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      {/* Severity + Exemptions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>

        {/* Severity bar */}
        <Card>
          <SectionTitle>Coachings by severity</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart layout="vertical" data={severityChartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9b9a94' }} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={160} tick={<TruncatedTick />} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value: number) => [value, 'Count']}
                contentStyle={{
                  background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                  borderRadius: 8, fontSize: 12,
                  boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
                }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={28}>
                {severityChartData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Exemptions by type pie */}
        <Card>
          <SectionTitle>Exemptions by type</SectionTitle>
          {exemptionData.length === 0
            ? <div style={{ fontSize: 13, color: '#b8b7b0', paddingTop: 8 }}>No exemptions in data</div>
            : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={exemptionData}
                    dataKey="count"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={48}
                  >
                    {exemptionData.map((entry, i) => {
                      const cfg = config.exemptionTypes.find(et => et.value === entry.type)
                      return <Cell key={i} fill={cfg?.color ?? '#94A3B8'} />
                    })}
                  </Pie>
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{
                      background: '#fff', border: '0.5px solid rgba(0,0,0,0.1)',
                      borderRadius: 8, fontSize: 12,
                      boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Legend content={<ChartLegend />} />
                </PieChart>
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
            defaultColDef={{ resizable: true, filter: true, sortable: true, cellStyle: { display: 'flex', alignItems: 'center' } }}
            autoGroupColumnDef={{ headerName: 'Location / Supervisor', minWidth: 220, pinned: 'left' }}
            suppressAggFuncInHeader
            groupDefaultExpanded={1}
            cellSelection
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
            defaultColDef={{ resizable: true, filter: true, sortable: true, cellStyle: { display: 'flex', alignItems: 'center' } }}
            cellSelection
            onFirstDataRendered={onFirstDataRendered}
          />
        </div>
      </Card>

    </div>
  )
}

export { CoachingInsights }