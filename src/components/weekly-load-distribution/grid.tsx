import { Retool } from '@tryretool/custom-component-support'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import { ColDef, StateUpdatedEvent, themeQuartz } from 'ag-grid-community'
import styles from '../../styles/insights.module.css'
import { LoadDistributionRow, WeeklyLoadDistributionGridProps } from '../../utils/types'
import { ensureAgGridInitialized } from '../../utils/helpers'

const WeeklyLoadDistributionGrid = ({
  rowData,
  gridState,
  agGridLicenseKey
}: WeeklyLoadDistributionGridProps) => {

  const [, setCurrentGridState] = Retool.useStateObject({
    name: 'currentGridState',
    inspector: 'hidden',
    initialValue: {}
  })

  const [gridInitialized, setGridInitialized] = useState(false)

  useEffect(() => {
    ensureAgGridInitialized(agGridLicenseKey)
    setGridInitialized(true)
  }, [agGridLicenseKey])

  const gridRef = useRef<AgGridReact<LoadDistributionRow>>(null)

  // Dimensions can be dragged to Row Groups / Column Labels; measures to
  // Values. The user builds the pivot from the sidebar — nothing is grouped
  // by default.
  const [colDefs] = useState<ColDef<LoadDistributionRow>[]>([
    {
      field: 'effectiveDate',
      headerName: 'Week',
      filter: 'agSetColumnFilter',
      sort: 'asc',
      enablePivot: true,
      enableRowGroup: true
    },
    {
      field: 'location',
      headerName: 'Location',
      filter: 'agSetColumnFilter',
      enablePivot: true,
      enableRowGroup: true
    },
    {
      field: 'program',
      headerName: 'Program',
      filter: 'agSetColumnFilter',
      enablePivot: true,
      enableRowGroup: true
    },
    {
      field: 'programProfile',
      headerName: 'Profile',
      filter: 'agSetColumnFilter',
      enablePivot: true,
      enableRowGroup: true
    },
    {
      field: 'carrier',
      headerName: 'Carrier',
      filter: 'agSetColumnFilter',
      enablePivot: true,
      enableRowGroup: true
    },
    {
      field: 'budgetType',
      headerName: 'Budget Type',
      filter: 'agSetColumnFilter',
      enablePivot: true,
      enableRowGroup: true
    },
    {
      field: 'baseline',
      headerName: 'Baseline',
      filter: 'agNumberColumnFilter',
      type: 'numericColumn',
      aggFunc: 'sum',
      enableValue: true
    },
    {
      field: 'backlog',
      headerName: 'Backlog',
      filter: 'agNumberColumnFilter',
      type: 'numericColumn',
      aggFunc: 'sum',
      enableValue: true
    },
    {
      field: 'totalPlan',
      headerName: 'Total Plan',
      filter: 'agNumberColumnFilter',
      type: 'numericColumn',
      aggFunc: 'sum',
      enableValue: true
    }
  ])

  const defaultColDef = useMemo<ColDef<LoadDistributionRow>>(() => ({
    flex: 1,
    minWidth: 150,
    filterParams: {
      buttons: ['reset']
    },
    // Hide the "(n)" row-count suffix on group labels.
    cellRendererParams: {
      suppressCount: true
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

  const debounceTimeoutRef = useRef<number | null>(null)

  const onStateUpdated = useCallback((_event: StateUpdatedEvent) => {
    if (!gridRef.current) return
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current)

    debounceTimeoutRef.current = window.setTimeout(() => {
      const state = gridRef.current!.api.getState()
      setCurrentGridState(state as Retool.SerializableObject)
    }, 200)
  }, [setCurrentGridState])

  const onFirstDataRendered = useCallback(() => {
    if (!gridRef.current?.api || !gridState) return
    gridRef.current.api.setState(gridState)
  }, [gridState])

  // Called for every group node as it's (re)created — unlike groupDefaultExpanded
  // this survives a query refresh, so row groups stay expanded on new data.
  const isGroupOpenByDefault = useCallback(() => true, [])

  // Pivot column groups have no per-group "open by default" hook, so re-open
  // them explicitly whenever new data rebuilds them.
  const onRowDataUpdated = useCallback(() => {
    const api = gridRef.current?.api
    if (!api) return
    const groupState = api.getColumnGroupState()
    if (groupState.some(group => !group.open)) {
      api.setColumnGroupState(groupState.map(group => ({ groupId: group.groupId, open: true })))
    }
  }, [])

  useEffect(() => {
    if (!gridRef.current?.api || !gridState) return
    gridRef.current.api.setState(gridState)
  }, [gridState])

  useEffect(() => () => {
    if (debounceTimeoutRef.current) window.clearTimeout(debounceTimeoutRef.current)
  }, [])

  if (!gridInitialized) return null

  return (
    <section className={styles.container}>
      <div className={styles.grid}>
        <AgGridReact<LoadDistributionRow>
          ref={gridRef}
          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          suppressAggFuncInHeader={true}
          grandTotalRow="bottom"
          pivotRowTotals="after"
          groupDefaultExpanded={-1}
          pivotDefaultExpanded={-1}
          isGroupOpenByDefault={isGroupOpenByDefault}
          sideBar
          enableCharts
          theme={theme}
          cellSelection
          onStateUpdated={onStateUpdated}
          onFirstDataRendered={onFirstDataRendered}
          onRowDataUpdated={onRowDataUpdated}
        />
      </div>
    </section>
  )
}

export default WeeklyLoadDistributionGrid
