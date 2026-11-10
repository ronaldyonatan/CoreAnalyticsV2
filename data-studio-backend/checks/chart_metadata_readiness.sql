/* Read-only readiness check for Chart Library metadata.
   Run after 013, and again after 014.
   No INSERT/UPDATE/DELETE/ALTER is executed here. */
USE [CoreAnalytics];
GO

SELECT
    CASE WHEN OBJECT_ID(N'studio.chart', N'U') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END AS chart_table,
    CASE WHEN OBJECT_ID(N'studio.spChartControl', N'P') IS NOT NULL
         THEN 'PASS' ELSE 'FAIL' END AS chart_procedure,
    CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'studio.spChartControl'))
              LIKE N'%CHART_VERSION_CONFLICT%'
         THEN 'PASS' ELSE 'FAIL' END AS chart_contract,
    CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'studio.spChartControl'))
              LIKE N'%JSON_QUERY(config_json)%'
         THEN 'PASS' ELSE 'FAIL' END AS list_config_object;
GO

SELECT
    c.name AS column_name,
    t.name AS data_type,
    c.max_length,
    c.is_nullable
FROM sys.columns c
JOIN sys.types t ON t.user_type_id = c.user_type_id
WHERE c.object_id = OBJECT_ID(N'studio.chart')
ORDER BY c.column_id;
GO

SELECT
    i.name AS index_name,
    i.is_unique,
    COL_NAME(ic.object_id, ic.column_id) AS column_name,
    ic.is_descending_key
FROM sys.indexes i
JOIN sys.index_columns ic
  ON ic.object_id = i.object_id
 AND ic.index_id = i.index_id
WHERE i.object_id = OBJECT_ID(N'studio.chart')
ORDER BY i.name, ic.key_ordinal;
GO

SELECT
    fk.name AS foreign_key_name,
    OBJECT_NAME(fk.referenced_object_id) AS referenced_table
FROM sys.foreign_keys fk
WHERE fk.parent_object_id = OBJECT_ID(N'studio.chart');
GO

/* Execute only as the BEAM SQL login to confirm object-level EXECUTE.
   As dbo/sysadmin this usually returns 1 regardless of grants. */
SELECT
    SUSER_SNAME() AS login_name,
    HAS_PERMS_BY_NAME(
        N'studio.spChartControl',
        N'OBJECT',
        N'EXECUTE'
    ) AS can_execute_chart_procedure;
GO

USE [BI];
GO

SELECT
    CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard'))
              LIKE N'%CoreStudioCharts%'
         THEN 'PASS' ELSE 'FAIL' END AS chart_route,
    CASE WHEN OBJECT_DEFINITION(OBJECT_ID(N'dbo.spDashboard'))
              LIKE N'%CoreStudioPipelines%'
         THEN 'PASS' ELSE 'FAIL' END AS pipeline_route_preserved;
GO
