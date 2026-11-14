/* DRAFT FOR REVIEW ONLY: not an installer. Do not execute independently.
   Requires separately provisioned studio.worker_beam_key / worker_beam_nonce,
   dbo.fnObjectAccessHmac256's studio equivalent, and reviewed BI routing.
   No worker credential or permission is provisioned here. */
CREATE PROCEDURE studio.spWorkerBeamRpc @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF @@TRANCOUNT<>0 OR @Payload IS NULL OR DATALENGTH(@Payload)>2097152 OR ISJSON(@Payload)<>1
 BEGIN SELECT CAST(0 AS bit) success,'WORKER_INVALID_ENVELOPE' code; RETURN; END;
 DECLARE @request nvarchar(max),@issuedText nvarchar(max),@nonceText nvarchar(max),@signature nvarchar(max),
         @issued datetime2(0),@nonce uniqueidentifier,@key varbinary(32),@expected varchar(64);
 SELECT @request=req,@issuedText=issued,@nonceText=nonce,@signature=sig
 FROM OPENJSON(@Payload) WITH(req nvarchar(max) '$.Request',issued nvarchar(max) '$.IssuedAtUtc',
                              nonce nvarchar(max) '$.Nonce',sig nvarchar(max) '$.Signature');
 SET @issued=TRY_CONVERT(datetime2(0),@issuedText,126);
 SET @nonce=TRY_CONVERT(uniqueidentifier,@nonceText);
 IF @request IS NULL OR ISJSON(@request)<>1 OR @issued IS NULL OR @nonce IS NULL
    OR DATALENGTH(@issuedText)<>38 OR @issuedText COLLATE Latin1_General_100_BIN2<>CONVERT(varchar(19),@issued,126) COLLATE Latin1_General_100_BIN2
    OR DATALENGTH(@nonceText)<>72 OR @nonceText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(varchar(36),@nonce)) COLLATE Latin1_General_100_BIN2
    OR @signature IS NULL OR DATALENGTH(@signature)<>128
    OR ABS(DATEDIFF_BIG(second,@issued,SYSUTCDATETIME()))>120
 BEGIN SELECT CAST(0 AS bit) success,'WORKER_INVALID_ENVELOPE' code; RETURN; END;
 SELECT @key=key_bytes FROM studio.worker_beam_key WHERE key_id=1 AND enabled=1;
 IF @key IS NULL OR DATALENGTH(@key)<>32
 BEGIN SELECT CAST(0 AS bit) success,'WORKER_GATEWAY_DISABLED' code; RETURN; END;
 SET @expected=studio.fnObjectAccessHmac256(@key,@issuedText+N'|'+@nonceText+N'|'+@request);
 IF @expected IS NULL OR UPPER(@signature) COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN SELECT CAST(0 AS bit) success,'WORKER_SIGNATURE_INVALID' code; RETURN; END;
 BEGIN TRY
  INSERT studio.worker_beam_nonce(nonce_id) VALUES(@nonce);
 END TRY
 BEGIN CATCH
  SELECT CAST(0 AS bit) success,'WORKER_NONCE_REPLAY_OR_DB_ERROR' code; RETURN;
 END CATCH;
 DECLARE @operation varchar(20)=JSON_VALUE(@request,'$.Operation'),
         @action varchar(16)=JSON_VALUE(@request,'$.Action'),
         @worker uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@request,'$.WorkerID')),
         @run uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@request,'$.RunID')),
         @rows bigint=TRY_CONVERT(bigint,JSON_VALUE(@request,'$.RowCount')),
         @schema nvarchar(max),@path nvarchar(512),@error varchar(100);
 SELECT @schema=schemaJson,@path=storagePath,@error=errorCode FROM OPENJSON(@request)
 WITH(schemaJson nvarchar(max) '$.SchemaJson',storagePath nvarchar(512) '$.StorageRelativePath',errorCode varchar(100) '$.ErrorCode');
 BEGIN TRY
  IF @operation='HEALTH' AND @action='Check'
  BEGIN
   SELECT CAST(1 AS bit) success,'WORKER_BEAM_READY' code;
   RETURN;
  END;
  IF @operation='INGEST' AND @action IN ('Claim','ClaimSpecific','Heartbeat','Complete','Fail') AND @worker IS NOT NULL
  BEGIN
   IF @action='ClaimSpecific'
   BEGIN
    IF @run IS NULL THROW 53200,'WORKER_INVALID_INPUT',1;
    DECLARE @targeted TABLE(run_id uniqueidentifier,dataset_id uniqueidentifier,requested_by uniqueidentifier);
    DECLARE @now datetime2(3)=SYSUTCDATETIME();
    BEGIN TRAN;
    ;WITH target_job AS (
     SELECT r.* FROM studio.dataset_ingest_run r WITH(UPDLOCK,READPAST,ROWLOCK)
      JOIN studio.dataset d ON d.dataset_id=r.dataset_id
      JOIN dbo.core_user u ON u.user_id=r.requested_by
      WHERE r.run_id=@run AND r.status='QUEUED' AND d.access_mode='STORED'
       AND u.is_active=1 AND u.is_locked=0
       AND studio.fnStudioAccessLevel(r.requested_by,'DATASET',r.dataset_id)>=20
    )
    UPDATE target_job SET status='RUNNING',started_at=@now,heartbeat_at=@now,
     lease_owner=@worker,lease_expires_at=DATEADD(second,120,@now)
    OUTPUT inserted.run_id,inserted.dataset_id,inserted.requested_by INTO @targeted;
    COMMIT;
    IF NOT EXISTS(SELECT 1 FROM @targeted)
     SELECT CAST(1 AS bit) success,CAST(0 AS bit) has_job;
    ELSE
     SELECT CAST(1 AS bit) success,CAST(1 AS bit) has_job,
      CONVERT(varchar(36),run_id) run_id,CONVERT(varchar(36),dataset_id) dataset_id,
      CONVERT(varchar(36),requested_by) requested_by FROM @targeted;
    RETURN;
   END;
   IF @action='Claim'
   BEGIN
    DECLARE @claim TABLE(run_id varchar(36),dataset_id varchar(36),requested_by varchar(36));
    INSERT @claim EXEC studio.spDatasetIngestWorker @Action=@action,@WorkerID=@worker;
    IF NOT EXISTS(SELECT 1 FROM @claim)
     SELECT CAST(1 AS bit) success,CAST(0 AS bit) has_job;
    ELSE
     SELECT CAST(1 AS bit) success,CAST(1 AS bit) has_job,run_id,dataset_id,requested_by FROM @claim;
    RETURN;
   END;
   IF @run IS NULL THROW 53200,'WORKER_INVALID_INPUT',1;
   DECLARE @affected TABLE(affected int);
   INSERT @affected EXEC studio.spDatasetIngestWorker @Action=@action,@WorkerID=@worker,@RunID=@run,
     @RowCount=@rows,@SchemaJson=@schema,@StorageRelativePath=@path,@ErrorCode=@error;
   SELECT CAST(1 AS bit) success,affected FROM @affected;
   RETURN;
  END;
  IF @operation='SCHEDULER' AND @action='Tick'
  BEGIN
   /* Preserve the dispatch procedure's existing variable result shape. */
   EXEC studio.spSchedulerDispatch @Action='Tick';
   RETURN;
  END;
  THROW 53200,'WORKER_INVALID_INPUT',1;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  SELECT CAST(0 AS bit) success,'WORKER_OPERATION_FAILED' code;
 END CATCH;
END;
