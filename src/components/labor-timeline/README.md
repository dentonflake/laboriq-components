# LaborTimeline

A minimal Gantt-style chart that compares an employee's scheduled shift, actual
punches, and the assignments and gaps that happened inside those punches.

## Retool setup

1. Drag **LaborTimeline** onto the canvas.
2. Bind the `rows` prop (inspector label: *Timeline records (query output)*) to
   the edit-labor timeline query's transformer output — `formatDataAsArray(data)`
   is already the correct shape.

That is the only prop.

## Interaction

| Retool name | Kind | What it is |
|---|---|---|
| `selectedSegment` | state (object) | The most recently clicked segment |
| `segmentClick` | event handler | Fires on every bar click, after `selectedSegment` is set |

Retool events cannot carry a payload, so the component sets `selectedSegment`
first and fires `segmentClick` second — read the state inside the handler
(e.g. open a modal, or pass `{{ timeline.selectedSegment.id }}` to a query).

The payload is the entire source query row, spread, plus what the chart worked
out about it — so columns the component doesn't model (`assignedBy`, `gapId`,
`jobId`, `isEditable`, anything added to the query later) come through
untouched:

```js
{
  // …every column from the query row, verbatim…
  id: '188576730', punchId: '7c6655cf…', type: 'Direct',
  description: 'Order Picker', jobId: 41, isEditable: 1,

  // …plus chart-derived fields:
  lane: 'Activity',            // 'Shift' | 'Punch' | 'Activity'
  kind: 'assignment',          // 'shift' | 'punch' | 'assignment' | 'gap'
  isOpen: true,                // end was null
  startMs: 1789651800000,
  endMs: null,
  durationSeconds: 30144,      // live; the query's `duration` is stale once open
  localStart: '6:30a',
  localEnd: null,
  flags: ['Ends 52m 24s after clock-out'],
  hasFlags: true,
}
```

The clicked bar's border darkens to its own text color to show what's selected.
Clicking empty space does not clear it. A drag that zooms never selects, even
though it ends with a click on whatever bar was under the cursor.

## Expected row shape

One row per record, as produced by the `punch_rows ∪ shift_rows ∪
assignment_rows ∪ gap_rows` union:

| Field | Used for |
|---|---|
| `id` | React key (combined with `type`) |
| `type` | Lane + color. `'Shift'`, `'Punch'`, `'Gap'`, or a `jobTypes.name` (`'Direct'`, …) for assignments |
| `description` | Bar label and tooltip title (`'Gap'` rows fall back to the type) |
| `timezone` | IANA zone used for every axis and tooltip time |
| `start` | Bar start. ISO (`…Z`) or naive `convert_tz` output both parse |
| `end` | Bar end. `null` means still open — the bar runs to the current time |

Other columns the query returns (`punchId`, `duration`, `assignedBy`,
`assignedAt`, `gapId`, `jobId`, `isEditable`) are accepted and ignored.

## Layout

Three lanes. Assignments and gaps share the **Activity** lane — a gap is the
unassigned remainder of a punch, so the two never overlap in time (gaps that
carry an `assignmentId` are excluded by the query).

```
         6a      9a      12p     3p
Shift    |=========== work ==========|
Punch    |========== work ========
Activity |Gap|= Order Picker =|Putaway|
```

| Lane | Rows | Color |
|---|---|---|
| Shift | `type = 'Shift'` — the scheduled shift | `#EAE2F8` |
| Punch | `type = 'Punch'` — actual clocked time | `#E3F8FF` |
| Activity | assignments (any `jobTypes.name`) | `#C6F7E2` |
| Activity | `type = 'Gap'` — clocked in, unassigned | `#FFE3E3` |

## Behavior

- **Axis** spans the data extent (earliest start → latest end or now), snapped
  out to whole local hours. No dead space.
- **Scale** fits the component width when the data fits; below 80px/hour it
  pins to 80px/hour and scrolls horizontally. Lane labels stay pinned in a
  left gutter.
- **Open segments** (`end: null`) run to the current time with a faded right
  edge, and a dashed `now` line marks the current time across all lanes. The
  component re-renders every 30s while any segment is open.
- **Durations** are computed in-component from `start`/`end` rather than read
  from the query's `duration` column, which is only accurate at fetch time for
  open segments.
