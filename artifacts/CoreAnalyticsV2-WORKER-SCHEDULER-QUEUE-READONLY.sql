USE [CoreAnalytics];
SET NOCOUNT ON;
DECLARE @dashboard nvarchar(max), @query nvarchar(max)=N'USE [BI]; SELECT @d=OBJECT_DEFINITION(OBJECT_ID(N''dbo.spDashboard''));';
IF DB_ID(N'BI') IS NOT NULL
 EXEC sys.sp_executesql @query,N'@d nvarchar(max) OUTPUT',@dashboard OUTPUT;
SELECT (
 SELECT DB_NAME() AS [metadata_database], SYSUTCDATETIME() AS [checked_at_utc],
   CASE WHEN @dashboard IS NULL THEN 0 ELSE 1 END AS [dashboard_definition_visible],
   CONVERT(varchar(64),HASHBYTES('SHA2_256',@dashboard),2) AS [dashboard_definition_sha256],
   CASE WHEN CHARINDEX(N'CoreStudioWorkerRpc',@dashboard)>0 THEN 1 ELSE 0 END AS [worker_route_marker_present],
   CASE WHEN OBJECT_ID(N'studio.spDatasetIngestWorker',N'P') IS NOT NULL THEN 1 ELSE 0 END AS [ingest_worker_procedure_present],
   CASE WHEN OBJECT_ID(N'studio.spSchedulerDispatch',N'P') IS NOT NULL THEN 1 ELSE 0 END AS [scheduler_dispatch_procedure_present],
   CASE WHEN OBJECT_ID(N'studio.fnObjectAccessHmac256',N'FN') IS NOT NULL THEN 1 ELSE 0 END AS [hmac_function_present],
   CASE WHEN OBJECT_ID(N'studio.worker_beam_key',N'U') IS NOT NULL THEN 1 ELSE 0 END AS [worker_key_table_present],
   CASE WHEN OBJECT_ID(N'studio.worker_beam_nonce',N'U') IS NOT NULL THEN 1 ELSE 0 END AS [worker_nonce_table_present],
   CASE WHEN OBJECT_ID(N'studio.spWorkerBeamRpc',N'P') IS NOT NULL THEN 1 ELSE 0 END AS [worker_gateway_present]
 FOR XML PATH('worker_beam_preflight'),TYPE
) AS [OPEN_AND_SAVE_XML];