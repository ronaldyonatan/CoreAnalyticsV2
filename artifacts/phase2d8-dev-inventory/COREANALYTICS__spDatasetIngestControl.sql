CREATE PROCEDURE studio.spDatasetIngestControl     @Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,'INGEST_INVALID_PAYLOAD' code; RETURN; END;  DECLARE @Action varchar(20)=JSON_VALUE(@Payload,'$.Action'),          @UserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.UserID')),          @DatasetID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.DatasetID')),          @RequestID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.RequestID')),          @RunID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.RunID'));  IF @UserID IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@UserID AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,'INGEST_USER_UNAVAILABLE' code; RETURN; END;  IF @Action='Submit'  BEGIN   IF @DatasetID IS NULL OR @RequestID IS NULL BEGIN SELECT CAST(0 AS bit) success,'INGEST_INVALID_REQUEST' code; RETURN; END;   IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@DatasetID AND created_by=CONVERT(nvarchar(100),@UserID) AND access_mode='STORED')   BEGIN SELECT CAST(0 AS bit) success,'INGEST_DATASET_NOT_FOUND' code; RETURN; END;   BEGIN TRY    BEGIN TRANSACTION;    IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE requested_by=@UserID AND request_id=@RequestID)    BEGIN     IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE dataset_id=@DatasetID AND status IN ('QUEUED','RUNNING'))     BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,'INGEST_ALREADY_PENDING' code; RETURN; END;     INSERT studio.dataset_ingest_run(dataset_id,requested_by,request_id) VALUES(@DatasetID,@UserID,@RequestID);    END;    IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID AND dataset_id=@DatasetID)    BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,'INGEST_REQUEST_REUSED' code; RETURN; END;    SELECT CAST(1 AS bit) success,'INGEST_QUEUED' code,CONVERT(varchar(36),run_id) run_id,status      FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID;    COMMIT;   END TRY   BEGIN CATCH    IF @@TRANCOUNT>0 ROLLBACK;    SELECT CAST(0 AS bit) success,'INGEST_SUBMIT_FAILED' code;   END CATCH;   RETURN;  END;  IF @Action='Jobs'  BEGIN   SELECT CAST(1 AS bit) success,'INGEST_JOBS' code,    (SELECT CONVERT(varchar(36),r.run_id) run_id,CONVERT(varchar(36),r.dataset_id) dataset_id,     r.status,r.created_at,r.started_at,r.finished_at,r.error_code,       (SELECT TOP (1) o.row_count        FROM studio.dataset_ingest_output AS o        WHERE o.run_id=r.run_id AND o.dataset_id=r.dataset_id) AS row_count /* DATASET_ROWCOUNT_020 */     FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id     WHERE r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID) AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind='STORED' AND z.run_id=r.run_id)     ORDER BY r.created_at DESC FOR JSON PATH) items_json;   RETURN;  END;  IF @Action='Job'  BEGIN   SELECT TOP 1 CAST(1 AS bit) success,'INGEST_JOB' code,CONVERT(varchar(36),r.run_id) run_id,    CONVERT(varchar(36),r.dataset_id) dataset_id,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,       (SELECT TOP (1) o.row_count        FROM studio.dataset_ingest_output AS o        WHERE o.run_id=r.run_id AND o.dataset_id=r.dataset_id) AS row_count /* DATASET_ROWCOUNT_020 */   FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id   WHERE r.run_id=@RunID AND r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID) AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind='STORED' AND z.run_id=r.run_id);   IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,'INGEST_JOB_NOT_FOUND' code;   RETURN;  END; 
 IF @Action IN ('CheckDelete','BeginDelete','FinishDelete','AbortDelete')
 BEGIN
  DECLARE @DeleteOutput uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.OutputVersionID'));
  DECLARE @DeletePath nvarchar(512),@DeleteRun uniqueidentifier,@DeleteStatus varchar(12),@DeleteState varchar(12);
  IF @DatasetID IS NULL OR @RunID IS NULL
  BEGIN SELECT CAST(0 AS bit) success,'INGEST_DELETE_INVALID' code; RETURN; END;
  BEGIN TRY
   BEGIN TRANSACTION;
   SELECT @DeletePath=o.storage_relative_path,@DeleteRun=o.run_id,@DeleteStatus=r.status,@DeleteOutput=o.output_version_id
   FROM studio.dataset_ingest_output o WITH(UPDLOCK,HOLDLOCK)
   JOIN studio.dataset_ingest_run r WITH(UPDLOCK,HOLDLOCK) ON r.run_id=o.run_id
   JOIN studio.dataset d ON d.dataset_id=o.dataset_id
   WHERE (@DeleteOutput IS NULL OR o.output_version_id=@DeleteOutput) AND o.dataset_id=@DatasetID AND o.run_id=@RunID
     AND r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID) AND d.access_mode='STORED';
   IF @DeletePath IS NULL OR @DeleteStatus<>'SUCCEEDED' THROW 51000,'INGEST_DELETE_NOT_FOUND',1;
   IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE dataset_id=@DatasetID AND status IN ('QUEUED','RUNNING'))
      THROW 51000,'INGEST_DELETE_JOB_ACTIVE',1;
   IF EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status IN ('QUEUED','RUNNING'))
      THROW 51000,'INGEST_DELETE_JOB_ACTIVE',1;
   SELECT @DeleteState=state FROM studio.parquet_delete_state WITH(UPDLOCK,HOLDLOCK)
    WHERE kind='STORED' AND target_id=@DeleteOutput;
   IF @Action='CheckDelete'
   BEGIN
    IF @DeleteState IS NOT NULL THROW 51000,'INGEST_DELETE_UNAVAILABLE',1;
    COMMIT;
    SELECT CAST(1 AS bit) success,'INGEST_DELETE_ALLOWED' code,
     LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@DeleteOutput)) output_version_id,@DeletePath storage_relative_path;
    RETURN;
   END;
   IF @Action='BeginDelete'
   BEGIN
    IF @DeleteState IS NOT NULL THROW 51000,'INGEST_DELETE_UNAVAILABLE',1;
    INSERT studio.parquet_delete_state(kind,target_id,run_id,owner_id,storage_relative_path)
    VALUES('STORED',@DeleteOutput,@DeleteRun,@UserID,@DeletePath);
    UPDATE studio.dataset SET active_ingest_output_version_id=NULL
      WHERE dataset_id=@DatasetID AND active_ingest_output_version_id=@DeleteOutput;
   END
   ELSE IF @Action='FinishDelete'
   BEGIN
    IF @DeleteState<>'PENDING' THROW 51000,'INGEST_DELETE_UNAVAILABLE',1;
    UPDATE studio.parquet_delete_state SET state='DELETED',finished_at=SYSUTCDATETIME()
     WHERE kind='STORED' AND target_id=@DeleteOutput AND owner_id=@UserID;
   END
   ELSE IF @Action='AbortDelete'
   BEGIN
    IF @DeleteState<>'PENDING' THROW 51000,'INGEST_DELETE_UNAVAILABLE',1;
    DELETE studio.parquet_delete_state WHERE kind='STORED' AND target_id=@DeleteOutput AND owner_id=@UserID;
   END;
   COMMIT;
   SELECT CAST(1 AS bit) success,'INGEST_DELETE_OK' code,
    LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@DeleteOutput)) output_version_id,@DeletePath storage_relative_path;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   SELECT CAST(0 AS bit) success,
    CASE WHEN ERROR_NUMBER()=51000 THEN ERROR_MESSAGE() ELSE 'INGEST_DELETE_METADATA_UNAVAILABLE' END code;
  END CATCH;
  RETURN;
 END;
 SELECT CAST(0 AS bit) success,'INGEST_ACTION_INVALID' code; END;
