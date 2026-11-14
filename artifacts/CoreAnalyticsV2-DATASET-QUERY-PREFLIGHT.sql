/* Dataset SQL query source: READ-ONLY DEV inventory; no install or data changes.
   Run in the same DEV environment as Phase 2D.8, with metadata visibility in
   CoreAnalytics and BI. Save the single XML result for review. The report
   contains object metadata and definition hashes, never query definitions,
   connection credentials, dataset rows, user IDs or access grants.
   A successful inventory does not enable query datasets or prove source safety. */
USE [CoreAnalytics];
SET NOCOUNT ON;

IF DB_ID(N'BI') IS NULL
    THROW 53100, 'BI_DATABASE_REQUIRED', 1;

SELECT (
    SELECT DB_NAME() AS [database_name],
           CONVERT(varchar(33), SYSUTCDATETIME(), 126) AS [captured_at_utc],
           CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion')) AS [sql_server_version],
           CAST(DATABASEPROPERTYEX(DB_NAME(), 'CompatibilityLevel') AS int) AS [compatibility_level],
           HAS_PERMS_BY_NAME(N'studio.dataset', N'OBJECT', N'VIEW DEFINITION') AS [can_view_dataset_definition],
           HAS_PERMS_BY_NAME(N'studio.spStoredDatasetCreate', N'OBJECT', N'VIEW DEFINITION') AS [can_view_stored_create],
           (
               SELECT c.column_id AS [position], c.name AS [name], t.name AS [type],
                      c.max_length AS [max_length_bytes], c.is_nullable AS [nullable],
                      dc.definition AS [default_definition]
               FROM sys.columns c
               JOIN sys.types t ON t.user_type_id = c.user_type_id
               LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
               WHERE c.object_id = OBJECT_ID(N'studio.dataset', N'U')
               ORDER BY c.column_id
               FOR XML PATH('column'), TYPE
           ) AS [dataset_columns],
           (
               SELECT ck.name AS [name], ck.definition AS [definition],
                      ck.is_disabled AS [disabled], ck.is_not_trusted AS [not_trusted]
               FROM sys.check_constraints ck
               WHERE ck.parent_object_id = OBJECT_ID(N'studio.dataset', N'U')
               ORDER BY ck.name
               FOR XML PATH('constraint'), TYPE
           ) AS [dataset_checks],
           (
               SELECT tr.name AS [name], tr.is_disabled AS [disabled],
                      CASE WHEN OBJECT_DEFINITION(tr.object_id) IS NULL THEN N'NOT_VISIBLE'
                           ELSE CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), OBJECT_DEFINITION(tr.object_id))), 2)
                      END AS [definition_sha256]
               FROM sys.triggers tr
               WHERE tr.parent_id = OBJECT_ID(N'studio.dataset', N'U')
               ORDER BY tr.name
               FOR XML PATH('trigger'), TYPE
           ) AS [dataset_triggers],
           (
               SELECT s.name + N'.' + o.name AS [name], o.type_desc AS [type],
                      CASE WHEN m.definition IS NULL THEN N'NOT_VISIBLE'
                           ELSE CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), m.definition)), 2)
                      END AS [definition_sha256]
               FROM sys.objects o JOIN sys.schemas s ON s.schema_id = o.schema_id
               LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
               WHERE s.name = N'studio' AND o.name IN
                  (N'spStoredDatasetCreate', N'spDatasetIngestControl', N'spDatasetIngestWorker',
                   N'spObjectAccessControlV2', N'fnStudioAccessLevel')
               ORDER BY o.name
               FOR XML PATH('module'), TYPE
           ) AS [core_modules],
           (
               SELECT N'BI.dbo.spDashboard' AS [name],
                      CASE WHEN m.definition IS NULL THEN N'NOT_VISIBLE'
                           ELSE CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), m.definition)), 2)
                      END AS [definition_sha256]
               FROM BI.sys.objects o JOIN BI.sys.schemas s ON s.schema_id = o.schema_id
               LEFT JOIN BI.sys.sql_modules m ON m.object_id = o.object_id
               WHERE s.name = N'dbo' AND o.name = N'spDashboard' AND o.type = 'P'
               FOR XML PATH('module'), TYPE
           ) AS [bi_gateway]
    FOR XML PATH('dataset_query_preflight'), TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
