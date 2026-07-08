# Inbound Weekly Plan

Weekly inbound planning grid replicating the per-location weekly view from the
2026 Inbound Planning Model spreadsheet — one row per (location × program),
pinned-left Location and Program columns, one column group per week
(Baseline / Backlog / Total Plan), pinned totals row at the bottom.

## Retool wiring

**Props**

| Name | Type | Description |
| --- | --- | --- |
| `rows` | array | Long-format program-week rows from the transformer (see shape below) |
| `agGridLicenseKey` | string | AG Grid Enterprise license key (shared across components) |

**Input row shape**

```js
{
  id: '7-10319-2026-07-06',             // `${locationId}-${programId}-${effectiveWeek}`
  effectiveWeek: '2026-07-06T00:00:00.000Z',
  budgetBaseline: 7,                    // loadsPerWeek of the budget in effect (null = none)
  loadsPerWeekOverride: null,               // stored weekly override, if any
  baseline: 7,                          // coalesce(loadsPerWeekOverride, budgetBaseline)
  backlog: null,                        // null = not entered (distinct from 0)
  totalPlan: 7,
  location: { id: 7, name: 'Dean Martin', timezone: 'America/Los_Angeles' },
  program: { id: 10319, name: 'RIC3', programProfile: 'RC XL' }
}
```

The mental model behind the fields: **budgets are rules** (effective-dated,
open-ended, in `parcel.inboundBudgets`), **weekly rows are exceptions and
observations** (`parcel.inboundWeeklyPlans`). The grid never stores resolved
values — `baseline` is recomputed by the source query on every fetch, and an
override is "overridden" because `loadsPerWeekOverride IS NOT NULL` in the DB,
never because a value differs from what was fetched.

The component pivots this to wide internally (`pivot.ts`); the week column
groups are derived from the distinct `effectiveWeek` values in the data. The
`location.timezone` field is ignored — week keys use the date part of
`effectiveWeek` and current-week detection uses the browser's local date.

**State (output)**

- `lastEditedCell` — `{ rowKey, locationId, programId, effectiveWeek, field,
  previousValue, newValue, loadsPerWeekOverride, loadsInBacklog }` where `field`
  is `'baseline' | 'backlog'`. The last two carry the **resulting row state**
  for `parcel.inboundWeeklyPlans`: the save queries write them directly, and
  delete the row when both are null (`chk_has_input` forbids empty rows).
  `newValue` is the resolved display value (clearing an override shows the
  budget again, so `newValue` equals the budget while `loadsPerWeekOverride` is
  null — trust `loadsPerWeekOverride`, not `newValue`, for what to store).

**Events**

- `cellValueChanged` — fires once per committed edit, after `lastEditedCell`
  is set. Wire both queries in `upsert.sql` here; the grid updates
  optimistically, so re-fetching on success simply rebuilds it with the same
  values, and re-fetching on failure rolls the cell back.

## Editing behavior

- Baseline and Backlog accept non-negative integers only; anything else is
  rejected (the cell keeps its previous value and no event fires).
- **Baseline is editable only where an active budget is in effect** — loads
  &gt; 0. A 0-loads budget is a terminator (the program is unbudgeted that
  week), so those cells are read-only like unbudgeted ones; adding loads to a
  dead week is a budget-builder action, not an override. Cells with a stray
  stored override stay editable so it can be cleared.
- **Clearing Baseline removes the override** — the cell falls back to the
  budget in effect. Typing the exact budget value also clears it (a redundant
  override is indistinguishable from no override, and storing one would pin a
  stale copy of the budget). The budget value is never written back as an
  override.
- **Clearing Backlog commits null** ("not entered", blank) — distinct from an
  explicit 0. Backlog is editable for any non-past week, budget or not.
- Weeks fully before the current week are read-only (greyed text).
- Total Plan is computed (`baseline + backlog`, blank when both are null) and
  read-only; the pinned totals row recomputes live on every edit.

## Judgment calls

- **Override styling is DB truth.** A baseline cell is highlighted (amber,
  bold) iff a `loadsPerWeekOverride` exists for it — carried in the payload and
  mutated optimistically on edit, so styling survives reloads and tracks
  pending writes. It is never inferred from value diffs.
- **Current week uses the browser's local date**, while week keys come from
  the data's UTC `effectiveWeek`. Week membership is date-only string
  comparison, which avoids timezone-shift bugs for any US timezone with
  Monday-start weeks.
- **Week numbers are ISO 8601** (Monday start, week 1 contains the first
  Thursday). If the spreadsheet numbers weeks differently, adjust
  `isoWeekNumber` in `pivot.ts`.
- **Missing cells are null (blank)**, not 0, and get a synthesized `rowKey`
  (`${locationId}-${programId}-${weekKey}`) in the edit payload, matching the
  transformer's id format — the save query upserts.
- **No unit tests yet**: the repo has no test runner. `pivot.ts` is pure
  (no AG Grid/Retool/DOM imports) specifically so tests can be added the
  moment one lands.
