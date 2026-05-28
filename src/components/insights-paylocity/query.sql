SELECT
  wr.workflowRunId,
  wr.status                                                                                AS runStatus,
  CONVERT_TZ(wr.startedAt,   'UTC', '{{ localStorage.values.user.location.timezone }}')    AS startedAt,
  CONVERT_TZ(wr.completedAt, 'UTC', '{{ localStorage.values.user.location.timezone }}')    AS completedAt,
  TIMESTAMPDIFF(SECOND, wr.startedAt, COALESCE(wr.completedAt, UTC_TIMESTAMP()))           AS runDurationSeconds,
  wl.stage,
  wl.status                                                                                AS stageStatus,
  wl.message,
  wl.metadata,
  CONVERT_TZ(wl.createdAt,   'UTC', '{{ localStorage.values.user.location.timezone }}')    AS stageCreatedAt
FROM parcel.workflowRuns wr
LEFT JOIN parcel.workflowLogs wl
  ON wl.workflowRunId = wr.workflowRunId
WHERE wr.workflowId = 'labor-sync'
  AND wr.startedAt >= '{{ moment.tz(home__dateRange__dateRange.value.start, 'YYYY-MM-DD', localStorage.values.user.location.timezone).startOf('day') }}'
  AND wr.startedAt <  '{{ moment.tz(home__dateRange__dateRange.value.end,   'YYYY-MM-DD', localStorage.values.user.location.timezone).add(1, 'day').startOf('day') }}'
ORDER BY wr.startedAt DESC, wl.createdAt ASC
