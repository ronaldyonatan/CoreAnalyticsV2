/* CoreAnalyticsV2 Stage 2C: metadata foundation ONLY.
   SQL Server 2016 compatible. No changes to dbo.spDashboard or ETL pipeline tables.
   Review in development before execution. No job processor is enabled by this migration. */
USE [CoreAnalytics];
GO
IF OBJECT_ID(N'studio.dataset_ingest_run',N'U') IS NULL
BEGIN
    CREATE TABLE studio.dataset_ingest_run (
        run_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_dataset_ingest_run PRIMARY KEY DEFAULT NEWID(),
        dataset_id uniqueidentifier NOT NULL,
        requested_by uniqueidentifier NOT NULL,
        request_id uniqueidentifier NOT NULL,
        status varchar(12) NOT NULL CONSTRAINT DF_studio_dataset_ingest_run_status DEFAULT 'QUEUED',
        created_at datetime2(3) NOT NULL CONSTRAINT DF_studio_dataset_ingest_run_created DEFAULT SYSUTCDATETIME(),
        started_at datetime2(3) NULL,
        finished_at datetime2(3) NULL,
        heartbeat_at datetime2(3) NULL,
        lease_owner uniqueidentifier NULL,
        lease_expires_at datetime2(3) NULL,
        error_code varchar(100) NULL,
        CONSTRAINT FK_studio_dataset_ingest_run_dataset FOREIGN KEY(dataset_id) REFERENCES studio.dataset(dataset_id),
        CONSTRAINT FK_studio_dataset_ingest_run_user FOREIGN KEY(requested_by) REFERENCES dbo.core_user(user_id),
        CONSTRAINT CK_studio_dataset_ingest_run_status CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
        CONSTRAINT UQ_studio_dataset_ingest_run_request UNIQUE(requested_by,request_id)
    );
    CREATE INDEX IX_studio_dataset_ingest_run_queue ON studio.dataset_ingest_run(status,created_at) INCLUDE(lease_expires_at);
    CREATE INDEX IX_studio_dataset_ingest_run_dataset ON studio.dataset_ingest_run(dataset_id,created_at);
END;
GO
IF OBJECT_ID(N'studio.dataset_ingest_output',N'U') IS NULL
BEGIN
    CREATE TABLE studio.dataset_ingest_output (
        output_version_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_dataset_ingest_output PRIMARY KEY DEFAULT NEWID(),
        dataset_id uniqueidentifier NOT NULL,
        run_id uniqueidentifier NOT NULL,
        storage_relative_path nvarchar(512) NOT NULL,
        row_count bigint NOT NULL,
        schema_json nvarchar(max) NOT NULL,
        created_at datetime2(3) NOT NULL CONSTRAINT DF_studio_dataset_ingest_output_created DEFAULT SYSUTCDATETIME(),
        CONSTRAINT FK_studio_dataset_ingest_output_dataset FOREIGN KEY(dataset_id) REFERENCES studio.dataset(dataset_id),
        CONSTRAINT FK_studio_dataset_ingest_output_run FOREIGN KEY(run_id) REFERENCES studio.dataset_ingest_run(run_id),
        CONSTRAINT CK_studio_dataset_ingest_output_rows CHECK(row_count>=0),
        CONSTRAINT CK_studio_dataset_ingest_output_schema CHECK(ISJSON(schema_json)=1),
        CONSTRAINT UQ_studio_dataset_ingest_output_run UNIQUE(run_id)
    );
    CREATE INDEX IX_studio_dataset_ingest_output_dataset ON studio.dataset_ingest_output(dataset_id,created_at DESC);
END;
GO
IF COL_LENGTH('studio.dataset','active_ingest_output_version_id') IS NULL
BEGIN
    ALTER TABLE studio.dataset ADD active_ingest_output_version_id uniqueidentifier NULL;
END;
GO
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_studio_dataset_active_ingest_output')
BEGIN
    ALTER TABLE studio.dataset WITH CHECK ADD CONSTRAINT FK_studio_dataset_active_ingest_output
        FOREIGN KEY(active_ingest_output_version_id) REFERENCES studio.dataset_ingest_output(output_version_id);
END;
GO
/* IMPORTANT: The active pointer must be changed only by an atomic, owner-validated
   publish operation after successful Parquet manifest verification. No publish
   procedure is created here; implementation is the next patch step. */
