/* Read-only verification. Does not display dashboard contents, keys, or run jobs. */
USE [CoreAnalytics];
SET NOCOUNT ON;
DECLARE @definition nvarchar(max),@phase nvarchar(max),@designer nvarchar(max),@previous nvarchar(max),@query nvarchar(max);
SELECT @definition=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
IF OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NOT NULL
 SELECT @phase=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
IF OBJECT_ID(N'studio.designer_gateway_backup',N'U') IS NOT NULL
 SELECT @designer=installed_definition,@previous=previous_definition FROM studio.designer_gateway_backup WHERE object_name=N'BI.dbo.spDashboard';
IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NOT NULL
 SELECT @query=installed_definition FROM studio.dataset_query_gateway_backup WHERE object_name=N'BI.dbo.spDashboard';
DECLARE @key_enabled bit=0;
IF OBJECT_ID(N'studio.object_access_rpc_key',N'U') IS NOT NULL AND EXISTS(SELECT 1 FROM studio.object_access_rpc_key WHERE key_id=1 AND enabled=1) SET @key_enabled=1;
SELECT (SELECT SYSUTCDATETIME() AS [checked_at_utc],
 CASE WHEN CHARINDEX(N'CoreStudioDesignerDashboard',@definition)>0 THEN 1 ELSE 0 END AS [designer_route_present],
 CASE WHEN OBJECT_ID(N'studio.designer_dashboard',N'U') IS NOT NULL THEN 1 ELSE 0 END AS [dashboard_table_present],
 CASE WHEN OBJECT_ID(N'studio.spDesignerDashboardRpc',N'P') IS NOT NULL THEN 1 ELSE 0 END AS [designer_gateway_present],
 @key_enabled AS [authorization_key_enabled],
 CASE WHEN @definition IS NOT NULL AND DATALENGTH(@phase)=DATALENGTH(@definition) AND @phase COLLATE Latin1_General_100_BIN2=@definition COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END AS [phase2d8_backup_matches],
 CASE WHEN @definition IS NOT NULL AND DATALENGTH(@designer)=DATALENGTH(@definition) AND @designer COLLATE Latin1_General_100_BIN2=@definition COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END AS [designer_backup_matches],
 CASE WHEN @previous IS NOT NULL AND DATALENGTH(@query)=DATALENGTH(@previous) AND @query COLLATE Latin1_General_100_BIN2=@previous COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END AS [query_rollback_baseline_preserved]
 FOR XML PATH('dashboard_designer_verify'),TYPE) AS OPEN_AND_SAVE_XML;
