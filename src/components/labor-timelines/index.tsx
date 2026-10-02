import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Retool } from '@tryretool/custom-component-support'
import {
  ArrowPathIcon,
  CheckIcon,
  ChevronDoubleLeftIcon,
  ChevronDoubleRightIcon,
  ClockIcon,
  LockClosedIcon,
} from '@heroicons/react/16/solid'

/* =========================================================================
   Input — one object per employee with precomputed *Seconds totals, employee
   flags, and its records. Records are slim: `type`, `jobType`, `flags` and
   `tools` are plain values, resolved against the four definition arrays that
   arrive once as their own inputs. Sending every record its own copy of each
   definition made the payload so large that Retool took seconds to hand it
   to the component. Full objects are still accepted in their place.
   ========================================================================= */
type Location = {
  id?: string | number | null
  name?: string | null
  timezone?: string | null
}

// A record type or job type, with the colors the transformer attached.
type TypeInfo = {
  value?: string | number | null
  label?: string | null
  color?: string | null
  textColor?: string | null
  border?: string | null
}

type Job = {
  id?: string | number | null
  name?: string | null
  jobTypeId?: string | number | null
}

// A flag definition from the flags array, plus a record-specific `message`.
type FlagInfo = {
  value?: string | number | null
  // 'employee' or 'record'; employee-scope definitions size the Flags column.
  scope?: string | null
  label?: string | null
  caption?: string | null
  icon?: string | null
  color?: string | null
  message?: string | null
}

// A tool definition from the tools array — what the log's menu offers.
type ToolInfo = {
  value?: string | number | null
  label?: string | null
}

type RecordRow = {
  id: string | number
  type: TypeInfo | string | null
  punchType?: string | null
  jobId?: string | number | null
  jobName?: string | null
  job?: Job | null
  jobType?: TypeInfo | string | number | null
  start: string
  end: string | null
  timezone?: string | null
  location?: Location | null
  punchId: string | null
  gapId: string | number | null
  // The assigner's name, or their employee object.
  assignedBy: { name?: string | null } | string | null
  assignedAt: string | null
  isCorrected?: boolean | null
  isEditable: number | boolean | string | null
  // `{ value, message }` — the rest comes from the flag definitions.
  flags?: FlagInfo[] | null
  // Tool values — labels come from the tool definitions.
  tools?: (ToolInfo | string)[] | null
}

type Person = {
  cargoId?: string | number | null
  name?: string | null
  jobTitle?: string | null
}

type EmployeeGroup = {
  cargoId: string | number
  name?: string | null
  jobTitle?: string | null
  supervisorName?: string | null
  timezone?: string | null
  employee?: Person | null
  supervisor?: Person | null
  location?: Location | null
  directSeconds?: number
  indirectSeconds?: number
  adminSeconds?: number
  gapSeconds?: number
  workPunchSeconds?: number
  breakPunchSeconds?: number
  lunchPunchSeconds?: number
  // `{ value, message }` or bare values, resolved like record flags.
  flags?: (FlagInfo | string | number)[]
  // Whether this viewer may reset the employee — decided by the transformer.
  canReset?: boolean
  records?: RecordRow[]
}

type TypeOption = {
  value: string | number
  label?: string
  color: string
  border?: string
  textColor?: string
}

type Colors = { fill: string; border: string; text: string }

// The definition arrays, keyed by String(value).
type Lookups = {
  types: Map<string, TypeInfo>
  jobTypes: Map<string, TypeInfo>
  flags: Map<string, FlagInfo>
  tools: Map<string, ToolInfo>
}

type Palette = Map<string, { label: string; colors: Colors }>

type Kind = 'shift' | 'punch' | 'assignment' | 'gap'

type Flag = {
  id: string
  label: string
  message: string | null
  icon: string | null
  color: string
}

type Tool = { id: string; label: string }
type Lane = 'Shift' | 'Punch' | 'Activity'

type Segment = {
  key: string
  id: string
  type: string
  jobTypeId: string | null
  jobId: string | null
  punchId: string | null
  punchType: string | null
  lane: Lane
  kind: Kind
  label: string
  typeLabel: string
  // The record type's own label ('Assignment'), where typeLabel may be the job type's.
  recordTypeLabel: string
  timeZone: string
  colors: Colors
  startMs: number
  endMs: number | null
  // Wall-clock instants: UTC ms shifted by the record's own zone offset, so
  // 6a in Phoenix and 6a in Los Angeles land on the same x.
  wallStartMs: number
  wallEndMs: number | null
  // Added to wall time to place the segment: zero normally; on a day row it
  // moves the day back onto the shared 12a–12a axis.
  wallShiftMs: number
  // The whole record, when this segment is one day's piece of it.
  fullStartMs: number
  fullEndMs: number | null
  // Which edges were cut at midnight — the bar continues on the next row.
  cutStart: boolean
  cutEnd: boolean
  // On a day row, the employee this piece belongs to; null on employee rows.
  owner: Row | null
  isEditable: boolean
  isLocked: boolean
  // An assignment that filled a gap after the fact (from the transformer).
  isCorrected: boolean
  assignedByName: string | null
  assignedAtMs: number | null
  flags: Flag[]
  tools: Tool[]
  // The record exactly as the transformer sent it — spread into selectedLog so
  // columns the chart doesn't model still reach the app.
  raw: Retool.SerializableObject
}

type Row = {
  key: string
  // A day row's midnight on the wall-clock axis; null on employee rows.
  day: number | null
  cargoId: string
  sourceCargoId: string | number
  // The row label — the employee, or the date on a day row.
  name: string
  employeeName: string
  supervisorName: string | null
  jobTitle: string | null
  timeZone: string
  totals: { work: number; direct: number; indirect: number; admin: number; gap: number; breaks: number }
  flags: Flag[]
  canReset: boolean
  isLocked: boolean
  // The transformer's employee object minus `records` — the reset payload.
  raw: Retool.SerializableObject
  segments: Segment[]
}

type LaneLayout = { lane: Lane; rows: Segment[][]; top: number; height: number }

type Span = { start: number; end: number }

type Frame = { start: number; end: number; pxPerHour: number }

type Geometry = {
  domain: Span
  available: number
  basePxPerHour: number
  zoom: number
  minZoom: number
  frame: Frame
}

type Hovered =
  | { kind: 'segment'; segment: Segment; employee: string; x: number; y: number }
  | { kind: 'employee'; flags: Flag[]; employee: string; x: number; y: number }


type Menu = { segment: Segment; row: Row; x: number; top: number; bottom: number }

type SortKey = 'name' | 'flags' | 'start' | 'work' | 'direct' | 'indirect' | 'admin' | 'gap' | 'breaks'
type SortDirection = 'asc' | 'desc'
// A start sort remembers which day (wall-clock midnight) its date label was.
type SortRule = { key: SortKey; direction: SortDirection; day?: number }

const HOUR_MS = 3600000
const MINUTE_MS = 60000
const DAY_MS = 86400000
const MIN_PX_PER_HOUR = 60
// Direct–Gap split up the punched work time, so only those four show a share
// (of their sum). Break/Lunch is break + lunch punches; Work is work punches.
// `width` is the room each column's text needs at the default size: '11h 24m'
// takes 48px, and the Break/Lunch header more. Resizing scales them together.
// `colorOf` names the definition whose text color the total wears — Break/Lunch
// and Work are punch time, so they wear the Punch type's.
const TOTAL_COLUMNS = [
  { key: 'direct', label: 'Direct', hasShare: true, width: 48, colorOf: { jobType: '1' } },
  { key: 'indirect', label: 'Indirect', hasShare: true, width: 48, colorOf: { jobType: '2' } },
  { key: 'admin', label: 'Admin', hasShare: true, width: 48, colorOf: { jobType: '3' } },
  { key: 'gap', label: 'Gap', hasShare: true, width: 48, colorOf: { type: 'Gap' } },
  { key: 'breaks', label: 'Break/Lunch', hasShare: false, width: 64, colorOf: { type: 'Punch' } },
  { key: 'work', label: 'Work', hasShare: false, width: 48, colorOf: { type: 'Punch' } },
] as const

type TotalKey = typeof TOTAL_COLUMNS[number]['key']
// Space left of every column's text, so right-aligned values never run into
// the column before them.
const TOTAL_GAP = 12
// Name and totals columns are resizable by dragging their inner edge; these
// are the defaults (restored by double-clicking a handle) and the limits.
const DEFAULT_NAME_WIDTH = 240
const MIN_NAME_WIDTH = 160
const MAX_NAME_WIDTH = 480
const TOTALS_PADDING = 16
const TOTAL_COLUMNS_WIDTH = TOTAL_COLUMNS.reduce((sum, column) => sum + column.width + TOTAL_GAP, 0)
const DEFAULT_TOTALS_WIDTH = TOTAL_COLUMNS_WIDTH + TOTALS_PADDING
const MIN_TOTALS_WIDTH = Math.round(TOTAL_COLUMNS_WIDTH * 0.8) + TOTALS_PADDING
const MAX_TOTALS_WIDTH = 480
// Collapsed, the totals shrink to a strip just wide enough for the expand and
// refresh buttons.
const COLLAPSED_TOTALS_WIDTH = 28
const RESIZE_HANDLE_WIDTH = 7
// Name line: cell padding, then the chevron and its gap. The sub-line, the
// Employee header and the footer count all indent to where the name starts.
const CELL_PADDING = 8
const CHEVRON_WIDTH = 8
const NAME_GAP = 4
const NAME_INDENT = CHEVRON_WIDTH + NAME_GAP
const NAME_LINE_HEIGHT = 16
// The flags column fits the most icons any shown employee has, and hides
// when nobody has a flag.
const FLAG_ICON_WIDTH = 16
const FLAG_GAP = 4
const MIN_FLAGS_WIDTH = 56
const LANE_LABEL_WIDTH = 56
const ROW_HEIGHT = 44
const ROW_PADDING = 6
const LANE_HEIGHT = 22
const LANE_GAP = 4
const DAY_BAND = 14
const HOUR_BAND = 16
const AXIS_HEIGHT = DAY_BAND + HOUR_BAND
const FOOTER_HEIGHT = 26
const OVERSCAN_PX = 400
// Horizontal scroll only re-renders once per step. It must stay under
// OVERSCAN_PX, or a step could scroll past the drawn edge and show blanks.
const SCROLL_STEP_PX = 200
const MIN_LABEL_WIDTH = 40
const MIN_TICK_GAP = 60
// Zoomed far out, date labels step through these day counts — the smallest
// that keeps labels MIN_DAY_LABEL_SPACING apart — like the hour ticks do.
const DAY_LABEL_STEPS = [1, 2, 3, 7, 14, 28]
const MIN_DAY_LABEL_SPACING = 90
// 1970-01-01 was a Thursday; offsetting the day index by 3 lands weekly and
// biweekly steps on Mondays.
const MONDAY_OFFSET = 3
const MAX_TICKS = 800
const FADE_PX = 18
const MAX_ZOOM = 20
// How much time can be in view when zoomed all the way out — a single day can
// widen to show the days around it. A longer range can always be fit in full.
const MAX_VISIBLE_HOURS = 48
const MIN_MARKER_WIDTH = 14
// Anything other than work (break, lunch, meal) is intentional time off.
const WORK_PUNCH = 'work'
const FLAG_COLOR = '#CB6E17'
const BACKFILL_COLOR = '#F0A020'
const MIN_DRAG_PX = 4
const ZOOM_SENSITIVITY = 0.01
const MAX_WHEEL_DELTA = 40

const LANES: Lane[] = ['Shift', 'Punch', 'Activity']
const TICK_STEPS_MINUTES = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440]
const JOB_TYPES: Record<string, string> = { 1: 'Direct', 2: 'Indirect', 3: 'Admin' }
// Names read A→Z first; totals read largest first, since the point of sorting
// by them is to surface who has the most.
const DEFAULT_DIRECTION: Record<SortKey, SortDirection> = {
  name: 'asc',
  flags: 'desc',
  start: 'asc',
  work: 'desc',
  direct: 'desc',
  indirect: 'desc',
  admin: 'desc',
  gap: 'desc',
  breaks: 'desc',
}
const TODAY_COLOR = '#2680C2'

const LOCKED_FLAG = 'locked'
const HAS_LOCKED_LOGS_FLAG = 'hasLockedLogs'

// Problems, as opposed to the lock, which is a fact about the log.
const issuesOf = (segment: Segment) => segment.flags.filter((flag) => flag.id !== LOCKED_FLAG)

