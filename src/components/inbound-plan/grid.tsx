import { CellValueChangedEvent, ColDef, ColGroupDef, DefaultMenuItem, GetContextMenuItemsParams, MenuItemDef, themeQuartz, ValueGetterParams } from 'ag-grid-community'
import React, { useMemo, useCallback, useRef, useEffect, useState } from 'react'
import { Retool } from '@tryretool/custom-component-support'
import { AgGridReact } from 'ag-grid-react'
import styles from '../../styles/insights.module.css'
import { InboundPlanGridProps, WideRow } from '../../utils/types'
import { ensureAgGridInitialized, LOAD_TYPES, cellFieldFor, parseCellField, formatWeekHeader } from '../../utils/helpers'

// Pull the numeric value of a wk-* cell field off a row (handling missing/0).
const num = (row: WideRow | undefined, field: string) => Number(row?.[field]) || 0

const InboundPlanGrid = ({ rows, agGridLicenseKey }: InboundPlanGridProps) => {

  const [gridInitialized, setGridInitialized] = useState(false)

  const [, setLastEditedCell] = Retool.useStateObject({
    name: 'lastEditedCell',
    inspector: 'hidden',
    initialValue: {}
  })

  const [, setLastDeletedProgram] = Retool.useStateObject({
    name: 'lastDeletedProgram',
    inspector: 'hidden',
    initialValue: {}
  })

  const triggerCellEdited = Retool.useEventCallback({
    name: 'cellEdited'
  })

  const triggerProgramDeleted = Retool.useEventCallback({
    name: 'programDeleted'
  })

  const gridRef = useRef<AgGridReact<WideRow>>(null)

  useEffect(() => {
    ensureAgGridInitialized(agGridLicenseKey)
    setGridInitialized(true)
  }, [agGridLicenseKey])

  const { rowData, weekStarts } = useMemo(() => {

    if (!rows) return {
      rowData: [] as WideRow[],
      weekStarts: [] as string[]
    }

    const planByKey = new Map<string, number>()
    const weekStartSet = new Set<string>()
    // programId → constant per-program fields, captured from any row mentioning
    // the program (every row of the SQL result comes via locationToPrograms, so
    // every row has a programId we care about, plus source + programProfile).
    type ProgramMeta = { name: string, source: string, programProfile: string }
    const programByKey = new Map<number, ProgramMeta>()

    for (const r of rows) {
      const weekStart = r.weekStart as string
      if (weekStart) weekStartSet.add(weekStart)

      if (r.programId == null) continue

      if (!programByKey.has(r.programId)) {
        programByKey.set(r.programId, {
          name: r.program ?? `Program ${r.programId}`,
          source: r.source ?? '',
          programProfile: r.programProfile ?? ''
        })
      }

      // loadType/loadCount are NULL for the LEFT JOIN's "no plan yet" rows —
      // skip those (the grid will render those cells as 0 by default below).
      if (r.loadType != null && r.loadCount != null) {
        planByKey.set(`${r.programId}|${weekStart}|${r.loadType}`, r.loadCount)
      }
    }

    const sortedWeekStarts = [...weekStartSet].sort()
    const programs = [...programByKey.entries()]
      .map(([id, meta]) => ({ id, ...meta }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const wideRows: WideRow[] = programs.map(program => {

      const row: WideRow = {
        programId: program.id,
        program: program.name,
        source: program.source,
        programProfile: program.programProfile
      }

      for (const weekStart of sortedWeekStarts) {
        for (const loadType of LOAD_TYPES) {
          row[cellFieldFor(weekStart, loadType)] =
            planByKey.get(`${program.id}|${weekStart}|${loadType}`) ?? 0
        }
      }

      return row
    })

    return {
      rowData: wideRows,
      weekStarts: sortedWeekStarts
    }

  }, [rows])

  // Summary row pinned at the top — sums baseline + backlog across all
  // programs per week. Total Plan is computed by valueGetter and works for the
  // summary row automatically.
  const pinnedBottomRowData = useMemo<WideRow[]>(() => {
    if (rowData.length === 0) return []
    const totals: WideRow = {
      programId: 0,
      program: 'Total',
      source: '',
      programProfile: ''
    }
    for (const weekStart of weekStarts) {
      let baselineSum = 0, backlogSum = 0
      for (const row of rowData) {
        baselineSum += num(row, cellFieldFor(weekStart, 'baseline'))
        backlogSum += num(row, cellFieldFor(weekStart, 'backlog'))
      }
      totals[cellFieldFor(weekStart, 'baseline')] = baselineSum
      totals[cellFieldFor(weekStart, 'backlog')] = backlogSum
    }
    return [totals]
  }, [rowData, weekStarts])

  const colDefs = useMemo<(ColDef<WideRow> | ColGroupDef<WideRow>)[]>(() => {

    // Three pinned-left columns (mirroring the original spreadsheet layout):
    // Program | Budget/Revision | Profile. All flex: 0 so the data columns to
    // the right don't try to flex-share them.
    const programCol: ColDef<WideRow> = {
      field: 'program',
      headerName: 'Program',
      pinned: 'left',
      flex: 0,
      width: 240,
      tooltipField: 'program',
      cellStyle: { fontWeight: 600 }
    }

    const sourceCol: ColDef<WideRow> = {
      field: 'source',
      headerName: 'Budget/Revision',
      pinned: 'left',
      flex: 0,
      width: 140,
      valueFormatter: params => {
        const v = String(params.value ?? '').toLowerCase()
        if (v === 'budget') return 'Budget'
        if (v === 'revision') return 'Revision'
        return ''
      }
    }

    const profileCol: ColDef<WideRow> = {
      field: 'programProfile',
      headerName: 'Profile',
      pinned: 'left',
      flex: 0,
      width: 150,
      tooltipField: 'programProfile'
    }

    const weekGroups: ColGroupDef<WideRow>[] = weekStarts.map(weekStart => {
      const baselineField = cellFieldFor(weekStart, 'baseline')
      const backlogField = cellFieldFor(weekStart, 'backlog')

      const totalPlanGetter = (params: ValueGetterParams<WideRow>) =>
        num(params.data, baselineField) + num(params.data, backlogField)

      return {
        headerName: formatWeekHeader(weekStart),
        groupId: `wk-${weekStart}`,
        children: [
          {
            headerName: 'Baseline',
            field: baselineField,
            editable: params => !params.node.rowPinned,
            type: 'numericColumn',
            cellDataType: 'number',
            valueParser: params => Number(params.newValue) || 0
          },
          {
            headerName: 'Backlog',
            field: backlogField,
            editable: params => !params.node.rowPinned,
            type: 'numericColumn',
            cellDataType: 'number',
            valueParser: params => Number(params.newValue) || 0
          },
          {
            headerName: 'Total Plan',
            colId: `wk-${weekStart}_totalPlan`,
            type: 'numericColumn',
            cellDataType: 'number',
            cellStyle: { backgroundColor: '#f5f5f4' },
            valueGetter: totalPlanGetter
          }
        ]
      }
    })

    return [
      programCol,
      sourceCol,
      profileCol,
      ...weekGroups
    ]

  }, [weekStarts])

  const defaultColDef = useMemo<ColDef<WideRow>>(() => ({
    flex: 1,
    // 125 fits "Total Plan" / "Variance" after we hide the column menu kebab
    // below. Sort still works by clicking the header text.
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

  // Right-click context menu — only shows on real program rows (not the pinned
  // Total row). The "Remove" item fires the programDeleted event so Retool can
  // run the DELETE against locationToPrograms.
  const getContextMenuItems = useCallback((params: GetContextMenuItemsParams<WideRow>): (MenuItemDef<WideRow> | DefaultMenuItem)[] => {
    if (params.node?.rowPinned) return []

    const data = params.node?.data
    if (!data || !data.programId) return ['copy', 'copyWithHeaders']

    return [
      {
        name: `Remove "${data.program}"`,
        action: () => {
          setLastDeletedProgram({ programId: data.programId } as Retool.SerializableObject)
          triggerProgramDeleted()
        }
      },
      'separator',
      'copy',
      'copyWithHeaders'
    ]
  }, [setLastDeletedProgram, triggerProgramDeleted])

  // Edit hook — only fires for editable leaf cells on regular rows. Skip pinned
  // (summary) rows and any non-baseline/backlog column.
  const onCellValueChanged = useCallback((event: CellValueChangedEvent<WideRow>) => {
    if (event.node.rowPinned) return

    const field = String(event.colDef.field ?? '')
    const parsed = parseCellField(field)
    if (!parsed) return

    const loadCount = Number(event.newValue) || 0
    const programId = Number(event.data?.programId ?? 0)
    if (!programId) return

    setLastEditedCell({
      programId,
      weekStart: parsed.weekStart,
      loadType: parsed.loadType,
      loadCount
    } as Retool.SerializableObject)

    triggerCellEdited()
  }, [setLastEditedCell, triggerCellEdited])

  if (!gridInitialized) return null

  return (
    <section className={styles.container}>
      <div className={styles.grid}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          pinnedBottomRowData={pinnedBottomRowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          theme={theme}
          getContextMenuItems={getContextMenuItems}
          cellSelection={true}
          onCellValueChanged={onCellValueChanged}
        />
      </div>
    </section>
  )
}

export default InboundPlanGrid
