# Weekly Load Distribution

Read-only, single-week, cross-location load distribution grid replicating the
"Weekly Load Distribution Plan" section of the 2026 Inbound Planning Model
spreadsheet — programs as rows, one column per location, per-program Grand
Total pinned right, per-location totals row pinned at the bottom. The
cross-location counterpart to `inbound-planning-model` (which shows one
location across many weeks).

## Retool wiring

**Props**

| Name | Type | Description |
| --- | --- | --- |
| `rows` | array | Long-format program-location rows for one week (shape below) |
| `metric` | string | Optional — `'loads'` (default) \| `'units'` \| `'revenue'` |
| `agGridLicenseKey` | string | AG Grid Enterprise license key (shared across components) |

**Input row shape**

```js
{
  totalPlan: 28,                       // planned loads = baseline + backlog
  units: 1200,                         // optional — for metric: 'units'
  revenue: 18400,                      // optional — for metric: 'revenue'
  location: { id: 3, name: 'Mesa', sortOrder: 1 },  // sortOrder optional
  program: { id: 10177, name: 'TUS1 (TWG)', programProfile: 'Variety Box (LOA)' }
}
```

The component pivots this to wide internally (`pivot.ts`); location columns
are derived from the distinct locations in the data, never hardcoded.

**State / events** — none. The grid is a read-only summary: all totals are
derived from the `rows` prop, so a Retool refetch rebuilds everything
(columns included) with no internal state to reset.

## Behavior

- Location column order: `location.sortOrder` when the data provides it
  (rows without one sort after those with), then `location.id`, then name.
- Row order: program name, matching the sibling components.
- A program with no plan at a location renders blank and counts as 0 in the
  row total, the location total, and the grand total.
- The `metric` prop switches what each cell reads and how it's formatted —
  loads/units as integers, revenue as whole-dollar currency — all behind the
  single `METRICS` accessor in `pivot.ts`.

## Judgment calls

- **Blank vs 0 for missing cells:** blank matches the spreadsheet. Flip
  `BLANK_MISSING_CELLS` in `grid.tsx` to render zeros instead — totals are
  unaffected either way. Grand totals always render (a program with no values
  anywhere shows `0` there, since the column is a computed total, not data).
- **Duplicate (program × location) rows are summed** defensively rather than
  last-write-wins, so an accidental ungrouped transformer output still totals
  correctly.
- **Unknown `metric` values fall back to `'loads'`** (`normalizeMetric`), so
  a typo'd or unset Retool prop can't blank the grid.
- **Revenue formats as whole dollars** — these are planning values; change
  `maximumFractionDigits` in `METRICS.revenue` if cents matter later.
- **No unit tests yet:** the repo has no test runner. `pivot.ts` is pure (no
  AG Grid/Retool/DOM imports) so the spec'd cases — partial location
  coverage, empty array, totals correctness — can be added the moment a
  runner lands.
