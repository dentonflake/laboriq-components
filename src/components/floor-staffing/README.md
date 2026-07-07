# Floor Staffing

A live "where is everyone right now" board for a location: a status strip
(On Assignment / Gap / Break-Lunch), department columns broken into area groups
and job rows with headcounts, and a detail panel listing the people behind any
job or status. Self-contained — inline SVG icons and inline styles, no AG Grid.

## Retool wiring

**Props**

| Name | Type | Description |
| --- | --- | --- |
| `rows` | array | Flat open-record rows from the floor-staffing query (see shape below) |
| `title` | string | Header title (default "Current Staffing") |
| `subtitle` | string | Header subtitle |
| `showGlanceDots` | boolean | Show the dot cluster next to each job's headcount |
| `showClockIn` | boolean | Show the "Clocked in … · #id" line in job detail |
| `showDeptChips` | boolean | Show the per-department chip row under the summary |

Bind `rows` directly to the staffing query's `.data`. The component groups the
flat rows into Department → Area → Job → people internally — no Retool
transformer needed.

**Input row shape** (one open record per row)

```js
{
  recordType: 'assignment',          // 'assignment' | 'gap' | 'punch'
  recordId: 91234,
  jobId: 55,                         // null for gaps and punches
  job: 'Dock Unload',                // null for gaps and punches
  employee: 'Jordan Smith',
  jobTitle: 'Receiver',
  start: '2026-06-18 09:15:00',      // location-local wall-clock
  timezone: 'America/Phoenix',       // location IANA zone — see "Duration"
  punchType: null,                   // 'break' | 'lunch' on punch rows
  department: 'Receiving',           // null for gaps and punches
  area: 'Inbound'                    // null for gaps and punches
}
```

### Recommended query change: add `timezone`

The "time in state" duration is `now − start`, so `start` must resolve to a
real instant. `start` is a location-local wall-clock string with no offset, so
the component needs the location's IANA timezone to anchor it. Surface
`l.timezone` in the outer `SELECT`:

```sql
convert_tz(ev.startUtc, 'UTC', l.timezone)    as start,
l.timezone                                    as timezone,   -- ← add this
```

The component interprets `start` *in* `timezone` to get the correct UTC instant,
so durations are right regardless of the viewer's browser timezone.

Fallbacks if `timezone` is absent: an explicit `startUtc` (UTC instant) column
is used if present; otherwise `start` is parsed as browser-local, which is only
accurate when the viewer shares the location's timezone.

## How records map

- **`assignment`** → a person on a job. Grouped Department → Area → Job; rows
  with no area fall under the department's direct jobs. Drives the "On
  Assignment" counter and the department columns.
- **`gap`** → a person clocked in but currently unassigned. Listed under the
  "Gap" counter/panel as idle employees.
- **`punch`** (break/lunch) → a person currently away. Listed under "Break /
  Lunch".

"On the floor" = assignment + gap + break/lunch (everyone clocked in).

## Behavior

- **Duration runs live.** The query loads once; a 30s timer ticks the clock so
  each person's "X hrs Y min" (and the header "As of" time) stays current
  without re-querying.
- **Click anything** — a job, an area's jobs, or a status counter — to populate
  the right-hand panel with the people behind it.

## Judgment calls

- **Gaps are people, not open positions.** The query's `gap` records are
  employees between assignments, so the Gap panel lists those employees (it is
  *not* a coverage-shortfall / "needs N" view).
- **Department icons are heuristic.** The query sends names, not icons;
  `iconForDept` picks a glyph by keyword (processing / warehouse / facilities)
  and defaults to the people icon. Adjust the patterns to your naming.
- **Assignments with no department go to the Location-level card.** Rows with a
  blank `department` are collected into a single `kind: 'location'` group
  (rendered as the full-width "Location-level" card above the department
  columns), not a "No Department" column. Real departments render as columns.
- **Person `#id` is the record id**, since the query doesn't return an employee
  id. Swap to a real employee id if the query starts selecting one.
- **Duration anchors `start` via `timezone`** (IANA zone) when present, then
  `startUtc`, then a browser-local parse of `start`. Negatives clamp to 0.
