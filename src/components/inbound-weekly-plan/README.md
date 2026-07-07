# Inbound Weekly Plan

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
  id: '7-10319-2026-07-06',             // `${locationId}-${programId}-${effectiveDate}`
  effectiveDate: '2026-07-06T00:00:00.000Z',
  baseline: 7,
  backlog: 0,
  totalPlan: 7,
  location: { id: 7, name: 'Dean Martin', timezone: 'America/Los_Angeles' },
  program: { id: 10319, name: 'RIC3', programProfile: 'RC XL' }
}
```

The component pivots this to wide internally (`pivot.ts`); the week column
groups are derived from the distinct `effectiveDate` values in the data. The
`location.timezone` field is ignored — week keys use the date part of
`effectiveDate` and current-week detection uses the browser's local date.

**State (output)**

- `lastEditedCell` — `{ rowKey, locationId, programId, effectiveDate, field, previousValue, newValue }`
  where `field` is `'baseline' | 'backlog'`.

**Events**

- `cellValueChanged` — fires once per committed edit, after `lastEditedCell`
  is set. Wire the insert/update query here; the grid updates optimistically,
  so re-fetching on success simply rebuilds it with the same values.

## Editing behavior

- Baseline and Backlog accept non-negative integers only; anything else is
  rejected (the cell keeps its previous value and no event fires).
- Clearing Backlog commits `0`. Clearing Baseline reverts to the fetched
  `baseline` for that cell; if the cell had no data (defaulted to 0) the
  previous value is kept, since there's nothing to revert to.
- Weeks fully before the current week are read-only (greyed text).
- Total Plan is computed (`baseline + backlog`) and read-only; the pinned
  totals row recomputes live on every edit.

## Judgment calls

- **Override styling is by value.** A baseline cell is highlighted (amber, bold)
  when its current value differs from the `baseline` originally fetched for that
  cell — i.e. it flags edits made since load. Typing the exact fetched value
  clears the styling. The `cellValueChanged` event still fires either way.
- **Current week uses the browser's local date**, while week keys come from
  the data's UTC `effectiveDate`. Week membership is date-only string
  comparison, which avoids timezone-shift bugs for any US timezone with
  Monday-start weeks.
- **Week numbers are ISO 8601** (Monday start, week 1 contains the first
  Thursday). If the spreadsheet numbers weeks differently, adjust
  `isoWeekNumber` in `pivot.ts`.
- **Missing cells default to 0** and get a synthesized `rowKey`
  (`${locationId}-${programId}-${weekKey}`) in the edit payload, matching the
  transformer's id format — the save query should upsert.
- **No unit tests yet**: the repo has no test runner. `pivot.ts` is pure
  (no AG Grid/Retool/DOM imports) specifically so tests can be added the
  moment one lands.
