
import { Retool } from '@tryretool/custom-component-support'
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'

import styles from '../styles/insights.module.css'
import { ActionRow, ActionInsightsGridProps } from '../../utils/types'
import { actionCount, distinctEmployees, parseHour } from '../../utils/helpers'

import { AgGridReact } from 'ag-grid-react'
import { AgChartsEnterpriseModule } from "ag-charts-enterprise"
import { LicenseManager, AllEnterpriseModule, IntegratedChartsModule } from 'ag-grid-enterprise'
import { ColDef, ModuleRegistry, StateUpdatedEvent, AllCommunityModule, themeQuartz } from 'ag-grid-community'

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

const ensureAgGridInitialized = (rawLicenseKey?: string) => {
  // Enforce order: license first, modules second.
  applyAgGridLicense(rawLicenseKey)

  if (!hasRegisteredAgGridModules) {
    ModuleRegistry.registerModules([AllCommunityModule, AllEnterpriseModule, IntegratedChartsModule.with(AgChartsEnterpriseModule)])
    hasRegisteredAgGridModules = true
  }
}

const ActionInsightsGrid = ({ rowData, gridState, agGridLicenseKey }: ActionInsightsGridProps) => {

  // Retool state outputs
  const [currentGridState, setCurrentGridState] = Retool.useStateObject({ name: "currentGridState", inspector: "hidden", initialValue: {} })
  const [gridInitialized, setGridInitialized] = useState(false)

  useEffect(() => {
    ensureAgGridInitialized(agGridLicenseKey)
    setGridInitialized(true)
  }, [agGridLicenseKey])

  // Reference to the AG Grid table
  const gridRef = useRef<AgGridReact<ActionRow>>(null);

  // Holds the state of the column definitions.
  const [colDefs] = useState<ColDef<ActionRow>[]>([

    {
      field: "year",
      headerName: "Year",
      filter: "agSetColumnFilter",
      sort: "asc",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "month",
      headerName: "Month",
      filter: "agSetColumnFilter",
      sort: "asc",
      enablePivot: true,
      enableRowGroup: true,

      comparator: (a: string | null, b: string | null): number => {

        const order: Record<string, number> = {
          January: 1,
          February: 2,
          March: 3,
          April: 4,
          May: 5,
          June: 6,
          July: 7,
          August: 8,
          September: 9,
          October: 10,
          November: 11,
          December: 12,
        };

        const numA = a ? order[a] ?? 99 : 99;
        const numB = b ? order[b] ?? 99 : 99;

        return numA - numB;
      }
    },

    {
      field: "week",
      headerName: "Week",
      filter: "agSetColumnFilter",
      sort: "asc",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "day",
      headerName: "Day",
      filter: "agSetColumnFilter",
      sort: "asc",
      enablePivot: true,
      enableRowGroup: true,

      comparator: (a: string | null, b: string | null) => {
        const order: Record<string, number> = {
          Monday: 1,
          Tuesday: 2,
          Wednesday: 3,
          Thursday: 4,
          Friday: 5,
          Saturday: 6,
          Sunday: 7,
        };

        const numA = a ? order[a] ?? 99 : 99;
        const numB = b ? order[b] ?? 99 : 99;

        return numA - numB;
      }
    },

    {
      field: "date",
      headerName: "Date",
      filter: "agSetColumnFilter",
      sort: "asc",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: 'hour',
      headerName: 'Hour',
      filter: 'agSetColumnFilter',
      sort: 'asc',
      enablePivot: true,
      enableRowGroup: true,
      comparator: (a: string, b: string) => parseHour(a) - parseHour(b),
    },

    {
      field: "createdAt",
      headerName: "Created At",
      filter: true,
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "location",
      headerName: "Location",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "cargoId",
      headerName: "Cargo Id",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "paylocityId",
      headerName: "Paylocity Id",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "status",
      headerName: "Status",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "jobTitle",
      headerName: "Job Title",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "employee",
      headerName: "Employee",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true
    },

    {
      colId: "distinctEmployees",
      headerName: "Distinct Employees",
      filter: "agNumberColumnFilter",
      allowedAggFuncs: ['distinctEmployees'],
      enableValue: true,

      comparator: (valueA, valueB) => {
        
        const numA = valueA?.value ?? 0;
        const numB = valueB?.value ?? 0;

        return numA - numB;
      },

      // Leaf rows: return the raw cargoId number
      valueGetter: (params) => {

        if (!(params.node && params.node.group)) {

          const cargoIds = [Number(params.data!.cargoId) ?? 0]
          const uniqueCargoIds = new Set(cargoIds)

          return {
            cargoIds,
            value: uniqueCargoIds.size
          }
        }
      },

      valueFormatter: (params) => {

        if (params.value == null) return '0';

        if (params.value.hasOwnProperty('value')) {
          return params.value.value;
        }

        return '0';
      },
    },

    {
      field: "supervisor",
      headerName: "Supervisor",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "supervisorSecond",
      headerName: "2nd Supervisor",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "supervisorThird",
      headerName: "3rd Supervisor",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "supervisorFourth",
      headerName: "4th Supervisor",
      filter: "agSetColumnFilter",
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      field: "logType",
      headerName: "Log Type",
      headerTooltip: "Log Type",
      filter: true,
      enablePivot: true,
      enableRowGroup: true
    },

    {
      field: "itemId",
      headerName: "Item Id",
      headerTooltip: "Item Id",
      filter: true,
      enablePivot: true,
      enableRowGroup: true
    },

    {
      field: "action",
      headerName: "Action",
      headerTooltip: "Action",
      filter: true,
      enablePivot: true,
      enableRowGroup: true,
    },

    {
      colId: 'actionCount',
      headerName: 'Action Count',
      filter: 'agNumberColumnFilter',
      allowedAggFuncs: ['actionCount'],
      enableValue: true,

      valueGetter: (params) => {
        if (!(params.node && params.node.group)) {

          const actions = [params.data!.action]

          return {
            actions,
            value: actions.length
          }
        }
      },

      valueFormatter: (params) => {

        if (params.value == null) return '0';

        if (params.value.hasOwnProperty('value')) {
          return params.value.value;
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
      field: "program",
      headerName: "Program",
      headerTooltip: "Program",
      filter: true,
      enablePivot: true,
      enableRowGroup: true,
      enableValue: true,
      allowedAggFuncs: ['count']
    },

    {
      field: "programType",
      headerName: "Program Type",
      headerTooltip: "Program Type",
      filter: true,
      enablePivot: true,
      enableRowGroup: true,
      enableValue: true,
      allowedAggFuncs: ['count']
    },

    {
      field: "size",
      headerName: "Size",
      headerTooltip: "Size",
      filter: true,
      enablePivot: true,
      enableRowGroup: true,
      enableValue: true,
      allowedAggFuncs: ['count']
    }
  ])

  // Adds additional defaults to each column definition
  const defaultColDef = useMemo(() => ({
    flex: 1,
    minWidth: 200,
    filterParams: {
      buttons: ["reset"]
    },
    cellRendererParams: {
      suppressCount: true
    }
  }), [])

  // Aggregate functions
  const aggFuncs = useMemo(() => ({
    distinctEmployees,
    actionCount
  }), [])

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

  const onStateUpdated = useCallback((event: StateUpdatedEvent) => {

    if (!gridRef.current) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = window.setTimeout(() => {
      const gridState = gridRef.current!.api.getState();
      setCurrentGridState(gridState as Retool.SerializableObject);
    }, 200);

  }, []);

  const onFirstDataRendered = () => {

    if (!gridRef.current?.api || !gridState) return;

    gridRef.current.api.setState(gridState);

  }

  useEffect(() => {

    if (!gridRef.current?.api || !gridState) return;

    gridRef.current.api.setState(gridState);

  }, [gridState]);

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

          onStateUpdated={onStateUpdated}
          onFirstDataRendered={onFirstDataRendered}
          pivotRowTotals={"before"}
        />
      </div>

    </section>
  )
}

export default ActionInsightsGrid
