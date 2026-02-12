import { ColDef, ModuleRegistry, StateUpdatedEvent, AllCommunityModule, themeQuartz, IAggFuncParams, IHeaderParams, ITooltipParams, IRowNode } from 'ag-grid-community'
import { LicenseManager, AllEnterpriseModule, IntegratedChartsModule } from 'ag-grid-enterprise'
import { useMemo, useCallback, useRef, useEffect, KeyboardEventHandler } from 'react'
import { AgChartsEnterpriseModule } from "ag-charts-enterprise"
import { Retool } from '@tryretool/custom-component-support'
import { AgGridReact } from 'ag-grid-react'

import styles from '../../styles/insights.module.css'
import { LocationRow, LocationInsightsGridProps } from '../../utils/types'

type HeaderWithCaptionProps = IHeaderParams & {
  caption?: string
}

const HeaderWithCaption = (props: HeaderWithCaptionProps) => {
  const onSort = () => {
    if (props.enableSorting) props.progressSort(false)
  }

  const onKeyDown: KeyboardEventHandler<HTMLDivElement> = (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSort()
  }

  return (
    <div className={styles.captionHeader} onClick={onSort} onKeyDown={onKeyDown} role="button" tabIndex={0}>
      <span className={styles.captionHeaderTitle}>{props.displayName}</span>
      {props.caption && <span className={styles.captionHeaderSubtitle}>{props.caption}</span>}
    </div>
  )
}

