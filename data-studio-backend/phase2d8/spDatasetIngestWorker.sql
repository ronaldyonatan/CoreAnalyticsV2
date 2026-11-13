ALTER PROCEDURE studio.spDatasetIngestWorker
    @Action varchar(16),
    @WorkerID uniqueidentifier,
    @RunID uniqueidentifier = NULL,
    @RowCount bigint = NULL,
    @SchemaJson nvarchar(max) = NULL,
    @StorageRelativePath nvarchar(512) = NULL,
    @ErrorCode varchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @now datetime2(3)=SYSUTCDATETIME();
    IF @WorkerID IS NULL THROW 51800,'INGEST_WORKER_INVALID',1;

    IF @Action='Claim'
    BEGIN
        DECLARE @claimed TABLE(run_id uniqueidentifier,dataset_id uniqueidentifier,requested_by uniqueidentifier);
        BEGIN TRANSACTION;
        UPDATE studio.dataset_ingest_run SET status='FAILED',error_code='INGEST_BIND_FAILED',finished_at=@now
        WHERE status='QUEUED' AND studio.fnStudioAccessLevel(requested_by,'DATASET',dataset_id)<20;
        ;WITH next_job AS (
            SELECT TOP(1) r.* FROM studio.dataset_ingest_run r WITH (UPDLOCK,READPAST,ROWLOCK)
            JOIN studio.dataset d ON d.dataset_id=r.dataset_id
            JOIN dbo.core_user u ON u.user_id=r.requested_by
            WHERE r.status='QUEUED' AND d.access_mode='STORED' AND
                  studio.fnStudioAccessLevel(r.requested_by,'DATASET',d.dataset_id)>=20 AND
                  u.is_active=1 AND u.is_locked=0
            ORDER BY r.created_at,r.run_id
        )
        UPDATE next_job SET status='RUNNING',started_at=@now,heartbeat_at=@now,
            lease_owner=@WorkerID,lease_expires_at=DATEADD(second,120,@now)
        OUTPUT inserted.run_id,inserted.dataset_id,inserted.requested_by INTO @claimed;
        COMMIT TRANSACTION;
        SELECT CONVERT(varchar(36),run_id) AS run_id,
               CONVERT(varchar(36),dataset_id) AS dataset_id,
               CONVERT(varchar(36),requested_by) AS requested_by FROM @claimed;
        RETURN;
    END;

    IF @RunID IS NULL THROW 51801,'INGEST_RUN_REQUIRED',1;
    IF @Action='Heartbeat'
    BEGIN
        UPDATE studio.dataset_ingest_run SET heartbeat_at=@now,lease_expires_at=DATEADD(second,120,@now)
        WHERE run_id=@RunID AND status='RUNNING' AND lease_owner=@WorkerID
          AND lease_expires_at>@now;
        SELECT @@ROWCOUNT AS affected;
        RETURN;
    END;
    IF @Action='Fail'
    BEGIN
        IF @ErrorCode IS NULL OR @ErrorCode NOT IN (
            'INGEST_BIND_FAILED','INGEST_DRIVER_FAILED','INGEST_TIMEOUT',
            'INGEST_MANIFEST_INVALID','INGEST_PUBLISH_FAILED','INGEST_WORKER_STOPPED')
            SET @ErrorCode='INGEST_DRIVER_FAILED';
        UPDATE studio.dataset_ingest_run SET status='FAILED',error_code=@ErrorCode,
            finished_at=@now,lease_expires_at=NULL
        WHERE run_id=@RunID AND status='RUNNING' AND lease_owner=@WorkerID
          AND lease_expires_at>@now;
        SELECT @@ROWCOUNT AS affected;
        RETURN;
    END;
    IF @Action='Complete'
    BEGIN
        IF @RowCount IS NULL OR @RowCount<0 OR @SchemaJson IS NULL OR ISJSON(@SchemaJson)<>1
            THROW 51802,'INGEST_OUTPUT_INVALID',1;
        IF @StorageRelativePath IS NULL OR
           @StorageRelativePath<>CONVERT(varchar(36),@RunID)+'/output-0'
            THROW 51803,'INGEST_STORAGE_PATH_INVALID',1;
        DECLARE @affected int=0;
        BEGIN TRANSACTION;
        IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK)
            WHERE run_id=@RunID AND status='RUNNING' AND lease_owner=@WorkerID
              AND lease_expires_at>@now AND studio.fnStudioAccessLevel(requested_by,'DATASET',dataset_id)>=20)
        BEGIN
            DECLARE @dataset uniqueidentifier=(SELECT dataset_id FROM studio.dataset_ingest_run WHERE run_id=@RunID);
            DECLARE @version uniqueidentifier=NEWID();
            INSERT studio.dataset_ingest_output(output_version_id,dataset_id,run_id,storage_relative_path,row_count,schema_json)
            VALUES(@version,@dataset,@RunID,@StorageRelativePath,@RowCount,@SchemaJson);
            UPDATE studio.dataset SET active_ingest_output_version_id=@version
                WHERE dataset_id=@dataset AND access_mode='STORED';
            IF @@ROWCOUNT<>1 THROW 51804,'INGEST_DATASET_INVALID',1;
            UPDATE studio.dataset_ingest_run SET status='SUCCEEDED',finished_at=@now,
                heartbeat_at=@now,lease_expires_at=NULL WHERE run_id=@RunID;
            SET @affected=1;
        END;
        COMMIT TRANSACTION;
        SELECT @affected AS affected;
        RETURN;
    END;
    THROW 51805,'INGEST_WORKER_ACTION_INVALID',1;
END;
