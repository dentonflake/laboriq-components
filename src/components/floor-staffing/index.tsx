import React, { useState, useEffect, useMemo, type FC, type CSSProperties } from 'react'
import { Retool } from '@tryretool/custom-component-support'

/* =========================================================================
   Rendered data model — the nested shape this dashboard draws. Built
   in-component from the flat query rows (see FloorRow / buildModel below),
   so Retool only needs to bind one `rows` prop to the staffing query.
   ========================================================================= */
type Person = { name: string; since: string; id: number; startMs: number | null }
type Job = { name: string; staff: Person[] }
type Area = { name: string; jobs: Job[] }
type Dept = {
  name: string
  kind: 'department' | 'location'
  icon: string
  directJobs?: Job[] // jobs in this dept that sit in no area
  areas: Area[]
}

/* =========================================================================
   Flat input row — one open record per row, straight from the floor-staffing
   query. `recordType` is 'assignment' (on a job), 'gap' (clocked in but
   unassigned), or 'punch' (on a break/lunch). Gaps and punches carry null
   job/department/area: the org joins only fire off jobId, which they lack.
   `timezone` is the location's IANA zone (e.g. 'America/Phoenix') — it anchors
   the local `start` to a real instant so the live duration is correct no
   matter where the viewer's browser sits (see startMsOf).
   ========================================================================= */
type FloorRow = {
  recordType: 'assignment' | 'gap' | 'punch'
  recordId: number
  jobId: number | null
  job: string | null
  employee: string
  jobTitle: string | null
  start: string
  timezone?: string | null
  startUtc?: string | null
  punchType: 'break' | 'lunch' | null
  department: string | null
  area: string | null
}

/* =========================================================================
   Flat → nested transform.
   ========================================================================= */

