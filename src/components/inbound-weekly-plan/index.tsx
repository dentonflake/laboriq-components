import { Retool } from '@tryretool/custom-component-support'
import React, { useMemo } from 'react'

import { RawWeeklyPlanRow } from '../../utils/types'
import InboundWeeklyPlanGrid from './grid'

export const InboundWeeklyPlan = () => {

  const [rawRows] = Retool.useStateArray({ name: 'rows', label: 'Weekly Plan Rows' })
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  const rows = useMemo(() => rawRows as unknown as RawWeeklyPlanRow[], [JSON.stringify(rawRows)])
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <InboundWeeklyPlanGrid
      rows={rows}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
}
