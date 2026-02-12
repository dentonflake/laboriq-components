import { Retool } from '@tryretool/custom-component-support'
import { GridState } from 'ag-grid-enterprise'
import { useMemo } from 'react'

import { LocationRow } from '../../utils/types'
import LocationInsightsGrid from './grid'

export const LocationInsights = () => {

  const [rawRowData] = Retool.useStateArray({ name: "data", label: "Data Source" })
  const [rawGridState] = Retool.useStateObject({ name: "gridState", label: "Grid State" })
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: "agGridLicenseKey", label: "AG Grid License Key" })

  const rowData = useMemo(() => rawRowData as LocationRow[], [JSON.stringify(rawRowData)])
  const gridState = useMemo(() => rawGridState as GridState, [JSON.stringify(rawGridState)])
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <LocationInsightsGrid
      rowData={rowData}
      gridState={gridState}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
}