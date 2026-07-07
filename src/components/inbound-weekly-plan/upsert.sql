-- Retool MySQL upsert against parcel.inboundWeeklyPlans — wire this to the
-- component's `cellValueChanged` event. Reads the hidden `lastEditedCell`
-- state: { rowKey, locationId, programId, effectiveDate, field, previousValue,
-- newValue } where field is 'baseline' | 'backlog'.
--
-- One query handles both fields: the ternaries bind the edited value to its
-- column and NULL to the other, and COALESCE(VALUES(col), col) keeps the
-- existing value for whichever column this edit didn't touch. The first edit
-- for a (location, program, week) inserts; later edits update in place via
-- the uq_loc_prog_week unique key.
--
-- Notes:
--   • effectiveDate arrives as full ISO ('2026-07-06T00:00:00.000Z');
--     .slice(0, 10) feeds the DATE column its date part only.
--   • chk_has_input is always satisfied: inserts carry exactly one non-null
--     value, and updates never null a column out.
--   • Clearing a Baseline cell reverts it to the fetched baseline in the grid
--     and fires this with newValue = that baseline, writing a redundant-but-
--     correct baselineOverride equal to it.
--   • Swap {{ current_user.id }} for however the app resolves the numeric
--     user id if current_user.id isn't an int in this org.
--   • Add a failure event handler on this query that re-runs the source
--     query — the grid edits optimistically, so a refetch is what rolls the
--     cell back when the write fails.
--
-- Rename `inboundWeeklyPlan1` to your component instance's name.

INSERT INTO parcel.inboundWeeklyPlans (
  locationId,
  programId,
  weekStart,
  baselineOverride,
  backlogLoadCount,
  createdBy
)
VALUES (
  {{ inboundWeeklyPlan1.lastEditedCell.locationId }},
  {{ inboundWeeklyPlan1.lastEditedCell.programId }},
  {{ inboundWeeklyPlan1.lastEditedCell.effectiveDate.slice(0, 10) }},
  {{ inboundWeeklyPlan1.lastEditedCell.field === 'baseline' ? inboundWeeklyPlan1.lastEditedCell.newValue : null }},
  {{ inboundWeeklyPlan1.lastEditedCell.field === 'backlog' ? inboundWeeklyPlan1.lastEditedCell.newValue : null }},
  {{ current_user.id }}
)
ON DUPLICATE KEY UPDATE
  baselineOverride = COALESCE(VALUES(baselineOverride), baselineOverride),
  backlogLoadCount = COALESCE(VALUES(backlogLoadCount), backlogLoadCount);
