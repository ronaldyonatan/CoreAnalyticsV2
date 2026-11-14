/* Read-only DEV diagnostic. Run on the SQL Server hosting CoreAnalytics.
   No job, schedule, data, configuration, or permission is changed.
   Agent job-step text and connection credentials are not returned.
   A job that uses a wrapper or executes elsewhere may not be detected. */
USE [CoreAnalytics];
SET NOCOUNT ON;

DECLARE @agent_available bit = 0;
DECLARE @agent_error int = NULL;
DECLARE @jobs TABLE(job_name sysname, enabled bit, step_count int);
BEGIN TRY
  INSERT @jobs(job_name, enabled, step_count)
  SELECT j.name, j.enabled, COUNT(*)
  FROM msdb.dbo.sysjobs j
  JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id
  WHERE s.command LIKE N'%spSchedulerDispatch%'
     OR s.command LIKE N'%spDatasetIngestWorker%'
     OR s.command LIKE N'%studio_scheduler_worker%'
     OR s.command LIKE N'%studio_ingest_worker%'
  GROUP BY j.name,j.enabled;
  SET @agent_available=1;
END TRY
BEGIN CATCH
  SET @agent_error=ERROR_NUMBER();
END CATCH;

SELECT (
 SELECT DB_NAME() AS [database_name], SYSUTCDATETIME() AS [checked_at_utc],
   (SELECT COUNT_BIG(*) FROM studio.dataset_ingest_run WHERE status IN ('QUEUED','RUNNING')) AS [ingest_active_count],
   (SELECT MAX(finished_at) FROM studio.dataset_ingest_run WHERE status='SUCCEEDED') AS [last_ingest_success_utc],
   (SELECT COUNT_BIG(*) FROM studio.scheduler_schedule WHERE enabled=1) AS [enabled_schedule_count],
   (SELECT MAX(created_at) FROM studio.scheduler_event) AS [last_schedule_event_utc],
   @agent_available AS [agent_job_scan_available], @agent_error AS [agent_job_scan_error],
   (SELECT job_name, enabled, step_count FROM @jobs ORDER BY job_name FOR XML PATH('job'),TYPE) AS [matching_agent_jobs]
 FOR XML PATH('worker_scheduler_diagnostic'), TYPE
) AS [OPEN_AND_SAVE_XML];
