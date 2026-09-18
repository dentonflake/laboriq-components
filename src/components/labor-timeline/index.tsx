import React, { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Retool } from '@tryretool/custom-component-support'

/* =========================================================================
   Flat input row — one record per row, straight from the edit-labor query
   (punch_rows ∪ shift_rows ∪ assignment_rows ∪ gap_rows, ordered by start).
   `type` is 'Punch' | 'Shift' | 'Gap' or a jobTypes.name ('Direct', …) for
   assignments. `end` is null while a segment is still open. `timezone` is the
   location's IANA zone — it anchors UTC instants to the local clock the
   employee actually worked.
   ========================================================================= */
type TimelineRow = {
  id: string | number
  punchId: string | null
  type: string
  description: string | null
  timezone: string | null
  start: string
  end: string | null
  duration: number
  assignedBy: string | null
  assignedAt: string | null
  gapId: string | number | null
  jobId: number | null
  isEditable: number | boolean
}

type Kind = 'shift' | 'punch' | 'assignment' | 'gap'
type Lane = 'Shift' | 'Punch' | 'Activity'

type Segment = {
  key: string
  id: string
  punchId: string | null
  lane: Lane
  kind: Kind
  type: string
  label: string
  startMs: number
  endMs: number | null
  flags: string[]
  row: TimelineRow
}

type Span = { start: number; end: number }

type Geometry = {
  domainStart: number
  available: number
  basePxPerHour: number
  pxPerHour: number
  zoom: number
}

const HOUR_MS = 3600000
const MINUTE_MS = 60000
const MIN_PX_PER_HOUR = 80
const GUTTER = 64
const LANE_HEIGHT = 28
const LANE_GAP = 4
const DAY_BAND = 14
const HOUR_BAND = 16
const AXIS_HEIGHT = DAY_BAND + HOUR_BAND
const MIN_LABEL_WIDTH = 40
const MIN_TICK_GAP = 60
const MAX_TICKS = 800
const FADE_PX = 18
const MAX_ZOOM = 20
const MIN_MARKER_WIDTH = 14
// Records are second-resolution and assignments tile end-to-start, so sub-second
// touches are rounding, not conflicts. Uncovered time needs a coarser floor —
// a few stray seconds between assignments is noise, a minute is a real hole.
const OVERLAP_TOLERANCE_MS = 1000
const OUTSIDE_TOLERANCE_MS = 1000
const UNCOVERED_TOLERANCE_MS = 60000
// Break and lunch punches legitimately carry no assignments; only work punches
// are expected to be fully covered by the Activity lane.
const WORK_PUNCH = 'work'
const FLAG_COLOR = '#CB6E17'
const MIN_DRAG_PX = 4
const ZOOM_SENSITIVITY = 0.01
const MAX_WHEEL_DELTA = 40

const LANES: Lane[] = ['Shift', 'Punch', 'Activity']
const TICK_STEPS_MINUTES = [1, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440]

const PALETTE: Record<Kind, { fill: string; border: string; text: string }> = {
  shift: { fill: '#EAE2F8', border: '#CFBCF2', text: '#51279B' },
  punch: { fill: '#E3F8FF', border: '#B3ECFF', text: '#0B69A3' },
  assignment: { fill: '#C6F7E2', border: '#8EEDC7', text: '#147D64' },
  gap: { fill: '#FFE3E3', border: '#FACDCD', text: '#A61B1B' },
}

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