// startUtc may arrive as a proper ISO string (…Z / ±hh:mm) or a naive
// 'YYYY-MM-DD HH:MM:SS' from convert_tz. A naive string has no offset, so
// `Date.parse` reads it as browser-local — append 'Z' to pin it to UTC.
const parseUtcMs = (value?: string | null) => {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)
  const ms = Date.parse(hasZone ? text : `${text.replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? null : ms
}

// Offset (target-tz wall-clock minus UTC) in ms at a given instant.
const tzOffsetMs = (utcMs: number, timeZone: string) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs
}

// Interpret a 'YYYY-MM-DD HH:MM[:SS]' wall-clock string as a time in `timeZone`
// and return the matching UTC epoch ms. Two passes settle DST boundaries.
const localToUtcMs = (local: string | null | undefined, timeZone: string) => {
  const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(String(local ?? ''))
  if (!m) return null
  try {
    const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
    const offset = tzOffsetMs(guess, timeZone)
    const epoch = guess - offset
    const refined = tzOffsetMs(epoch, timeZone)
    return refined === offset ? epoch : guess - refined
  } catch {
    return null // invalid IANA zone — fall through to the other sources
  }
}

// Anchor `start` to a real instant for duration math. Preferred path is the
// location timezone + local start; then an explicit UTC instant; last resort
// is parsing the local string as browser-local (only right when the viewer
// shares the location's zone).
const startMsOf = (row: FloorRow) => {
  if (row.timezone) {
    const tzMs = localToUtcMs(row.start, row.timezone)
    if (tzMs != null) return tzMs
  }
  const utc = parseUtcMs(row.startUtc)
  if (utc != null) return utc
  const local = Date.parse(String(row.start ?? '').replace(' ', 'T'))
  return Number.isNaN(local) ? null : local
}

// Pull HH:MM straight off the (location-local) start string and render a
// '6:00 AM' clock — never through Date, which would re-apply the viewer's tz.
const formatClock = (value?: string | null) => {
  const m = /(\d{1,2}):(\d{2})/.exec(String(value ?? ''))
  if (!m) return ''
  const raw = Number(m[1])
  const meridiem = raw >= 12 ? 'PM' : 'AM'
  const hour = raw % 12 || 12
  return `${hour}:${m[2]} ${meridiem}`
}

// The query gives department names, not icons — pick one by keyword, default
// to the people glyph. Adjust the patterns to match your department naming.
const iconForDept = (name: string) => {
  const n = name.toLowerCase()
  if (/process|listing|photo|receiv|manifest|qc/.test(n)) return 'processing'
  if (/warehous|pick|put|load|stage|forklift|dock/.test(n)) return 'warehouse'
  if (/facilit|security|maintenance|janitor/.test(n)) return 'location'
  return 'users'
}

const toPerson = (row: FloorRow): Person => ({
  name: row.employee,
  since: formatClock(row.start),
  id: row.recordId,
  startMs: startMsOf(row),
})

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name)

type StaffingAcc = {
  direct: Map<string, Person[]>
  areas: Map<string, Map<string, Person[]>>
}

const newAcc = (): StaffingAcc => ({ direct: new Map(), areas: new Map() })

const addToAcc = (acc: StaffingAcc, jobName: string, areaName: string | undefined, person: Person) => {
  if (areaName) {
    const jobs = acc.areas.get(areaName) ?? new Map<string, Person[]>()
    acc.areas.set(areaName, jobs)
    const staff = jobs.get(jobName) ?? []
    jobs.set(jobName, staff)
    staff.push(person)
  } else {
    const staff = acc.direct.get(jobName) ?? []
    acc.direct.set(jobName, staff)
    staff.push(person)
  }
}

const accToJobs = (m: Map<string, Person[]>): Job[] =>
  [...m.entries()].map(([name, staff]) => ({ name, staff: staff.sort(byName) })).sort(byName)

const accToAreas = (m: Map<string, Map<string, Person[]>>): Area[] =>
  [...m.entries()].map(([name, jobs]) => ({ name, jobs: accToJobs(jobs) })).sort(byName)

const buildModel = (rows: FloorRow[]) => {
  const deptMap = new Map<string, StaffingAcc>()
  const locationAcc = newAcc() // assignments with no department → location-level
  let hasLocation = false
  const breakRoster: Person[] = []
  const gapRoster: Person[] = []

  for (const row of rows) {
    if (row.recordType === 'punch') { breakRoster.push(toPerson(row)); continue }
    if (row.recordType === 'gap') { gapRoster.push(toPerson(row)); continue }

    const jobName = row.job?.trim() || row.jobTitle?.trim() || 'Unassigned'
    const areaName = row.area?.trim() || undefined
    const deptName = row.department?.trim()

    if (deptName) {
      const dept = deptMap.get(deptName) ?? newAcc()
      deptMap.set(deptName, dept)
      addToAcc(dept, jobName, areaName, toPerson(row))
    } else {
      hasLocation = true
      addToAcc(locationAcc, jobName, areaName, toPerson(row))
    }
  }

  const departments: Dept[] = [...deptMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, acc]) => ({
      name,
      kind: 'department' as const,
      icon: iconForDept(name),
      directJobs: accToJobs(acc.direct),
      areas: accToAreas(acc.areas),
    }))

  // Location-level card holds everything not tied to a department.
  if (hasLocation) {
    departments.push({
      name: 'Location-level',
      kind: 'location',
      icon: 'location',
      directJobs: accToJobs(locationAcc.direct),
      areas: accToAreas(locationAcc.areas),
    })
  }

  return { departments, breakRoster: breakRoster.sort(byName), gapRoster: gapRoster.sort(byName) }
}

/* =========================================================================
   Palette (Cargo / Nellis Auction tokens).
   ========================================================================= */
const C = {
  brand: 'hsl(10.12 92.22% 35.29%)',
  ink: 'hsl(0 0% 9%)',
  sub: 'hsl(0 0% 43.5%)',
  faint: 'hsl(0 0% 56.1%)',
  line: 'hsl(0 0% 88.7%)',
  line2: 'hsl(0 0% 90.9%)',
  line3: 'hsl(0 0% 93%)',
  surface: 'hsl(0 0% 98%)',
  hover: 'hsl(0 0% 95.1%)',
  bg: 'hsl(0 0% 97.3%)',
  link: 'hsl(211 100% 43.2%)',
  warnInk: 'hsl(42 100% 29%)',
  warnBg: 'hsl(55 100% 95.5%)',
  warnBg2: 'hsl(55 100% 90.9%)',
  warnBorder: 'hsl(50 89.4% 76.1%)',
  warnHover: 'hsl(52 97.9% 82%)',
  locBg: 'hsl(206 100% 96.5%)',
}
const MONO = "'Overpass Mono', ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS = "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"

/* =========================================================================
   Inline SVG icons (no external icon font — keeps the component
   self-contained inside the Retool sandbox).
   ========================================================================= */
const Icon: FC<{ name: string; size?: number; color?: string }> = ({ name, size = 20, color }) => {
  const p: React.SVGProps<SVGSVGElement> = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color || 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (name) {
    case 'users': return <svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
    case 'processing': return <svg {...p}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
    case 'warehouse': return <svg {...p}><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
    case 'location': return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
    case 'tasks': return <svg {...p}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M9 14l2 2 4-4" /></svg>
    case 'warning': return <svg {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
    case 'coffee': return <svg {...p}><path d="M18 8h1a4 4 0 0 1 0 8h-1" /><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" /><line x1="6" y1="1" x2="6" y2="4" /><line x1="10" y1="1" x2="10" y2="4" /><line x1="14" y1="1" x2="14" y2="4" /></svg>
    case 'chevron': return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>
    case 'idcard': return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M5 17a4 4 0 0 1 8 0" /><line x1="15" y1="9" x2="19" y2="9" /><line x1="15" y1="13" x2="19" y2="13" /></svg>
    case 'close': return <svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
    case 'pointer': return <svg {...p}><path d="M9 11.5V5a2 2 0 0 1 4 0v6" /><path d="M13 11V4.5a2 2 0 0 1 4 0V13" /><path d="M17 11.5a2 2 0 0 1 4 0V16a6 6 0 0 1-6 6h-2a6 6 0 0 1-5.2-3l-2.3-4a2 2 0 0 1 3.4-2L9 13" /></svg>
    default: return null
  }
}

/* =========================================================================
   Small helpers.
   ========================================================================= */
function durationStr(startMs: number | null, now: Date): string {
  if (startMs == null) return ''
  const mins = Math.max(0, Math.round((now.getTime() - startMs) / 60000))
  return `${Math.floor(mins / 60)} hrs ${mins % 60} min`
}

const Dots: FC<{ n: number }> = ({ n }) => (
  <span style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
    {Array.from({ length: Math.min(n, 8) }).map((_, i) => (
      <span key={i} style={{ width: 5, height: 5, borderRadius: 999, background: C.faint }} />
    ))}
  </span>
)

/* =========================================================================
   Row + group building blocks.
   ========================================================================= */
const JobRow: FC<{ job: Job; selected: boolean; showDots: boolean; onClick: () => void }> = ({ job, selected, showDots, onClick }) => {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', width: '100%', textAlign: 'left', border: 'none', background: hover ? C.hover : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 6, fontFamily: SANS, minHeight: 48 }}
    >
      {selected && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 3, borderRadius: 999, background: C.brand }} />}
      <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: C.ink }}>{job.name}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {showDots && <Dots n={job.staff.length} />}
        <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{job.staff.length}</span>
      </span>
      <Icon name="chevron" size={12} color="hsl(0 0% 78%)" />
    </button>
  )
}

const AreaGroup: FC<{ area: Area; selKey: string | null; showDots: boolean; onSelect: (k: string) => void; keyOf: (job: string) => string }> = ({ area, selKey, showDots, onSelect, keyOf }) => (
  <div style={{ marginTop: 10 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px' }}>
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.sub }}>{area.name}</span>
      <span style={{ flex: 1, height: 1, background: C.line3 }} />
      <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: C.sub }}>{area.jobs.reduce((s, j) => s + j.staff.length, 0)}</span>
    </div>
    {area.jobs.map((job) => {
      const k = keyOf(job.name)
      return <JobRow key={k} job={job} selected={selKey === k} showDots={showDots} onClick={() => onSelect(k)} />
    })}
  </div>
)

/* =========================================================================
   Main component.
   ========================================================================= */
export const FloorStaffing: FC = () => {
  // --- Retool-bound props (appear in the right-hand inspector) ---
  const [rows] = Retool.useStateArray({ name: 'rows', label: 'Floor records (query output)' })
  const [showGlanceDots] = Retool.useStateBoolean({ name: 'showGlanceDots', initialValue: true, label: 'Show glance dots' })
  const [showClockIn] = Retool.useStateBoolean({ name: 'showClockIn', initialValue: true, label: 'Show clock-in line' })
  const [showDeptChips] = Retool.useStateBoolean({ name: 'showDeptChips', initialValue: false, label: 'Show department chips' })

  // Flat query rows → nested Dept/Area/Job tree + the gap & break rosters.
  const floorRows = useMemo(() => (rows ?? []) as unknown as FloorRow[], [JSON.stringify(rows)])
  const { departments: depts, breakRoster: brk, gapRoster } = useMemo(() => buildModel(floorRows), [floorRows])

  // Data loads once (on the query); the duration runs in the component — a
  // ticking clock keeps "time in state" current without re-querying.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000)
    return () => window.clearInterval(id)
  }, [])

  const [sel, setSel] = useState<{ type: 'job'; key: string } | { type: 'status'; which: string } | null>(null)

  // Inject Google Fonts once.
  useEffect(() => {
    const id = 'floor-staffing-fonts'
    if (document.getElementById(id)) return
    const link = document.createElement('link')
    link.id = id; link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700&family=Overpass+Mono:wght@400;600;700&display=swap'
    document.head.appendChild(link)
  }, [])

  const realDepts = useMemo(() => depts.filter((d) => d.kind !== 'location'), [depts])
  const location = useMemo(() => depts.find((d) => d.kind === 'location') || null, [depts])

  const deptCount = (d: Dept) =>
    (d.directJobs || []).reduce((s, j) => s + j.staff.length, 0) +
    d.areas.reduce((s, a) => s + a.jobs.reduce((x, j) => x + j.staff.length, 0), 0)

  const assignment = useMemo(() => depts.reduce((s, d) => s + deptCount(d), 0), [depts])
  const breakTotal = brk.length
  const gapTotal = gapRoster.length
  const present = assignment + breakTotal + gapTotal

  const keyFor = (di: number, scope: string, ai: number, ji: number, jobName: string) => `${di}:${scope}:${ai}:${ji}:${jobName}`

  // --- panel content ---
  const panel = useMemo(() => {
    if (!sel) return null
    if (sel.type === 'status') {
      if (sel.which === 'assignment') {
        const people: (Person & { role: string })[] = []
        depts.forEach((d) => {
          ;(d.directJobs || []).forEach((j) => j.staff.forEach((p) => people.push({ ...p, role: `${d.name} · ${j.name}` })))
          d.areas.forEach((a) => a.jobs.forEach((j) => j.staff.forEach((p) => people.push({ ...p, role: `${d.name} · ${a.name} · ${j.name}` }))))
        })
        return { crumb: 'Floor status', title: 'On Assignment', count: people.length, countLabel: 'on a job task right now', people, roleLines: true }
      }
      if (sel.which === 'breakLunch') {
        return { crumb: 'Floor status', title: 'Break / Lunch', count: breakTotal, countLabel: 'currently away', people: brk.map((p) => ({ ...p, role: 'On break / lunch' })), roleLines: true }
      }
      if (sel.which === 'gap') {
        return { crumb: 'Floor status', title: 'In a Gap', count: gapTotal, countLabel: gapTotal === 1 ? 'employee currently unassigned' : 'employees currently unassigned', people: gapRoster.map((p) => ({ ...p, role: 'In a gap · unassigned' })), roleLines: true }
      }
    }
    if (sel.type === 'job') {
      let found: { crumb: string; job: Job } | null = null
      depts.forEach((d, di) => {
        ;(d.directJobs || []).forEach((j, ji) => { const k = keyFor(di, 'direct', 0, ji, j.name); if (k === sel.key) found = { crumb: d.name, job: j } })
        d.areas.forEach((a, ai) => a.jobs.forEach((j, ji) => { const k = keyFor(di, 'area', ai, ji, j.name); if (k === sel.key) found = { crumb: `${d.name} · ${a.name}`, job: j } }))
      })
      if (found) {
        const hit = found as { crumb: string; job: Job }
        return { crumb: hit.crumb, title: hit.job.name, count: hit.job.staff.length, countLabel: hit.job.staff.length === 1 ? 'person on this job' : 'people on this job', people: hit.job.staff.map((p) => ({ ...p, role: '' })), roleLines: false }
      }
    }
    return null
  }, [sel, depts, brk, gapRoster, breakTotal, gapTotal])

  const statusSel = sel && sel.type === 'status' ? sel.which : null

  /* ---------- styles ---------- */
  const card: CSSProperties = { background: '#fff', border: `1px solid ${C.line}`, borderRadius: 8, boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.10), 0 1px 2px -1px rgb(0 0 0 / 0.10)' }

  return (
    <div style={{ width: '100%', height: '100%', minHeight: 600, background: C.bg, fontFamily: SANS, color: C.ink, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* summary strip */}
      <div style={{ background: '#fff', borderBottom: `1px solid ${C.line}`, padding: '16px 32px', display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flex: 'none' }}>
            <span style={{ fontFamily: MONO, fontSize: 52, fontWeight: 700, lineHeight: 1, color: C.brand }}>{present}</span>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>on the floor</div>
              <div style={{ fontSize: 12, color: C.sub }}>clocked in right now</div>
            </div>
          </div>
          <div style={{ width: 1, height: 46, background: C.line, flex: 'none' }} />
          <div style={{ display: 'flex', gap: 12, flex: 1 }}>
            <StatusCounter icon="tasks" value={assignment} label="Assignment" selected={statusSel === 'assignment'} onClick={() => setSel({ type: 'status', which: 'assignment' })} />
            <StatusCounter icon="warning" value={gapTotal} label="Gap" warn selected={statusSel === 'gap'} onClick={() => setSel({ type: 'status', which: 'gap' })} />
            <StatusCounter icon="coffee" value={breakTotal} label="Break / Lunch" selected={statusSel === 'breakLunch'} onClick={() => setSel({ type: 'status', which: 'breakLunch' })} />
          </div>
        </div>
        {showDeptChips && (
          <div style={{ display: 'flex', gap: 12 }}>
            {realDepts.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', background: C.surface, border: `1px solid ${C.line2}`, borderRadius: 8 }}>
                <Icon name={d.icon} size={22} color={C.ink} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: C.sub }}>{d.areas.length} areas</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 26, fontWeight: 700 }}>{deptCount(d)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* body */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20, padding: '24px 32px', minWidth: 0, overflowY: 'auto' }}>
          {/* location-level card */}
          {location && (
            <section style={{ ...card, display: 'flex', alignItems: 'stretch', gap: 20, padding: '14px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 'none', width: 232 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, background: C.locBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <Icon name="location" size={24} color={C.link} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>Location-level</div>
                  <div style={{ fontSize: 12, color: C.sub }}>not tied to a department</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{deptCount(location)}</span>
              </div>
              <div style={{ width: 1, background: C.line2, flex: 'none' }} />
              <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '4px 24px', alignItems: 'start' }}>
                {(location.directJobs || []).length > 0 && (
                  <div>
                    {(location.directJobs || []).map((j, ji) => {
                      const di = depts.indexOf(location)
                      const k = keyFor(di, 'direct', 0, ji, j.name)
                      return <JobRow key={k} job={j} selected={sel?.type === 'job' && sel.key === k} showDots={showGlanceDots} onClick={() => setSel({ type: 'job', key: k })} />
                    })}
                  </div>
                )}
                {location.areas.map((a, ai) => {
                  const di = depts.indexOf(location)
                  return <AreaGroup key={ai} area={a} selKey={sel && sel.type === 'job' ? sel.key : null} showDots={showGlanceDots} keyOf={(jn) => keyFor(di, 'area', ai, a.jobs.findIndex((j) => j.name === jn), jn)} onSelect={(k) => setSel({ type: 'job', key: k })} />
                })}
              </div>
            </section>
          )}

          {/* department columns */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, realDepts.length)}, 1fr)`, gap: 20, alignItems: 'start' }}>
            {realDepts.map((d) => {
              const di = depts.indexOf(d)
              return (
                <section key={di} style={{ ...card, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderBottom: `1px solid ${C.line2}` }}>
                    <div style={{ width: 48, height: 48, borderRadius: 8, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name={d.icon} size={24} color={C.ink} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: C.sub }}>{d.areas.length} areas &middot; {(d.directJobs || []).length + d.areas.reduce((s, a) => s + a.jobs.length, 0)} jobs</div>
                    </div>
                    <span style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, lineHeight: 1 }}>{deptCount(d)}</span>
                  </div>
                  <div style={{ padding: '8px 12px 14px' }}>
                    {(d.directJobs || []).map((j, ji) => {
                      const k = keyFor(di, 'direct', 0, ji, j.name)
                      return <JobRow key={k} job={j} selected={sel?.type === 'job' && sel.key === k} showDots={showGlanceDots} onClick={() => setSel({ type: 'job', key: k })} />
                    })}
                    {d.areas.map((a, ai) => (
                      <AreaGroup key={ai} area={a} selKey={sel && sel.type === 'job' ? sel.key : null} showDots={showGlanceDots} keyOf={(jn) => keyFor(di, 'area', ai, a.jobs.findIndex((j) => j.name === jn), jn)} onSelect={(k) => setSel({ type: 'job', key: k })} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        </div>

        {/* detail panel */}
        <aside style={{ width: 380, flex: 'none', background: '#fff', borderLeft: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {panel ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '20px 22px 16px', borderBottom: `1px solid ${C.line2}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.sub }}>{panel.crumb}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginTop: 4 }}>{panel.title}</div>
                  </div>
                  <button onClick={() => setSel(null)} style={{ border: 'none', background: C.hover, width: 36, height: 36, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="close" size={16} color={C.sub} />
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 14 }}>
                  <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: C.brand }}>{panel.count}</span>
                  <span style={{ fontSize: 13, color: C.sub }}>{panel.countLabel}</span>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 20px' }}>
                {panel.people.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 10px', borderRadius: 6, minHeight: 48 }}>
                    <Icon name="idcard" size={20} color={C.brand} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 15, fontWeight: 600, color: C.link, textDecoration: 'none', lineHeight: 1.3, flex: 1, minWidth: 0 }}>{p.name}</a>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.ink, fontFamily: MONO, whiteSpace: 'nowrap' }}>{durationStr(p.startMs, now)}</span>
                      </div>
                      {panel.roleLines
                        ? <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{p.role}</div>
                        : (showClockIn && <div style={{ fontSize: 12, color: C.sub, fontFamily: MONO, marginTop: 2 }}>Clocked in {p.since} &middot; #{p.id}</div>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 40, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 999, background: C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="pointer" size={28} color="hsl(0 0% 78%)" />
              </div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>Select a job</div>
              <div style={{ fontSize: 13, color: C.sub, maxWidth: 220 }}>Tap any job, area, or status counter to see who&rsquo;s clocked in and on it right now.</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ---------- status counter button ---------- */
const StatusCounter: FC<{ icon: string; value: number; label: string; warn?: boolean; selected: boolean; onClick: () => void }> = ({ icon, value, label, warn, selected, onClick }) => {
  const [hover, setHover] = useState(false)
  const base = warn ? C.warnBg : C.surface
  const hoverBg = warn ? C.warnHover : C.hover
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center', gap: 14, padding: '9px 18px', background: hover ? hoverBg : base, border: `1px solid ${warn ? C.warnBorder : C.line2}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', fontFamily: SANS }}
    >
      {selected && <span style={{ position: 'absolute', inset: 0, border: `2px solid ${C.brand}`, borderRadius: 8, pointerEvents: 'none' }} />}
      <div style={{ width: 44, height: 44, borderRadius: 8, background: warn ? C.warnBg2 : C.hover, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
        <Icon name={icon} size={20} color={warn ? C.warnInk : C.ink} />
      </div>
      <span style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, lineHeight: 1, color: warn ? C.warnInk : C.ink }}>{value}</span>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>{label}</div>
      <Icon name="chevron" size={12} color={warn ? 'hsl(45 80% 55%)' : 'hsl(0 0% 78%)'} />
    </button>
  )
}
