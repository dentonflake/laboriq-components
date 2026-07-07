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
  InboundPlanningModelGridProps,
  PlanningModelEditedCell,
  PlanningModelWideRow,
  PlanningWeek
} from '../../utils/types'
import { ensureAgGridInitialized } from '../../utils/helpers'
import {
  buildTotalsRow,
  cellFieldFor,
  cellMetaKeyFor,
  isCurrentWeek,
  isPastWeek,
  parseCellField,
  pivotPlanningRows,
  toNumber
} from './pivot'

const CURRENT_WEEK_BG = 'var(--color-primary-050)'
const COMPUTED_CELL_BG = '#f5f5f4'
const OVERRIDE_CELL_BG = '#fef3c7'
const READ_ONLY_TEXT = 'var(--color-neutral-500)'
const NEGATIVE_TEXT = '#dc2626'

// Local calendar date ('YYYY-MM-DD') — current-week detection follows the
// user's timezone while week keys come from the data's UTC week starts.
const localTodayKey = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

const InboundPlanningModelGrid = ({
  rows,
  agGridLicenseKey
}: InboundPlanningModelGridProps) => {

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

  const { rowData, weeks, cellMeta, hasActuals } = useMemo(
    () => pivotPlanningRows(rows ?? []),
    [rows]
  )

  // Edits mutate AG Grid's row objects in place, so the memo over `rowData`
  // alone wouldn't see them — onCellValueChanged rebuilds the totals from the
  // grid's live rows, and a fresh data prop resets back to the base totals.
  const baseTotals = useMemo<PlanningModelWideRow[]>(
    () => (rowData.length > 0 ? [buildTotalsRow(rowData, weeks, hasActuals)] : []),
    [rowData, weeks, hasActuals]
  )
  const [editedTotals, setEditedTotals] = useState<PlanningModelWideRow[] | null>(null)
  useEffect(() => setEditedTotals(null), [rowData])
  const pinnedBottomRowData = editedTotals ?? baseTotals

  const colDefs = useMemo<(ColDef<PlanningModelWideRow> | ColGroupDef<PlanningModelWideRow>)[]>(() => {

    const programCol: ColDef<PlanningModelWideRow> = {
      field: 'program',
      headerName: 'Program',
      pinned: 'left',
      flex: 0,
      width: 240,
      tooltipField: 'program',
      cellStyle: { fontWeight: 600 }
    }

    // const typeCol: ColDef<PlanningModelWideRow> = {
    //   field: 'type',
    //   headerName: 'Budget/Revision',
    //   pinned: 'left',
    //   flex: 0,
    //   width: 140,
    //   valueFormatter: params => {
    //     const value = String(params.value ?? '').toLowerCase()
    //     if (value === 'budget') return 'Budget'
    //     if (value === 'revision') return 'Revision'
    //     return ''
    //   }
    // }

    const profileCol: ColDef<PlanningModelWideRow> = {
      field: 'programProfile',
      headerName: 'Profile',
      pinned: 'left',
      flex: 0,
      width: 150,
      tooltipField: 'programProfile'
    }

    const buildWeekGroup = (week: PlanningWeek): ColGroupDef<PlanningModelWideRow> => {

      const baselineField = cellFieldFor(week.key, 'baseline')
      const backlogField = cellFieldFor(week.key, 'backlog')
      const actualsField = cellFieldFor(week.key, 'actuals')

      const current = isCurrentWeek(week.key, todayKey)
      const weekEditable = !isPastWeek(week.key, todayKey)
      const headerClass = current ? styles.currentWeekHeader : undefined

      const editable = (params: EditableCallbackParams<PlanningModelWideRow>) =>
        weekEditable && !params.node.rowPinned

      const metaFor = (data: PlanningModelWideRow | undefined) =>
        data ? cellMeta.get(cellMetaKeyFor(data.programId, week.key)) : undefined

      const totalPlanGetter = (params: ValueGetterParams<PlanningModelWideRow>) =>
        toNumber(params.data?.[baselineField]) + toNumber(params.data?.[backlogField])

      // Current-week tint applies to headers (via headerClass) and the pinned
      // totals row only — regular body cells stay uncolored. AG Grid keeps
      // stale cellStyle properties unless every branch returns them
      // explicitly, hence the always-present defaults.
      const editableCellStyle = (
        params: CellClassParams<PlanningModelWideRow>,
        overridden: boolean
      ) => ({
        backgroundColor: overridden
          ? OVERRIDE_CELL_BG
          : current && params.node.rowPinned ? CURRENT_WEEK_BG : 'transparent',
        fontWeight: overridden ? 600 : 'normal',
        color: weekEditable ? 'inherit' : READ_ONLY_TEXT
      })

      // Overridden = baseline differs from the budget baseline (only knowable
      // when the transformer sends budgetBaseline). Typing the exact budget
      // value reads as "no override" — the event still fires so Retool can
      // delete the override row.
      const baselineCellStyle = (params: CellClassParams<PlanningModelWideRow>) => {
        const budgetBaseline = metaFor(params.data)?.budgetBaseline
        const overridden =
          !params.node.rowPinned &&
          budgetBaseline != null &&
          toNumber(params.value) !== budgetBaseline
        return editableCellStyle(params, overridden)
      }

      const computedCellStyle = (params: CellClassParams<PlanningModelWideRow>) => ({
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

      const baselineParser = (params: ValueParserParams<PlanningModelWideRow>) => {
        const parsed = parseNonNegativeInt(params.newValue)
        if (parsed === undefined) return toNumber(params.oldValue)
        if (parsed !== null) return parsed
        // Cleared — revert to the budget baseline when the data provides one,
        // otherwise keep the previous value (there's nothing to revert to).
        return metaFor(params.data)?.budgetBaseline ?? toNumber(params.oldValue)
      }

      const backlogParser = (params: ValueParserParams<PlanningModelWideRow>) => {
        const parsed = parseNonNegativeInt(params.newValue)
        if (parsed === undefined) return toNumber(params.oldValue)
        return parsed ?? 0
      }

      const children: ColDef<PlanningModelWideRow>[] = [
        {
          headerName: 'Baseline',
          field: baselineField,
          type: 'numericColumn',
          cellDataType: 'number',
          editable,
          headerClass,
          cellEditor: 'agNumberCellEditor',
          cellEditorParams: { min: 0, precision: 0 },
          valueParser: baselineParser,
          cellStyle: baselineCellStyle
        },
        {
          headerName: 'Backlog',
          field: backlogField,
          type: 'numericColumn',
          cellDataType: 'number',
          editable,
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

      if (hasActuals) {
        children.push(
          {
            headerName: 'Actuals',
            field: actualsField,
            type: 'numericColumn',
            cellDataType: 'number',
            headerClass,
            cellStyle: computedCellStyle
          },
          {
            headerName: 'Variance',
            colId: cellFieldFor(week.key, 'variance'),
            type: 'numericColumn',
            cellDataType: 'number',
            headerClass,
            valueGetter: params =>
              toNumber(params.data?.[actualsField]) - totalPlanGetter(params),
            cellStyle: params => ({
              ...computedCellStyle(params),
              color: toNumber(params.value) < 0 ? NEGATIVE_TEXT : 'inherit'
            })
          }
        )
      }

      return {
        headerName: week.header,
        groupId: `wk-${week.key}`,
        headerClass,
        children
      }
    }

    return [
      programCol,
      // typeCol,
      profileCol,
      ...weeks.map(buildWeekGroup)
    ]

  }, [weeks, cellMeta, hasActuals, todayKey])

  const defaultColDef = useMemo<ColDef<PlanningModelWideRow>>(() => ({
    flex: 1,
    // 125 fits 'Total Plan' / 'Variance' once the column menu kebab is hidden.
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
    (params: GetRowIdParams<PlanningModelWideRow>) => String(params.data.programId),
    []
  )

  const onCellValueChanged = useCallback((event: CellValueChangedEvent<PlanningModelWideRow>) => {
    if (event.node.rowPinned) return

    const parsed = parseCellField(String(event.colDef.field ?? ''))
    const data = event.data
    if (!parsed || !data) return

    const liveRows: PlanningModelWideRow[] = []
    event.api.forEachNode(node => {
      if (node.data) liveRows.push(node.data)
    })
    setEditedTotals([buildTotalsRow(liveRows, weeks, hasActuals)])

    // Cells the data window never mentioned have no meta — synthesize the key
    // in the transformer's `${locationId}-${programId}-${weekStart}` format.
    const meta = cellMeta.get(cellMetaKeyFor(data.programId, parsed.weekKey))
    const editedCell: PlanningModelEditedCell = {
      rowKey: meta?.rowKey ?? `${data.locationId}-${data.programId}-${parsed.weekKey}`,
      locationId: data.locationId,
      programId: data.programId,
      weekStart: meta?.weekStart ?? `${parsed.weekKey}T00:00:00.000Z`,
      field: parsed.field,
      previousValue: toNumber(event.oldValue),
      newValue: toNumber(event.newValue)
    }

    setLastEditedCell(editedCell as Retool.SerializableObject)
    triggerCellValueChanged()
  }, [weeks, hasActuals, cellMeta, setLastEditedCell, triggerCellValueChanged])

  if (!gridInitialized) return null

  return (
    <section className={styles.container}>
      <div className={styles.grid}>
        <AgGridReact<PlanningModelWideRow>
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

export default InboundPlanningModelGrid
