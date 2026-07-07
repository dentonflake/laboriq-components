import {
  CellClassParams,
  ColDef,
  GetRowIdParams,
  themeQuartz,
  ValueFormatterParams
} from 'ag-grid-community'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import styles from '../../styles/insights.module.css'
import {
  LoadDistributionWideRow,
  WeeklyLoadDistributionGridProps
} from '../../utils/types'
import { ensureAgGridInitialized } from '../../utils/helpers'
import {
  locationFieldFor,
  METRICS,
  normalizeMetric,
  pivotLoadDistribution
} from './pivot'

const TOTAL_CELL_BG = '#f5f5f4'

// Judgment call (matches the spreadsheet): a program with no plan at a
// location renders blank, not '0'. Flip to false to show zeros — totals
// already count missing cells as 0 either way.
const BLANK_MISSING_CELLS = true

const WeeklyLoadDistributionGrid = ({
  rows,
  metric,
  agGridLicenseKey
}: WeeklyLoadDistributionGridProps) => {

  const [gridInitialized, setGridInitialized] = useState(false)

  useEffect(() => {
    ensureAgGridInitialized(agGridLicenseKey)
    setGridInitialized(true)
  }, [agGridLicenseKey])

  const metricKey = normalizeMetric(metric)

  // Everything below is derived from the data — replacing the `rows` prop
  // rebuilds rows, location columns and all totals with no state to reset.
  const { rowData, locations, totalsRow, hasProfiles } = useMemo(
    () => pivotLoadDistribution(rows ?? [], metricKey),
    [rows, metricKey]
  )

  const pinnedBottomRowData = useMemo<LoadDistributionWideRow[]>(
    () => (totalsRow ? [totalsRow] : []),
    [totalsRow]
  )

  const colDefs = useMemo<ColDef<LoadDistributionWideRow>[]>(() => {

    const { format } = METRICS[metricKey]

    const numberFormatter = (params: ValueFormatterParams<LoadDistributionWideRow>) => {
      if (params.value == null) return BLANK_MISSING_CELLS ? '' : format(0)
      return format(Number(params.value))
    }

    // Bold the pinned totals row; AG Grid keeps stale cellStyle properties
    // unless every branch returns them, hence the explicit 'normal'.
    const locationCellStyle = (params: CellClassParams<LoadDistributionWideRow>) => ({
      fontWeight: params.node.rowPinned ? 600 : 'normal'
    })

    const programCol: ColDef<LoadDistributionWideRow> = {
      field: 'program',
      headerName: 'Program',
      pinned: 'left',
      flex: 0,
      width: 240,
      tooltipField: 'program',
      cellStyle: { fontWeight: 600 }
    }

    const profileCol: ColDef<LoadDistributionWideRow> = {
      field: 'programProfile',
      headerName: 'Profile',
      pinned: 'left',
      flex: 0,
      width: 150,
      tooltipField: 'programProfile'
    }

    const locationCols: ColDef<LoadDistributionWideRow>[] = locations.map(location => ({
      field: locationFieldFor(location.id),
      headerName: location.name,
      type: 'numericColumn',
      valueFormatter: numberFormatter,
      cellStyle: locationCellStyle
    }))

    const grandTotalCol: ColDef<LoadDistributionWideRow> = {
      field: 'grandTotal',
      headerName: 'Grand Total',
      pinned: 'right',
      flex: 0,
      width: 140,
      type: 'numericColumn',
      valueFormatter: numberFormatter,
      cellStyle: { fontWeight: 600, backgroundColor: TOTAL_CELL_BG }
    }

    return [
      programCol,
      ...(hasProfiles ? [profileCol] : []),
      ...locationCols,
      grandTotalCol
    ]

  }, [locations, hasProfiles, metricKey])

  const defaultColDef = useMemo<ColDef<LoadDistributionWideRow>>(() => ({
    flex: 1,
    minWidth: 110,
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
    (params: GetRowIdParams<LoadDistributionWideRow>) => String(params.data.programId),
    []
  )

  if (!gridInitialized) return null

  return (
    <section className={styles.container}>
      <div className={styles.grid}>
        <AgGridReact<LoadDistributionWideRow>
          rowData={rowData}
          pinnedBottomRowData={pinnedBottomRowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}
          theme={theme}
          getRowId={getRowId}
          cellSelection={true}
        />
      </div>
    </section>
  )
}

export default WeeklyLoadDistributionGrid
