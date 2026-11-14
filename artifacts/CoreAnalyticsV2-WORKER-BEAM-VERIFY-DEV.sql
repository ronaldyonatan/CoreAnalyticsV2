/* Read-only deployment verification; does not expose keys or run jobs. */
USE [CoreAnalytics];
SET NOCOUNT ON;
DECLARE @dashboard nvarchar(max),@backup nvarchar(max),@previous nvarchar(max),@enabled bit=0;
SELECT @dashboard=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
IF OBJECT_ID(N'studio.worker_beam_gateway_backup',N'U') IS NOT NULL
 SELECT @backup=installed_definition FROM studio.worker_beam_gateway_backup WHERE object_name=N'BI.dbo.spDashboard';
IF OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NOT NULL
 SELECT @previous=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
IF OBJECT_ID(N'studio.worker_beam_key',N'U') IS NOT NULL
 SELECT @enabled=enabled FROM studio.worker_beam_key WHERE key_id=1;
SELECT (
 SELECT SYSUTCDATETIME() checked_at_utc,
  CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@dashboard)),2) dashboard_sha256,
  CASE WHEN @dashboard IS NOT NULL AND CHARINDEX(N'CoreStudioWorkerRpc',@dashboard)>0 THEN 1 ELSE 0 END worker_route_present,
  CASE WHEN @dashboard IS NOT NULL AND @backup IS NOT NULL AND DATALENGTH(@dashboard)=DATALENGTH(@backup)
    AND @dashboard COLLATE Latin1_General_100_BIN2=@backup COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END worker_backup_matches,
  CASE WHEN @dashboard IS NOT NULL AND @previous IS NOT NULL AND DATALENGTH(@dashboard)=DATALENGTH(@previous)
    AND @dashboard COLLATE Latin1_General_100_BIN2=@previous COLLATE Latin1_General_100_BIN2 THEN 1 ELSE 0 END phase2d8_backup_matches,
  CASE WHEN OBJECT_ID(N'studio.spWorkerBeamRpc',N'P') IS NOT NULL THEN 1 ELSE 0 END worker_rpc_present,
  @enabled AS worker_key_enabled,
  CASE WHEN OBJECT_ID(N'studio.dataset_query_source',N'U') IS NOT NULL THEN 1 ELSE 0 END query_dataset_metadata_installed
 FOR XML PATH('worker_beam_verify'),TYPE
) AS OPEN_AND_SAVE_XML;
