import { Retool } from '@tryretool/custom-component-support'
import React, { useMemo } from 'react'
import { GridState } from 'ag-grid-enterprise'

import { LoadDistributionRow, RawLoadDistributionRow } from '../../utils/types'
import WeeklyLoadDistributionGrid from './grid'

// Flatten the nested transformer rows into the flat shape AG Grid pivots over.
// carrier / budgetType are optional in the payload — blank when absent.
const toFlatRow = (row: RawLoadDistributionRow): LoadDistributionRow => ({
  effectiveDate: row.effectiveDate ?? '',
  location: row.location?.name ?? '',
  program: row.program?.name ?? '',
  programProfile: row.program?.programProfile ?? '',
  carrier: row.carrier?.name ?? '',
  budgetType: row.budgetType?.label ?? '',
  baseline: row.baseline ?? 0,
  backlog: row.backlog ?? 0,
  totalPlan: row.totalPlan ?? 0
})

export const WeeklyLoadDistribution = () => {

  const [rawRows] = Retool.useStateArray({ name: 'rows', label: 'Distribution Rows' })
  const [rawGridState] = Retool.useStateObject({ name: 'gridState', label: 'Grid State' })
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  const rowData = useMemo(
    () => (rawRows as unknown as RawLoadDistributionRow[]).map(toFlatRow),
    [JSON.stringify(rawRows)]
  )
  const gridState = useMemo(() => rawGridState as GridState, [JSON.stringify(rawGridState)])
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <WeeklyLoadDistributionGrid
      rowData={rowData}
      gridState={gridState}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
}
