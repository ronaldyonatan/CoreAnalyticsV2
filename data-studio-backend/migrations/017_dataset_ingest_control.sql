/* Stage 2C.2: safe metadata API only; no worker, no automatic ingestion.
   Apply after migration 016, to CoreAnalytics DEVELOPMENT database. */
USE [CoreAnalytics];
GO
CREATE OR ALTER PROCEDURE studio.spDatasetIngestControl
    @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,'INGEST_INVALID_PAYLOAD' code; RETURN; END;
 DECLARE @Action varchar(20)=JSON_VALUE(@Payload,'$.Action'),
         @UserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.UserID')),
         @DatasetID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.DatasetID')),
         @RequestID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.RequestID')),
         @RunID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.RunID'));
 IF @UserID IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@UserID AND is_active=1 AND is_locked=0)
 BEGIN SELECT CAST(0 AS bit) success,'INGEST_USER_UNAVAILABLE' code; RETURN; END;
 IF @Action='Submit'
 BEGIN
  IF @DatasetID IS NULL OR @RequestID IS NULL BEGIN SELECT CAST(0 AS bit) success,'INGEST_INVALID_REQUEST' code; RETURN; END;
  IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@DatasetID AND created_by=CONVERT(nvarchar(100),@UserID) AND access_mode='DIRECT')
  BEGIN SELECT CAST(0 AS bit) success,'INGEST_DATASET_NOT_FOUND' code; RETURN; END;
  BEGIN TRY
   BEGIN TRANSACTION;
   IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE requested_by=@UserID AND request_id=@RequestID)
   BEGIN
    IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE dataset_id=@DatasetID AND status IN ('QUEUED','RUNNING'))
    BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,'INGEST_ALREADY_PENDING' code; RETURN; END;
    INSERT studio.dataset_ingest_run(dataset_id,requested_by,request_id) VALUES(@DatasetID,@UserID,@RequestID);
   END;
   IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID AND dataset_id=@DatasetID)
   BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,'INGEST_REQUEST_REUSED' code; RETURN; END;
   SELECT CAST(1 AS bit) success,'INGEST_QUEUED' code,CONVERT(varchar(36),run_id) run_id,status
     FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID;
   COMMIT;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   SELECT CAST(0 AS bit) success,'INGEST_SUBMIT_FAILED' code;
  END CATCH;
  RETURN;
 END;
 IF @Action='Jobs'
 BEGIN
  SELECT CAST(1 AS bit) success,'INGEST_JOBS' code,
   (SELECT CONVERT(varchar(36),r.run_id) run_id,CONVERT(varchar(36),r.dataset_id) dataset_id,
    r.status,r.created_at,r.started_at,r.finished_at,r.error_code
    FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id
    WHERE r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID)
    ORDER BY r.created_at DESC FOR JSON PATH) items_json;
  RETURN;
 END;
 IF @Action='Job'
 BEGIN
  SELECT TOP 1 CAST(1 AS bit) success,'INGEST_JOB' code,CONVERT(varchar(36),r.run_id) run_id,
   CONVERT(varchar(36),r.dataset_id) dataset_id,r.status,r.created_at,r.started_at,r.finished_at,r.error_code
  FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id
  WHERE r.run_id=@RunID AND r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID);
  IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,'INGEST_JOB_NOT_FOUND' code;
  RETURN;
 END;
 SELECT CAST(0 AS bit) success,'INGEST_ACTION_INVALID' code;
END;
GO
/* This isolated procedure is called by the existing authenticated Core API
   using a new CoreStudioIngest mode. It does not alter pipeline routing. */
