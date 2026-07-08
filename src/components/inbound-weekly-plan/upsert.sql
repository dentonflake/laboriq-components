-- Retool save queries against parcel.inboundWeeklyPlans — wire BOTH to the
-- component's `cellValueChanged` event (or chain: upsert → success → delete).
-- Each no-ops in the other's case, so firing both on every edit is safe.
--
-- The component emits the *resulting* row state in `lastEditedCell`:
--   { rowKey, locationId, programId, effectiveWeek, field, previousValue,
--     newValue, loadsPerWeekOverride, loadsInBacklog }
-- so these queries write both columns directly — no COALESCE/IF gymnastics,
-- and NULL is a real writable value:
--   • loadsPerWeekOverride = NULL   → override cleared (budget stands)
--   • loadsInBacklog = NULL   → backlog "not entered" (distinct from 0)
--   • both NULL                 → the row must be DELETED: chk_has_input
--     forbids storing an empty row, which is why the upsert is guarded.
--
-- The component never writes the budget value back as an override (typing
-- the exact budget value clears the override instead), so overrides in this
-- table are always intentional deviations — never stale budget snapshots.
--
-- Notes:
--   • effectiveWeek arrives as full ISO ('2026-07-06T00:00:00.000Z');
--     .slice(0, 10) feeds the DATE column its date part (always a Monday —
--     chk_wp_monday enforces this).
--   • Swap {{ current_user.id }} for however the app resolves the numeric
--     user id if current_user.id isn't an int in this org.
--   • Add a failure event handler on both queries that re-runs the source
--     query — the grid edits optimistically, so a refetch is what rolls the
--     cell back when a write fails.
--
-- Rename `inboundWeeklyPlan1` to your component instance's name.

-- ── Query 1: upsertWeeklyPlan ────────────────────────────────────────────────
-- Guarded so it no-ops when the edit leaves both fields null (delete's case).

INSERT INTO parcel.inboundWeeklyPlans (
  locationId,
  programId,
  weekOf,
  loadsPerWeekOverride,
  loadsInBacklog,
  createdBy,
  updatedBy
)
SELECT
  {{ inboundWeeklyPlan1.lastEditedCell.locationId }},
  {{ inboundWeeklyPlan1.lastEditedCell.programId }},
  {{ inboundWeeklyPlan1.lastEditedCell.effectiveWeek.slice(0, 10) }},
  {{ inboundWeeklyPlan1.lastEditedCell.loadsPerWeekOverride }},
  {{ inboundWeeklyPlan1.lastEditedCell.loadsInBacklog }},
  {{ current_user.id }},
  {{ current_user.id }}
FROM DUAL
WHERE {{ !(inboundWeeklyPlan1.lastEditedCell.loadsPerWeekOverride === null && inboundWeeklyPlan1.lastEditedCell.loadsInBacklog === null) }}
ON DUPLICATE KEY UPDATE
  loadsPerWeekOverride = VALUES(loadsPerWeekOverride),
  loadsInBacklog = VALUES(loadsInBacklog),
  updatedBy        = VALUES(updatedBy);

-- ── Query 2: deleteWeeklyPlan ────────────────────────────────────────────────
-- Removes the row when the edit cleared the last remaining value.

DELETE FROM parcel.inboundWeeklyPlans
WHERE locationId = {{ inboundWeeklyPlan1.lastEditedCell.locationId }}
  AND programId  = {{ inboundWeeklyPlan1.lastEditedCell.programId }}
  AND weekOf     = {{ inboundWeeklyPlan1.lastEditedCell.effectiveWeek.slice(0, 10) }}
  AND {{ inboundWeeklyPlan1.lastEditedCell.loadsPerWeekOverride === null && inboundWeeklyPlan1.lastEditedCell.loadsInBacklog === null }};
