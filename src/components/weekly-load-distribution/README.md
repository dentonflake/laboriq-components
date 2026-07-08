# Weekly Load Distribution

A general-purpose pivot table over inbound weekly-plan rows — modeled on
`insights-advanced`. Rows are fed flat to AG Grid, and the user builds the
view from the sidebar: drag dimensions (Week, Location, Program, Profile,
Carrier, Budget Type) to row groups / column labels, drag measures (Baseline,
Backlog, Total Plan) to values, and filter from the set/number filters.

## Retool wiring

**Props**

| Name | Type | Description |
| --- | --- | --- |
| `rows` | array | Long-format rows from the transformer (shape below) |
| `gridState` | object | Optional — a saved AG Grid state to restore on load |
| `agGridLicenseKey` | string | AG Grid Enterprise license key (shared across components) |

**Input row shape**

```js
{
  id: '3-10315-2026-07-06',            // `${locationId}-${programId}-${effectiveDate}`
  effectiveDate: '2026-07-06',
  baseline: 20,
  backlog: 0,
  totalPlan: 20,
  location: { id: 3, name: 'Mesa', timezone: 'America/Phoenix' },
  program: { id: 10315, name: 'SCK3', programProfile: 'RC XL' },
  carrier: { id: 8, name: 'ECHO Logistics' },   // optional
  budgetType: { id: 'budget', label: 'Budget', color: '#E3F8FF' }
}
```

`index.tsx` flattens each row (nested `location`/`program`/`carrier`/`budgetType`
objects collapse to their name/label) before handing it to the grid. Missing
`carrier` / `budgetType` render blank. `location.timezone` and
`budgetType.color` are carried in the payload but not used by the grid.

**State (output)**

- `currentGridState` — the live AG Grid state (column layout, pivot config,
  filters, sorts), debounced. Persist this and feed it back via the `gridState`
  prop to restore the user's view across sessions.

## Behavior

- Dimensions (`enableRowGroup` + `enablePivot`) can be grouped or pivoted;
  measures (`enableValue`, `aggFunc: 'sum'`) sum within each group.
- Nothing is grouped by default — the grid opens flat and the user builds the
  pivot from the sidebar (Columns + Filters tool panels), same as
  `insights-advanced`.
- Integrated charts are enabled (`enableCharts`).

## Judgment calls

- **No pre-pivot.** Grouping/pivoting/filtering are delegated entirely to AG
  Grid's enterprise pivot engine rather than computed in code, so the view is
  fully user-driven. (The previous fixed program×location pivot and the
  `metric` prop were removed.)
- **`budgetType.color` is ignored** for now — it's available in the payload if
  cell/legend theming is wanted later.
