
import { IAggFuncParams, ModuleRegistry, AllCommunityModule } from 'ag-grid-community'
import {
  LicenseManager,
  AllEnterpriseModule,
  IntegratedChartsModule,
  PivotModule,
  RowGroupingModule
} from 'ag-grid-enterprise'
import { AgChartsEnterpriseModule } from 'ag-charts-enterprise'

export const parseHour = (value: string) => {

  if (!value) {
    return -1;
  }

  const [hourStr, meridian] = value.trim().split(" ");

  let hour = parseInt(hourStr, 10);

  if (meridian === "AM" && hour === 12) {
    hour = 0;
  } else if (meridian === "PM" && hour !== 12) {
    hour += 12;
  }

  return hour;
};

export const distinctEmployees = (params: IAggFuncParams) => {

  const cargoIds = params.values.map(value => value.cargoIds).flat()
  const uniqueCargoIds = new Set<number>(cargoIds)

  return {
    cargoIds,
    value: uniqueCargoIds.size
  }
};

export const actionCount = (params: IAggFuncParams) => {

  const actions = params.values.map(value => value.actions).flat()

  return {
    actions,
    value: actions.length
  }
};

export const pphAggregation = (params: IAggFuncParams) => {

  const { points, directHours } = params.values.reduce((acc, value) => {
    acc.points += value.points
    acc.directHours += value.directHours
    return acc
  }, { points: 0, directHours: 0 })

  return {
    points,
    directHours,
    value: directHours > 0 ? points / directHours : 0
  }
}

export const directPercentAggregation = (params: IAggFuncParams) => {

  const { directHours, totalHours } = params.values.reduce((acc, value) => {
    acc.directHours += value.directHours
    acc.totalHours += value.totalHours
    return acc
  }, { directHours: 0, totalHours: 0 })

  return {
    directHours,
    totalHours,
    value: totalHours > 0 ? (directHours / totalHours) * 100 : 0
  }
}

export const indirectPercentAggregation = (params: IAggFuncParams) => {

  const { indirectHours, totalHours } = params.values.reduce((acc, value) => {
    acc.indirectHours += value.indirectHours
    acc.totalHours += value.totalHours
    return acc
  }, { indirectHours: 0, totalHours: 0 })

  return {
    indirectHours,
    totalHours,
    value: totalHours > 0 ? (indirectHours / totalHours) * 100 : 0
  }
}

export const adminPercentAggregation = (params: IAggFuncParams) => {

  const { adminHours, totalHours } = params.values.reduce((acc, value) => {
    acc.adminHours += value.adminHours
    acc.totalHours += value.totalHours
    return acc
  }, { adminHours: 0, totalHours: 0 })

  return {
    adminHours,
    totalHours,
    value: totalHours > 0 ? (adminHours / totalHours) * 100 : 0
  }
}

export const gapPercentAggregation = (params: IAggFuncParams) => {

  const { gapHours, totalHours } = params.values.reduce((acc, value) => {
    acc.gapHours += value.gapHours
    acc.totalHours += value.totalHours
    return acc
  }, { gapHours: 0, totalHours: 0 })

  return {
    gapHours,
    totalHours,
    value: totalHours > 0 ? (gapHours / totalHours) * 100 : 0
  }
}

export const kioskPercent = (params: IAggFuncParams) => {

  const { kioskAssignments, totalAssignments } = params.values.reduce((acc, value) => {
    acc.kioskAssignments += value.kioskAssignments
    acc.totalAssignments += value.totalAssignments
    return acc
  }, { kioskAssignments: 0, totalAssignments: 0 })

  return {
    kioskAssignments,
    totalAssignments,
    value: totalAssignments > 0 ? (kioskAssignments / totalAssignments) * 100 : 0
  }
}

export const proactivePercent = (params: IAggFuncParams) => {
  
  const { proactiveAssignments, totalAssignments } = params.values.reduce((acc, value) => {
    acc.proactiveAssignments += value.proactiveAssignments
    acc.totalAssignments += value.totalAssignments
    return acc
  }, { proactiveAssignments: 0, totalAssignments: 0 })

  return {
    proactiveAssignments,
    totalAssignments,
    value: totalAssignments > 0 ? (proactiveAssignments / totalAssignments) * 100 : 0
  }
}

export const reactivePercent = (params: IAggFuncParams) => {
  
  const { reactiveAssignments, totalAssignments } = params.values.reduce((acc, value) => {
    acc.reactiveAssignments += value.reactiveAssignments
    acc.totalAssignments += value.totalAssignments
    return acc
  }, { reactiveAssignments: 0, totalAssignments: 0 })

  return {
    reactiveAssignments,
    totalAssignments,
    value: totalAssignments > 0 ? (reactiveAssignments / totalAssignments) * 100 : 0
  }
}

export const actualRateMPPAggregation = (params: IAggFuncParams) => {

  const { points, hours } = params.values.reduce((acc, value) => {

    acc.points += value.points
    acc.hours += value.hours

    return acc

  }, { points: 0, hours: 0 })

  const value = points > 0
    ? (hours * 60) / points
    : 0;

  return {
    points,
    hours,
    value
  }
}

// ── AG Grid initialization ────────────────────────────────────────────────────

let appliedAgGridLicenseKey: string | null = null
let hasWarnedMissingAgGridLicense = false
let hasRegisteredAgGridModules = false

const applyAgGridLicense = (rawLicenseKey?: string) => {
  const licenseKey = String(rawLicenseKey ?? '').trim()
  if (licenseKey) {
    if (appliedAgGridLicenseKey !== licenseKey) {
      LicenseManager.setLicenseKey(licenseKey)
      appliedAgGridLicenseKey = licenseKey
    }
    hasWarnedMissingAgGridLicense = false
    return
  }
  if (!hasWarnedMissingAgGridLicense) {
    console.warn('AG Grid License Key not provided. Please set the "agGridLicenseKey" state variable to enable enterprise features.')
    hasWarnedMissingAgGridLicense = true
  }
}

export const ensureAgGridInitialized = (rawLicenseKey?: string) => {
  applyAgGridLicense(rawLicenseKey)
  if (!hasRegisteredAgGridModules) {
    ModuleRegistry.registerModules([
      AllCommunityModule,
      AllEnterpriseModule,
      IntegratedChartsModule.with(AgChartsEnterpriseModule),
      // Explicit pivot / row-grouping modules — belt-and-suspenders against
      // bundler tree-shaking dropping them from the AllEnterpriseModule barrel.
      RowGroupingModule,
      PivotModule
    ])
    hasRegisteredAgGridModules = true
  }
}

// ── Inbound Plan helpers ──────────────────────────────────────────────────────

export const LOAD_TYPES = ['baseline', 'backlog'] as const

// Cell field naming: 'wk-YYYY-MM-DD_{suffix}'. Used both for editable baseline/
// backlog cells AND for read-only computed/imported cells (e.g. 'actual').
// parseCellField only matches the editable suffixes ('baseline' | 'backlog')
// since those are the only ones the edit handler cares about.
export const cellFieldFor = (weekStart: string, suffix: string) =>
  `wk-${weekStart}_${suffix}`

export const parseCellField = (field: string) => {
  const match = /^wk-(\d{4}-\d{2}-\d{2})_(baseline|backlog)$/.exec(field)
  if (!match) return null
  return { weekStart: match[1], loadType: match[2] as 'baseline' | 'backlog' }
}

// Format a 'YYYY-MM-DD' weekStart into a short column-group header ('May 18').
export const formatWeekHeader = (mondayIso: string) => {
  if (!mondayIso) return ''
  const d = new Date(`${mondayIso}T00:00:00Z`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
