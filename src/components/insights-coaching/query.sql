WITH RECURSIVE

reporting_chain AS (
  SELECT
    e.cargoId AS employeeCargoId,
    s.cargoId AS supervisorCargoId,
    s.paylocityId AS supervisorPaylocityId
  FROM paylocityEmployees_deduped e
  JOIN paylocityEmployees_deduped s
    ON e.supervisor = s.paylocityId

  UNION ALL

  SELECT
    rc.employeeCargoId,
    parent.cargoId,
    parent.paylocityId
  FROM reporting_chain rc
  JOIN paylocityEmployees_deduped parent
    ON parent.paylocityId = (
      SELECT supervisor
      FROM paylocityEmployees_deduped
      WHERE cargoId = rc.supervisorCargoId
      LIMIT 1
    )
),

scoped_employees AS (
  SELECT DISTINCT
    rc.employeeCargoId
  FROM reporting_chain rc
  WHERE supervisorCargoId = {{ coachingInsights__select__supervisor.value }}
    AND rc.employeeCargoId NOT IN (
      SELECT DISTINCT
        s.cargoId
      FROM paylocityEmployees_deduped emp
      JOIN paylocityEmployees_deduped s
        ON emp.supervisor = s.paylocityId
    )
),

filtered_coachings AS (
  SELECT
    c.id,
    c.cargoId,
    c.type,
    c.severity,
    c.status,
    c.content,
    c.createdAt
  FROM coaching c
  JOIN scoped_employees se
    ON c.cargoId = se.employeeCargoId
  WHERE
    {{
      coachingInsights__multiselect__week.selectedItems?.length
        ? `(${coachingInsights__multiselect__week.selectedItems
              .map(({ value }) => `c.createdAt >= '${value.start}' AND c.createdAt < '${value.end}'`)
              .join(' OR ')})`
        : 'TRUE'
    }}
    AND {{
      coachingInsights__multiselect__filterType.selectedItems?.length
        ? `c.type IN (${coachingInsights__multiselect__filterType.value.map(type => `'${type}'`).join(',')})`
        : 'TRUE'
    }}
),

ranked_logs AS (
  SELECT
    cl.*,
    ROW_NUMBER() OVER (
      PARTITION BY cl.coachingId
      ORDER BY cl.createdAt DESC, cl.id DESC
    ) AS logRank
  FROM coachingLogs cl
  JOIN filtered_coachings fc
    ON fc.id = cl.coachingId
),

coaching_status AS (
  SELECT
    coachingId,
    action AS lastAction
  FROM ranked_logs
  WHERE logRank = 1
),

coaching_timings AS (
  SELECT
    cl.coachingId,
    MIN(
      CASE
        WHEN cl.action = 'viewed'
          THEN TIMESTAMPDIFF(SECOND, fc.createdAt, cl.createdAt)
      END
    ) / 3600.0 AS timeToViewed,
    MIN(
      CASE
        WHEN cl.action = 'reviewed'
          THEN TIMESTAMPDIFF(SECOND, fc.createdAt, cl.createdAt)
      END
    ) / 3600.0 AS timeToReviewed,
    MIN(
      CASE
        WHEN cl.action IN ('override requested', 'exemption requested')
          THEN TIMESTAMPDIFF(SECOND, fc.createdAt, cl.createdAt)
      END
    ) / 3600.0 AS timeToRequested,
    MIN(
      CASE
        WHEN cl.action = 'delivered'
          THEN TIMESTAMPDIFF(SECOND, fc.createdAt, cl.createdAt)
      END
    ) / 3600.0 AS timeToDelivered,
    MIN(
      CASE
        WHEN cl.action = 'exempted'
          THEN TIMESTAMPDIFF(SECOND, fc.createdAt, cl.createdAt)
      END
    ) / 3600.0 AS timeToExempted
  FROM coachingLogs cl
  JOIN filtered_coachings fc
    ON fc.id = cl.coachingId
  GROUP BY cl.coachingId
),

