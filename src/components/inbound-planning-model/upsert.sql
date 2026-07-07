-- Retool MySQL upsert against parcel.inboundWeeklyPlans — wire this to the
-- component's `cellValueChanged` event. Reads the hidden `lastEditedCell`
-- state: { rowKey, locationId, programId, weekStart, field, previousValue,
-- newValue } where field is 'baseline' | 'backlog'.
--
-- One query handles both fields: the ternaries bind the edited value to its
-- column and NULL to the other, and COALESCE(VALUES(col), col) keeps the
-- existing value for whichever column this edit didn't touch. The first edit
-- for a (location, program, week) inserts; later edits update in place via
-- the uq_loc_prog_week unique key.
--
-- Notes:
--   • weekStart arrives as full ISO ('2026-06-01T00:00:00.000Z'); .slice(0, 10)
--     feeds the DATE column its date part only.
--   • chk_has_input is always satisfied: inserts carry exactly one non-null
--     value, and updates never null a column out.
--   • Clearing a Baseline cell reverts it to budgetBaseline in the grid and
--     fires this with newValue = budgetBaseline, so a redundant-but-correct
--     baselineOverride equal to the budget gets stored. If you'd rather store
--     NULL (so later budget revisions flow through), the component needs to
--     include budgetBaseline in the payload — see the README.
--   • Swap {{ current_user.id }} for however the app resolves the numeric
--     user id if current_user.id isn't an int in this org.
--   • Add a failure event handler on this query that re-runs the source
--     query — the grid edits optimistically, so a refetch is what rolls the
--     cell back when the write fails.
--
-- Rename `inboundPlanningModel1` to your component instance's name.

INSERT INTO parcel.inboundWeeklyPlans (
  locationId,
  programId,
  weekStart,
  baselineOverride,
  backlogLoadCount,
  createdBy
)
VALUES (
  {{ inboundPlanningModel1.lastEditedCell.locationId }},
  {{ inboundPlanningModel1.lastEditedCell.programId }},
  {{ inboundPlanningModel1.lastEditedCell.weekStart.slice(0, 10) }},
  {{ inboundPlanningModel1.lastEditedCell.field === 'baseline' ? inboundPlanningModel1.lastEditedCell.newValue : null }},
  {{ inboundPlanningModel1.lastEditedCell.field === 'backlog' ? inboundPlanningModel1.lastEditedCell.newValue : null }},
  {{ current_user.id }}
)
ON DUPLICATE KEY UPDATE
  baselineOverride = COALESCE(VALUES(baselineOverride), baselineOverride),
  backlogLoadCount = COALESCE(VALUES(backlogLoadCount), backlogLoadCount);