// Offset (target-tz wall clock minus UTC) in ms at a given instant.
const tzOffsetMs = (utcMs: number, timeZone: string) => {
  const parts = formatter(timeZone, {
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - utcMs
}

// Snap an instant to the enclosing local hour boundary. Flooring in local
// space (rather than UTC) keeps zones with :30/:45 offsets on their own clock.
const snapToLocalHour = (utcMs: number, timeZone: string, mode: 'floor' | 'ceil') => {
  const offset = tzOffsetMs(utcMs, timeZone)
  const local = utcMs + offset
  const round = mode === 'floor' ? Math.floor : Math.ceil
  return round(local / HOUR_MS) * HOUR_MS - offset
}

const localHour = (utcMs: number, timeZone: string) =>
  Number(formatter(timeZone, { hourCycle: 'h23', hour: '2-digit' }).format(new Date(utcMs)))

// '6 AM' → '6a', '12 PM' → '12p'
const formatHour = (utcMs: number, timeZone: string) => {
  const [hour, meridiem] = formatter(timeZone, { hour: 'numeric' }).format(new Date(utcMs)).split(' ')
  return `${hour}${(meridiem ?? '').charAt(0).toLowerCase()}`
}

// '4:56 AM' → '4:56a'
const formatClock = (utcMs: number, timeZone: string) => {
  const [clock, meridiem] = formatter(timeZone, { hour: 'numeric', minute: '2-digit' })
    .format(new Date(utcMs)).split(' ')
  return `${clock}${(meridiem ?? '').charAt(0).toLowerCase()}`
}

const formatDay = (utcMs: number, timeZone: string) =>
  formatter(timeZone, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(utcMs))

const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
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

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(1, zoom))

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
   Row → segment mapping. Assignments and standalone gaps share the Activity
   lane: a gap is the unassigned remainder of a punch, so the two never
   overlap in time (gaps carrying an assignmentId are excluded upstream).
   ========================================================================= */

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

const toSegments = (rows: TimelineRow[]) =>
  rows.flatMap((row) => {
    const startMs = parseUtcMs(row.start)
    if (startMs === null) return []
    const kind = kindOf(row.type)
    return [{
      key: `${row.type}-${row.id}`,
      id: String(row.id),
      punchId: row.punchId === null || row.punchId === undefined ? null : String(row.punchId),
      lane: laneOf(kind),
      kind,
      type: row.type,
      label: row.description ?? row.type,
      startMs,
      endMs: parseUtcMs(row.end),
      flags: [],
      row,
    }]
  })

/* =========================================================================
   Discrepancy detection. All three checks are geometric — they compare the
   intervals the rows already describe, so no extra query columns are needed.
   Note this is a second definition of "discrepancy" alongside whatever the
   Logs grid's Flags column uses; the two can disagree.
   ========================================================================= */

const detectFlags = (segments: Segment[], now: number, timeZone: string): Segment[] => {
  const reasons = new Map<string, string[]>()
  const add = (key: string, reason: string) => {
    const existing = reasons.get(key)
    if (existing) {
      existing.push(reason)
      return
    }
    reasons.set(key, [reason])
  }
  const endOf = (segment: Segment) => segment.endMs ?? now

  const activity = segments.filter((segment) => segment.lane === 'Activity')
  const punches = segments.filter((segment) => segment.kind === 'punch')
  const punchById = new Map(punches.map((punch) => [punch.id, punch]))

  // Two records in the same lane claiming the same minutes — time counted
  // twice, whether that's two assignments, two punches (a break running
  // through a lunch and a work punch) or two shifts. Sorted by start, so the
  // scan can stop as soon as a later record begins past this one's end.
  const flagOverlaps = (items: Segment[]) => {
    const sorted = [...items].sort((a, b) => a.startMs - b.startMs)
    sorted.forEach((segment, index) => {
      for (let other = index + 1; other < sorted.length && sorted[other].startMs < endOf(segment); other += 1) {
        const shared = Math.min(endOf(segment), endOf(sorted[other])) - sorted[other].startMs
        if (shared <= OVERLAP_TOLERANCE_MS) continue
        add(segment.key, `Overlaps ${sorted[other].label} by ${formatDuration(shared)}`)
        add(sorted[other].key, `Overlaps ${segment.label} by ${formatDuration(shared)}`)
      }
    })
  }

  LANES.forEach((lane) => flagOverlaps(segments.filter((segment) => segment.lane === lane)))

  // Activity recorded outside the punch it belongs to — work while not clocked
  // in. The trailing edge is only checked on closed punches.
  activity.forEach((segment) => {
    const punch = segment.punchId === null ? undefined : punchById.get(segment.punchId)
    if (!punch) return
    if (segment.startMs < punch.startMs - OUTSIDE_TOLERANCE_MS) {
      add(segment.key, `Starts ${formatDuration(punch.startMs - segment.startMs)} before clock-in`)
    }
    if (punch.endMs !== null && endOf(segment) > punch.endMs + OUTSIDE_TOLERANCE_MS) {
      add(segment.key, `Ends ${formatDuration(endOf(segment) - punch.endMs)} after clock-out`)
    }
  })

  // Punch minutes with no assignment and no gap record. The Activity lane
  // should tile a work punch exactly; any hole is unaccounted labor.
  punches.filter((punch) => punch.label === WORK_PUNCH).forEach((punch) => {
    const punchEnd = endOf(punch)
    const covering = activity
      .filter((segment) => segment.punchId === punch.id)
      .map((segment) => ({
        start: Math.max(segment.startMs, punch.startMs),
        end: Math.min(endOf(segment), punchEnd),
      }))
      .filter((span) => span.end > span.start)
      .sort((a, b) => a.start - b.start)

    const holes: Span[] = []
    let cursor = punch.startMs
    covering.forEach((span) => {
      if (span.start > cursor) holes.push({ start: cursor, end: span.start })
      cursor = Math.max(cursor, span.end)
    })
    if (cursor < punchEnd) holes.push({ start: cursor, end: punchEnd })

    const significant = holes.filter((hole) => hole.end - hole.start > UNCOVERED_TOLERANCE_MS)
    if (significant.length === 0) return
    const total = significant.reduce((sum, hole) => sum + (hole.end - hole.start), 0)
    const windows = significant
      .slice(0, 3)
      .map((hole) => `${formatClock(hole.start, timeZone)}\u2013${formatClock(hole.end, timeZone)}`)
      .join(', ')
    const more = significant.length > 3 ? `, +${significant.length - 3} more` : ''
    add(punch.key, `${formatDuration(total)} unaccounted (${windows}${more})`)
  })

  return segments.map((segment) => ({ ...segment, flags: reasons.get(segment.key) ?? [] }))
}

// Greedy interval packing: place each record in the first sub-row that is free
// at its start time. A lane with no overlaps collapses to a single row, so a
// clean day looks exactly as it did before stacking existed.
const packRows = (items: Segment[], endOf: (segment: Segment) => number) => {
  const rows: Segment[][] = []
  const rowEnds: number[] = []
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs)
  sorted.forEach((segment) => {
    const end = endOf(segment)
    const index = rowEnds.findIndex((rowEnd) => rowEnd <= segment.startMs)
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

// Everything the query returned for this record, plus what the chart worked
// out about it. Spreading the source row keeps columns the component doesn't
// model (assignedBy, gapId, jobId, isEditable, anything added later) available
// to the app without another change here.
const selectionPayload = (segment: Segment, now: number, timeZone: string) => ({
  ...segment.row,
  lane: segment.lane,
  kind: segment.kind,
  isOpen: segment.endMs === null,
  startMs: segment.startMs,
  endMs: segment.endMs,
  // Recomputed rather than passed through: the query's `duration` is fixed at
  // fetch time, so it drifts for a still-open segment.
  durationSeconds: Math.round(((segment.endMs ?? now) - segment.startMs) / 1000),
  localStart: formatClock(segment.startMs, timeZone),
  localEnd: segment.endMs === null ? null : formatClock(segment.endMs, timeZone),
  flags: segment.flags,
  hasFlags: segment.flags.length > 0,
})

/* =========================================================================
   Component.
   ========================================================================= */

export const LaborTimeline = () => {
  const [rows] = Retool.useStateArray({ name: 'rows', label: 'Timeline records (query output)' })
  const [, setSelectedSegment] = Retool.useStateObject({
    name: 'selectedSegment',
    initialValue: {},
    inspector: 'hidden',
    description: 'The segment most recently clicked, including its source query row.',
  })
  // Retool events carry no payload, so state has to be set before firing.
  const onSegmentClick = Retool.useEventCallback({ name: 'segmentClick' })

  const segments = useMemo(
    () => toSegments((rows ?? []) as unknown as TimelineRow[]),
    [JSON.stringify(rows)],
  )

  const timeZone = useMemo(() => {
    const zone = ((rows ?? []) as unknown as TimelineRow[]).find((row) => row.timezone)?.timezone
    return zone ?? 'UTC'
  }, [JSON.stringify(rows)])

  const hasOpenSegment = segments.some((segment) => segment.endMs === null)

  // Open segments run to the current time, so the chart needs its own clock —
  // the query's `duration` is only correct at fetch time.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!hasOpenSegment) return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [hasOpenSegment])

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  // Layout effect, not useEffect: measuring after paint would show one frame
  // at the fallback scale and flash a scrollbar before the fit-to-width pass.
  useLayoutEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const [hovered, setHovered] = useState<{ segment: Segment; x: number; y: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [tooltipSize, setTooltipSize] = useState({ width: 0, height: 0 })

  // Retool renders custom components in an iframe, so `position: fixed` is
  // bounded by the component box — a tooltip can't overflow into the app and
  // has to be measured, then flipped and clamped to stay inside it.
  useLayoutEffect(() => {
    const node = tooltipRef.current
    if (!node) return
    const { width, height } = node.getBoundingClientRect()
    setTooltipSize((previous) => (
      previous.width === width && previous.height === height ? previous : { width, height }
    ))
  }, [hovered])

  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // A drag that zoomed still ends in a click on whatever bar sat under the
  // cursor — suppress that one so zooming never selects a segment.
  const didZoomRef = useRef(false)

  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<{ startX: number; currentX: number } | null>(null)
  const dragRef = useRef<{ startX: number; currentX: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  // Geometry the native wheel listener and the drag handlers need. Held in a
  // ref so those listeners register once instead of on every scale change.
  const geometryRef = useRef<Geometry | null>(null)
  // Scroll offset to apply on the render that follows a zoom change, so the
  // anchored time lands back under the cursor.
  const pendingScrollRef = useRef<number | null>(null)

  const flagged = useMemo(
    () => detectFlags(segments, now, timeZone),
    [segments, now, timeZone],
  )

  const domain = useMemo(() => {
    if (segments.length === 0) return null
    const earliest = Math.min(...segments.map((segment) => segment.startMs))
    const latest = Math.max(...segments.map((segment) => segment.endMs ?? now))
    return {
      start: snapToLocalHour(earliest, timeZone, 'floor'),
      end: snapToLocalHour(latest, timeZone, 'ceil'),
    }
  }, [segments, timeZone, now])

  const geometry = useMemo<Geometry | null>(() => {
    if (!domain) return null
    const hoursSpan = Math.max((domain.end - domain.start) / HOUR_MS, 1)
    const available = Math.max(Math.floor(containerWidth - GUTTER), MIN_PX_PER_HOUR)
    // Zoom 1 is the existing behavior: fit the data to the width when it fits,
    // otherwise fall back to a fixed scale and scroll.
    const basePxPerHour = Math.max(MIN_PX_PER_HOUR, available / hoursSpan)
    return {
      domainStart: domain.start,
      available,
      basePxPerHour,
      pxPerHour: basePxPerHour * zoom,
      zoom,
    }
  }, [domain, containerWidth, zoom])

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

  const canRender = segments.length > 0 && domain !== null && geometry !== null

  // React attaches wheel listeners passively at the root, so preventDefault
  // there is a no-op — this has to be a native non-passive listener or the
  // browser's own ctrl+wheel page zoom wins.
  useEffect(() => {
    const node = scrollRef.current
    if (!node || !canRender) return
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const current = geometryRef.current
      if (!current) return
      const delta = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, event.deltaY))
      const nextZoom = clampZoom(current.zoom * Math.exp(-delta * ZOOM_SENSITIVITY))
      if (nextZoom === current.zoom) return
      const cursorOffset = event.clientX - node.getBoundingClientRect().left
      const hoursAtCursor = (node.scrollLeft + cursorOffset) / current.pxPerHour
      pendingScrollRef.current = hoursAtCursor * current.basePxPerHour * nextZoom - cursorOffset
      setZoom(nextZoom)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [canRender])

  const finishDrag = () => {
    const current = dragRef.current
    dragRef.current = null
    setDrag(null)
    const geo = geometryRef.current
    if (!current || !geo) return
    const left = Math.min(current.startX, current.currentX)
    const right = Math.max(current.startX, current.currentX)
    if (right - left < MIN_DRAG_PX) return
    didZoomRef.current = true
    const spanHours = (right - left) / geo.pxPerHour
    const nextZoom = clampZoom(geo.available / spanHours / geo.basePxPerHour)
    pendingScrollRef.current = (left / geo.pxPerHour) * geo.basePxPerHour * nextZoom
    setZoom(nextZoom)
  }

  const isDragging = drag !== null
  useEffect(() => {
    if (!isDragging) return
    const onMove = (event: MouseEvent) => {
      const node = trackRef.current
      if (!node || !dragRef.current) return
      const x = event.clientX - node.getBoundingClientRect().left
      dragRef.current = { ...dragRef.current, currentX: Math.max(0, Math.min(x, node.offsetWidth)) }
      setDrag(dragRef.current)
    }
    const onUp = () => finishDrag()
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDragging])

  if (!canRender) {
    return (
      <div ref={containerRef} style={emptyStyle}>No records</div>
    )
  }

  const { pxPerHour } = geometry
  const hoursSpan = Math.max((domain.end - domain.start) / HOUR_MS, 1)
  const trackWidth = hoursSpan * pxPerHour
  const xOf = (ms: number) => ((ms - domain.start) / HOUR_MS) * pxPerHour

  const stepMs = chooseTickStepMs(pxPerHour, hoursSpan)
  const tickCount = Math.floor((domain.end - domain.start) / stepMs) + 1
  const ticks = Array.from({ length: tickCount }, (_, index) => domain.start + index * stepMs)
  const hourTicks = Array.from({ length: Math.round(hoursSpan) + 1 }, (_, index) => domain.start + index * HOUR_MS)
  const dayStarts = hourTicks.filter((tick, index) => index === 0 || localHour(tick, timeZone) === 0)
  const dayStartSet = new Set(dayStarts)
  const showMinutes = stepMs < HOUR_MS

  // Each lane packs into as many sub-rows as its deepest overlap needs, so the
  // Activity lane grows only on days where records actually conflict.
  const endOfSegment = (segment: Segment) => segment.endMs ?? now
  const laneLayout = LANES.reduce<{ lane: Lane; rows: Segment[][]; top: number; height: number }[]>(
    (accumulator, lane) => {
      const rows = packRows(flagged.filter((segment) => segment.lane === lane), endOfSegment)
      const height = Math.max(rows.length, 1) * (LANE_HEIGHT + LANE_GAP) - LANE_GAP
      const previous = accumulator[accumulator.length - 1]
      const top = previous ? previous.top + previous.height + LANE_GAP : 0
      return [...accumulator, { lane, rows, top, height }]
    },
    [],
  )
  const lanesHeight = laneLayout.reduce((total, lane) => Math.max(total, lane.top + lane.height), 0)
  const nowVisible = now >= domain.start && now <= domain.end

  const onTrackMouseDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return
    const node = trackRef.current
    if (!node) return
    const x = event.clientX - node.getBoundingClientRect().left
    didZoomRef.current = false
    dragRef.current = { startX: x, currentX: x }
    setDrag(dragRef.current)
    setHovered(null)
  }

  const selectSegment = (segment: Segment) => {
    if (didZoomRef.current) {
      didZoomRef.current = false
      return
    }
    setSelectedKey(segment.key)
    setSelectedSegment(selectionPayload(segment, now, timeZone))
    onSegmentClick()
  }

  const selection = drag && {
    left: Math.min(drag.startX, drag.currentX),
    width: Math.abs(drag.currentX - drag.startX),
  }

  return (
    <div ref={containerRef} style={rootStyle}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', width: GUTTER }}>
          <div style={{ height: AXIS_HEIGHT }} />
          {laneLayout.map((lane) => (
            <div key={lane.lane} style={{ ...laneLabelStyle, height: lane.height, marginBottom: LANE_GAP }}>
              {lane.lane}
            </div>
          ))}
        </div>

        <div ref={scrollRef} style={{ flex: '1 1 auto', overflowX: 'auto', overflowY: 'hidden' }}>
          <div
            ref={trackRef}
            onMouseDown={onTrackMouseDown}
            style={{ position: 'relative', width: trackWidth, cursor: 'crosshair', userSelect: 'none' }}
          >
            <div style={{ position: 'relative', height: AXIS_HEIGHT }}>
              {dayStarts.map((dayStart) => (
                <div key={`day-${dayStart}`} style={{ ...dayLabelStyle, left: xOf(dayStart) }}>
                  {formatDay(dayStart, timeZone)}
                </div>
              ))}
              {ticks.map((tick) => (
                <div key={`tick-${tick}`} style={{ ...hourLabelStyle, left: xOf(tick) }}>
                  {showMinutes ? formatClock(tick, timeZone) : formatHour(tick, timeZone)}
                </div>
              ))}
              {nowVisible && (
                <div style={{ ...nowLabelStyle, left: xOf(now) }}>now</div>
              )}
            </div>

            <div style={{ position: 'relative', height: lanesHeight }}>
              {ticks.map((tick) => (
                <div
                  key={`grid-${tick}`}
                  style={{
                    ...gridLineStyle,
                    left: xOf(tick),
                    borderLeft: dayStartSet.has(tick) ? '1px solid #D9E2EC' : '1px solid #F0F4F8',
                  }}
                />
              ))}

              {laneLayout.map((lane) => (
                lane.rows.map((row, rowIndex) => (
                  <div
                    key={`${lane.lane}-${rowIndex}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: lane.top + rowIndex * (LANE_HEIGHT + LANE_GAP),
                      height: LANE_HEIGHT,
                    }}
                  >
                    {row.map((segment) => {
                      const left = xOf(segment.startMs)
                      const width = Math.max(xOf(endOfSegment(segment)) - left, 2)
                      const colors = PALETTE[segment.kind]
                      const isOpen = segment.endMs === null
                      const isFlagged = segment.flags.length > 0
                      const isSelected = segment.key === selectedKey
                      const fade = `linear-gradient(to right, #000 0%, #000 calc(100% - ${FADE_PX}px), transparent 100%)`
                      return (
                        <div
                          key={segment.key}
                          onMouseEnter={(event) => setHovered({ segment, x: event.clientX, y: event.clientY })}
                          onMouseMove={(event) => setHovered({ segment, x: event.clientX, y: event.clientY })}
                          onMouseLeave={() => setHovered(null)}
                          onClick={() => selectSegment(segment)}
                          style={{
                            ...barStyle,
                            left,
                            width,
                            background: colors.fill,
                            border: `1px solid ${isSelected ? colors.text : colors.border}`,
                            color: colors.text,
                            cursor: 'pointer',
                            ...(isOpen && width > FADE_PX + 6
                              ? { maskImage: fade, WebkitMaskImage: fade }
                              : {}),
                          }}
                        >
                          {isFlagged && width >= MIN_MARKER_WIDTH && (
                            <span style={markerStyle}>&#9888;</span>
                          )}
                          {width >= MIN_LABEL_WIDTH && (
                            <span style={{ ...barTextStyle, paddingLeft: isFlagged ? 2 : 6 }}>
                              {segment.label}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ))
              ))}

              {nowVisible && <div style={{ ...nowLineStyle, left: xOf(now) }} />}
            </div>

            {selection && selection.width > 0 && (
              <div style={{ ...selectionStyle, left: selection.left, width: selection.width }} />
            )}
          </div>
        </div>
      </div>

      {hovered && !isDragging && (
        <div ref={tooltipRef} style={{ ...tooltipStyle, ...placeTooltip(hovered, tooltipSize) }}>
          <div style={{ fontWeight: 600 }}>{hovered.segment.label}</div>
          <div style={{ color: '#829AB1' }}>{hovered.segment.type}</div>
          <div>{formatDuration((hovered.segment.endMs ?? now) - hovered.segment.startMs)}</div>
          <div style={{ color: '#829AB1' }}>
            {formatClock(hovered.segment.startMs, timeZone)}
            {' – '}
            {hovered.segment.endMs === null ? 'open' : formatClock(hovered.segment.endMs, timeZone)}
          </div>
          {hovered.segment.flags.map((flag) => (
            <div key={flag} style={{ color: FLAG_COLOR }}>&#9888; {flag}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/* =========================================================================
   Styles — chart only, no surrounding chrome.
   ========================================================================= */

const rootStyle: CSSProperties = {
  fontFamily: 'Inter, system-ui, sans-serif',
  fontSize: 11,
  width: '100%',
}

const emptyStyle: CSSProperties = {
  ...rootStyle,
  color: '#9FB3C8',
  padding: 8,
}

const laneLabelStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  paddingRight: 8,
  color: '#627D98',
  whiteSpace: 'nowrap',
}

const dayLabelStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  height: DAY_BAND,
  paddingLeft: 3,
  color: '#486581',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const hourLabelStyle: CSSProperties = {
  position: 'absolute',
  top: DAY_BAND,
  height: HOUR_BAND,
  paddingLeft: 3,
  color: '#9FB3C8',
  whiteSpace: 'nowrap',
}

const nowLabelStyle: CSSProperties = {
  position: 'absolute',
  top: DAY_BAND,
  height: HOUR_BAND,
  paddingLeft: 3,
  color: '#627D98',
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

const nowLineStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 0,
  borderLeft: '1px dashed #829AB1',
  pointerEvents: 'none',
}

const selectionStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  background: 'rgba(16,42,67,0.06)',
  borderLeft: '1px solid #9FB3C8',
  borderRight: '1px solid #9FB3C8',
  pointerEvents: 'none',
}

const tooltipStyle: CSSProperties = {
  position: 'fixed',
  zIndex: 10,
  pointerEvents: 'none',
  background: '#FFFFFF',
  border: '1px solid #E4E7EB',
  borderRadius: 4,
  padding: '6px 8px',
  lineHeight: 1.5,
  color: '#334E68',
  whiteSpace: 'nowrap',
  boxShadow: '0 1px 1px rgba(0,0,0,0.08), 0 8px 10px rgba(0,0,0,0.08)',
}