exemption_info AS (
  SELECT
    cl.coachingId,
    MAX(
      CASE
        WHEN cl.action = 'exempted'
          THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.exemptionType')), 'null')
      END
    ) AS exemptionType,
    MAX(
      CASE
        WHEN cl.action = 'exempted'
          THEN COALESCE(
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.note')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.notes')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.reason')), 'null')
          )
      END
    ) AS approverNotes,
    MAX(
      CASE
        WHEN cl.action IN ('exemption requested', 'override requested')
          THEN COALESCE(
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.note')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.notes')), 'null'),
            NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.reason')), 'null')
          )
      END
    ) AS requesterNotes,
    MAX(
      CASE
        WHEN cl.action = 'exempted' THEN cl.createdAt
      END
    ) AS exemptionCreatedAt
  FROM coachingLogs cl
  JOIN filtered_coachings fc
    ON fc.id = cl.coachingId
  GROUP BY cl.coachingId
),

override_info AS (
  SELECT
    cl.coachingId,
    MAX(CASE WHEN cl.action = 'override approved'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.originalStage')), 'null')
    END) AS originalSeverity,
    MAX(CASE WHEN cl.action = 'override approved'
      THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.newStage')), 'null')
    END) AS newSeverity,
    MAX(CASE WHEN cl.action = 'override approved'
      THEN COALESCE(
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.note')), 'null'),
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.notes')), 'null'),
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.reason')), 'null')
      )
    END) AS approverNotes,
    MAX(CASE WHEN cl.action = 'override requested'
      THEN COALESCE(
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.note')), 'null'),
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.notes')), 'null'),
        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(cl.content, '$.reason')), 'null')
      )
    END) AS requesterNotes,
    MAX(CASE WHEN cl.action = 'override approved' THEN cl.createdAt END) AS overrideCreatedAt
  FROM coachingLogs cl
  JOIN filtered_coachings fc ON fc.id = cl.coachingId
  WHERE cl.action IN ('override approved', 'override requested')
  GROUP BY cl.coachingId
)

SELECT
  c.id AS coachingId,
  c.cargoId AS employeeId,
  c.type,
  c.severity,
  c.status,
  CONVERT_TZ(c.createdAt, 'UTC', l.timezone) AS createdAt,
  CONCAT(COALESCE(ped.preferredName, ped.firstName), ' ', ped.lastName) AS employee,
  TIMESTAMPDIFF(DAY, ped.hireDate, CURDATE()) AS tenure,
  ped.locationId,
  l.name AS location,
  ped.jobTitle,
  ped.status AS employeeStatus,
  CONCAT(COALESCE(sup.preferredName, sup.firstName), ' ', sup.lastName) AS supervisor,
  sup.cargoId AS supervisorId,
  cs.lastAction,
  ct.timeToViewed,
  ct.timeToReviewed,
  ct.timeToRequested,
  ct.timeToDelivered,
  ct.timeToExempted,
  ei.exemptionType,
  ei.approverNotes,
  ei.requesterNotes,
  CONVERT_TZ(ei.exemptionCreatedAt, 'UTC', l.timezone) AS exemptionCreatedAt,
  oi.originalSeverity,
  oi.newSeverity,
  oi.approverNotes     AS overrideApproverNotes,
  oi.requesterNotes    AS overrideRequesterNotes,
  CONVERT_TZ(oi.overrideCreatedAt, 'UTC', l.timezone) AS overrideCreatedAt
FROM filtered_coachings c
JOIN paylocityEmployees_deduped ped
  ON ped.cargoId = c.cargoId
JOIN locations l
  ON l.id = ped.locationId
JOIN coaching_status cs
  ON cs.coachingId = c.id
LEFT JOIN paylocityEmployees_deduped sup
  ON sup.paylocityId = ped.supervisor
LEFT JOIN coaching_timings ct
  ON ct.coachingId = c.id
LEFT JOIN exemption_info ei
  ON ei.coachingId = c.id
LEFT JOIN override_info oi
  ON oi.coachingId = c.id
ORDER BY
  CONCAT(COALESCE(ped.preferredName, ped.firstName), ' ', ped.lastName),
  c.createdAt
