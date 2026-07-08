-- Retool source query for the Inbound Weekly Plan grid — one row per
-- (location × program × week). The transformer nests location/program
-- objects and passes loadsPerWeek/loadsPerWeekOverride/backlog through:
-- map `budgetBaseline: row.loadsPerWeek` (component-internal name).
--
-- Mental model: budgets are rules (effective-dated, open-ended, ended by the
-- next entry for the same location+program — 0 loads terminates); weekly rows
-- are exceptions (loadsPerWeekOverride) and observations (loadsInBacklog).
-- The weekly view is *resolved at read time* — nothing is materialized, so
-- budget edits flow through every week they govern.
--
-- Notes:
--   • backlog is NOT coalesced to 0: null = "not entered", distinct from 0.
--   • combos unions in weekly-plan pairs so backlog-only weeks (no budget
--     rows at all) still appear.
--   • totalPlan coalesces the baseline term to 0 so a backlog-only week
--     doesn't produce NULL + n = NULL.
--   • Weeks window: 1 week back + current + 4 forward. Adjust the `7 * 1`
--     offset (weeks back) and `n < 6` (total weeks) to taste.

WITH RECURSIVE

weeks AS (
  SELECT
    DATE_SUB(CURDATE(), INTERVAL (WEEKDAY(CURDATE()) + 7 * 1) DAY) AS effectiveWeek,
    1 AS n

  UNION ALL

  SELECT
    effectiveWeek + INTERVAL 7 DAY,
    n + 1
  FROM
    weeks
  WHERE
    n < 6
),

budgetRanges AS (
  SELECT
    locationId,
    programId,
    effectiveWeek,
    loadsPerWeek,
    carrierId,
    type,
    LEAD(effectiveWeek) OVER (
      PARTITION BY locationId, programId
      ORDER BY effectiveWeek
    ) AS endWeek
  FROM
    parcel.inboundBudgets
  WHERE
    {{
      home__multiselect__location.value.length > 0
        ? `locationId IN (${home__multiselect__location.value.join(',')})`
        : 'TRUE'
    }}
    AND {{
      home__multiselect__programs.value.length > 0
        ? `programId IN (${home__multiselect__programs.value.join(',')})`
        : 'TRUE'
    }}
),

-- Every pair that has either a budget or a weekly entry — backlog can exist
-- where no budget does (e.g. working down inventory after a budget ends).
combos AS (
  SELECT
    locationId,
    programId
  FROM
    budgetRanges

  UNION

  SELECT
    locationId,
    programId
  FROM
    parcel.inboundWeeklyPlans
  WHERE
    {{
      home__multiselect__location.value.length > 0
        ? `locationId IN (${home__multiselect__location.value.join(',')})`
        : 'TRUE'
    }}
    AND {{
      home__multiselect__programs.value.length > 0
        ? `programId IN (${home__multiselect__programs.value.join(',')})`
        : 'TRUE'
    }}
),

-- The budget in effect for each week: effectiveWeek <= week < endWeek.
-- NULLIF translates the storage convention (0 loads = terminator) into its
-- domain meaning: a 0-budget week IS an unbudgeted week, so it resolves to
-- NULL and renders blank/read-only downstream. A 0 *override* is different —
-- a deliberate pause — and still displays as 0.
resolved AS (
  SELECT
    c.locationId,
    c.programId,
    w.effectiveWeek,
    NULLIF(br.loadsPerWeek, 0) AS loadsPerWeek,
    br.carrierId,
    br.type AS budgetType
  FROM
    weeks w
  CROSS JOIN
    combos c
  LEFT JOIN
    budgetRanges br
    ON br.locationId = c.locationId
    AND br.programId = c.programId
    AND w.effectiveWeek >= br.effectiveWeek
    AND (br.endWeek IS NULL OR w.effectiveWeek < br.endWeek)
),

-- The grid derives its week columns from the rows it receives, so every
-- surviving program must keep ALL its weeks — empty ones render as blank
-- cells and hold the 6-week skeleton open. Filtering must therefore happen
-- at PROGRAM grain, not row grain: comboHasData asks "does this
-- location+program have any data anywhere in the window?" and stamps the
-- answer on all its rows, so they live or die together. Keyed on "has any
-- data" rather than "> 0" so a program whose only entry is a 0-override
-- (deliberate pause) or an explicit backlog 0 still shows.
planned AS (
  SELECT
    r.locationId,
    r.programId,
    r.effectiveWeek,
    r.carrierId,
    r.budgetType,
    wp.loadsInBacklog AS backlog,
    r.loadsPerWeek,
    wp.loadsPerWeekOverride,
    COALESCE(wp.loadsPerWeekOverride, r.loadsPerWeek) AS baseline,
    COALESCE(wp.loadsPerWeekOverride, r.loadsPerWeek, 0) + COALESCE(wp.loadsInBacklog, 0) AS totalPlan,
    MAX(
      COALESCE(wp.loadsPerWeekOverride, r.loadsPerWeek) IS NOT NULL
        OR wp.loadsInBacklog IS NOT NULL
    ) OVER (PARTITION BY r.locationId, r.programId) AS comboHasData
  FROM
    resolved r
  LEFT JOIN
    parcel.inboundWeeklyPlans wp
    ON wp.locationId = r.locationId
    AND wp.programId = r.programId
    AND wp.weekOf    = r.effectiveWeek
)

SELECT

  CONCAT_WS('-', locationId, programId, effectiveWeek) AS id,

  locationId,
  programId,
  effectiveWeek,

  carrierId,
  budgetType,

  backlog,

  loadsPerWeek,
  loadsPerWeekOverride,
  baseline,

  totalPlan
FROM
  planned
WHERE
  comboHasData
ORDER BY
  locationId,
  programId,
  effectiveWeek;
