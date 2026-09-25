# LaborTimelines

Every filtered employee's timeline stacked on one shared, wall-clock-aligned
axis, with each employee's direct / indirect / admin / gap totals pinned on the
right. Intended to replace `LaborTimeline`.

The component draws; the transformer decides. Flags, locks, tools and
corrections are all worked out in Retool — the component only looks up how to
draw them.

## Retool setup

1. Drag **LaborTimelines** onto the canvas and give it a fixed height — rows
   scroll inside the component and only the visible ones are rendered. The
   same goes sideways: bars, ticks and grid lines are only drawn near the
   visible stretch of time, so long ranges stay smooth.
2. Bind the inputs:

| Input | Bind to |
|---|---|
| *Employees* (`employees`) | The filtered, slimmed list — `{{ editLabor__transformer__timelineEmployees.value }}` |
| *Types* (`types`) | The record type definitions |
| *Job types* (`jobTypes`) | The job type definitions |
| *Flags* (`flagDefinitions`) | The flag definitions |
| *Tools* (`toolDefinitions`) | The tool definitions |
| *Loading* (`isLoading`) | `{{ editLabor__query__getEmployees.isFetching }}` |

The four definition inputs are the same arrays `groupLaborRecords` uses.

While `isLoading` is true the component shows a loading bar instead of *No
records* on the first load, and a thin bar across the top (over the current
rows) on a refresh. *No records* only shows when loading has finished and the
list is still empty.

**Filtering happens in Retool**, before the data reaches the component — a
transformer drops employees (employee, supervisor, job title, flags) and records
(type, job type, job) that don't match the page filters. That's safe because
the transformer computed every flag against the full data first, so hiding
records never changes what's flagged. Totals stay full-range. Expanded rows only
show lanes that some visible record uses.

## Slim records

Records reference definitions by value rather than carrying their own copies.
Retool copies the whole `employees` value into the component's iframe, and
with every record holding its own type, job type, flag and tool objects that
copy took several seconds on large ranges. `slimLaborEmployees` (preloaded JS)
produces this shape from the full transformer output. Full objects are still
accepted anywhere a value is expected.

## Fields used

**Employee**

| Field | Used for |
|---|---|
| `cargoId` | Row key, gray pill next to the name |
| `name`, `jobTitle` | Name line, and `supervisor · job title` sub-line |
| `supervisorName` | Sub-line |
| `timezone` | Row's now tick, only when its records have no timezone |
| `directSeconds`, `indirectSeconds`, `adminSeconds`, `gapSeconds` | Totals column — read as-is |
| `flags[]` | Flag values (or `{ value, message }`) — icons after the name, hover for label and message |
| `canReset` | Shows the ↻ reset button |

**Record**

| Field | Used for |
|---|---|
| `type` | `'Shift'`, `'Punch'`, `'Gap'`, `'Assignment'` — lane, and colors from *Types* |
| `jobType` | Job type value — assignment colors and tooltip type from *Job types* |
| `jobId`, `jobName` | Assignment bar label |
| `punchType` | Shift/punch bar label; anything but `work` is striped |
| `start` / `end` | Bar extent. `end: null` = still open, runs to now |
| `timezone` | Places the record on the wall-clock axis |
| `isCorrected` | Orange check badge and *Corrected* tooltip line |
| `flags[]` | Flag values, or `{ value, message }` — bar marker and border, tooltip lines, lock |
| `tools[]` | Tool values, in order — the log's menu, labelled from *Tools* |
| `assignedBy`, `assignedAt` | Tooltip "Assigned by …" line (`assignedBy` is the name) |

Only `color` is required for a type — `border` and `textColor` are derived by
darkening it when absent. A record whose type has no color at all falls back to
the built-in defaults (Shift purple, Punch blue, Gap red, Assignment green). A
flag or tool value missing from its definitions still shows, labelled with its
raw value.

## Layout

