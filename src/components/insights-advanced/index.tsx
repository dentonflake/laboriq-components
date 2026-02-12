import { Retool } from '@tryretool/custom-component-support';
import { useMemo } from 'react';
import AdvancedInsightsGrid from './grid'
import { AdvancedRow } from '../../utils/types';
import { GridState } from 'ag-grid-enterprise';

export const AdvancedInsights = () => {

  const [rawRowData] = Retool.useStateArray({ name: "data", label: "Data Source" });
  const [rawGridState] = Retool.useStateObject({ name: "gridState", label: "Grid State" });
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: "agGridLicenseKey", label: "AG Grid License Key" })

  const rowData = useMemo(() => rawRowData as AdvancedRow[], [JSON.stringify(rawRowData)]);
  const gridState = useMemo(() => rawGridState as GridState, [JSON.stringify(rawGridState)]);
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <AdvancedInsightsGrid
      rowData={rowData}
      gridState={gridState}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
};