const DEFAULT_TYPES: TypeOption[] = [
  { value: 'Shift', label: 'Shift', color: '#EAE2F8', border: '#CFBCF2', textColor: '#51279B' },
  { value: 'Punch', label: 'Punch', color: '#E3F8FF', border: '#B3ECFF', textColor: '#0B69A3' },
  { value: 'Gap', label: 'Gap', color: '#FFE3E3', border: '#FACDCD', textColor: '#A61B1B' },
  { value: 'Assignment', label: 'Assignment', color: '#C6F7E2', border: '#8EEDC7', textColor: '#147D64' },
]

const NEUTRAL: Colors = { fill: '#F0F4F8', border: '#D9E2EC', text: '#486581' }

/* =========================================================================
   Colors come from the records' `type` / `jobType` objects. Only the fill is
   required — border and text are derived by darkening it in HSL when absent.
   The built-in defaults cover a record that arrives without a color.
   ========================================================================= */

const hexToHsl = (hex: string) => {
  const match = hex.trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const digits = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1]
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(digits.slice(index, index + 2), 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: l * 100 }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: s * 100, l: l * 100 }
}

const hsl = (h: number, s: number, l: number) =>
  `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(Math.max(0, Math.min(100, l)))}%)`

const toColors = (option: TypeOption): Colors => {
  const base = hexToHsl(option.color)
  return {
    fill: option.color,
    border: option.border ?? (base ? hsl(base.h, base.s, base.l - 10) : NEUTRAL.border),
    text: option.textColor ?? (base ? hsl(base.h, Math.min(base.s, 75), 34) : NEUTRAL.text),
  }
}

const toPalette = (options: TypeOption[]): Palette => new Map(options.map((option) => [
  String(option.value),
  { label: option.label ?? String(option.value), colors: toColors(option) },
]))

const DEFAULT_PALETTE = toPalette(DEFAULT_TYPES)

const colorsOf = (info: TypeInfo | null | undefined, typeValue: string): Colors => (
  info?.color
    ? toColors({
      value: typeValue,
      color: info.color,
      border: info.border ?? undefined,
      textColor: info.textColor ?? undefined,
    })
    : DEFAULT_PALETTE.get(typeValue)?.colors ?? NEUTRAL
)

/* =========================================================================
   Time helpers.
   ========================================================================= */

// Intl.DateTimeFormat construction dominates the cost of these helpers, and a
// zoomed-in axis calls them hundreds of times per render — build each one once.
const formatterCache = new Map<string, Intl.DateTimeFormat>()
const formatter = (timeZone: string, options: Intl.DateTimeFormatOptions) => {
  const key = `${timeZone}|${JSON.stringify(options)}`
  const cached = formatterCache.get(key)
  if (cached) return cached
  const created = new Intl.DateTimeFormat('en-US', { timeZone, ...options })
  formatterCache.set(key, created)
  return created
}

// start/end arrive as ISO ('…Z') from the driver, but a convert_tz column can
// come back naive ('YYYY-MM-DD HH:MM:SS'). A naive string has no offset, so
// Date.parse reads it as browser-local — append 'Z' to pin it to UTC.
const parseUtcMs = (value?: string | null) => {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text)
  const ms = Date.parse(hasZone ? text : `${text.replace(' ', 'T')}Z`)
  return Number.isNaN(ms) ? null : ms
}

// Offset (target-tz wall clock minus UTC) in ms at a given instant. Zone
// offsets only ever change on a 15-minute boundary, so caching per zone per
// quarter hour turns thousands of formatToParts calls into a few dozen.
const QUARTER_HOUR_MS = 15 * MINUTE_MS
const offsetCache = new Map<string, number>()
const tzOffsetMs = (utcMs: number, timeZone: string) => {
  const key = `${timeZone}|${Math.floor(utcMs / QUARTER_HOUR_MS)}`
  const cached = offsetCache.get(key)
  if (cached !== undefined) return cached
  const offset = computeOffsetMs(utcMs, timeZone)
  offsetCache.set(key, offset)
  return offset
}

