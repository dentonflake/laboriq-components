import { Retool } from '@tryretool/custom-component-support'
import React, { useMemo } from 'react'

import { RawInboundRow } from '../../utils/types'
import InboundPlanGrid from './grid'

export const InboundPlan = () => {

  const [rawRows] = Retool.useStateArray({ name: 'rows', label: 'Inbound Rows' })
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  const rows = useMemo(() => rawRows as RawInboundRow[], [JSON.stringify(rawRows)])
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <InboundPlanGrid
      rows={rows}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
}
