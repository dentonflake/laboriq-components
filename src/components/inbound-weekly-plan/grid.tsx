import {
  CellClassParams,
  CellValueChangedEvent,
  ColDef,
  ColGroupDef,
  EditableCallbackParams,
  GetRowIdParams,
  themeQuartz,
  ValueGetterParams,
  ValueParserParams
} from 'ag-grid-community'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Retool } from '@tryretool/custom-component-support'
import { AgGridReact } from 'ag-grid-react'
import styles from '../../styles/insights.module.css'
import {
  InboundWeeklyPlanGridProps,
  WeeklyPlanEditedCell,
  WeeklyPlanWideRow,
  WeeklyPlanWeek
} from '../../utils/types'
import { ensureAgGridInitialized } from '../../utils/helpers'
import {
  buildTotalsRow,
  cellFieldFor,
  cellMetaKeyFor,
  isCurrentWeek,
  isPastWeek,
  parseCellField,
  pivotWeeklyPlanRows,
  toNumber
} from './pivot'

const CURRENT_WEEK_BG = 'var(--color-primary-050)'
const COMPUTED_CELL_BG = '#f5f5f4'
const OVERRIDE_CELL_BG = '#fef3c7'
const READ_ONLY_TEXT = 'var(--color-neutral-500)'

// Local calendar date ('YYYY-MM-DD') — current-week detection follows the
// user's timezone while week keys come from the data's UTC week starts.
const localTodayKey = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const InboundWeeklyPlanGrid = ({
  rows,
  agGridLicenseKey
}: InboundWeeklyPlanGridProps) => {

  const [gridInitialized, setGridInitialized] = useState(false)

  const [, setLastEditedCell] = Retool.useStateObject({
    name: 'lastEditedCell',
    inspector: 'hidden',
    initialValue: {}
  })

  const triggerCellValueChanged = Retool.useEventCallback({
    name: 'cellValueChanged'
  })

  useEffect(() => {
    ensureAgGridInitialized(agGridLicenseKey)
    setGridInitialized(true)
  }, [agGridLicenseKey])

  const todayKey = useMemo(localTodayKey, [])

  const { rowData, weeks, cellMeta } = useMemo(
    () => pivotWeeklyPlanRows(rows ?? []),
    [rows]
  )

  // Edits mutate AG Grid's row objects in place, so the memo over `rowData`
  // alone wouldn't see them — onCellValueChanged rebuilds the totals from the
  // grid's live rows, and a fresh data prop resets back to the base totals.
  const baseTotals = useMemo<WeeklyPlanWideRow[]>(
    () => (rowData.length > 0 ? [buildTotalsRow(rowData, weeks)] : []),
    [rowData, weeks]
  )
  const [editedTotals, setEditedTotals] = useState<WeeklyPlanWideRow[] | null>(null)
  useEffect(() => setEditedTotals(null), [rowData])
  const pinnedBottomRowData = editedTotals ?? baseTotals

  const colDefs = useMemo<(ColDef<WeeklyPlanWideRow> | ColGroupDef<WeeklyPlanWideRow>)[]>(() => {

    const locationCol: ColDef<WeeklyPlanWideRow> = {
      field: 'location',
      headerName: 'Location',
      pinned: 'left',
      flex: 0,
      width: 160,
      tooltipField: 'location',
      cellStyle: { fontWeight: 600 }
    }

    const programCol: ColDef<WeeklyPlanWideRow> = {
      field: 'program',
      headerName: 'Program',
      pinned: 'left',
      flex: 0,
      width: 150,
      tooltipField: 'program',
      cellStyle: { fontWeight: 600 }
    }

    const buildWeekGroup = (week: WeeklyPlanWeek): ColGroupDef<WeeklyPlanWideRow> => {

      const baselineField = cellFieldFor(week.key, 'baseline')
      const backlogField = cellFieldFor(week.key, 'backlog')

      const current = isCurrentWeek(week.key, todayKey)
      const weekEditable = !isPastWeek(week.key, todayKey)
      const headerClass = current ? styles.currentWeekHeader : undefined

      const metaFor = (data: WeeklyPlanWideRow | undefined) =>
        data ? cellMeta.get(cellMetaKeyFor(data.locationId, data.programId, week.key)) : undefined

      // Backlog is enterable for any non-past week — backlog can exist even
      // where no budget does. Baseline edits are *overrides*, and an override
      // requires an ACTIVE budget: loads > 0. A 0-loads budget is a
      // terminator — the program is unbudgeted that week (and terminator rows
      // carry no carrier to inherit), so adding loads there is budget-builder
      // territory, not an override. The stored-override clause keeps stray
      // overrides clearable if one exists without an active budget.
      const backlogEditable = (params: EditableCallbackParams<WeeklyPlanWideRow>) =>
        weekEditable && !params.node.rowPinned

      const baselineEditable = (params: EditableCallbackParams<WeeklyPlanWideRow>) => {
        if (!weekEditable || params.node.rowPinned) return false
        const meta = metaFor(params.data)
        const budgetActive = meta?.budgetBaseline != null && meta.budgetBaseline > 0
        return budgetActive || meta?.loadsPerWeekOverride != null
      }

      // Blank when neither input exists — a 0 here would claim a plan of zero,
      // which is a real (different) state.
      const totalPlanGetter = (params: ValueGetterParams<WeeklyPlanWideRow>) => {
        const baseline = params.data?.[baselineField]
        const backlog = params.data?.[backlogField]
        if (baseline == null && backlog == null) return null
        return toNumber(baseline) + toNumber(backlog)
      }

      // Current-week tint applies to headers (via headerClass) and the pinned
      // totals row only — regular body cells stay uncolored. AG Grid keeps
      // stale cellStyle properties unless every branch returns them
      // explicitly, hence the always-present defaults.
      const editableCellStyle = (
        params: CellClassParams<WeeklyPlanWideRow>,
        overridden: boolean
      ) => ({
        backgroundColor: overridden
          ? OVERRIDE_CELL_BG
          : current && params.node.rowPinned ? CURRENT_WEEK_BG : 'transparent',
        fontWeight: overridden ? 600 : 'normal',
        color: weekEditable ? 'inherit' : READ_ONLY_TEXT
      })

      // Overridden = a loadsPerWeekOverride exists in the DB (meta is mutated
      // optimistically on edit, so styling tracks the pending write too).
      // Never inferred from value diffs — an override that happens to equal
      // the budget can't exist (it's cleared instead), and reloads must not
      // reset the styling.
      const baselineCellStyle = (params: CellClassParams<WeeklyPlanWideRow>) => {
        const overridden =
          !params.node.rowPinned &&
          metaFor(params.data)?.loadsPerWeekOverride != null
        return editableCellStyle(params, overridden)
      }

      const computedCellStyle = (params: CellClassParams<WeeklyPlanWideRow>) => ({
        backgroundColor: current && params.node.rowPinned
          ? CURRENT_WEEK_BG
          : COMPUTED_CELL_BG
      })

      // Validation backstop behind agNumberCellEditor: returning the old value
      // makes AG Grid see "no change", so no event fires for rejected input.
      const parseNonNegativeInt = (raw: unknown) => {
        if (raw == null || String(raw).trim() === '') return null
        const value = Number(raw)
        return Number.isInteger(value) && value >= 0 ? value : undefined
      }

      // Clearing Baseline removes the override: the cell falls back to the
      // budget in effect (null when there is none — only reachable when
      // clearing a stray override). Never write the budget value back as an
      // override — that stores a frozen copy that goes stale when the budget
      // is revised.
      const baselineParser = (params: ValueParserParams<WeeklyPlanWideRow>) => {
        const parsed = parseNonNegativeInt(params.newValue)
        if (parsed === undefined) return params.oldValue ?? null
        if (parsed !== null) return parsed
        return metaFor(params.data)?.budgetBaseline ?? null
      }

      // Clearing Backlog means "not entered" (null, blank) — distinct from an
      // explicit 0.
      const backlogParser = (params: ValueParserParams<WeeklyPlanWideRow>) => {
        const parsed = parseNonNegativeInt(params.newValue)
        if (parsed === undefined) return params.oldValue ?? null
        return parsed
      }

      const children: ColDef<WeeklyPlanWideRow>[] = [
        {
          headerName: 'Baseline',
          field: baselineField,
          type: 'numericColumn',
          cellDataType: 'number',
          editable: baselineEditable,
          headerClass,
          cellEditor: 'agNumberCellEditor',
          cellEditorParams: { min: 0, precision: 0 },
          valueParser: baselineParser,
          cellStyle: baselineCellStyle,
          // Surface the underlying budget when a cell is overridden.
          tooltipValueGetter: params => {
            const meta = metaFor(params.data)
            return !params.node?.rowPinned && meta?.loadsPerWeekOverride != null
              ? `Override — budget: ${meta.budgetBaseline ?? 'none'}`
              : null
          }
        },
        {
          headerName: 'Backlog',
          field: backlogField,
          type: 'numericColumn',
          cellDataType: 'number',
          editable: backlogEditable,
          headerClass,
          cellEditor: 'agNumberCellEditor',
          cellEditorParams: { min: 0, precision: 0 },
          valueParser: backlogParser,
          cellStyle: params => editableCellStyle(params, false)
        },
        {
          headerName: 'Total Plan',
          colId: cellFieldFor(week.key, 'totalPlan'),
          type: 'numericColumn',
          cellDataType: 'number',
          headerClass,
          valueGetter: totalPlanGetter,
          cellStyle: computedCellStyle
        }
      ]

      return {
        headerName: week.header,
        groupId: `wk-${week.key}`,
        headerClass,
        children
      }
    }

    return [
      locationCol,
      programCol,
      ...weeks.map(buildWeekGroup)
    ]

  }, [weeks, cellMeta, todayKey])

  const defaultColDef = useMemo<ColDef<WeeklyPlanWideRow>>(() => ({
    flex: 1,
    // 125 fits 'Total Plan' once the column menu kebab is hidden.
    minWidth: 125,
    suppressHeaderMenuButton: true,
    filterParams: {
      buttons: ['reset']
    }
  }), [])

  const theme = useMemo(() => themeQuartz.withParams({
    borderRadius: 4,
    browserColorScheme: 'light',
    headerFontSize: 14,
    spacing: 8,
    wrapperBorderRadius: 8,
    wrapperBorder: 'rgba(0, 0, 0, 0)'
  }), [])

  const getRowId = useCallback(
    (params: GetRowIdParams<WeeklyPlanWideRow>) =>
      `${params.data.locationId}-${params.data.programId}`,
    []
  )

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<WeeklyPlanWideRow>) => {
    if (event.node.rowPinned) return

    const parsed = parseCellField(String(event.colDef.field ?? ''))
    const data = event.data
    if (!parsed || !data) return

    const liveRows: WeeklyPlanWideRow[] = []
    event.api.forEachNode(node => {
      if (node.data) liveRows.push(node.data)
    })
    setEditedTotals([buildTotalsRow(liveRows, weeks)])

    // Cells the data window never mentioned have no meta — synthesize the key
    // in the transformer's `${locationId}-${programId}-${effectiveWeek}` format.
    const metaKey = cellMetaKeyFor(data.locationId, data.programId, parsed.weekKey)
    let meta = cellMeta.get(metaKey)

    const newValue = event.newValue == null ? null : toNumber(event.newValue)
    const previousValue = event.oldValue == null ? null : toNumber(event.oldValue)

    // Resulting DB state for the (location, program, week) row. The save
    // queries write these two columns directly — and delete the row when
    // both are null (chk_has_input forbids storing an empty row).
    let loadsPerWeekOverride = meta?.loadsPerWeekOverride ?? null
    let loadsInBacklog =
      (data[cellFieldFor(parsed.weekKey, 'backlog')] as number | null) ?? null

    if (parsed.field === 'baseline') {
      // A value equal to the budget in effect is no override at all — store
      // nothing rather than a redundant copy that would go stale when the
      // budget is revised. Clearing the cell resolves back to the budget
      // (the parser already handled the display), which also lands here.
      loadsPerWeekOverride =
        newValue != null && newValue !== meta?.budgetBaseline ? newValue : null

      // Track the pending write optimistically so override styling stays
      // correct until the refetch lands.
      if (meta) {
        meta.loadsPerWeekOverride = loadsPerWeekOverride
      } else {
        meta = {
          rowKey: `${data.locationId}-${data.programId}-${parsed.weekKey}`,
          effectiveWeek: `${parsed.weekKey}T00:00:00.000Z`,
          budgetBaseline: null,
          loadsPerWeekOverride
        }
        cellMeta.set(metaKey, meta)
      }
      event.api.refreshCells({ rowNodes: [event.node], columns: [event.column], force: true })
    } else {
      loadsInBacklog = newValue
    }

    const editedCell: WeeklyPlanEditedCell = {
      rowKey: meta?.rowKey ?? `${data.locationId}-${data.programId}-${parsed.weekKey}`,
      locationId: data.locationId,
      programId: data.programId,
      effectiveWeek: meta?.effectiveWeek ?? `${parsed.weekKey}T00:00:00.000Z`,
      field: parsed.field,
      previousValue,
      newValue,
      loadsPerWeekOverride,
      loadsInBacklog
    }

    setLastEditedCell(editedCell as Retool.SerializableObject)
    triggerCellValueChanged()
  }, [weeks, cellMeta, setLastEditedCell, triggerCellValueChanged])

  if (!gridInitialized) return null

  return (
    <section className={styles.container}>
      <div className={styles.grid}>
        <AgGridReact<WeeklyPlanWideRow>
          rowData={rowData}
          pinnedBottomRowData={pinnedBottomRowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          theme={theme}
          getRowId={getRowId}
          cellSelection={true}
          onCellValueChanged={onCellValueChanged}
        />
      </div>
    </section>
  )
}

export default InboundWeeklyPlanGrid
