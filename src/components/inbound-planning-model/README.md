# Inbound Planning Model

Weekly inbound planning grid replicating the per-location weekly view from the
2026 Inbound Planning Model spreadsheet — programs as rows, one column group
per week (Baseline / Backlog / Total Plan), pinned totals row at the bottom.

## Retool wiring

**Props**

| Name | Type | Description |
| --- | --- | --- |
| `rows` | array | Long-format program-week rows from the transformer (see shape below) |
| `agGridLicenseKey` | string | AG Grid Enterprise license key (shared across components) |

**Input row shape**

```js
{
  id: '3-10177-2026-06-01',            // `${locationId}-${programId}-${weekStart}`
  weekStart: '2026-06-01T00:00:00.000Z',
  baseline: 28,                         // COALESCE(baselineOverride, budgetBaseline)
  backlog: 0,
  totalPlan: 28,
  type: 'Budget',                       // optional — 'Budget' | 'Revision'
  budgetBaseline: 28,                   // optional — enables override styling + clear-to-revert
  baselineOverride: null,               // optional — informational; see "Override detection"
  actuals: 30,                          // optional — enables Actuals + Variance columns
  location: { id: 3, name: 'Mesa' },
  program: { id: 10177, name: 'TUS1 (TWG)', programProfile: 'Variety Box (LOA)' }
}
```

The component pivots this to wide internally (`pivot.ts`); the week column
groups are derived from the distinct `weekStart` values in the data.

**State (output)**

- `lastEditedCell` — `{ rowKey, locationId, programId, weekStart, field, previousValue, newValue }`
  where `field` is `'baseline' | 'backlog'`.

**Events**

- `cellValueChanged` — fires once per committed edit, after `lastEditedCell`
  is set. Wire the insert/update query here; the grid updates optimistically,
  so re-fetching on success simply rebuilds it with the same values.

## Editing behavior

- Baseline and Backlog accept non-negative integers only; anything else is
  rejected (the cell keeps its previous value and no event fires).
- Clearing Backlog commits `0`. Clearing Baseline reverts to `budgetBaseline`
  when the data provides it; otherwise the previous value is kept, since
  there's nothing to revert to.
- Weeks fully before the current week are read-only (greyed text).
- Total Plan is computed (`baseline + backlog`) and read-only; the pinned
  totals row recomputes live on every edit.

## Judgment calls

- **Override detection is by value, not flag.** A baseline cell is styled as
  overridden when `budgetBaseline` is known and the current value differs
  from it. Consequence: typing the exact budget value clears the override
  styling. The `cellValueChanged` event still fires, so the handler can decide
  whether that means "delete the override row".
- **Current week uses the browser's local date**, while week keys come from
  the data's UTC week starts. Week membership is date-only string comparison,
  which avoids timezone-shift bugs for any US timezone with Monday-start weeks.
- **Week numbers are ISO 8601** (Monday start, week 1 contains the first
  Thursday). If the spreadsheet numbers weeks differently, adjust
  `isoWeekNumber` in `pivot.ts`.
- **Missing cells default to 0** and get a synthesized `rowKey`
  (`${locationId}-${programId}-${weekKey}`) in the edit payload, matching the
  transformer's id format — the save query should upsert.
- **`type` is taken from the first row seen per program** (stable per program
  within the window, per the data contract).
- **No unit tests yet**: the repo has no test runner. `pivot.ts` is pure
  (no AG Grid/Retool/DOM imports) specifically so tests can be added the
  moment one lands.

## Future columns

`buildWeekGroup` in `grid.tsx` appends Actuals and Variance
(`actuals - totalPlan`, negatives in red) to each week group whenever any
input row carries a non-null `actuals` — no restructuring needed when the
transformer starts sending it.
