/* Read-only DEV inventory. Run in CoreAnalytics; do not export RPC keys or secrets.
   Export these procedure definitions for review before data-plane migrations.
   dbo.spDashboard may live in the gateway database: inspect it there separately.
*/
SET NOCOUNT ON;
SELECT @@VERSION AS sql_server_version, DB_NAME() AS database_name;
SELECT s.name AS schema_name,o.name,o.type_desc,o.modify_date,
       CASE WHEN m.definition IS NULL THEN 0 ELSE 1 END AS definition_visible,
       m.definition
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
LEFT JOIN sys.sql_modules m ON m.object_id=o.object_id
WHERE s.name='studio' AND o.name IN
 ('spObjectAccessControlV2','spObjectAccessRpc','spPipelineControl',
  'spDatasetIngestControl','spDatasetIngestWorker','spStoredDatasetCreate',
  'spSchedulerControl','spSchedulerDispatch','spChartControl');
SELECT t.name AS table_name,c.name AS column_name,ty.name AS data_type,c.max_length
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.columns c ON c.object_id=t.object_id
JOIN sys.types ty ON ty.user_type_id=c.user_type_id
WHERE s.name='studio' AND t.name IN
 ('object_ownership','object_access','object_access_audit','object_access_admin_group',
  'pipeline','pipeline_run','pipeline_output_version','dataset','dataset_ingest_run','scheduler_schedule','chart')
ORDER BY t.name,c.column_id;
IF OBJECT_ID('studio.object_ownership','U') IS NOT NULL
 SELECT object_type,COUNT_BIG(*) AS ownership_count
 FROM studio.object_ownership GROUP BY object_type;