```
                            │ Mon Sep 21                     │ Direct Indirect  Admin   Gap
                            │ 6a    9a    12p    3p    6p    │
▸ Aaron Humphries  (4277)   │ ░[▓▓▓ Putaway ▓▓▓▓]░[▓▓]░      │ 6h 24m  1h 10m     0m   12m
  Marisa Miranda · Put Away │                                │  82%     15%      0%    3%
▾ Matthew Harmon   (3738)   │  |==== work ====|              │     0m      0m 11h 24m    0m
  Jason Rogers · Area Mgr   │  |==== work ===|=|             │
                  Activity  │  |=== Admin ===|=|             │
```

- **Bars** look the same collapsed or expanded. Break, lunch and meal records
  are striped so intentional time off doesn't read as a coverage hole.
- **Collapsed row** — a single-lane row draws exactly like an expanded lane. A
  mixed row layers shift → punch → activity, each inset inside the previous.
- **Expanded row** — click the name to toggle. Only rows showing more than one
  record type (after filters) can expand. Shift / Punch / Activity lanes, with
  overlapping records split into sub-rows. Any number can be open; expansion
  survives filter changes (keyed by `cargoId`).
- **Pinned** — the axis sticks to the top, names to the left, totals to the
  right. Horizontal scroll and zoom are shared by every row.
- **Resizable columns** — drag the inner edge of the name or totals column
  (a line appears on hover). Names run 160–480px, totals 208–480px with the
  four total columns sharing the width equally; the timeline re-fits to what's
  left. Double-click a handle to reset. Widths last for the session.
