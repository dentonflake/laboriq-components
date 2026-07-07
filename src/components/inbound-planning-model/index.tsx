import { Retool } from '@tryretool/custom-component-support'
import React, { useMemo } from 'react'

import { RawPlanningModelRow } from '../../utils/types'
import InboundPlanningModelGrid from './grid'

export const InboundPlanningModel = () => {

  const [rawRows] = Retool.useStateArray({ name: 'rows', label: 'Planning Rows' })
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  const rows = useMemo(() => rawRows as unknown as RawPlanningModelRow[], [JSON.stringify(rawRows)])
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <InboundPlanningModelGrid
      rows={rows}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
}