const RichTooltip = (props: ITooltipParams<LocationRow>) => {
  const raw = String(props.value ?? '').trim()
  if (!raw) return null

  const lines = raw.split('\n').map(line => line.trim()).filter(Boolean)

  return (
    <div className={styles.richTooltip}>
      {lines.map((line, index) => {
        const separatorIndex = line.indexOf(':')
        const hasLabel = separatorIndex > 0
        const label = hasLabel ? line.slice(0, separatorIndex).trim() : ''
        const content = hasLabel ? line.slice(separatorIndex + 1).trim() : line
        const isStatusLine = label.toLowerCase() === 'status'
        const lowerContent = content.toLowerCase()
        const statusClassName = isStatusLine
          ? (lowerContent.includes('meeting') ? styles.richTooltipStatusGood : styles.richTooltipStatusBad)
          : ''

        return (
          <div className={styles.richTooltipLine} key={`${line}-${index}`}>
            {hasLabel && <span className={styles.richTooltipLabel}>{label}:</span>}
            <span className={`${styles.richTooltipValue} ${statusClassName}`.trim()}>
              {content}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const LocationInsightsGrid = ({ rowData, gridState, agGridLicenseKey }: LocationInsightsGridProps) => {

  ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule, IntegratedChartsModule.with(AgChartsEnterpriseModule)])

  if (agGridLicenseKey) {
    LicenseManager.setLicenseKey(agGridLicenseKey)
  } else {
    console.warn('AG Grid License Key not provided. Please set the "agGridLicenseKey" state variable to enable enterprise features.')
  }

  // Retool state outputs
  const [, setCurrentGridState] = Retool.useStateObject({ name: "currentGridState", inspector: "hidden", initialValue: {} })

  // Reference to the AG Grid table
  const gridRef = useRef<AgGridReact<LocationRow>>(null);

  const getLocationKey = useCallback((row?: LocationRow) => {
    if (!row) return ''

    const normalizedLocation = String(row.location ?? '').trim().toLowerCase()
    return row.locationId != null
      ? `locationId:${row.locationId}`
      : `location:${normalizedLocation}`
  }, [])

  const buildPointsKey = useCallback((row?: LocationRow) => {
    if (!row) return ''

    const locationKey = getLocationKey(row)
    const normalizedArea = String(row.area ?? '').trim().toLowerCase()
    const normalizedDepartment = String(row.department ?? '').trim().toLowerCase()

    const areaKey = normalizedArea
      ? `area:${normalizedArea}`
      : (row.areaId != null ? `areaId:${row.areaId}` : '')
    const departmentKey = normalizedDepartment
      ? `department:${normalizedDepartment}`
      : (row.departmentId != null ? `departmentId:${row.departmentId}` : '')

    const hierarchyKey = [areaKey, departmentKey].filter(Boolean).join('|')
    if (hierarchyKey) return `${locationKey}|${hierarchyKey}`
    if (row.teamId != null) return `${locationKey}|teamId:${row.teamId}`
    return `${locationKey}|unmapped`
  }, [getLocationKey])

  const getLookupKeys = useCallback((row?: LocationRow) => {
    if (!row) return []

    const locationKey = getLocationKey(row)
    const normalizedArea = String(row.area ?? '').trim().toLowerCase()
    const normalizedDepartment = String(row.department ?? '').trim().toLowerCase()
    const areaKey = normalizedArea
      ? `area:${normalizedArea}`
      : (row.areaId != null ? `areaId:${row.areaId}` : '')
    const departmentKey = normalizedDepartment
      ? `department:${normalizedDepartment}`
      : (row.departmentId != null ? `departmentId:${row.departmentId}` : '')
    const teamKey = row.teamId != null ? `teamId:${row.teamId}` : ''

    const keys: string[] = []
    if (areaKey && departmentKey) keys.push(`${locationKey}|${areaKey}|${departmentKey}`)
    if (teamKey) keys.push(`${locationKey}|${teamKey}`)
    if (departmentKey) keys.push(`${locationKey}|${departmentKey}`)
    if (areaKey) keys.push(`${locationKey}|${areaKey}`)
    return keys
  }, [getLocationKey])

  const directPointsByKey = useMemo(() => {
    const pointsMap = new Map<string, number>()

    for (const row of rowData) {
      if (String(row.laborType ?? '').trim().toLowerCase() !== 'direct') continue

      const points = Number(row.points) || 0
      const keys = getLookupKeys(row)
      for (const key of keys) {
        pointsMap.set(key, (pointsMap.get(key) || 0) + points)
      }
    }

    return pointsMap
  }, [getLookupKeys, rowData])

  const getSupportScopeMetrics = useCallback((node?: IRowNode<LocationRow>) => {
    if (!node) return null

    let scopeNode: IRowNode<LocationRow> | null | undefined = node.parent
    while (scopeNode) {
      const scopedLeaves = scopeNode.allLeafChildren ?? []
      if (scopedLeaves.length > 0) {
        let directPoints = 0
        let supportCount = 0

        for (const leaf of scopedLeaves) {
          const data = leaf.data as LocationRow | undefined
          if (!data) continue

          const laborType = String(data.laborType ?? '').trim().toLowerCase()
          if (laborType === 'direct') directPoints += Number(data.points) || 0
          if (laborType === 'support') supportCount += 1
        }

        if (directPoints > 0 && supportCount > 0) {
          return { directPoints, supportCount }
        }
      }

      scopeNode = scopeNode.parent
    }

    return null
  }, [])

  const isUnderSupportGroup = useCallback((node?: IRowNode<LocationRow>) => {
    let cursor: IRowNode<LocationRow> | null | undefined = node
    while (cursor && cursor.level >= 0) {
      const field = String(cursor.rowGroupColumn?.getColId?.() ?? '')
      const key = String(cursor.key ?? '').trim().toLowerCase()
      if (field === 'laborType' && key === 'support') return true
      cursor = cursor.parent
    }
    return false
  }, [])

  const getDirectPointsByGroupPath = useCallback((node?: IRowNode<LocationRow>) => {
    if (!node) return null

    let rootNode: IRowNode<LocationRow> = node
    while (rootNode.parent && rootNode.parent.level >= 0) {
      rootNode = rootNode.parent
    }

    const criteria: Array<{ field: string; key: string }> = []
    let cursor: IRowNode<LocationRow> | null | undefined = node
    while (cursor && cursor.level >= 0) {
      const field = String(cursor.rowGroupColumn?.getColId?.() ?? '')
      const key = String(cursor.key ?? '').trim().toLowerCase()
      if (field && key && field !== 'laborType') {
        criteria.push({ field, key })
      }
      cursor = cursor.parent
    }

    let directPoints = 0
    for (const leaf of rootNode.allLeafChildren ?? []) {
      const data = leaf.data as LocationRow | undefined
      if (!data) continue
      if (String(data.laborType ?? '').trim().toLowerCase() !== 'direct') continue

      const values = data as unknown as Record<string, unknown>
      const matches = criteria.every(({ field, key }) => {
        const rawValue = values[field]
        if (rawValue == null) return false
        const normalizedValue = typeof rawValue === 'string'
          ? rawValue.trim().toLowerCase()
          : String(rawValue).trim().toLowerCase()
        return normalizedValue === key
      })

      if (matches) directPoints += Number(data.points) || 0
    }

    return directPoints
  }, [])

  const getEffectivePoints = useCallback((row?: LocationRow, node?: IRowNode<LocationRow>, contextNode?: IRowNode<LocationRow>) => {
    if (!row) return 0

    const currentPoints = Number(row.points) || 0
    const laborType = String(row.laborType ?? '').trim().toLowerCase()
    if (laborType !== 'support') return currentPoints

    const pathDirectPoints = getDirectPointsByGroupPath(node) ?? getDirectPointsByGroupPath(contextNode)
    if (pathDirectPoints != null) return pathDirectPoints

    const scopeMetrics = getSupportScopeMetrics(node) ?? getSupportScopeMetrics(contextNode)
    if (scopeMetrics && scopeMetrics.supportCount > 0) return scopeMetrics.directPoints

    const keys = getLookupKeys(row)
    for (const key of keys) {
      const directPoints = directPointsByKey.get(key)
      if (directPoints == null) continue

      return directPoints
    }

    return currentPoints
  }, [directPointsByKey, getDirectPointsByGroupPath, getLookupKeys, getSupportScopeMetrics])

  const getSupportGoalPPH = useCallback((row?: LocationRow) => {
    if (!row) return 0
    return Number(row.supportGoalPointsPerHour) || 0
  }, [])

  const getGoalRateSPP = useCallback((row?: LocationRow) => {
    if (!row) return 0

    const laborType = String(row.laborType ?? '').trim().toLowerCase()
    if (laborType === 'direct') return 36
    if (laborType === 'support') {
      const supportGoalPPH = getSupportGoalPPH(row)
      return supportGoalPPH > 0 ? 3600 / supportGoalPPH : 0
    }

    return 0
  }, [getSupportGoalPPH])

  const getGoalRatePPH = useCallback((row?: LocationRow) => {
    if (!row) return 0

    const laborType = String(row.laborType ?? '').trim().toLowerCase()
    if (laborType === 'direct') return 100
    if (laborType === 'support') return getSupportGoalPPH(row)

    return 0
  }, [getSupportGoalPPH])

  const getGoalRateMPP = useCallback((row?: LocationRow) => {
    const goalRateSPP = getGoalRateSPP(row)
    return goalRateSPP > 0 ? goalRateSPP / 60 : 0
  }, [getGoalRateSPP])

  const getGoalStatusStyle = useCallback((isMeetingGoal: boolean | null) => {
    if (isMeetingGoal == null) return undefined
    return isMeetingGoal
      ? { color: '#15803d', fontWeight: 600 }
      : { color: '#dc2626', fontWeight: 600 }
  }, [])

  const isMeetingGoalSPP = useCallback((params: { value: unknown; data?: LocationRow; node?: { group?: boolean; aggData?: Record<string, unknown> } }) => {
    if (params.node?.group) {
      const actualValue = Number((params.node.aggData?.actualRateMPP as { value?: number } | undefined)?.value ?? 0)
      const goalValue = Number(params.node.aggData?.goalRateSPP ?? 0)
      if (goalValue <= 0) return null
      return actualValue <= goalValue
    }

    const actualValue = Number(params.value ?? 0)
    const goalValue = getGoalRateSPP(params.data)
    if (goalValue <= 0) return null
    return actualValue <= goalValue
  }, [getGoalRateSPP])

  const isMeetingGoalPPH = useCallback((params: { value: unknown; data?: LocationRow; node?: { group?: boolean; aggData?: Record<string, unknown> } }) => {
    if (params.node?.group) {
      const actualValue = Number(params.node.aggData?.actualPPH ?? 0)
      const goalValue = Number(params.node.aggData?.goalRatePPH ?? 0)
      if (goalValue <= 0) return null
      return actualValue >= goalValue
    }

    const actualValue = Number(params.value ?? 0)
    const goalValue = getGoalRatePPH(params.data)
    if (goalValue <= 0) return null
    return actualValue >= goalValue
  }, [getGoalRatePPH])

  const aggregateMetrics = useCallback((params: IAggFuncParams) => {
    const leaves = params.rowNode?.allLeafChildren ?? []
    const sumsByKey = new Map<string, {
      directPoints: number
      supportPoints: number
      totalPoints: number
      otherPoints: number
      directHours: number
      supportHours: number
      totalHours: number
      otherHours: number
      directGoalHours: number
      supportGoalHours: number
      totalGoalHours: number
      otherGoalHours: number
    }>()

    for (const leaf of leaves) {
      const data = leaf.data as LocationRow | undefined
      if (!data) continue

      const key = buildPointsKey(data)
      if (!key) continue

      const laborType = String(data.laborType ?? '').trim().toLowerCase()
      const points = getEffectivePoints(data, leaf as IRowNode<LocationRow>, params.rowNode as IRowNode<LocationRow> | undefined)
      const hours = Number(data.hours) || 0
      const goalRateSPP = getGoalRateSPP(data)
      const goalHours = points > 0 ? (goalRateSPP * points) / 3600 : 0
      const bucket = sumsByKey.get(key) ?? {
        directPoints: 0,
        supportPoints: 0,
        totalPoints: 0,
        otherPoints: 0,
        directHours: 0,
        supportHours: 0,
        totalHours: 0,
        otherHours: 0,
        directGoalHours: 0,
        supportGoalHours: 0,
        totalGoalHours: 0,
        otherGoalHours: 0
      }

      if (laborType === 'direct') {
        bucket.directPoints += points
        bucket.directHours += hours
        bucket.directGoalHours += goalHours
      } else if (laborType === 'support') {
        bucket.supportPoints = Math.max(bucket.supportPoints, points)
        bucket.supportHours += hours
        bucket.supportGoalHours = Math.max(bucket.supportGoalHours, goalHours)
      } else if (laborType === 'total') {
        bucket.totalPoints += points
        bucket.totalHours += hours
        bucket.totalGoalHours += goalHours
      } else {
        bucket.otherPoints += points
        bucket.otherHours += hours
        bucket.otherGoalHours += goalHours
      }

      sumsByKey.set(key, bucket)
    }

    let points = 0
    let hours = 0
    let goalHours = 0
    for (const bucket of sumsByKey.values()) {
      const pointsValue = bucket.directPoints
      const hoursValue = Math.max(bucket.totalHours, bucket.directHours + bucket.supportHours) + bucket.otherHours
      const goalHoursValue = Math.max(bucket.totalGoalHours, bucket.directGoalHours + bucket.supportGoalHours) + bucket.otherGoalHours

      points += pointsValue
      hours += hoursValue
      goalHours += goalHoursValue
    }

    const supportPathDirectPoints = isUnderSupportGroup(params.rowNode as IRowNode<LocationRow> | undefined)
      ? getDirectPointsByGroupPath(params.rowNode as IRowNode<LocationRow> | undefined)
      : null

    return {
      points: supportPathDirectPoints ?? points,
      hours,
      goalHours
    }
  }, [buildPointsKey, getDirectPointsByGroupPath, getEffectivePoints, getGoalRateSPP, isUnderSupportGroup])

  const pointsAggregation = useCallback((params: IAggFuncParams) => {
    return aggregateMetrics(params).points
  }, [aggregateMetrics])

  const actualRateMPPAggregation = useCallback((params: IAggFuncParams) => {
    const { points, hours } = aggregateMetrics(params)

    const value = points > 0
      ? (hours * 3600) / points
      : 0

    return {
      points,
      hours,
      value
    }
  }, [aggregateMetrics])

  const actualPPHAggregation = useCallback((params: IAggFuncParams) => {
    const { points, hours } = aggregateMetrics(params)
    return hours > 0 ? points / hours : 0
  }, [aggregateMetrics])

  const goalRateSPPAggregation = useCallback((params: IAggFuncParams) => {
    const { points, goalHours } = aggregateMetrics(params)
    return points > 0 ? (goalHours * 3600) / points : 0
  }, [aggregateMetrics])

  const actualRateMinPPAggregation = useCallback((params: IAggFuncParams) => {
    const { points, hours } = aggregateMetrics(params)
    return points > 0 ? (hours * 60) / points : 0
  }, [aggregateMetrics])

  const goalRateMinPPAggregation = useCallback((params: IAggFuncParams) => {
    const { points, goalHours } = aggregateMetrics(params)
    return points > 0 ? (goalHours * 60) / points : 0
  }, [aggregateMetrics])

  const goalRatePPHAggregation = useCallback((params: IAggFuncParams) => {
    const { points, goalHours } = aggregateMetrics(params)
    return goalHours > 0 ? points / goalHours : 0
  }, [aggregateMetrics])

  const goalHoursAggregation = useCallback((params: IAggFuncParams) => {
    return aggregateMetrics(params).goalHours
  }, [aggregateMetrics])

  const hoursDeltaAggregation = useCallback((params: IAggFuncParams) => {
    const { hours, goalHours } = aggregateMetrics(params)
    return goalHours - hours
  }, [aggregateMetrics])

  const pctToGoalAggregation = useCallback((params: IAggFuncParams) => {
    const { hours, goalHours } = aggregateMetrics(params)
    return hours > 0 ? (goalHours / hours) * 100 : 0
  }, [aggregateMetrics])

  const formatNumber = useCallback((value: number, digits = 2) => {
    const num = Number(value)
    if (!Number.isFinite(num)) return '0'
    return num.toFixed(digits)
  }, [])

  const getLeafGoalHours = useCallback((row?: LocationRow, node?: IRowNode<LocationRow>) => {
    const points = getEffectivePoints(row, node)
    const goalRateSPP = getGoalRateSPP(row)
    return points > 0 ? (goalRateSPP * points) / 3600 : 0
  }, [getEffectivePoints, getGoalRateSPP])

  // Holds the state of the column definitions.
  const colDefs = useMemo<ColDef<LocationRow>[]>(() => [

    {
      field: "year",
      headerName: "Year",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "month",
      headerName: "Month",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "week",
      headerName: "Week",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "day",
      headerName: "Day",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "date",
      headerName: "Date",
      headerTooltip: "Work date for the metric row.",
      filter: "agSetColumnFilter",
      sort: "asc",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "locationId",
      headerName: "Location ID",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "location",
      headerName: "Location",
      headerTooltip: "Auction/site location name.",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "type",
      headerName: "Type",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "jobId",
      headerName: "Job ID",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "job",
      headerName: "Job",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "jobTypeId",
      headerName: "Job Type ID",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "jobType",
      headerName: "Job Type",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "laborType",
      headerName: "Labor Type",
      headerTooltip: "Direct = point-generating work. Support = indirect/admin work. Gap = non-assignment time.",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const laborType = String(params.data?.laborType ?? '')
        if (laborType.toLowerCase() === 'direct') return 'Direct: point-generating operational work.'
        if (laborType.toLowerCase() === 'support') return 'Support: indirect/admin work. Direct points are distributed across support rows within the current grouping scope.'
        if (laborType.toLowerCase() === 'gap') return 'Gap: non-assignment/gap time.'
        return laborType || 'Labor type'
      }
    },

    {
      field: "teamId",
      headerName: "Team ID",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "departmentId",
      headerName: "Department ID",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "department",
      headerName: "Department",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "areaId",
      headerName: "Area ID",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "area",
      headerName: "Area",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "directHours",
      headerName: "Direct Hours",
      filter: "agNumberColumnFilter",
      enableValue: true,
      valueFormatter: params => params.value && params.value.toFixed(2)
    },

    {
      field: "supportHours",
      headerName: "Support Hours",
      filter: "agNumberColumnFilter",
      enableValue: true,
      valueFormatter: params => params.value && params.value.toFixed(2) 
    },

    {
      field: "gapHours",
      headerName: "Gap Hours",
      filter: "agNumberColumnFilter",
      enableValue: true,
      valueFormatter: params => params.value && params.value.toFixed(2)
    },

    {
      field: "points",
      headerName: "Points",
      headerTooltip: "Effective points used for rates. Support points align to Direct points by area+department buckets.",
      filter: "agNumberColumnFilter",
      allowedAggFuncs: ['pointsAggregation'],
      aggFunc: 'pointsAggregation',
      enableValue: true,
      valueGetter: params => getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined),
      valueFormatter: params => params.value && params.value.toFixed(0),
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const effectivePoints = Number(params.value ?? 0)
        const rawPoints = Number(params.data?.points ?? 0)
        if (params.node?.group) {
          return `Effective Points (group): ${formatNumber(effectivePoints, 0)}\nAggregation de-duplicates overlapping Direct/Support/Total buckets.`
        }
        return `Effective Points: ${formatNumber(effectivePoints, 0)}\nRaw Row Points: ${formatNumber(rawPoints, 0)}`
      }
    },

    {
      colId: 'actualRateMPP',
      headerName: 'Actual Rate (SPP)',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Seconds per point' },
      autoHeaderHeight: true,
      headerTooltip: "Actual seconds per point. Lower is better.\nFormula: (Actual Hours * 3600) / Points",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['actualRateMPPAggregation'],
      aggFunc: 'actualRateMPPAggregation',
      enableValue: true,
      cellStyle: params => getGoalStatusStyle(isMeetingGoalSPP(params)),
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const rate = params.node?.group
          ? Number((params.node.aggData?.actualRateMPP as { value?: number } | undefined)?.value ?? 0)
          : Number((params.value as { value?: number } | undefined)?.value ?? 0)
        const hours = params.node?.group
          ? Number((params.node.aggData?.actualRateMPP as { hours?: number } | undefined)?.hours ?? 0)
          : Number(params.data?.hours ?? 0)
        const points = params.node?.group
          ? Number((params.node.aggData?.actualRateMPP as { points?: number } | undefined)?.points ?? 0)
          : getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const goal = params.node?.group
          ? Number(params.node.aggData?.goalRateSPP ?? 0)
          : getGoalRateSPP(params.data)
        const status = goal > 0 ? (rate <= goal ? 'Meeting goal' : 'Below goal') : 'No goal set'
        return `Actual Rate (SPP): ${formatNumber(rate)}\nFormula: (${formatNumber(hours)} hrs * 3600) / ${formatNumber(points)} pts\nGoal (SPP): ${formatNumber(goal)}\nStatus: ${status}`
      },

      valueGetter: (params) => {
        if (!(params.node && params.node.group)) {

          const hours = Number(params.data?.hours) || 0
          const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)

          const value = points > 0
            ? (hours * 3600) / points
            : 0;
          
          return {
            hours,
            points,
            value
          }
        }
      },


      filterValueGetter: (params) => {
        if (!(params.node && params.node.group)) {

          const hours = Number(params.data?.hours) || 0
          const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)

          const value = points > 0
            ? (hours * 3600) / points
            : 0;

          return value;
        }

        return params.node?.aggData?.actualRateMPP?.value;
      },

      valueFormatter: (params) => {

        if (params.value == null) return '0';

        if (params.value.hasOwnProperty('value')) {
          return params.value.value.toFixed(2);
        }

        return '0';
      },

      comparator: (valueA, valueB) => {
        
        const numA = valueA?.value ?? 0;
        const numB = valueB?.value ?? 0;

        return numA - numB;
      }
    },

    {
      colId: 'goalRateSPP',
      headerName: 'Goal Rate (SPP)',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Target seconds per point' },
      autoHeaderHeight: true,
      headerTooltip: "Target seconds per point for the row.\nDirect is fixed target; Support is derived from supportGoalPointsPerHour.",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['goalRateSPPAggregation'],
      aggFunc: 'goalRateSPPAggregation',
      enableValue: true,
      valueGetter: params => getGoalRateSPP(params.data),
      valueFormatter: params => Number(params.value || 0).toFixed(2)
    },

    {
      colId: 'actualRateMinPP',
      headerName: 'Actual Rate (MPP)',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Minutes per point' },
      autoHeaderHeight: true,
      headerTooltip: "Actual minutes per point. Lower is better.\nFormula: (Actual Hours * 60) / Points",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['actualRateMinPPAggregation'],
      aggFunc: 'actualRateMinPPAggregation',
      enableValue: true,
      cellStyle: params => {
        const actualValue = Number(params.value ?? 0)
        const goalValue = params.node?.group
          ? Number(params.node.aggData?.goalRateMinPP ?? 0)
          : getGoalRateMPP(params.data)
        if (goalValue <= 0) return undefined
        return getGoalStatusStyle(actualValue <= goalValue)
      },
      valueGetter: (params) => {
        const hours = Number(params.data?.hours) || 0
        const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        return points > 0 ? (hours * 60) / points : 0
      },
      valueFormatter: params => Number(params.value || 0).toFixed(2)
    },

    {
      colId: 'goalRateMinPP',
      headerName: 'Goal Rate (MPP)',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Target minutes per point' },
      autoHeaderHeight: true,
      headerTooltip: "Target minutes per point for the row.",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['goalRateMinPPAggregation'],
      aggFunc: 'goalRateMinPPAggregation',
      enableValue: true,
      valueGetter: params => getGoalRateMPP(params.data),
      valueFormatter: params => Number(params.value || 0).toFixed(2)
    },

    {
      colId: 'actualPPH',
      headerName: 'Actual Rate (PPH)',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Points per hour' },
      autoHeaderHeight: true,
      headerTooltip: "Actual points per hour. Higher is better.\nFormula: Points / Actual Hours",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['actualPPHAggregation'],
      aggFunc: 'actualPPHAggregation',
      enableValue: true,
      cellStyle: params => getGoalStatusStyle(isMeetingGoalPPH(params)),
      valueGetter: (params) => {
        const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const hours = Number(params.data?.hours) || 0
        return hours > 0 ? points / hours : 0
      },
      valueFormatter: params => Number(params.value || 0).toFixed(2),
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const rate = Number(params.value ?? 0)
        const hours = params.node?.group ? Number(params.node.aggData?.hours ?? 0) : Number(params.data?.hours ?? 0)
        const points = params.node?.group ? Number(params.node.aggData?.points ?? 0) : getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const goal = params.node?.group ? Number(params.node.aggData?.goalRatePPH ?? 0) : getGoalRatePPH(params.data)
        const status = goal > 0 ? (rate >= goal ? 'Meeting goal' : 'Below goal') : 'No goal set'
        return `Actual Rate (PPH): ${formatNumber(rate)}\nFormula: ${formatNumber(points)} pts / ${formatNumber(hours)} hrs\nGoal (PPH): ${formatNumber(goal)}\nStatus: ${status}`
      }
    },

    {
      colId: 'goalRatePPH',
      headerName: 'Goal Rate (PPH)',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Target points per hour' },
      autoHeaderHeight: true,
      headerTooltip: "Target points per hour for the row.\nDirect is fixed target; Support uses supportGoalPointsPerHour.",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['goalRatePPHAggregation'],
      aggFunc: 'goalRatePPHAggregation',
      enableValue: true,
      valueGetter: params => getGoalRatePPH(params.data),
      valueFormatter: params => Number(params.value || 0).toFixed(2)
    },

    {
      field: "hours",
      headerName: "Actual Hours",
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Total worked hours' },
      autoHeaderHeight: true,
      headerTooltip: "Actual worked hours used in all goal comparisons.",
      filter: "agNumberColumnFilter",
      enableValue: true,
      valueFormatter: params => params.value && params.value.toFixed(2),
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const actualHours = Number(params.value ?? 0)
        const goalHours = params.node?.group ? Number(params.node.aggData?.goalHours ?? 0) : getLeafGoalHours(params.data, params.node as IRowNode<LocationRow> | undefined)
        const delta = goalHours - actualHours
        return `Actual Hours: ${formatNumber(actualHours)}\nGoal Hours: ${formatNumber(goalHours)}\nDelta (Goal - Actual): ${formatNumber(delta)}`
      }
    },

    {
      colId: 'goalHours',
      headerName: 'Goal Hours',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Expected hours at goal rate' },
      autoHeaderHeight: true,
      headerTooltip: "Expected hours if work was performed exactly at goal rate.\nFormula: (Goal SPP * Points) / 3600",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['goalHoursAggregation'],
      aggFunc: 'goalHoursAggregation',
      enableValue: true,
      valueGetter: (params) => {
        const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const goalRateSPP = getGoalRateSPP(params.data)
        return points > 0 ? (goalRateSPP * points) / 3600 : 0
      },
      valueFormatter: params => Number(params.value || 0).toFixed(2),
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const goalHours = Number(params.value ?? 0)
        const points = params.node?.group ? Number(params.node.aggData?.points ?? 0) : getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const goalSPP = params.node?.group ? Number(params.node.aggData?.goalRateSPP ?? 0) : getGoalRateSPP(params.data)
        return `Goal Hours: ${formatNumber(goalHours)}\nFormula: (${formatNumber(goalSPP)} SPP * ${formatNumber(points)} pts) / 3600`
      }
    },

    {
      colId: 'hoursDelta',
      headerName: 'Hours delta',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Goal hours minus actual hours' },
      autoHeaderHeight: true,
      headerTooltip: "Difference between expected goal-hours and actual worked hours.\nPositive is better.",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['hoursDeltaAggregation'],
      aggFunc: 'hoursDeltaAggregation',
      enableValue: true,
      cellStyle: params => getGoalStatusStyle(Number(params.value ?? 0) >= 0),
      valueGetter: (params) => {
        const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const goalRateSPP = getGoalRateSPP(params.data)
        const goalHours = points > 0 ? (goalRateSPP * points) / 3600 : 0
        const hours = Number(params.data?.hours) || 0
        return goalHours - hours
      },
      valueFormatter: params => Number(params.value || 0).toFixed(2),
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const delta = Number(params.value ?? 0)
        const hours = params.node?.group ? Number(params.node.aggData?.hours ?? 0) : Number(params.data?.hours ?? 0)
        const goalHours = params.node?.group ? Number(params.node.aggData?.goalHours ?? 0) : getLeafGoalHours(params.data, params.node as IRowNode<LocationRow> | undefined)
        const status = delta >= 0 ? 'Meeting goal' : 'Below goal'
        return `Hours Delta: ${formatNumber(delta)}\nFormula: ${formatNumber(goalHours)} Goal Hrs - ${formatNumber(hours)} Actual Hrs\nStatus: ${status}`
      }
    },

    {
      colId: 'pctToGoal',
      headerName: 'PCT to Goal',
      headerComponent: HeaderWithCaption,
      headerComponentParams: { caption: 'Goal hours divided by actual hours' },
      autoHeaderHeight: true,
      headerTooltip: "Percent to goal.\nFormula: (Goal Hours / Actual Hours) * 100",
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['pctToGoalAggregation'],
      aggFunc: 'pctToGoalAggregation',
      enableValue: true,
      cellStyle: params => getGoalStatusStyle(Number(params.value ?? 0) >= 100),
      valueGetter: (params) => {
        const points = getEffectivePoints(params.data, params.node as IRowNode<LocationRow> | undefined)
        const goalRateSPP = getGoalRateSPP(params.data)
        const goalHours = points > 0 ? (goalRateSPP * points) / 3600 : 0
        const hours = Number(params.data?.hours) || 0
        return hours > 0 ? (goalHours / hours) * 100 : 0
      },
      valueFormatter: params => `${Number(params.value || 0).toFixed(0)}%`,
      tooltipValueGetter: (params: ITooltipParams<LocationRow>) => {
        const pct = Number(params.value ?? 0)
        const hours = params.node?.group ? Number(params.node.aggData?.hours ?? 0) : Number(params.data?.hours ?? 0)
        const goalHours = params.node?.group ? Number(params.node.aggData?.goalHours ?? 0) : getLeafGoalHours(params.data, params.node as IRowNode<LocationRow> | undefined)
        const status = pct >= 100 ? 'Meeting goal' : 'Below goal'
        return `PCT to Goal: ${formatNumber(pct)}%\nFormula: (${formatNumber(goalHours)} / ${formatNumber(hours)}) * 100\nStatus: ${status}`
      }
    },

  ], [formatNumber, getEffectivePoints, getGoalRateMPP, getGoalRatePPH, getGoalRateSPP, getGoalStatusStyle, getLeafGoalHours])

  // Adds additional defaults to each column definition
  const defaultColDef = useMemo(() => ({
    flex: 1,
    minWidth: 175,
    tooltipComponent: RichTooltip,
    filterParams: {
      buttons: ["reset"]
    },
    cellRendererParams: {
      suppressCount: true
    }
  }), [])

  // Aggregate functions
  const aggFuncs = useMemo(() => ({
    pointsAggregation,
    actualRateMPPAggregation,
    actualRateMinPPAggregation,
    actualPPHAggregation,
    goalRateSPPAggregation,
    goalRateMinPPAggregation,
    goalRatePPHAggregation,
    goalHoursAggregation,
    hoursDeltaAggregation,
    pctToGoalAggregation
  }), [actualPPHAggregation, actualRateMPPAggregation, actualRateMinPPAggregation, goalHoursAggregation, goalRateMinPPAggregation, goalRatePPHAggregation, goalRateSPPAggregation, hoursDeltaAggregation, pctToGoalAggregation, pointsAggregation])

  // Theme of the grid
  const theme = useMemo(() => themeQuartz.withParams({
    borderRadius: 4,
    browserColorScheme: "light",
    headerFontSize: 14,
    spacing: 8,
    wrapperBorderRadius: 8,
    wrapperBorder: "rgba(0, 0, 0, 0)"
  }), []);

  const debounceTimeoutRef = useRef<number | null>(null);
  const stateApplyTimeoutRef = useRef<number | null>(null);

  const scheduleApplyGridState = useCallback(() => {
    if (!gridRef.current?.api) return
    if (stateApplyTimeoutRef.current) window.clearTimeout(stateApplyTimeoutRef.current)

    stateApplyTimeoutRef.current = window.setTimeout(() => {
      if (!gridRef.current?.api || !gridState) return
      gridRef.current.api.setState(gridState)
    }, 0)
  }, [gridState])

  const onStateUpdated = useCallback((_event: StateUpdatedEvent) => {

    if (!gridRef.current) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = window.setTimeout(() => {
      const gridState = gridRef.current!.api.getState();
      setCurrentGridState(gridState as Retool.SerializableObject);
    }, 200);
    
  }, [setCurrentGridState]);

  const onFirstDataRendered = () => {

    if (!gridRef.current?.api) return
    scheduleApplyGridState()

  }

  useEffect(() => {

    if (!gridRef.current?.api) return
    scheduleApplyGridState()

  }, [scheduleApplyGridState]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) window.clearTimeout(debounceTimeoutRef.current)
      if (stateApplyTimeoutRef.current) window.clearTimeout(stateApplyTimeoutRef.current)
    }
  }, [])

  return (
    <section className={styles.container}>

      <div className={styles.grid}>
        <AgGridReact

          ref={gridRef}

          rowData={rowData}
          columnDefs={colDefs}
          defaultColDef={defaultColDef}

          aggFuncs={aggFuncs}
          suppressAggFuncInHeader={true}

          sideBar
          enableCharts
          theme={theme}
          cellSelection
          tooltipShowDelay={120}
          tooltipMouseTrack

          onStateUpdated={onStateUpdated}
          onFirstDataRendered={onFirstDataRendered}
        />
      </div>

    </section>
  )
}

export default LocationInsightsGrid
