-- Retool MySQL query against the Parcel DB: one row per (program × week) for
-- programs assigned to the selected building, LEFT JOINed to any plan rows.
--
-- The recursive `weeks` CTE generates every Monday in the date range so empty
-- weeks always produce rows. CROSS JOIN with `locationToPrograms` (filtered to
-- the current building) means programs without any plan data still appear.
-- LEFT JOIN to `inboundPlans` brings in the baseline/backlog values where they
-- exist — combos with no data come back as NULL loadType / NULL loadCount,
-- which the component renders as empty (0) cells ready to type into.
--
-- Bind these placeholders to your Retool app state:
--   home__select__location.value          INT   selected building id
--   home__dateRange.value.start/.end      DATE  date range picker bounds
--
-- Returns columns: weekStart | programId | loadType | loadCount
-- A Retool JS transformer joins this with the BQ programs lookup to add
-- `program` (name), then the merged array binds to the component's `rows` prop.

WITH RECURSIVE
weeks AS (
  SELECT
    '{{ moment.tz(home__dateRange.value.start, localStorage.values.user.location.timezone).startOf('isoWeek').format('YYYY-MM-DD') }}' AS weekStart
  UNION ALL
  SELECT
    DATE_ADD(weekStart, INTERVAL 7 DAY)
  FROM weeks
  WHERE DATE_ADD(weekStart, INTERVAL 7 DAY) < '{{ home__dateRange.value.end }}'
)
SELECT
  DATE_FORMAT(w.weekStart, '%Y-%m-%d') AS weekStart,
  ltp.programId,
  ip.loadType,
  ip.loadCount
FROM
  weeks w
CROSS JOIN
  locationToPrograms ltp
LEFT JOIN
  inboundPlans ip
    ON ip.weekStart  = w.weekStart
    AND ip.programId = ltp.programId
    AND ip.locationId = ltp.locationId
WHERE
  ltp.locationId = {{ home__select__location.value }}
ORDER BY
  w.weekStart,
  ltp.programId,
  ip.loadType DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- Companion UPSERT query (wire this one to the `cellEdited` event)
-- Reads from the component's hidden `lastEditedCell` state, which always holds
-- { programId, weekStart, loadType, loadCount } for the cell that just changed.
-- ─────────────────────────────────────────────────────────────────────────────

-- INSERT INTO inboundPlans (locationId, programId, weekStart, loadType, loadCount, updatedBy)
-- VALUES (
--   {{ home__select__location.value }},
--   {{ inboundPlan.lastEditedCell.programId }},
--   {{ inboundPlan.lastEditedCell.weekStart }},
--   {{ inboundPlan.lastEditedCell.loadType }},
--   {{ inboundPlan.lastEditedCell.loadCount }},
--   {{ current_user.id }}
-- )
-- ON DUPLICATE KEY UPDATE
--   loadCount = VALUES(loadCount),
--   updatedBy = VALUES(updatedBy);
