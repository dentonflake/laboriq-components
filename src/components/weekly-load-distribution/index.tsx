import { Retool } from '@tryretool/custom-component-support'
import React, { useMemo } from 'react'

import { RawLoadDistributionRow } from '../../utils/types'
import WeeklyLoadDistributionGrid from './grid'

export const WeeklyLoadDistribution = () => {

  const [rawRows] = Retool.useStateArray({ name: 'rows', label: 'Distribution Rows' })
  const [rawMetric] = Retool.useStateString({ name: 'metric', label: 'Metric (loads | units | revenue)' })
  const [rawAgGridLicenseKey] = Retool.useStateString({ name: 'agGridLicenseKey', label: 'AG Grid License Key' })

  const rows = useMemo(() => rawRows as unknown as RawLoadDistributionRow[], [JSON.stringify(rawRows)])
  const metric = useMemo(() => rawMetric as string, [JSON.stringify(rawMetric)])
  const agGridLicenseKey = useMemo(() => rawAgGridLicenseKey as string, [JSON.stringify(rawAgGridLicenseKey)])

  return (
    <WeeklyLoadDistributionGrid
      rows={rows}
      metric={metric}
      agGridLicenseKey={agGridLicenseKey}
    />
  )
}