const computeOffsetMs = (utcMs: number, timeZone: string) => {
  const parts = formatter(timeZone, {
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs
}

// The whole axis lives in "wall" space: a local clock reading encoded as if it
// were UTC. Formatting wall ms with timeZone 'UTC' prints that local reading,
// and hour/day boundaries are plain arithmetic — no DST drift across a range.
const toWall = (utcMs: number, timeZone: string) => utcMs + tzOffsetMs(utcMs, timeZone)

const WALL = 'UTC'

// 'YYYY-MM-DD' (anything after the date is ignored) → that day's midnight on
// the wall-clock axis.
const toWallDay = (value: unknown) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value : '')
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

// '6 AM' → '6a', '12 PM' → '12p'
const formatHour = (ms: number, timeZone: string) => {
  const [hour, meridiem] = formatter(timeZone, { hour: 'numeric' }).format(new Date(ms)).split(' ')
  return `${hour}${(meridiem ?? '').charAt(0).toLowerCase()}`
}

// '4:56 AM' → '4:56a'
const formatClock = (ms: number, timeZone: string) => {
  const [clock, meridiem] = formatter(timeZone, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(ms)).split(' ')
  return `${clock}${(meridiem ?? '').charAt(0).toLowerCase()}`
}

// '4:56:07 AM' → '4:56:07a' — tooltip precision. Split on any whitespace:
// newer ICU puts a narrow no-break space before the meridiem.
const formatClockSeconds = (ms: number, timeZone: string) => {
  const [clock, meridiem] = formatter(timeZone, { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    .format(new Date(ms)).split(/\s/)
  return `${clock}${(meridiem ?? '').charAt(0).toLowerCase()}`
}

const formatDay = (ms: number, timeZone: string) =>
  formatter(timeZone, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(ms))

// Always down to the second, e.g. '2h 5m 35s'.
const formatDurationSeconds = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

const formatTotal = (seconds: number) => {
  const minutes = Math.round(Math.max(0, seconds) / 60)
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

/* =========================================================================
   Axis + zoom math.
   ========================================================================= */

// Coarsest tick interval that still leaves ~MIN_TICK_GAP between ticks, so the
// axis gains 30/15/10/5/1-minute detail as pxPerHour grows. The tick-count cap
// keeps a long date range at high zoom from emitting thousands of nodes.
const chooseTickStepMs = (pxPerHour: number, hoursSpan: number) => {
  const step = TICK_STEPS_MINUTES.find((minutes) => (
    (minutes / 60) * pxPerHour >= MIN_TICK_GAP && (hoursSpan * 60) / minutes <= MAX_TICKS
  ))
  return (step ?? TICK_STEPS_MINUTES[TICK_STEPS_MINUTES.length - 1]) * MINUTE_MS
}

const clampZoom = (zoom: number, minZoom: number) => Math.min(MAX_ZOOM, Math.max(minZoom, zoom))

// The visible time window at a zoom level. Zoomed out past fit-to-width, the
// window widens evenly around the data instead of shrinking the track, so the
// chart always fills the width.
const frameFor = (domain: Span, available: number, basePxPerHour: number, zoom: number): Frame => {
  const pxPerHour = basePxPerHour * zoom
  const dataHours = (domain.end - domain.start) / HOUR_MS
  const padMs = ((Math.max(dataHours, available / pxPerHour) - dataHours) / 2) * HOUR_MS
  return { start: domain.start - padMs, end: domain.end + padMs, pxPerHour }
}

// Flip away from the cursor when the preferred side would overflow, then clamp
// to the viewport. Measured against `window`, which inside Retool's iframe is
// exactly the component's own box.
const placeTooltip = (
  anchor: { x: number; y: number },
  size: { width: number; height: number },
): CSSProperties => {
  const margin = 6
  const offset = 12
  const maxLeft = window.innerWidth - size.width - margin
  const maxTop = window.innerHeight - size.height - margin
  const preferredLeft = anchor.x + offset
  const preferredTop = anchor.y + offset
  const left = preferredLeft > maxLeft ? anchor.x - offset - size.width : preferredLeft
  const top = preferredTop > maxTop ? anchor.y - offset - size.height : preferredTop
  return {
    left: Math.max(margin, Math.min(left, Math.max(margin, maxLeft))),
    top: Math.max(margin, Math.min(top, Math.max(margin, maxTop))),
  }
}

/* =========================================================================
   Employee → row mapping.
   ========================================================================= */

const zoneOf = (record: RecordRow) => record.timezone ?? record.location?.timezone ?? null

const kindOf = (type: string): Kind => {
  if (type === 'Shift') return 'shift'
  if (type === 'Punch') return 'punch'
  if (type === 'Gap') return 'gap'
  return 'assignment'
}

const laneOf = (kind: Kind): Lane => {
  if (kind === 'shift') return 'Shift'
  if (kind === 'punch') return 'Punch'
  return 'Activity'
}

const toId = (value: string | number | null | undefined) => (value === null || value === undefined ? null : String(value))

const byValue = <T extends { value?: string | number | null }>(items: T[]) =>
  new Map(items.map((item) => [String(item.value ?? ''), item]))

// The record's own fields win over the definition, so a flag's `message` (or a
// full object sent in place of a value) is kept.
const toFlag = (info: FlagInfo | string | number, definitions: Lookups['flags']): Flag => {
  const own = typeof info === 'object' && info !== null ? info : { value: info }
  const flag = { ...definitions.get(String(own.value ?? '')), ...own }
  const id = String(flag.value ?? '')
  return {
    id,
    label: flag.label ?? id,
    message: flag.message ?? null,
    icon: flag.icon ?? null,
    color: flag.color ?? FLAG_COLOR,
  }
}

const toTool = (info: ToolInfo | string, definitions: Lookups['tools']): Tool => {
  const tool = typeof info === 'object' ? info : definitions.get(info) ?? { value: info }
  const id = String(tool.value ?? '')
  return { id, label: tool.label ?? id }
}

// A full object is used as-is; a bare value is looked up in its definitions.
const resolve = (value: TypeInfo | string | number | null | undefined, definitions: Map<string, TypeInfo>) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  return definitions.get(String(value)) ?? { value }
}

const toSegments = (records: RecordRow[], lookups: Lookups) =>
  records.flatMap((record): Segment[] => {
    const startMs = parseUtcMs(record.start)
    if (startMs === null) return []
    const endMs = parseUtcMs(record.end)
    const typeInfo = resolve(record.type, lookups.types)
    const typeValue = toId(typeInfo?.value) ?? ''
    const kind = kindOf(typeValue)
    const timeZone = zoneOf(record) ?? 'UTC'
    const jobType = resolve(record.jobType ?? record.job?.jobTypeId, lookups.jobTypes)
    const jobTypeId = toId(jobType?.value)
    const flags = (record.flags ?? []).map((flag) => toFlag(flag, lookups.flags))
    // Assignments wear their job type's colors when it has them; everything
    // else (and a job type without colors) wears the record type's.
    const colorInfo = kind === 'assignment' && jobType?.color ? jobType : typeInfo
    const recordTypeLabel = typeInfo?.label ?? typeValue
    return [{
      key: `${typeValue}-${record.id}`,
      id: String(record.id),
      type: typeValue,
      jobTypeId,
      jobId: toId(record.jobId ?? record.job?.id),
      punchId: toId(record.punchId),
      punchType: record.punchType ?? null,
      lane: laneOf(kind),
      kind,
      label: record.jobName ?? record.job?.name ?? record.punchType ?? recordTypeLabel,
      typeLabel: kind === 'assignment'
        ? jobType?.label ?? (jobTypeId === null ? undefined : JOB_TYPES[jobTypeId]) ?? recordTypeLabel
        : recordTypeLabel,
      recordTypeLabel,
      timeZone,
      colors: colorsOf(colorInfo, typeValue),
      startMs,
      endMs,
      wallStartMs: toWall(startMs, timeZone),
      wallEndMs: endMs === null ? null : toWall(endMs, timeZone),
      wallShiftMs: 0,
      fullStartMs: startMs,
      fullEndMs: endMs,
      cutStart: false,
      cutEnd: false,
      owner: null,
      isEditable: record.isEditable === true || Number(record.isEditable) === 1,
      isLocked: flags.some((flag) => flag.id === LOCKED_FLAG),
      isCorrected: record.isCorrected === true,
      assignedByName: typeof record.assignedBy === 'object' && record.assignedBy !== null
        ? record.assignedBy.name ?? null
        : record.assignedBy ?? null,
      assignedAtMs: parseUtcMs(record.assignedAt),
      flags,
      tools: (record.tools ?? []).map((tool) => toTool(tool, lookups.tools)).filter((tool) => tool.id !== ''),
      raw: record as unknown as Retool.SerializableObject,
    }]
  })

const toRow = (group: EmployeeGroup, lookups: Lookups): Row => {
  const { records: groupRecords, ...rest } = group
  const records = groupRecords ?? []
  const cargoId = String(group.cargoId)
  const flags = (group.flags ?? []).map((flag) => toFlag(flag, lookups.flags))
  const segments = toSegments(records, lookups)
  const employeeName = group.name ?? group.employee?.name ?? `#${cargoId}`
  return {
    key: cargoId,
    day: null,
    cargoId,
    sourceCargoId: group.cargoId,
    name: employeeName,
    employeeName,
    supervisorName: group.supervisorName ?? group.supervisor?.name ?? null,
    jobTitle: group.jobTitle ?? group.employee?.jobTitle ?? null,
    // The row's zone (for its now tick) follows where the work happened; the
    // employee's home location only covers a row whose records have none.
    timeZone: records.map(zoneOf).find(Boolean) ?? group.timezone ?? group.location?.timezone ?? 'UTC',
    totals: {
      work: group.workPunchSeconds ?? 0,
      direct: group.directSeconds ?? 0,
      indirect: group.indirectSeconds ?? 0,
      admin: group.adminSeconds ?? 0,
      gap: group.gapSeconds ?? 0,
      breaks: (group.breakPunchSeconds ?? 0) + (group.lunchPunchSeconds ?? 0),
    },
    flags,
    canReset: group.canReset === true,
    isLocked: flags.some((flag) => flag.id === HAS_LOCKED_LOGS_FLAG) || segments.some((segment) => segment.isLocked),
    raw: rest as unknown as Retool.SerializableObject,
    segments,
  }
}

/* =========================================================================
   Days view: the Employees view turned around. Each row is a day, and across
   the timeline every employee's 12a–12a sits side by side — employee i spans
   hours 24·i to 24·(i+1) — the way an employee's days sit side by side. Records
   are cut at their own local midnight; each piece keeps the whole record
   (fullStartMs/fullEndMs) for tooltips and tools, and its owner. A day's totals
   are added up from its pieces, so they follow the filters.
   ========================================================================= */

const wallEndAt = (segment: Segment, now: number) => segment.wallEndMs ?? toWall(now, segment.timeZone)

// The calendar days on the wall-clock axis: the bound range, otherwise every
// day any record touches.
const daysOf = (rows: Row[], range: Span | null, now: number) => {
  let first = range?.start ?? Infinity
  let last = range ? range.end - DAY_MS : -Infinity
  if (!range) rows.forEach((row) => row.segments.forEach((segment) => {
    first = Math.min(first, Math.floor(segment.wallStartMs / DAY_MS) * DAY_MS)
    last = Math.max(last, Math.ceil(wallEndAt(segment, now) / DAY_MS) * DAY_MS - DAY_MS)
  }))
  if (first > last) return []
  return Array.from({ length: Math.round((last - first) / DAY_MS) + 1 }, (_, index) => first + index * DAY_MS)
}

// One day's piece of a segment, moved into its owner's block (`blockMs`).
const pieceOf = (segment: Segment, day: number, blockMs: number, now: number): Segment | null => {
  const wallEnd = wallEndAt(segment, now)
  const from = Math.max(segment.wallStartMs, day)
  const to = Math.min(wallEnd, day + DAY_MS)
  if (to <= from) return null
  // Wall time runs parallel to UTC within a record, so the cut points map
  // straight back to real instants.
  const isOpenEnd = segment.endMs === null && to === wallEnd
  const shift = blockMs - day
  return {
    ...segment,
    key: `${segment.key}@${day}`,
    startMs: segment.startMs + (from - segment.wallStartMs),
    endMs: isOpenEnd ? null : segment.startMs + (to - segment.wallStartMs),
    wallStartMs: from + shift,
    wallEndMs: isOpenEnd ? null : to + shift,
    wallShiftMs: shift,
    cutStart: from > segment.wallStartMs,
    cutEnd: to < wallEnd,
  }
}

const dayTotalsOf = (segments: Segment[], now: number): Row['totals'] => {
  const totals = { work: 0, direct: 0, indirect: 0, admin: 0, gap: 0, breaks: 0 }
  segments.forEach((segment) => {
    const seconds = ((segment.endMs ?? now) - segment.startMs) / 1000
    if (segment.kind === 'gap') totals.gap += seconds
    if (segment.kind === 'assignment' && segment.jobTypeId === '1') totals.direct += seconds
    if (segment.kind === 'assignment' && segment.jobTypeId === '2') totals.indirect += seconds
    if (segment.kind === 'assignment' && segment.jobTypeId === '3') totals.admin += seconds
    if (segment.kind === 'punch' && segment.punchType === WORK_PUNCH) totals.work += seconds
    if (segment.kind === 'punch' && (segment.punchType === 'break' || segment.punchType === 'lunch')) totals.breaks += seconds
  })
  return totals
}

// `employees` in the order their blocks run across the timeline.
const toDayRows = (employees: Row[], range: Span | null, now: number) =>
  daysOf(employees, range, now).map((day): Row => {
    const segments = employees.flatMap((employee, index) => employee.segments.flatMap((segment) => {
      const piece = pieceOf(segment, day, index * DAY_MS, now)
      return piece ? [{ ...piece, owner: employee }] : []
    }))
    return {
      key: `day-${day}`,
      day,
      cargoId: '',
      sourceCargoId: '',
      name: formatDay(day, WALL),
      employeeName: '',
      supervisorName: null,
      jobTitle: null,
      timeZone: employees[0]?.timeZone ?? 'UTC',
      totals: dayTotalsOf(segments, now),
      flags: [],
      canReset: false,
      isLocked: false,
      raw: {},
      segments,
    }
  })

// Greedy interval packing: place each record in the first sub-row that is free
// at its start time. A lane with no overlaps collapses to a single row.
// Packs by position on the axis (wall time), so pieces in different employees'
// blocks of a day row never land in the same sub-row by accident.
const packRows = (items: Segment[], endOf: (segment: Segment) => number) => {
  const rows: Segment[][] = []
  const rowEnds: number[] = []
  const sorted = [...items].sort((a, b) => a.wallStartMs - b.wallStartMs)
  sorted.forEach((segment) => {
    const end = endOf(segment)
    const index = rowEnds.findIndex((rowEnd) => rowEnd <= segment.wallStartMs)
    if (index === -1) {
      rows.push([segment])
      rowEnds.push(end)
      return
    }
    rows[index].push(segment)
    rowEnds[index] = Math.max(rowEnds[index], end)
  })
  return rows
}

const layoutLanes = (segments: Segment[], lanes: Lane[], endOf: (segment: Segment) => number) =>
  lanes.reduce<LaneLayout[]>((accumulator, lane) => {
    const rows = packRows(segments.filter((segment) => segment.lane === lane), endOf)
    const height = Math.max(rows.length, 1) * (LANE_HEIGHT + LANE_GAP) - LANE_GAP
    const previous = accumulator[accumulator.length - 1]
    const top = previous ? previous.top + previous.height + LANE_GAP : 0
    return [...accumulator, { lane, rows, top, height }]
  }, [])

// Last index whose row still extends past `y` — the first row to render.
const firstRowAt = (offsets: number[], y: number) => {
  let low = 0
  let high = offsets.length - 2
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2)
    if (offsets[mid] <= y) low = mid
    else high = mid - 1
  }
  return low
}

// Everything the query returned for the record, plus who it belongs to and
// what the chart worked out about it.
const ownerFields = (employee: Row) => ({ cargoId: employee.sourceCargoId, employeeName: employee.employeeName })

// Always the whole record — on a day row, a midnight piece reports the record
// it came from (and its employee), so tools act on the real log.
const logPayload = (segment: Segment, row: Row, now: number): Retool.SerializableObject => ({
  ...segment.raw,
  ...ownerFields(segment.owner ?? row),
  // An object like the full data's, so handlers can keep reading `log.type.value`.
  type: { value: segment.type, label: segment.recordTypeLabel },
  isLocked: segment.isLocked,
  jobType: segment.kind === 'assignment' && segment.jobTypeId !== null ? segment.typeLabel : null,
  lane: segment.lane,
  kind: segment.kind,
  isOpen: segment.fullEndMs === null,
  startMs: segment.fullStartMs,
  endMs: segment.fullEndMs,
  // Recomputed rather than passed through: the query's `duration` is fixed at
  // fetch time, so it drifts for a still-open segment.
  durationSeconds: Math.round(((segment.fullEndMs ?? now) - segment.fullStartMs) / 1000),
  localStart: formatClock(segment.fullStartMs, segment.timeZone),
  localEnd: segment.fullEndMs === null ? null : formatClock(segment.fullEndMs, segment.timeZone),
  hasIssues: issuesOf(segment).length > 0,
})

const formatShare = (seconds: number, total: number) =>
  total > 0 ? `${Math.round((seconds / total) * 100)}%` : '\u2013'

const tooltipTitleOf = (segment: Segment, row: Row) => (
  segment.owner ? `${segment.owner.employeeName} \u00B7 ${row.name}` : row.name
)

const employeePayload = (row: Row): Retool.SerializableObject => ({
  ...row.raw,
  cargoId: row.sourceCargoId,
  employeeName: row.employeeName,
  isLocked: row.isLocked,
})

// Centered over the click, just above the bar; drops below when there's no
// room above. Clamped to the component's iframe like the tooltip.
const placeMenu = (menu: Menu, size: { width: number; height: number }): CSSProperties => {
  const margin = 6
  const gap = 4
  const above = menu.top - gap - size.height
  const top = above >= margin ? above : menu.bottom + gap
  const maxLeft = window.innerWidth - size.width - margin
  const maxTop = window.innerHeight - size.height - margin
  return {
    left: Math.max(margin, Math.min(menu.x - size.width / 2, Math.max(margin, maxLeft))),
    top: Math.max(margin, Math.min(top, Math.max(margin, maxTop))),
  }
}

const BackfillBadge = ({ style }: { style?: CSSProperties }) => (
  <span style={{ ...backfillBadgeStyle, ...style }}>
    <CheckIcon style={{ width: 9, height: 9 }} />
  </span>
)

// Assignments are often made after the fact, so the date is shown whenever it
// differs from the day the assignment itself started.
const formatAssignedAt = (assignedAtMs: number, segment: Segment) => {
  const clock = formatClockSeconds(assignedAtMs, segment.timeZone)
  const sameDay = formatDay(assignedAtMs, segment.timeZone) === formatDay(segment.startMs, segment.timeZone)
  return sameDay ? clock : `${formatDay(assignedAtMs, segment.timeZone)}, ${clock}`
}

/* =========================================================================
   Sorting. A plain click sorts by one column (clicking it again flips the
   direction); shift-click adds a column as the next tiebreaker, or flips it
   if it's already in the list. Name always breaks remaining ties.
   ========================================================================= */

const flip = (direction: SortDirection): SortDirection => (direction === 'asc' ? 'desc' : 'asc')

// Clicking the column already sorting flips it. For the start sort that means
// the same date — a different date switches the sort to that day instead.
const nextSort = (rules: SortRule[], key: SortKey, additive: boolean, day?: number): SortRule[] => {
  const existing = rules.find((rule) => rule.key === key)
  const isSame = existing !== undefined && existing.day === day
  if (additive) {
    if (!existing) return [...rules, { key, direction: DEFAULT_DIRECTION[key], day }]
    return rules.map((rule) => {
      if (rule.key !== key) return rule
      return isSame ? { ...rule, direction: flip(rule.direction) } : { key, direction: DEFAULT_DIRECTION[key], day }
    })
  }
  if (existing && isSame && rules.length === 1) return [{ ...existing, direction: flip(existing.direction) }]
  return [{ key, direction: DEFAULT_DIRECTION[key], day }]
}

type FirstRecord = { start: number; duration: number }

// `firstOf` is each row's earliest *visible* record on the sorted day: its
// start in wall time, so the type and job filters decide what "first" means
// (first shift, first punch-in, …) and 6:00a compares equal across time zones.
// Equal starts fall back to that record's length — shortest first ascending,
// longest first descending. A row with nothing that day sorts last either way.
// Day rows are named by their date label, so they order by the date itself.
const byName = (a: Row, b: Row) => (
  a.day !== null && b.day !== null ? a.day - b.day : a.name.localeCompare(b.name)
)

const compareRows = (rules: SortRule[], firstOf: Map<string, FirstRecord>) => (a: Row, b: Row) => {
  const orderBy = (rule: SortRule) => {
    const sign = rule.direction === 'asc' ? 1 : -1
    if (rule.key === 'name') return sign * byName(a, b)
    if (rule.key === 'flags') return sign * (a.flags.length - b.flags.length)
    if (rule.key === 'start') {
      const first = firstOf.get(a.key)
      const second = firstOf.get(b.key)
      if (!first || !second) return first === second ? 0 : first ? -1 : 1
      return sign * (first.start - second.start || first.duration - second.duration)
    }
    return sign * (a.totals[rule.key] - b.totals[rule.key])
  }
  const decided = rules.map(orderBy).find((order) => order !== 0)
  return decided ?? byName(a, b)
}

const BROWSER_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

// Retool applies component state asynchronously, so an event fired right
// after a setter runs its handler against the *previous* value — every field
// reads as "". Queue the event instead, tag the state with a unique eventId,
// and fire once that exact state has come back through the hook.
const useFireAfterSync = (value: Retool.SerializableObject | undefined) => {
  const pending = useRef<{ eventId: string; fire: () => void } | null>(null)
  useEffect(() => {
    const queued = pending.current
    if (!queued || value?.eventId !== queued.eventId) return
    pending.current = null
    queued.fire()
  }, [value])
  return (fire: () => void) => {
    const eventId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    pending.current = { eventId, fire }
    return eventId
  }
}

/* =========================================================================
   Component. The outer shell only reads Retool state and builds rows; all
   scroll/hover/zoom state lives in Chart so a scroll frame never re-parses
   (or re-stringifies) hundreds of employees.
   ========================================================================= */

export const LaborTimelines = () => {
  const [employees] = Retool.useStateArray({
    name: 'employees',
    label: 'Employees (transformer output)',
    description: 'One object per employee (slimLaborEmployees output) with totals, flags and slim records.',
  })
  // Retool can't tell the component its query is running, and an empty list
  // looks the same either way — so the app says so.
  const [isLoading] = Retool.useStateBoolean({
    name: 'isLoading',
    initialValue: false,
    label: 'Loading',
    description: 'Bind to the employees query isFetching. Shows a loading bar instead of "No records" while it runs.',
  })
  const [rangeStart] = Retool.useStateString({
    name: 'rangeStart',
    label: 'Range start',
    description: 'First day shown (YYYY-MM-DD) — bind to the date filter so filtering never moves the edges.',
  })
  const [rangeEnd] = Retool.useStateString({
    name: 'rangeEnd',
    label: 'Range end',
    description: 'Last day shown (YYYY-MM-DD), inclusive.',
  })
  // Midnight to midnight across the chosen days; null until both are set.
  const range = useMemo((): Span | null => {
    const start = toWallDay(rangeStart)
    const end = toWallDay(rangeEnd)
    return start === null || end === null || end < start ? null : { start, end: end + DAY_MS }
  }, [rangeStart, rangeEnd])

  const [types] = Retool.useStateArray({
    name: 'types',
    label: 'Types',
    description: 'Record type definitions: { value, label, color, textColor?, border? }.',
  })
  const [jobTypes] = Retool.useStateArray({
    name: 'jobTypes',
    label: 'Job types',
    description: 'Job type definitions: { value, label, color, textColor?, border? }.',
  })
  const [flagDefinitions] = Retool.useStateArray({
    name: 'flagDefinitions',
    label: 'Flags',
    description: 'Flag definitions: { value, label, icon, color }.',
  })
  const [toolDefinitions] = Retool.useStateArray({
    name: 'toolDefinitions',
    label: 'Tools',
    description: 'Tool definitions: { value, label }.',
  })
  const lookupsKey = JSON.stringify([types, jobTypes, flagDefinitions, toolDefinitions])
  // Like employees, a cleared binding arrives as '' rather than [].
  const lookups = useMemo((): Lookups => {
    const asArray = <T,>(value: unknown) => (Array.isArray(value) ? value as T[] : [])
    return {
      types: byValue(asArray<TypeInfo>(types)),
      jobTypes: byValue(asArray<TypeInfo>(jobTypes)),
      flags: byValue(asArray<FlagInfo>(flagDefinitions)),
      tools: byValue(asArray<ToolInfo>(toolDefinitions)),
    }
  }, [lookupsKey])

  // Job types without colors fall back to the default Assignment green, the
  // same as their bars.
  const totalColors = useMemo(() => Object.fromEntries(TOTAL_COLUMNS.map((column) => [
    column.key,
    'jobType' in column.colorOf
      ? colorsOf(lookups.jobTypes.get(column.colorOf.jobType), 'Assignment').text
      : colorsOf(lookups.types.get(column.colorOf.type), column.colorOf.type).text,
  ])) as Record<TotalKey, string>, [lookups])

  // How many employee flags exist, so the Flags column keeps one width no matter
  // who's filtered in. Zero when the definitions carry no scope.
  const flagSlots = useMemo(
    () => [...lookups.flags.values()].filter((flag) => flag.scope === 'employee').length,
    [lookups],
  )

  const employeesKey = JSON.stringify(employees)
  // A cleared or still-loading binding arrives as '' rather than [].
  const rows = useMemo(() => (
    (Array.isArray(employees) ? employees as unknown as EmployeeGroup[] : [])
      .map((group) => toRow(group, lookups))
      .filter((row) => row.segments.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [employeesKey, lookups])

  const [selectedLog, setSelectedLog] = Retool.useStateObject({
    name: 'selectedLog',
    initialValue: {},
    inspector: 'hidden',
    description: 'The log whose menu action was most recently clicked, including its source record.',
  })
  // Retool events carry no payload, so selectedLog is set first and the event
  // fires once Retool has applied it.
  // One event for every tool: the chosen tool rides along in selectedLog.tool,
  // so new tools are a data change, and the tool can't lag behind the log.
  const onTool = Retool.useEventCallback({ name: 'tool' })
  const [selectedEmployee, setSelectedEmployee] = Retool.useStateObject({
    name: 'selectedEmployee',
    initialValue: {},
    inspector: 'hidden',
    description: 'The employee whose reset button was most recently clicked (records excluded).',
  })
  const onReset = Retool.useEventCallback({ name: 'reset' })
  const onRefresh = Retool.useEventCallback({ name: 'refresh' })

  const queueLogEvent = useFireAfterSync(selectedLog)
  const queueEmployeeEvent = useFireAfterSync(selectedEmployee)

  const onResetEmployee = (employee: Retool.SerializableObject) => {
    const eventId = queueEmployeeEvent(onReset)
    setSelectedEmployee({ ...employee, eventId })
  }

  const onToolPick = (log: Retool.SerializableObject) => {
    const eventId = queueLogEvent(onTool)
    setSelectedLog({ ...log, eventId })
  }

  if (rows.length === 0 && isLoading) {
    return (
      <div style={loadingStyle}>
        <LoadingBar style={{ position: 'relative', width: 160 }} />
        Loading records…
      </div>
    )
  }
  if (rows.length === 0) return <div style={emptyStyle}>No records</div>

  return (
    <Chart
      rows={rows}
      totalColors={totalColors}
      range={range}
      flagSlots={flagSlots}
      isLoading={isLoading}
      onToolPick={onToolPick}
      onReset={onResetEmployee}
      onRefresh={onRefresh}
    />
  )
}

// An indeterminate bar: a short segment sliding across a faint track.
const LoadingBar = ({ style }: { style?: CSSProperties }) => (
  <div style={{ ...loadingTrackStyle, ...style }}>
    <style>{LOADING_KEYFRAMES}</style>
    <div style={loadingFillStyle} />
  </div>
)

type ChartProps = {
  rows: Row[]
  totalColors: Record<TotalKey, string>
  range: Span | null
  flagSlots: number
  isLoading: boolean
  onToolPick: (log: Retool.SerializableObject) => void
  onReset: (employee: Retool.SerializableObject) => void
  onRefresh: () => void
}

const Chart = ({ rows, totalColors, range, flagSlots, isLoading, onToolPick, onReset, onRefresh }: ChartProps) => {
  const hasOpenSegment = useMemo(
    () => rows.some((row) => row.segments.some((segment) => segment.endMs === null)),
    [rows],
  )

  // Open segments run to the current time, so the chart needs its own clock.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!hasOpenSegment) return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [hasOpenSegment])

  const scrollRef = useRef<HTMLDivElement>(null)

  const [columns, setColumns] = useState({ name: DEFAULT_NAME_WIDTH, totals: DEFAULT_TOTALS_WIDTH })
  const [resize, setResize] = useState<{ column: 'name' | 'totals'; startX: number; startWidth: number } | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<'name' | 'totals' | null>(null)
  const [isTotalsCollapsed, setIsTotalsCollapsed] = useState(false)
  // Days: the Employees view turned around — a row per day, and across the
  // timeline every employee's 12a–12a side by side, the way days sit side by
  // side for an employee. Zoom, scroll and expand work exactly the same.
  const [isDayMode, setIsDayMode] = useState(false)
  const nameWidth = columns.name
  const totalsWidth = isTotalsCollapsed ? COLLAPSED_TOTALS_WIDTH : columns.totals
  const totalColumnWidth = (column: typeof TOTAL_COLUMNS[number]) =>
    ((column.width + TOTAL_GAP) / TOTAL_COLUMNS_WIDTH) * (totalsWidth - TOTALS_PADDING)
  // Sized from the definitions when they say which flags are employee flags, so
  // filtering never changes the column (and the timeline's width with it).
  const maxFlags = useMemo(
    () => flagSlots || rows.reduce((most, row) => Math.max(most, row.flags.length), 0),
    [flagSlots, rows],
  )
  const flagsWidth = maxFlags === 0 || isDayMode
    ? 0
    : Math.max(MIN_FLAGS_WIDTH, CELL_PADDING * 2 + maxFlags * FLAG_ICON_WIDTH + (maxFlags - 1) * FLAG_GAP)
  // Everything pinned left of the timeline: the name column, then flags.
  const leftWidth = nameWidth + flagsWidth
  // The native wheel listener registers once, so it reads the width from a ref.
  const leftWidthRef = useRef(leftWidth)
  leftWidthRef.current = leftWidth

  useEffect(() => {
    if (!resize) return
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
    const onMove = (event: MouseEvent) => {
      const delta = event.clientX - resize.startX
      setColumns((previous) => (
        resize.column === 'name'
          ? { ...previous, name: clamp(resize.startWidth + delta, MIN_NAME_WIDTH, MAX_NAME_WIDTH) }
          // The totals handle sits on the column's left edge, so dragging left widens it.
          : { ...previous, totals: clamp(resize.startWidth - delta, MIN_TOTALS_WIDTH, MAX_TOTALS_WIDTH) }
      ))
    }
    const onUp = () => setResize(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [resize])

  const startResize = (column: 'name' | 'totals') => (event: React.MouseEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    setHovered(null)
    setResize({ column, startX: event.clientX, startWidth: columns[column] })
  }

  const resetColumn = (column: 'name' | 'totals') => () => setColumns((previous) => ({
    ...previous,
    [column]: column === 'name' ? DEFAULT_NAME_WIDTH : DEFAULT_TOTALS_WIDTH,
  }))
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [scrollTop, setScrollTop] = useState(0)
  const [scrollStep, setScrollStep] = useState(0)

  // Layout effect, not useEffect: measuring after paint would show one frame
  // at the fallback scale and flash a scrollbar before the fit-to-width pass.
  useLayoutEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const measure = () => setViewport({ width: node.clientWidth, height: node.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [sort, setSort] = useState<SortRule[]>([{ key: 'name', direction: 'asc' }])
  const toggle = (key: string) => setExpanded((previous) => {
    const next = new Set(previous)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const [hovered, setHovered] = useState<Hovered | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 })

  // Retool renders custom components in an iframe, so `position: fixed` is
  // bounded by the component box — the tooltip has to be measured, then
  // flipped and clamped to stay inside it.
  useLayoutEffect(() => {
    const node = tooltipRef.current
    if (!node) return
    const { width, height } = node.getBoundingClientRect()
    setTooltipSize((previous) => (
      previous.width === width && previous.height === height ? previous : { width, height }
    ))
  }, [hovered])

  const [zoom, setZoom] = useState(1)
  const [menu, setMenu] = useState<Menu | null>(null)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [menuSize, setMenuSize] = useState({ width: 0, height: 0 })
  // A drag that zoomed still ends in a click on whatever bar sat under the
  // cursor — suppress that one so zooming never opens a menu.
  const didZoomRef = useRef(false)

  useLayoutEffect(() => {
    const node = menuRef.current
    if (!node) return
    const { width, height } = node.getBoundingClientRect()
    setMenuSize((previous) => (
      previous.width === width && previous.height === height ? previous : { width, height }
    ))
  }, [menu])

  // The menu is anchored to a bar's screen position, so anything that moves
  // bars (zoom, new data) closes it.
  useEffect(() => setMenu(null), [zoom, rows])

  useEffect(() => {
    if (!menu) return
    const onDown = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return
      setMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])
  const [drag, setDrag] = useState<{ startX: number; currentX: number } | null>(null)
  const dragRef = useRef<{ startX: number; currentX: number } | null>(null)
  const geometryRef = useRef<Geometry | null>(null)
  const pendingScrollRef = useRef<number | null>(null)

  // Rows arrive already filtered by Retool. Flags were computed by the
  // transformer against every record, so filtering never changes them.
  // In Days view the employees' blocks run across in name order.
  const dayRows = useMemo(() => (isDayMode ? toDayRows(rows, range, now) : []), [isDayMode, rows, range, now])
  const shown = isDayMode ? dayRows : rows

  // The two views have different axes, so switching starts from fit-to-width.
  const switchRows = (toDays: boolean) => {
    if (toDays === isDayMode) return
    pendingScrollRef.current = 0
    setZoom(1)
    setMenu(null)
    setIsDayMode(toDays)
  }

  // Expanded rows only show lanes that some visible record uses, so filtering
  // to punches and gaps drops the empty Shift lane.
  const activeLanes = useMemo(
    () => LANES.filter((lane) => rows.some((row) => row.segments.some((segment) => segment.lane === lane))),
    [rows],
  )

  const wallNow = useMemo(() => {
    const zones = new Set(rows.flatMap((row) => row.segments.map((segment) => segment.timeZone)))
    return new Map([...zones].map((zone) => [zone, toWall(now, zone)]))
  }, [rows, now])

  const wallEndOf = (segment: Segment) => (
    segment.wallEndMs ?? (wallNow.get(segment.timeZone) ?? now) + segment.wallShiftMs
  )
  const endOf = (segment: Segment) => segment.endMs ?? now

  // Whole days, and the date filter's days when it's bound, so hiding records
  // never moves the edges — zoom and scroll stay put, and empty days still
  // show. Records past the range (an overnight shift) widen it to fit.
  // A loop, not Math.min(...spread): spreading tens of thousands of records
  // into call arguments overflows the stack.
  const domain = useMemo(() => {
    // One 12a–12a block per employee.
    if (isDayMode) return { start: 0, end: Math.max(rows.length, 1) * DAY_MS }
    let earliest = Infinity
    let latest = -Infinity
    shown.forEach((row) => row.segments.forEach((segment) => {
      earliest = Math.min(earliest, segment.wallStartMs)
      latest = Math.max(latest, wallEndOf(segment))
    }))
    const start = Math.min(Math.floor(earliest / DAY_MS) * DAY_MS, range?.start ?? Infinity)
    const end = Math.max(Math.ceil(latest / DAY_MS) * DAY_MS, range?.end ?? -Infinity, start + DAY_MS)
    return { start, end }
  }, [shown, wallNow, range, isDayMode, rows.length])

  const dataHours = (domain.end - domain.start) / HOUR_MS
  const available = Math.max(Math.floor(viewport.width - leftWidth - totalsWidth), MIN_PX_PER_HOUR)
  // Zoom 1 fits the whole range to the width when it fits, otherwise falls
  // back to a fixed scale and scrolls.
  const basePxPerHour = Math.max(MIN_PX_PER_HOUR, available / dataHours)
  // Days view stops at its blocks; there's nothing either side of them.
  const minZoom = Math.min(1, available / Math.max(dataHours, isDayMode ? dataHours : MAX_VISIBLE_HOURS) / basePxPerHour)
  const effectiveZoom = clampZoom(zoom, minZoom)
  const frame = frameFor(domain, available, basePxPerHour, effectiveZoom)
  const { pxPerHour } = frame
  const spanHours = (frame.end - frame.start) / HOUR_MS
  const geometry: Geometry = { domain, available, basePxPerHour, zoom: effectiveZoom, minZoom, frame }

  useLayoutEffect(() => {
    geometryRef.current = geometry
  })

  useLayoutEffect(() => {
    const target = pendingScrollRef.current
    if (target === null) return
    pendingScrollRef.current = null
    const node = scrollRef.current
    if (node) node.scrollLeft = target
  })

  // Expanding only earns its space when a row mixes record types — a row of
  // nothing but gaps (or one job's assignments) already shows everything.
  const expandable = useMemo(
    () => new Set(shown
      .filter((row) => new Set(row.segments.map((segment) => segment.type)).size > 1)
      .map((row) => row.key)),
    [shown],
  )

  const allExpanded = expandable.size > 0 && [...expandable].every((key) => expanded.has(key))
  const toggleAll = () => setExpanded((previous) => (
    allExpanded ? new Set() : new Set([...previous, ...expandable])
  ))

  const sorted = useMemo(() => {
    // Only records starting on the sorted day count (wall-clock day, so each
    // log's own local date). Among those sharing the earliest start, the
    // shortest one represents the row, matching the shortest-first tiebreak.
    const day = sort.find((rule) => rule.key === 'start')?.day
    const onDay = (segment: Segment) => (
      day === undefined || (segment.wallStartMs >= day && segment.wallStartMs < day + DAY_MS)
    )
    const firstOf = new Map(shown.flatMap((row): [string, FirstRecord][] => {
      const candidates = row.segments.filter(onDay)
      if (candidates.length === 0) return []
      return [[
        row.key,
        candidates.reduce<FirstRecord>((first, segment) => {
          const candidate = { start: segment.wallStartMs, duration: endOf(segment) - segment.startMs }
          return (candidate.start - first.start || candidate.duration - first.duration) < 0 ? candidate : first
        }, { start: Infinity, duration: Infinity }),
      ]]
    }))
    return [...shown].sort(compareRows(sort, firstOf))
  }, [shown, sort])

  const layouts = useMemo(
    () => new Map(shown
      .filter((row) => expanded.has(row.key) && expandable.has(row.key))
      .map((row) => [row.key, layoutLanes(row.segments, activeLanes, wallEndOf)])),
    [shown, expanded, expandable, activeLanes],
  )

  const heightOf = (row: Row) => {
    const lanes = layouts.get(row.key)
    if (!lanes) return ROW_HEIGHT
    const last = lanes[lanes.length - 1]
    return Math.max(ROW_HEIGHT, last.top + last.height + ROW_PADDING * 2)
  }

  const offsets = useMemo(() => {
    const tops = [0]
    sorted.forEach((row) => tops.push(tops[tops.length - 1] + heightOf(row)))
    return tops
  }, [sorted, layouts])
  const bodyHeight = offsets[offsets.length - 1]
  const bodyViewport = Math.max(viewport.height - AXIS_HEIGHT - FOOTER_HEIGHT, 0)
  const firstIndex = firstRowAt(offsets, Math.max(scrollTop - OVERSCAN_PX, 0))
  const lastY = scrollTop + bodyViewport + OVERSCAN_PX
  const visible = sorted
    .slice(firstIndex)
    .filter((_, index) => offsets[firstIndex + index] < lastY)

  // React attaches wheel listeners passively at the root, so preventDefault
  // there is a no-op — this has to be a native non-passive listener or the
  // browser's own ctrl+wheel page zoom wins.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const current = geometryRef.current
      if (!current) return
      const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, event.deltaY))
      const nextZoom = clampZoom(current.zoom * Math.exp(-delta * ZOOM_SENSITIVITY), current.minZoom)
      if (nextZoom === current.zoom) return
      const trackOffset = event.clientX - node.getBoundingClientRect().left - leftWidthRef.current
      const { frame: from } = current
      const anchorMs = from.start + ((node.scrollLeft + trackOffset) / from.pxPerHour) * HOUR_MS
      const to = frameFor(current.domain, current.available, current.basePxPerHour, nextZoom)
      pendingScrollRef.current = ((anchorMs - to.start) / HOUR_MS) * to.pxPerHour - trackOffset
      setZoom(nextZoom)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [])

  const trackWidth = spanHours * pxPerHour
  const contentWidth = leftWidth + trackWidth + totalsWidth

  // Pointer x → track x. Returns null when the pointer is over the pinned
  // name or totals column, which overlay the track while scrolled.
  const trackXAt = (clientX: number, clamp: boolean) => {
    const node = scrollRef.current
    if (!node) return null
    const viewportX = clientX - node.getBoundingClientRect().left
    const inTrack = viewportX >= leftWidth && viewportX <= node.clientWidth - totalsWidth
    if (!inTrack && !clamp) return null
    const x = node.scrollLeft + viewportX - leftWidth
    return Math.max(0, Math.min(x, trackWidth))
  }

  const finishDrag = () => {
    const current = dragRef.current
    dragRef.current = null
    setDrag(null)
    const geo = geometryRef.current
    if (!current || !geo) return
    const left = Math.min(current.startX, current.currentX)
    const right = Math.max(current.startX, current.currentX)
    if (right - left < MIN_DRAG_PX) return
    const { frame: from } = geo
    const leftMs = from.start + (left / from.pxPerHour) * HOUR_MS
    const draggedHours = (right - left) / from.pxPerHour
    const nextZoom = clampZoom(geo.available / draggedHours / geo.basePxPerHour, geo.minZoom)
    const to = frameFor(geo.domain, geo.available, geo.basePxPerHour, nextZoom)
    pendingScrollRef.current = ((leftMs - to.start) / HOUR_MS) * to.pxPerHour
    didZoomRef.current = true
    setZoom(nextZoom)
  }

  const isDragging = drag !== null
  useEffect(() => {
    if (!isDragging) return
    const onMove = (event: MouseEvent) => {
      const x = trackXAt(event.clientX, true)
      if (x === null || !dragRef.current) return
      dragRef.current = { ...dragRef.current, currentX: x }
      setDrag(dragRef.current)
    }
    const onUp = () => finishDrag()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging, trackWidth])

  const onBodyMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return
    const x = trackXAt(event.clientX, false)
    if (x === null) return
    didZoomRef.current = false
    dragRef.current = { startX: x, currentX: x }
    setDrag(dragRef.current)
    setHovered(null)
  }

  const xOf = (wallMs: number) => ((wallMs - frame.start) / HOUR_MS) * pxPerHour

  // Only bars, ticks and grid lines near the visible stretch of track are
  // drawn. A zoom sets its new scroll position after this render, so read the
  // pending one; otherwise the old position would blank the view for a frame.
  const scrollLeft = pendingScrollRef.current ?? scrollStep * SCROLL_STEP_PX
  const drawFromX = scrollLeft - OVERSCAN_PX
  const drawToX = scrollLeft + available + SCROLL_STEP_PX + OVERSCAN_PX
  const isDrawnX = (x: number) => x >= drawFromX && x <= drawToX
  const isDrawn = (segment: Segment) => (
    xOf(segment.wallStartMs) <= drawToX && xOf(wallEndOf(segment)) >= drawFromX
  )

  // A widened frame starts mid-hour, so ticks begin at the first step boundary.
  const stepMs = chooseTickStepMs(pxPerHour, spanHours)
  const firstTick = Math.ceil(frame.start / stepMs) * stepMs
  const tickCount = Math.floor((frame.end - firstTick) / stepMs) + 1
  const ticks = Array.from({ length: tickCount }, (_, index) => firstTick + index * stepMs)
  // Date labels come from the calendar, not the ticks — deriving them from the
  // first tick made the label jump every time zooming changed the tick step.
  // Zoomed out, labels step by several days, weekly steps landing on Mondays.
  const dayStep = DAY_LABEL_STEPS.find((step) => step * pxPerHour * 24 >= MIN_DAY_LABEL_SPACING)
    ?? DAY_LABEL_STEPS[DAY_LABEL_STEPS.length - 1]
  const isOnDayStep = (day: number) => {
    const index = Math.round(day / DAY_MS)
    return (dayStep >= 7 ? index + MONDAY_OFFSET : index) % dayStep === 0
  }
  const firstDay = Math.floor(frame.start / DAY_MS) * DAY_MS
  const days = Array.from(
    { length: Math.ceil((frame.end - firstDay) / DAY_MS) },
    (_, index) => firstDay + index * DAY_MS,
  )
  // Each label owns the stretch until the next one and sticks to the left edge
  // of the timeline while that stretch is in view, so zooming into the middle
  // of a day never loses its date.
  const dayLabels = days
    .filter((day) => dayStep === 1 || (day >= frame.start && isOnDayStep(day)))
    .map((day) => ({ day, left: xOf(day), width: xOf(day + dayStep * DAY_MS) - xOf(day) }))
    .filter(({ left, width }) => left + width >= drawFromX && left <= drawToX)
  // Past a week per label the weekday names a single day no longer, so drop it.
  const formatDayLabel = (day: number) => (
    dayStep >= 7 ? formatter(WALL, { month: 'short', day: 'numeric' }).format(new Date(day)) : formatDay(day, WALL)
  )
  // Once ticks are a day apart every hour label would read '12a' — hide them,
  // and let the grid follow the date labels instead of drawing every day.
  const showHourLabels = stepMs < DAY_MS
  // Days view labels each employee's block where the Employees view labels
  // each day; at block boundaries the heavier grid line falls the same way.
  const employeeBlocks = isDayMode
    ? rows.map((employee, index) => ({ employee, left: xOf(index * DAY_MS), width: 24 * pxPerHour }))
      .filter(({ left, width }) => left + width >= drawFromX && left <= drawToX)
    : []
  const gridTicks = showHourLabels
    ? ticks
    : isDayMode ? rows.map((_, index) => index * DAY_MS) : dayLabels.map((label) => label.day)
  const showMinutes = stepMs < HOUR_MS
  const today = Math.floor(toWall(now, BROWSER_ZONE) / DAY_MS) * DAY_MS

  const sortHeader = (
    key: SortKey,
    label: React.ReactNode,
    style: CSSProperties,
    reactKey: string = key,
    day?: number,
    name: string | null = typeof label === 'string' ? label : null,
  ) => {
    // A date label only shows the arrow when it's the day being sorted.
    const index = sort.findIndex((rule) => rule.key === key && rule.day === day)
    const rule = sort[index]
    return (
      <div
        key={reactKey}
        // Date labels sit on the axis, where mousedown starts a drag-zoom.
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => setSort((previous) => nextSort(previous, key, event.shiftKey, day))}
        // A truncated label is still readable in full on hover.
        title={`${name ? `${name} \u2014 ` : ''}Click to sort, shift-click to add a sort`}
        style={{ ...sortHeaderStyle, ...style, color: rule ? '#243B53' : style.color ?? '#829AB1' }}
      >
        <span style={sortLabelStyle}>{label}</span>
        {rule && (
          <span style={sortMarkStyle}>
            {rule.direction === 'asc' ? '\u25B2' : '\u25BC'}
            {sort.length > 1 && <sup style={sortIndexStyle}>{index + 1}</sup>}
          </span>
        )}
      </div>
    )
  }

  const hover = (segment: Segment, employee: string) => (event: React.MouseEvent) => {
    if (isDragging) return
    setHovered({ kind: 'segment', segment, employee, x: event.clientX, y: event.clientY })
  }

  const hoverFlags = (row: Row) => (event: React.MouseEvent) => {
    if (isDragging) return
    setHovered({ kind: 'employee', flags: row.flags, employee: row.name, x: event.clientX, y: event.clientY })
  }

  const openMenu = (segment: Segment, row: Row) => (event: React.MouseEvent<HTMLDivElement>) => {
    if (didZoomRef.current) {
      didZoomRef.current = false
      return
    }
    // A log with no tools has nothing to offer, so it doesn't open a menu.
    if (segment.tools.length === 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    setHovered(null)
    setMenu({ segment, row, x: event.clientX, top: rect.top, bottom: rect.bottom })
  }

  const runTool = (tool: string) => {
    if (!menu) return
    onToolPick({ ...logPayload(menu.segment, menu.row, now), tool })
    setMenu(null)
  }

  // One look for every bar, collapsed or expanded, in either view: fill,
  // border, label, ⚠ and the open-segment fade. Callers choose the vertical
  // position, and the Days grid passes its own horizontal placement.
  const renderBar = (segment: Segment, row: Row, style: CSSProperties, x: (wallMs: number) => number = xOf) => {
    const left = x(segment.wallStartMs)
    const width = Math.max(x(wallEndOf(segment)) - left, 2)
    const isOpen = segment.endMs === null
    // The marker shows the first problem's icon; a lock alone still gets its
    // icon but not the warning border, since it isn't a problem.
    const issues = issuesOf(segment)
    const marker = issues[0] ?? segment.flags[0]
    const isFlagged = issues.length > 0
    // Break, lunch and meal records are intentional time off — striped so they
    // don't read as a coverage hole.
    const isTimeOff = segment.lane !== 'Activity' && segment.punchType !== null && segment.punchType !== WORK_PUNCH
    const fade = `linear-gradient(to right, #000 0%, #000 calc(100% - ${FADE_PX}px), transparent 100%)`
    return (
      <div
        key={segment.key}
        onMouseEnter={hover(segment, tooltipTitleOf(segment, row))}
        onMouseMove={hover(segment, tooltipTitleOf(segment, row))}
        onMouseLeave={() => setHovered(null)}
        onClick={openMenu(segment, row)}
        style={{
          ...barStyle,
          left,
          width,
          background: isTimeOff
            ? `repeating-linear-gradient(135deg, ${segment.colors.fill} 0 4px, ${segment.colors.border} 4px 6px)`
            : segment.colors.fill,
          border: `1px solid ${isFlagged ? issues[0].color : segment.colors.border}`,
          boxShadow: menu?.segment.key === segment.key ? `0 0 0 1px ${segment.colors.text}` : undefined,
          cursor: 'pointer',
          color: segment.colors.text,
          ...(isOpen && width > FADE_PX + 6 ? { maskImage: fade, WebkitMaskImage: fade } : {}),
          // A record cut at midnight gets square, dashed edges where it
          // continues on the neighboring day's row.
          ...(segment.cutStart ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftStyle: 'dashed' } : {}),
          ...(segment.cutEnd ? { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightStyle: 'dashed' } : {}),
          ...style,
        }}
      >
        {marker && width >= MIN_MARKER_WIDTH && (
          <span style={{ ...markerStyle, color: marker.color }}>{marker.icon ?? '\u26A0'}</span>
        )}
        {segment.isCorrected && width >= MIN_MARKER_WIDTH + (marker ? MIN_MARKER_WIDTH : 0) && (
          <BackfillBadge style={{ marginLeft: 4 }} />
        )}
        {width >= MIN_LABEL_WIDTH && (
          <span style={{ ...barTextStyle, paddingLeft: marker || segment.isCorrected ? 3 : 6 }}>
            {segment.label}
          </span>
        )}
      </div>
    )
  }

  // Collapsed. A row with a single lane draws it exactly like an expanded lane.
  // A mixed row layers shift → punch → activity, each inset inside the last,
  // so all three stay visible in one row.
  const renderCompact = (row: Row, x = xOf, isVisible = isDrawn) => {
    const lanesPresent = LANES.filter((lane) => row.segments.some((segment) => segment.lane === lane))
    const drawn = row.segments.filter(isVisible)
    if (lanesPresent.length === 1) {
      const top = (ROW_HEIGHT - LANE_HEIGHT) / 2
      return drawn.map((segment) => renderBar(segment, row, { top, height: LANE_HEIGHT }, x))
    }
    const inset = (lane: Lane) => {
      const depth = lanesPresent.indexOf(lane)
      return { top: 4 + depth * 4, height: ROW_HEIGHT - 8 - depth * 8 }
    }
    return lanesPresent.flatMap((lane) => drawn
      .filter((segment) => segment.lane === lane)
      .map((segment) => renderBar(segment, row, inset(lane), x)))
  }

  const renderExpanded = (row: Row, lanes: LaneLayout[], x = xOf, isVisible = isDrawn) => lanes.map((lane) => lane.rows.map((laneRow, index) => (
    <div
      key={`${lane.lane}-${index}`}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: ROW_PADDING + lane.top + index * (LANE_HEIGHT + LANE_GAP),
        height: LANE_HEIGHT,
      }}
    >
      {laneRow.filter(isVisible).map((segment) => renderBar(segment, row, {}, x))}
    </div>
  )))

  const selection = drag && {
    left: Math.min(drag.startX, drag.currentX),
    width: Math.abs(drag.currentX - drag.startX),
  }

  // Shared by both views' footers: the employee count with the
  // Employees | Days toggle, and refresh.
  const footerCount = (
    <>
      <span style={footerCountTextStyle}>
        {rows.length} {rows.length === 1 ? 'employee' : 'employees'}
      </span>
      <div role="radiogroup" aria-label="View" style={rowsToggleStyle}>
        {[{ label: 'Employees', toDays: false }, { label: 'Days', toDays: true }].map((option) => (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={option.toDays === isDayMode}
            onClick={() => switchRows(option.toDays)}
            style={{ ...rowsToggleButtonStyle, ...(option.toDays === isDayMode ? rowsToggleActiveStyle : {}) }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  )

  const refreshButton = (
    <button
      type="button"
      title="Refresh"
      disabled={isLoading}
      onClick={onRefresh}
      style={{ ...refreshStyle, cursor: isLoading ? 'default' : 'pointer' }}
    >
      <ArrowPathIcon
        style={{ ...refreshIconStyle, animation: isLoading ? 'labor-timelines-spin 0.9s linear infinite' : undefined }}
      />
    </button>
  )

  // Handles sit outside the scroll area so they stay on the column edges while
  // the chart scrolls; clientWidth excludes the vertical scrollbar.
  const handles = [
    { column: 'name' as const, left: nameWidth - RESIZE_HANDLE_WIDTH / 2 },
    { column: 'totals' as const, left: viewport.width - totalsWidth - RESIZE_HANDLE_WIDTH / 2 },
  ].filter(({ column }) => column !== 'totals' || !isTotalsCollapsed)

  return (
    <div style={{ ...frameStyle, userSelect: resize ? 'none' : undefined, cursor: resize ? 'col-resize' : undefined }}>
      {/* A refresh keeps the old rows on screen, with a bar across the top. */}
      {isLoading && <LoadingBar />}
      <div
        ref={scrollRef}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop)
          setScrollStep(Math.floor(event.currentTarget.scrollLeft / SCROLL_STEP_PX))
          setMenu(null)
        }}
        style={scrollStyle}
      >
        {/* At least full height, so the footer sits at the bottom even with few rows. */}
        <div style={{ ...contentStyle, width: contentWidth }}>
          <div style={{ ...headerStyle, width: contentWidth }}>
            <div style={{ ...stickyLeftStyle, ...cornerStyle, width: nameWidth }}>
              {sortHeader('name', isDayMode ? 'Day' : 'Employee', { paddingLeft: NAME_INDENT, height: DAY_BAND })}
              <label style={{ ...expandAllStyle, opacity: expandable.size > 0 ? 1 : 0.4 }}>
                <button
                  type="button"
                  role="switch"
                  aria-checked={allExpanded}
                  disabled={expandable.size === 0}
                  onClick={toggleAll}
                  style={{ ...switchStyle, background: allExpanded ? TODAY_COLOR : '#D9E2EC' }}
                >
                  <span style={{ ...switchKnobStyle, left: allExpanded ? 12 : 2 }} />
                </button>
                Expand all
              </label>
            </div>
            {flagsWidth > 0 && (
              <div style={{ ...stickyLeftStyle, ...flagsHeaderStyle, left: nameWidth, width: flagsWidth }}>
                {sortHeader('flags', 'Flags', { height: DAY_BAND })}
              </div>
            )}
            <div
              onMouseDown={onBodyMouseDown}
              style={{ position: 'relative', width: trackWidth, height: AXIS_HEIGHT, cursor: 'crosshair', userSelect: 'none' }}
            >
              {employeeBlocks.map(({ employee, left, width }) => (
                <div key={employee.key} style={{ ...labelBlockStyle, left, width }}>
                  <div
                    // The axis starts a drag-zoom on mousedown; the label's buttons shouldn't.
                    onMouseDown={(event) => event.stopPropagation()}
                    style={{ ...employeeLabelStyle, left: leftWidth, maxWidth: Math.max(width - CELL_PADDING, 0) }}
                  >
                    <span style={employeeLabelNameStyle}>{employee.name}</span>
                    <span style={pillStyle}>{employee.cargoId}</span>
                    {employee.flags.length > 0 && (
                      <span
                        onMouseEnter={hoverFlags(employee)}
                        onMouseMove={hoverFlags(employee)}
                        onMouseLeave={() => setHovered(null)}
                        style={{ ...employeeFlagsStyle, height: DAY_BAND }}
                      >
                        {employee.flags.map((flag, flagIndex) => (
                          <span key={`${flag.id}-${flagIndex}`} style={{ ...flagIconStyle, color: flag.color }}>
                            {flag.icon ?? '\u26A0'}
                          </span>
                        ))}
                      </span>
                    )}
                    {employee.canReset && (
                      <button type="button" title="Reset" onClick={() => onReset(employeePayload(employee))} style={resetStyle}>
                        <ArrowPathIcon style={resetIconStyle} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!isDayMode && dayLabels.map(({ day, left, width }) => (
                <div key={`day-${day}`} style={{ ...labelBlockStyle, left, width }}>
                  {sortHeader(
                    'start',
                    <>
                      {day === today && <span style={todayDotStyle} />}
                      {formatDayLabel(day)}
                    </>,
                    { ...dayLabelStyle, left: leftWidth, maxWidth: width },
                    `day-${day}`,
                    day,
                  )}
                </div>
              ))}
              {showHourLabels && ticks.filter((tick) => isDrawnX(xOf(tick))).map((tick) => (
                <div key={`tick-${tick}`} style={{ ...hourLabelStyle, left: xOf(tick) }}>
                  {showMinutes ? formatClock(tick, WALL) : formatHour(tick, WALL)}
                </div>
              ))}
            </div>
            {isTotalsCollapsed ? (
              <div style={{ ...stickyRightStyle, ...totalsHeaderStyle, ...collapsedTotalsStyle, width: totalsWidth }}>
                <button
                  type="button"
                  title="Show totals"
                  onClick={() => setIsTotalsCollapsed(false)}
                  style={collapseToggleStyle}
                >
                  <ChevronDoubleLeftIcon style={collapseIconStyle} />
                </button>
              </div>
            ) : (
              <div style={{ ...stickyRightStyle, ...totalsHeaderStyle, width: totalsWidth }}>
                <button
                  type="button"
                  title="Hide totals"
                  onClick={() => setIsTotalsCollapsed(true)}
                  // Sits in the padding and gap before Direct's label, above its click area.
                  style={{ ...collapseToggleStyle, position: 'absolute', left: 4, top: 0, zIndex: 1 }}
                >
                  <ChevronDoubleRightIcon style={collapseIconStyle} />
                </button>
                {TOTAL_COLUMNS.map((column) => sortHeader(column.key, column.label, {
                  ...totalCellStyle,
                  width: totalColumnWidth(column),
                  justifyContent: 'flex-end',
                  height: DAY_BAND,
                }))}
              </div>
            )}
          </div>

          <div
            onMouseDown={onBodyMouseDown}
            style={{ position: 'relative', height: bodyHeight, cursor: 'crosshair', userSelect: 'none' }}
          >
            <div style={{ position: 'absolute', top: 0, left: leftWidth, width: trackWidth, height: bodyHeight, pointerEvents: 'none' }}>
              {gridTicks.filter((tick) => isDrawnX(xOf(tick))).map((tick) => (
                <div
                  key={`grid-${tick}`}
                  style={{
                    ...gridLineStyle,
                    left: xOf(tick),
                    borderLeft: tick % DAY_MS === 0 ? '1px solid #D9E2EC' : '1px solid #F0F4F8',
                  }}
                />
              ))}
            </div>

            {visible.map((row, index) => {
              const top = offsets[firstIndex + index]
              const height = heightOf(row)
              const lanes = layouts.get(row.key)
              // A day row shows "now" in each employee's block, but only on today.
              const rowDay = row.day
              const nowTicks = rowDay === null
                ? [wallNow.get(row.timeZone) ?? toWall(now, row.timeZone)]
                : rows.map((employee, blockIndex) => toWall(now, employee.timeZone) - rowDay + blockIndex * DAY_MS)
                  .filter((tick, blockIndex) => tick >= blockIndex * DAY_MS && tick < (blockIndex + 1) * DAY_MS)
              return (
                <div key={row.key} style={{ ...rowStyle, top, height, width: contentWidth }}>
                  <div
                    onClick={expandable.has(row.key) ? () => toggle(row.key) : undefined}
                    onMouseDown={(event) => event.stopPropagation()}
                    style={{
                      ...stickyLeftStyle,
                      ...nameCellStyle,
                      width: nameWidth,
                      cursor: expandable.has(row.key) ? 'pointer' : 'default',
                    }}
                  >
                    <div style={{ ...nameBlockStyle, justifyContent: lanes ? 'flex-start' : 'center', paddingTop: lanes ? ROW_PADDING + 2 : 0 }}>
                      <div style={nameLineStyle}>
                        <span style={chevronStyle}>{expandable.has(row.key) && (lanes ? '▾' : '▸')}</span>
                        {row.day === today && <span style={todayDotStyle} />}
                        <span style={nameTextStyle}>{row.name}</span>
                        {row.day === null && <span style={pillStyle}>{row.cargoId}</span>}
                        {row.canReset && (
                          <button
                            type="button"
                            title="Reset"
                            onClick={(event) => {
                              event.stopPropagation()
                              onReset(employeePayload(row))
                            }}
                            style={resetStyle}
                          >
                            <ArrowPathIcon style={resetIconStyle} />
                          </button>
                        )}
                      </div>
                      {row.day === null && (
                        <div style={subLineStyle}>
                          {[row.supervisorName, row.jobTitle].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {lanes && (
                      <div style={{ position: 'relative', width: LANE_LABEL_WIDTH, flex: '0 0 auto' }}>
                        {lanes.map((lane) => (
                          <div
                            key={lane.lane}
                            style={{ ...laneLabelStyle, top: ROW_PADDING + lane.top, height: LANE_HEIGHT }}
                          >
                            {lane.lane}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {flagsWidth > 0 && (
                    <div
                      onMouseDown={(event) => event.stopPropagation()}
                      style={{
                        ...stickyLeftStyle,
                        ...flagsCellStyle,
                        left: nameWidth,
                        width: flagsWidth,
                        alignItems: lanes ? 'flex-start' : 'center',
                        paddingTop: lanes ? ROW_PADDING + 2 : 0,
                      }}
                    >
                      {row.flags.length > 0 && (
                        <div
                          onMouseEnter={hoverFlags(row)}
                          onMouseMove={hoverFlags(row)}
                          onMouseLeave={() => setHovered(null)}
                          style={employeeFlagsStyle}
                        >
                          {row.flags.map((flag, flagIndex) => (
                            <span key={`${flag.id}-${flagIndex}`} style={{ ...flagIconStyle, color: flag.color }}>
                              {flag.icon ?? '\u26A0'}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ position: 'relative', width: trackWidth, height: '100%', flex: '0 0 auto' }}>
                    {lanes ? renderExpanded(row, lanes) : renderCompact(row)}
                    {nowTicks
                      .filter((tick) => tick >= frame.start && tick <= frame.end && isDrawnX(xOf(tick)))
                      .map((tick) => <div key={tick} style={{ ...nowTickStyle, left: xOf(tick) }} />)}
                  </div>

                  <div
                    onMouseDown={(event) => event.stopPropagation()}
                    style={{
                      ...stickyRightStyle,
                      ...totalsCellStyle,
                      width: totalsWidth,
                      alignItems: lanes ? 'flex-start' : 'center',
                      paddingTop: lanes ? ROW_PADDING + 2 : 0,
                    }}
                  >
                    {!isTotalsCollapsed && TOTAL_COLUMNS.map((column) => {
                      const seconds = row.totals[column.key]
                      const sum = row.totals.direct + row.totals.indirect + row.totals.admin + row.totals.gap
                      return (
                        <div
                          key={column.key}
                          style={{ ...totalCellStyle, width: totalColumnWidth(column), color: seconds > 0 ? totalColors[column.key] : '#BCCCDC' }}
                        >
                          <div>{formatTotal(seconds)}</div>
                          {/* A blank line keeps every column's hours on the same baseline. */}
                          <div style={shareStyle}>{column.hasShare ? formatShare(seconds, sum) : '\u00A0'}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {selection && selection.width > 0 && (
              <div style={{ ...selectionStyle, left: leftWidth + selection.left, width: selection.width, height: bodyHeight }} />
            )}
          </div>

          <div style={{ flex: '1 1 auto' }} />

          <div style={{ ...footerStyle, width: contentWidth }}>
            <div style={{ ...stickyLeftStyle, ...footerCountStyle, width: nameWidth }}>
              {footerCount}
            </div>
            {flagsWidth > 0 && (
              <div style={{ ...stickyLeftStyle, ...footerFlagsStyle, left: nameWidth, width: flagsWidth }} />
            )}
            <div style={{ flex: '0 0 auto', width: trackWidth }} />
            <div
              style={{
                ...stickyRightStyle,
                ...footerActionsStyle,
                ...(isTotalsCollapsed ? collapsedTotalsStyle : {}),
                width: totalsWidth,
              }}
            >
              {refreshButton}
            </div>
          </div>
        </div>

        {menu && (
          <div ref={menuRef} role="menu" style={{ ...menuStyle, ...placeMenu(menu, menuSize) }}>
            {menu.segment.endMs === null && (
              <div style={menuNoteStyle}>
                <ClockIcon style={{ ...menuIconStyle, color: '#9FB3C8' }} />
                In progress
              </div>
            )}
            {menu.segment.isLocked && (
              <div style={menuNoteStyle}>
                <LockClosedIcon style={{ ...menuIconStyle, color: '#9FB3C8' }} />
                Locked by payroll
              </div>
            )}
            {menu.segment.tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                role="menuitem"
                onClick={() => runTool(tool.id)}
                onMouseEnter={() => setActiveTool(tool.id)}
                onMouseLeave={() => setActiveTool(null)}
                style={{ ...menuItemStyle, background: activeTool === tool.id ? '#F0F4F8' : 'transparent' }}
              >
                {tool.label}
              </button>
            ))}
          </div>
        )}

        {hovered?.kind === 'employee' && !isDragging && !menu && (
          <div ref={tooltipRef} style={{ ...tooltipStyle, ...placeTooltip(hovered, tooltipSize) }}>
            <div style={{ color: '#829AB1' }}>{hovered.employee}</div>
            {hovered.flags.map((flag, index) => (
              <div key={`${flag.id}-${index}`} style={{ color: flag.color }}>
                {flag.icon ?? '⚠'} {flag.label}{flag.message ? `: ${flag.message}` : ''}
              </div>
            ))}
          </div>
        )}

        {hovered?.kind === 'segment' && !isDragging && !menu && (
          <div ref={tooltipRef} style={{ ...tooltipStyle, ...placeTooltip(hovered, tooltipSize) }}>
            <div style={{ color: '#829AB1' }}>{hovered.employee}</div>
            <div style={{ fontWeight: 600 }}>{hovered.segment.label}</div>
            <div style={{ color: '#829AB1' }}>{hovered.segment.typeLabel}</div>
            <div>{formatDurationSeconds((hovered.segment.fullEndMs ?? now) - hovered.segment.fullStartMs)}</div>
            <div style={{ color: '#829AB1' }}>
              {formatClockSeconds(hovered.segment.fullStartMs, hovered.segment.timeZone)}
              {' – '}
              {hovered.segment.fullEndMs === null ? 'open' : formatClockSeconds(hovered.segment.fullEndMs, hovered.segment.timeZone)}
            </div>
            {hovered.segment.assignedByName && (
              <div style={{ color: '#829AB1' }}>
                Assigned by {hovered.segment.assignedByName}
                {hovered.segment.assignedAtMs !== null && (
                  ` \u00B7 ${formatAssignedAt(hovered.segment.assignedAtMs, hovered.segment)}`
                )}
              </div>
            )}
            {hovered.segment.isCorrected && (
              <div style={tooltipBadgeLineStyle}>
                <BackfillBadge />
                Corrected
              </div>
            )}
            {hovered.segment.flags.map((flag, index) => (
              <div key={`${flag.id}-${index}`} style={{ color: flag.color }}>
                {flag.icon ?? '\u26A0'} {flag.label}{flag.message ? `: ${flag.message}` : ''}
              </div>
            ))}
          </div>
        )}
      </div>

      {handles.map(({ column, left }) => (
        <div
          key={column}
          onMouseDown={startResize(column)}
          onDoubleClick={resetColumn(column)}
          onMouseEnter={() => setHoveredHandle(column)}
          onMouseLeave={() => setHoveredHandle(null)}
          title="Drag to resize, double-click to reset"
          style={{ ...resizeHandleStyle, left }}
        >
          <div
            style={{
              ...resizeLineStyle,
              opacity: resize?.column === column || (!resize && hoveredHandle === column) ? 1 : 0,
            }}
          />
        </div>
      ))}
    </div>
  )
}

/* =========================================================================
   Styles.
   ========================================================================= */

const frameStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
  width: '100%',
  height: '100%',
  position: 'relative',
}

const scrollStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  overflow: 'auto',
  position: 'relative',
}

const resizeHandleStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: RESIZE_HANDLE_WIDTH,
  zIndex: 6,
  cursor: 'col-resize',
  display: 'flex',
  justifyContent: 'center',
}

const resizeLineStyle: CSSProperties = {
  width: 2,
  height: '100%',
  background: '#9FB3C8',
  transition: 'opacity 120ms',
  pointerEvents: 'none',
}

const LOADING_KEYFRAMES = `@keyframes labor-timelines-loading {
  from { left: -35%; }
  to { left: 100%; }
}
@keyframes labor-timelines-spin {
  to { transform: rotate(360deg); }
}`

const loadingTrackStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 3,
  overflow: 'hidden',
  borderRadius: 2,
  background: '#DCEEFB',
  zIndex: 10,
  pointerEvents: 'none',
}

const loadingFillStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: '35%',
  borderRadius: 2,
  background: TODAY_COLOR,
  animation: 'labor-timelines-loading 1.1s ease-in-out infinite',
}

const loadingStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
  color: '#829AB1',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}

const emptyStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
  color: '#9FB3C8',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const contentStyle: CSSProperties = {
  position: 'relative',
  minHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
}

// Pinned to the bottom like the header is to the top, so the count stays in
// view while rows scroll.
const footerStyle: CSSProperties = {
  position: 'sticky',
  bottom: 0,
  zIndex: 3,
  display: 'flex',
  height: FOOTER_HEIGHT,
  background: '#FFFFFF',
  borderTop: '1px solid #E4E7EB',
}

const footerCountStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  // Lines up with the employee names.
  paddingLeft: CELL_PADDING + NAME_INDENT,
  paddingRight: CELL_PADDING - 4,
  color: '#829AB1',
  fontWeight: 500,
  borderRight: '1px solid #E4E7EB',
}

const footerCountTextStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const rowsToggleStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  padding: 2,
  borderRadius: 4,
  background: '#F0F4F8',
}

const rowsToggleButtonStyle: CSSProperties = {
  padding: '0 8px',
  height: 16,
  border: 'none',
  borderRadius: 3,
  background: 'transparent',
  color: '#829AB1',
  font: 'inherit',
  fontSize: 10,
  fontWeight: 500,
  cursor: 'pointer',
}

const rowsToggleActiveStyle: CSSProperties = {
  background: '#FFFFFF',
  color: '#243B53',
  boxShadow: '0 1px 1px rgba(0,0,0,0.08)',
}

const footerActionsStyle: CSSProperties = {
  alignItems: 'center',
  justifyContent: 'flex-end',
  // The button's own inset makes up the difference, so the icon's edge lines
  // up with the totals above it.
  paddingRight: CELL_PADDING - 4,
  borderLeft: '1px solid #E4E7EB',
}

const footerFlagsStyle: CSSProperties = {
  borderRight: '1px solid #E4E7EB',
}

const collapsedTotalsStyle: CSSProperties = {
  justifyContent: 'center',
  paddingLeft: 0,
  paddingRight: 0,
}

const collapseToggleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: DAY_BAND,
  padding: 0,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: '#9FB3C8',
  cursor: 'pointer',
}

const collapseIconStyle: CSSProperties = {
  width: 12,
  height: 12,
}

const refreshStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  padding: 0,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: '#627D98',
}

const refreshIconStyle: CSSProperties = {
  width: 14,
  height: 14,
}

const headerStyle: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 3,
  display: 'flex',
  height: AXIS_HEIGHT,
  background: '#FFFFFF',
  borderBottom: '1px solid #E4E7EB',
  userSelect: 'none',
}

const stickyLeftStyle: CSSProperties = {
  position: 'sticky',
  left: 0,
  zIndex: 2,
  flex: '0 0 auto',
  background: '#FFFFFF',
  boxSizing: 'border-box',
}

const stickyRightStyle: CSSProperties = {
  position: 'sticky',
  right: 0,
  zIndex: 2,
  flex: '0 0 auto',
  background: '#FFFFFF',
  boxSizing: 'border-box',
  display: 'flex',
  paddingLeft: CELL_PADDING,
  paddingRight: CELL_PADDING,
}

// No fixed height: globals.css makes everything border-box, so the header's
// 30px includes its bottom border. A 30px corner would paint over that line;
// stretching (like the totals header) leaves it visible end to end. Contents
// sit in the top DAY_BAND so they share a line with the date labels.
const cornerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  paddingLeft: CELL_PADDING,
  paddingRight: CELL_PADDING,
  borderRight: '1px solid #E4E7EB',
}

const flagsHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  paddingLeft: CELL_PADDING,
  paddingRight: CELL_PADDING,
  borderRight: '1px solid #E4E7EB',
}

const sortHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  fontWeight: 500,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

// Shrinks to an ellipsis when a header is wider than its column; the arrow
// never shrinks, so the active sort stays visible.
const sortLabelStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const sortMarkStyle: CSSProperties = {
  flex: '0 0 auto',
  fontSize: 8,
  lineHeight: 1,
  display: 'inline-flex',
  alignItems: 'flex-start',
}

const sortIndexStyle: CSSProperties = {
  fontSize: 8,
  marginLeft: 2,
}

const expandAllStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  height: DAY_BAND,
  gap: 4,
  color: '#829AB1',
  fontSize: 11,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
}

const switchStyle: CSSProperties = {
  position: 'relative',
  width: 22,
  height: 12,
  padding: 0,
  border: 'none',
  borderRadius: 6,
  cursor: 'inherit',
  transition: 'background 120ms',
}

const switchKnobStyle: CSSProperties = {
  position: 'absolute',
  top: 2,
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#FFFFFF',
  transition: 'left 120ms',
}

const todayDotStyle: CSSProperties = {
  display: 'inline-block',
  width: 6,
  height: 6,
  marginRight: 4,
  borderRadius: '50%',
  background: TODAY_COLOR,
  verticalAlign: 'middle',
}

const totalsHeaderStyle: CSSProperties = {
  alignItems: 'flex-start',
  borderLeft: '1px solid #E4E7EB',
}

const totalsCellStyle: CSSProperties = {
  borderLeft: '1px solid #E4E7EB',
  fontVariantNumeric: 'tabular-nums',
}

const totalCellStyle: CSSProperties = {
  paddingLeft: TOTAL_GAP,
  boxSizing: 'border-box',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const rowStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  display: 'flex',
  borderBottom: '1px solid #F0F4F8',
  boxSizing: 'border-box',
}

const nameCellStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  paddingLeft: CELL_PADDING,
  cursor: 'pointer',
  borderRight: '1px solid #E4E7EB',
}

const flagsCellStyle: CSSProperties = {
  display: 'flex',
  height: '100%',
  paddingLeft: CELL_PADDING,
  paddingRight: CELL_PADDING,
  borderRight: '1px solid #E4E7EB',
}

const nameBlockStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
}

const nameLineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: NAME_GAP,
  height: NAME_LINE_HEIGHT,
  minWidth: 0,
}

const chevronStyle: CSSProperties = {
  flex: '0 0 auto',
  width: CHEVRON_WIDTH,
  color: '#9FB3C8',
  fontSize: 10,
}

const nameTextStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#243B53',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const pillStyle: CSSProperties = {
  flex: '0 0 auto',
  padding: '0 6px',
  borderRadius: 9999,
  background: '#F0F4F8',
  color: '#627D98',
  fontSize: 10,
  lineHeight: '16px',
}

const subLineStyle: CSSProperties = {
  paddingLeft: NAME_INDENT,
  color: '#829AB1',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const laneLabelStyle: CSSProperties = {
  position: 'absolute',
  right: CELL_PADDING,
  display: 'flex',
  alignItems: 'center',
  color: '#9FB3C8',
  whiteSpace: 'nowrap',
}

// A day's (or employee's) stretch of the axis. No overflow clipping: that
// would stop the label inside from sticking.
const labelBlockStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  height: DAY_BAND,
}

// Sticks just right of the pinned columns (`left` is set to their width) while
// its block is in view; the next block's label pushes it out.
const employeeLabelStyle: CSSProperties = {
  position: 'sticky',
  width: 'max-content',
  height: DAY_BAND,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  paddingLeft: 4,
  overflow: 'hidden',
  whiteSpace: 'nowrap',
}

const employeeLabelNameStyle: CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: '#243B53',
  fontWeight: 600,
}

const dayLabelStyle: CSSProperties = {
  position: 'sticky',
  width: 'max-content',
  height: DAY_BAND,
  paddingLeft: 4,
  color: '#486581',
  whiteSpace: 'nowrap',
}

const hourLabelStyle: CSSProperties = {
  position: 'absolute',
  top: DAY_BAND,
  height: HOUR_BAND,
  paddingLeft: 4,
  color: '#9FB3C8',
  fontSize: 10,
  whiteSpace: 'nowrap',
}

const gridLineStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 0,
}

const barStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  height: '100%',
  borderRadius: 3,
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  overflow: 'hidden',
}

const backfillBadgeStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 11,
  height: 11,
  boxSizing: 'border-box',
  border: `1.5px solid ${BACKFILL_COLOR}`,
  borderRadius: 3,
  background: '#FFFFFF',
  color: BACKFILL_COLOR,
}

const tooltipBadgeLineStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  color: BACKFILL_COLOR,
}

const markerStyle: CSSProperties = {
  paddingLeft: 4,
  color: FLAG_COLOR,
  fontSize: 10,
  lineHeight: 1,
  flex: '0 0 auto',
}

const barTextStyle: CSSProperties = {
  padding: '0 6px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const nowTickStyle: CSSProperties = {
  position: 'absolute',
  top: 2,
  bottom: 2,
  width: 0,
  borderLeft: '1px dashed #829AB1',
  pointerEvents: 'none',
}

const selectionStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  zIndex: 1,
  background: 'rgba(16,42,67,0.06)',
  borderLeft: '1px solid #9FB3C8',
  borderRight: '1px solid #9FB3C8',
  pointerEvents: 'none',
}

const menuStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 11,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 112,
  padding: 4,
  background: '#FFFFFF',
  border: '1px solid #E4E7EB',
  borderRadius: 6,
  boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
}

const menuItemStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: '#243B53',
  font: 'inherit',
  fontSize: 12,
  textAlign: 'left',
  cursor: 'pointer',
}

const menuNoteStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '4px 8px 6px',
  marginBottom: 2,
  borderBottom: '1px solid #F0F4F8',
  color: '#9FB3C8',
  fontSize: 11,
  whiteSpace: 'nowrap',
}

const resetStyle: CSSProperties = {
  flex: '0 0 auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 16,
  height: 16,
  padding: 0,
  border: 'none',
  borderRadius: 4,
  background: 'transparent',
  color: FLAG_COLOR,
  cursor: 'pointer',
}

const employeeFlagsStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: FLAG_GAP,
  height: NAME_LINE_HEIGHT,
  fontSize: 12,
  lineHeight: 1,
  cursor: 'default',
}

const flagIconStyle: CSSProperties = {
  width: FLAG_ICON_WIDTH,
  textAlign: 'center',
}

const resetIconStyle: CSSProperties = {
  width: 12,
  height: 12,
}

const shareStyle: CSSProperties = {
  fontSize: 10,
  color: '#9FB3C8',
}

const menuIconStyle: CSSProperties = {
  width: 14,
  height: 14,
  color: '#829AB1',
  flex: '0 0 auto',
}

const tooltipStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 10,
  pointerEvents: 'none',
  background: '#FFFFFF',
  border: '1px solid #E4E7EB',
  borderRadius: 4,
  padding: '8px 12px',
  lineHeight: 1.5,
  color: '#334E68',
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
}
