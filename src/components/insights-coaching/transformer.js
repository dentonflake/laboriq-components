const rows = formatDataAsArray(data)

const outcomes = {{ global__variable__coachingOutcomes.value }}
const actions = {{ global__variable__coachingActions.value }}
const severities = {{ global__variable__coachingSeverities.value }}
const exemptionTypes = {{ global__variable__coachingExemptionTypes.value }}

const config = { outcomes, actions, severities, exemptionTypes }

if (!rows.length) return {
  config,
  totals: {
    total: 0,
    completed: 0,
    improved: 0,
    exempted: 0,
    missed: 0,
    pending: 0,
    completedPct: 0,
    improvedPct: 0,
    exemptedPct: 0,
    missedPct: 0,
    pendingPct: 0,
  },
  weeklyData: [],
  severityData: [],
  performanceRows: [],
  exemptionRows: [],
  exemptionData: [],
  overrideRows: [],
}

// ── Totals ────────────────────────────────────────────────────────────────────
const outcomeSet = outcome => new Set(actions.filter(a => a.outcome === outcome).map(a => a.value))

const deliveredSet = outcomeSet('delivered')
const improvedSet  = outcomeSet('improved')
const exemptedSet  = outcomeSet('exempted')
const missedSet    = outcomeSet('missed')
const pendingSet   = outcomeSet('pending')

const total     = rows.length
const completed = rows.filter(r => deliveredSet.has(r.lastAction)).length
const improved  = rows.filter(r => improvedSet.has(r.lastAction)).length
const exempted  = rows.filter(r => exemptedSet.has(r.lastAction)).length
const missed    = rows.filter(r => missedSet.has(r.lastAction)).length
const pending   = rows.filter(r => pendingSet.has(r.lastAction)).length

const pct = n => total ? Math.round((n / total) * 100) : 0

const totals = {
  total,
  completed,
  improved,
  exempted,
  missed,
  pending,
  completedPct: pct(completed),
  improvedPct:  pct(improved),
  exemptedPct:  pct(exempted),
  missedPct:    pct(missed),
  pendingPct:   pct(pending),
}

// ── Weekly data ───────────────────────────────────────────────────────────────
const getMondayOf = date => {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (d.getDay() + 6) % 7)
  return d
}

const actionFields = actions.map(a => a.value.replace(/ /g, '_'))

const weekMap = new Map()

for (const row of rows) {
  const monday = getMondayOf(row.createdAt)
  const key = monday.getTime()

  if (!weekMap.has(key)) {
    const entry = {
      monday,
      label: `${monday.getMonth() + 1}/${monday.getDate()}`,
      total: 0,
    }

    for (const f of actionFields) entry[f] = 0
    weekMap.set(key, entry)
  }

  const w = weekMap.get(key)
  w.total++

  const actionKey = row.lastAction?.replace(/ /g, '_')
  if (actionKey && actionKey in w) w[actionKey]++
}

const weeklyData = Array.from(weekMap.values())
  .sort((a, b) => a.monday - b.monday)
  .map(({ monday, label, total, ...stages }) => ({
    week: label,
    total,
    completionPct: total ? Math.round((stages.delivered / total) * 100) : 0,
    ...stages,
  }))

// ── Severity data ─────────────────────────────────────────────────────────────
const sevMap = new Map()

for (const row of rows) {
  sevMap.set(row.severity, (sevMap.get(row.severity) || 0) + 1)
}

const severityData = Array.from(sevMap.entries())
  .map(([severity, value]) => ({ severity, value }))
  .sort((a, b) => a.severity - b.severity)

// ── Performance rows ──────────────────────────────────────────────────────────
const performanceRows = rows.map(r => ({
  location:        r.location   || 'Unknown',
  supervisor:      r.supervisor || 'Unknown',
  employee:        r.employee,
  total:           1,
  delivered:       deliveredSet.has(r.lastAction) ? 1 : 0,
  improved:        improvedSet.has(r.lastAction)  ? 1 : 0,
  exempted:        exemptedSet.has(r.lastAction)  ? 1 : 0,
  missed:          missedSet.has(r.lastAction)    ? 1 : 0,
  pending:         pendingSet.has(r.lastAction)   ? 1 : 0,
  timeToViewed:    r.timeToViewed    ?? null,
  timeToReviewed:  r.timeToReviewed  ?? null,
  timeToRequested: r.timeToRequested ?? null,
  timeToDelivered: r.timeToDelivered ?? null,
  timeToExempted:  r.timeToExempted  ?? null,
}))

// ── Exemption rows ────────────────────────────────────────────────────────────
const severityLabelMap = new Map(severities.map(s => [s.value, s.label]))

const fmtDate = d => {
  const x = new Date(d)
  return `${x.getMonth() + 1}/${x.getDate()}/${x.getFullYear()}`
}

const exemptionRows = rows
  .filter(r => r.lastAction === 'exempted')
  .map(r => ({
    date: fmtDate(r.exemptionCreatedAt || r.createdAt),
    employee: r.employee,
    supervisor: r.supervisor,
    location: r.location,
    severityLabel: severityLabelMap.get(r.severity) || `Level ${r.severity}`,
    exemptionType: r.exemptionType || 'Unknown',
    requesterNotes: r.requesterNotes || '—',
    notes: r.approverNotes || '—',
  }))
  .sort((a, b) => new Date(b.date) - new Date(a.date))

// ── Exemption data (pie chart) ────────────────────────────────────────────────
const exemptionMap = new Map()

for (const r of exemptionRows) {
  exemptionMap.set(r.exemptionType, (exemptionMap.get(r.exemptionType) || 0) + 1)
}

const exemptionData = Array.from(exemptionMap.entries())
  .map(([type, count]) => ({ type, count }))
  .sort((a, b) => b.count - a.count)

// ── Override rows ─────────────────────────────────────────────────────────────
const overrideRows = rows
  .filter(r => r.overrideCreatedAt != null)
  .map(r => ({
    date:             fmtDate(r.overrideCreatedAt || r.createdAt),
    employee:         r.employee,
    supervisor:       r.supervisor,
    location:         r.location,
    originalSeverity: r.originalSeverity ? (severityLabelMap.get(Number(r.originalSeverity)) || `Level ${r.originalSeverity}`) : '—',
    newSeverity:      r.newSeverity      ? (severityLabelMap.get(Number(r.newSeverity))      || `Level ${r.newSeverity}`)      : '—',
    requesterNotes:   r.overrideRequesterNotes || '—',
    notes:            r.overrideApproverNotes  || '—',
  }))
  .sort((a, b) => new Date(b.date) - new Date(a.date))

return {
  config,
  totals,
  weeklyData,
  severityData,
  performanceRows,
  exemptionRows,
  exemptionData,
  overrideRows,
}