- **Sort** — click **Employee**, a **date** in the axis, **Direct**,
  **Indirect**, **Admin** or **Gap**. A date sorts by each employee's earliest
  *visible* start **on that day** (each log's local date), so the type/job
  filters decide what it means (Type = Punch → who clocked in first on that
  day); equal starts go shortest-first, and employees with nothing that day
  sort last in either direction. The arrow shows on the sorted date only;
  clicking it again flips, clicking another date switches days. Clicking the
  active column flips it; **shift-click** adds a tiebreaker. Names start A→Z,
  totals largest-first.
- **Expand all** — the switch above the names opens every expandable row.
- **Today** — a blue dot before today's date, using the viewer's browser date.
- **Footer** — pinned to the bottom: the number of employees shown, which
  follows whatever the filtered data contains, and a ↻ button at the right
  that fires the `refresh` event. The icon spins (and the button is disabled)
  while `isLoading` is true.
- **Totals** — hours, and underneath, each category's share of
  Direct + Indirect + Admin + Gap.

## Wall-clock alignment

Each record is placed by its local clock reading at its own location, not its
UTC instant. 6a in Phoenix and 6a in Los Angeles sit in the same column even
though they're an hour apart in real time, and there's no DST drift across a
multi-day range. Because "now" is a different column per zone, each row gets a
short dashed tick at its own local time. The component re-renders every 30s
while any record is open.

## Flags

Record flags arrive on `records[].flags` — flag definitions from the flags
array plus a record-specific `message`:

```js
{ value: 'overlap', label: 'Overlap', icon: '⚠️', color: '#CB6E17', message: 'Overlaps Gap by 13m 17s', … }
```

- **Bar** — the first *problem* flag's icon at the left, and its color on the
  border. `locked` isn't a problem: a locked log shows 🔒 but keeps its normal
  border.
- **Tooltip** — one line per flag, `{icon} {label}: {message}`, in the flag's
  color (just `{icon} {label}` when there's no message).

**Employee flags** arrive the same way on `flags[]` and show as icons right
after the name — every one, `discrepancy` and `hasLockedLogs` included. Hover
them for a tooltip listing each flag as `{icon} {label}: {message}`.

## Corrected assignments

`isCorrected: true` gets a small orange check badge at the left of the bar
(after the flag icon, hidden on bars too narrow for it) and a *Corrected* line
in the tooltip.

## Reset

The ↻ button shows next to the name when the employee has `canReset: true`.
Clicking it sets `selectedEmployee` — the employee object without `records`,
plus `cargoId`, `employeeName` and `isLocked` — then fires `reset`.

Who may reset is decided by the transformer, not the component, so the table
and the timeline always agree:

```js
canReset: !hasLockedLogs && (hasDiscrepancy || isSupport)
```

A locked employee gets no button at all; the 🔒 `hasLockedLogs` flag icon
explains why.

| Retool name | Kind | What it is |
|---|---|---|
| `selectedEmployee` | state (object, hidden) | The employee whose reset was last clicked |
| `reset` | event | Reset that employee |

## Refresh

| Retool name | Kind | What it is |
|---|---|---|
| `refresh` | event | The footer's ↻ was clicked — re-run the employees query |

## Log tools

Clicking a bar opens a small menu of that log's **tools** — exactly
`records[].tools`, in order, each shown as its `label`. Which
tools a log gets (and the rules behind them: lock, open log, `isEditable`,
flags, type) are decided by the transformer; the component just draws them. A
log with no tools doesn't open a menu.

Picking a tool sets `selectedLog` — with the chosen tool's value on
`selectedLog.tool` — then fires the single `tool` event. Branch on the tool in
one handler:

```js
const log = laborTimelines1.selectedLog

switch (log.tool) {
  case 'actions': editLabor__query__openActions.trigger({ additionalScope: { log } }); break
  case 'fill':    /* … */ break
  case 'split':   /* … */ break
}
```

The tool lives inside `selectedLog` rather than its own state so the two always
arrive together — separate states sync independently, and the handler could
see the previous tool.

| Retool name | Kind | What it is |
|---|---|---|
| `selectedLog` | state (object, hidden) | The log whose tool was last picked, including `tool` |
| `tool` | event | A tool was picked — read `selectedLog.tool` |

A locked log's menu also shows *Locked by payroll*; an open one shows *In
progress*.

`selectedLog` is the slim record as sent, with `type` turned back into a
`{ value, label }` object (so handlers read `log.type.value` either way), plus
`tool`, `cargoId`, `employeeName`, `jobType`, `lane`,
`kind`, `isOpen`, `isLocked`, `hasIssues`, `startMs`, `endMs`, a live
`durationSeconds`, `localStart` and `localEnd`.

The menu closes on an outside click, Esc, scroll, zoom, or new data.

## Event timing

Retool applies custom component state asynchronously, so an event fired right
after setting state would run its handler against the *previous* value. The
component tags `selectedLog` / `selectedEmployee` with a unique `eventId`,
waits until that exact value comes back from Retool, and only then fires the
event — handlers can read the state directly.

## Interaction

| Gesture | Effect |
|---|---|
| Hover a bar | Tooltip: employee, label, type, duration, start–end (to the second), assigned by, corrected, flags |
| Click a bar | Open the log's tools menu |
| Click a name | Expand / collapse that employee |
| Click a header or date | Sort; click again to flip |
| Shift-click a header or date | Add / flip a secondary sort |
| Drag a column edge | Resize the name or totals column; double-click to reset |
| Pinch, or ⌘/ctrl + scroll | Zoom anchored at the cursor |
| Drag across the chart | Zoom into the dragged range |
| Scroll / swipe | Pan |

Zoom runs from 1× (fit-to-width, or 60px/hour for long ranges) up to 20×, and
out until 48 hours are in view (`MAX_VISIBLE_HOURS`) or the whole range if
longer.

The axis adapts to the zoom. Hour ticks step from 1 minute up to a day. Zoomed
out further, the hour row hides (it would read `12a` under every date) and the
date labels step by 1, 2, 3, 7, 14 or 28 days — weekly steps land on Mondays and
drop the weekday (`Sep 21`). The grid follows the date labels at that point.

## Known limitations

- Totals and flags come from the transformer, so they're fixed at fetch time —
  an open record's bar keeps growing, but its flags only update on refetch.
- Overlapping activity in a collapsed row draws on top of itself; expand the
  row to see it split into sub-rows.
