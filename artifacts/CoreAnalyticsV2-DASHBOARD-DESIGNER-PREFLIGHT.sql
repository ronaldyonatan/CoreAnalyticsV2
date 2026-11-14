/* Read-only DEV preflight. No data, grants, keys, jobs, or definitions change. */
USE [CoreAnalytics];
SET NOCOUNT ON;
DECLARE @definition nvarchar(max),@phase nvarchar(max),@query nvarchar(max);
SELECT @definition=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
IF OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NOT NULL
 SELECT @phase=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NOT NULL
 SELECT @query=installed_definition FROM studio.dataset_query_gateway_backup WHERE object_name=N'BI.dbo.spDashboard';
SELECT (
 SELECT SYSUTCDATETIME() AS [checked_at_utc],DB_NAME() AS [metadata_database],
  CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@definition)),2) AS [dashboard_definition_sha256],
  CASE WHEN @definition IS NOT NULL THEN 1 ELSE 0 END AS [dashboard_definition_visible],
  CASE WHEN @definition IS NOT NULL AND DATALENGTH(@phase)=DATALENGTH(@definition) AND @phase COLLATE Latin1_General_100_BIN2=@definition COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END AS [phase2d8_backup_matches],
  CASE WHEN @definition IS NOT NULL AND DATALENGTH(@query)=DATALENGTH(@definition) AND @query COLLATE Latin1_General_100_BIN2=@definition COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END AS [query_dataset_backup_matches],
  CASE WHEN CHARINDEX(N'CoreStudioDesignerDashboard',@definition)>0 THEN 1 ELSE 0 END AS [designer_route_marker_present],
  CASE WHEN OBJECT_ID(N'studio.designer_dashboard',N'U') IS NOT NULL THEN 1 ELSE 0 END AS [dashboard_table_present],
  CASE WHEN OBJECT_ID(N'studio.spDesignerDashboardRpc',N'P') IS NOT NULL THEN 1 ELSE 0 END AS [designer_gateway_present],
  CASE WHEN OBJECT_ID(N'studio.fnObjectAccessHmac256',N'FN') IS NOT NULL THEN 1 ELSE 0 END AS [hmac_function_present],
  CASE WHEN OBJECT_ID(N'studio.object_access_rpc_key',N'U') IS NOT NULL THEN 1 ELSE 0 END AS [authorization_key_present],
  CASE WHEN OBJECT_ID(N'studio.object_access_rpc_nonce',N'U') IS NOT NULL THEN 1 ELSE 0 END AS [nonce_table_present]
 FOR XML PATH('dashboard_designer_preflight'),TYPE
) AS OPEN_AND_SAVE_XML;
