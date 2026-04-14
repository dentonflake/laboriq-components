import { Retool } from '@tryretool/custom-component-support';
import React, { useMemo } from 'react';
import ActionInsightsGrid from './grid';
import { ActionRow } from '../../utils/types';
import { GridState } from 'ag-grid-enterprise';

export const ActionInsights = () => {

  const [rawRowData] = Retool.useStateArray({ name: "data", label: "Data Source" });
  const [rawGridState] = Retool.useStateObject({ name: "gridState", label: "Grid State" });
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: "agGridLicenseKey", label: "AG Grid License Key" })

  const rowData = useMemo(() => rawRowData as ActionRow[], [JSON.stringify(rawRowData)]);
  const gridState = useMemo(() => rawGridState as GridState, [JSON.stringify(rawGridState)]);
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <ActionInsightsGrid
      rowData={rowData}
      gridState={gridState}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
};