- **Bar text** is the description, hidden entirely below 40px so a bar never
  shows a half-truncated word. Full detail is in the hover tooltip
  (description, type, duration, local start–end).
- **Tooltip placement** flips and clamps to stay inside the component. Retool
  renders custom components in an iframe, so `position: fixed` is bounded by
  the component box rather than the app — a tooltip cannot overflow into the
  page and would otherwise clip on the bottom lane. It is measured on hover,
  then flipped above the cursor when there is no room below and flipped left
  near the right edge.
- **Day boundaries** get a heavier grid line and a date label in the axis.

## Zoom

| Gesture | Effect |
|---|---|
| Click a bar | Set `selectedSegment`, then fire `segmentClick` |
| Trackpad pinch, or ⌘/ctrl + scroll | Zoom anchored at the cursor — the time under the pointer stays put |
| Drag across the chart | Zoom into the dragged time range |
| Horizontal scroll / two-finger swipe / scrollbar | Pan when zoomed in |

Zoom runs from 1× (fit-to-width, the default) to 20×. Pinching out returns to
1× and clamps there; there is no separate reset control. Plain scroll without a
modifier is left alone so the surrounding Retool page still scrolls normally.

**Tick granularity is adaptive.** The axis picks the coarsest interval from
1/5/10/15/30/60 minutes (up to 24h) that keeps ticks ~60px apart, so zooming in
reveals minute-level detail instead of leaving hour ticks 1600px apart. Labels
switch from `4a` to `4:05a` once the interval drops below an hour. Two
consequences worth knowing:

- At 1× a short data extent can show sub-hour ticks (a 12-hour extent in a wide
  panel is ~175px/hour, which yields 30-minute ticks). Raise `MIN_TICK_GAP` to
  make it lazier, or floor `chooseTickStepMs` at 60 minutes to force hourly.
- A tick-count cap (`MAX_TICKS`) steps the interval back up rather than emitting
  thousands of nodes for a long date range at high zoom.

## Discrepancies

The component derives discrepancies from the rows it already has — no extra
query columns. Flagged bars get an amber ⚠ and the tooltip gains a reason line
per problem. Three checks run:

| Check | Flags | Reason text |
|---|---|---|
| Overlapping records in a lane | both records | `Overlaps Gap by 13m 17s` |
| Uncovered punch time | the punch | `21m 44s unaccounted (7:08a–7:30a)` |
| Activity outside its punch | the record | `Starts 7m 0s before clock-in` |

**Overlaps** mean the same minutes are counted twice. The check runs per lane,
so it catches all three shapes:

- two activity records — an `Indirect` assignment and a `Gap` both claiming
  6:52:00–7:05:17
- two punches — a `break` running straight through a `lunch` and a `work` punch
- two shifts — two overlapping scheduled shifts

Records that merely touch (one ending exactly where the next begins) are not
overlaps. Any lane with overlapping records splits into as many sub-rows as its
deepest conflict needs so both stay visible; a clean lane still renders as a
single row.

**Uncovered punch time** only applies to punches whose `description` is `work`.
Break and lunch punches carry no assignments by design, so including them would
flag every one as 100% unaccounted.

**Activity outside its punch** matches a record to its punch via `punchId`. The
trailing edge is only checked on closed punches, and records with a null or
unmatched `punchId` are skipped.

Tolerances are constants at the top of the file: `OVERLAP_TOLERANCE_MS` and
`OUTSIDE_TOLERANCE_MS` are 1s (records are second-resolution and assignments
tile end-to-start, so sub-second touches are rounding), and
`UNCOVERED_TOLERANCE_MS` is 60s (a few stray seconds between assignments is
noise; a minute is a real hole).

> This is a second definition of "discrepancy" alongside whatever the Logs
> grid's Flags column uses. The two are computed independently and can disagree.

## Known limitations

- Uses the first non-null `timezone` in the row set for the whole chart. Fine
  for one employee on one location's clock; a range spanning locations in
  different zones would render on the first location's clock.
- Hour ticks step by a fixed hour from a local-hour-aligned start, so a range
  crossing a DST transition drifts by the offset change for the rest of that
  range. Not an issue for `America/Phoenix`.
- Lanes grow taller when records overlap, so the component's content height is
  data-dependent. Give it enough room in Retool (or enable auto-height) or a
  conflicted day will clip.
