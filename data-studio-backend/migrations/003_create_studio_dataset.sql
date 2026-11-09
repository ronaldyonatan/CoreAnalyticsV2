/* Dataset metadata only. Review and apply separately in CoreAnalytics SQL Server. */
USE [CoreAnalytics];
GO
IF OBJECT_ID(N'studio.dataset', N'U') IS NULL
BEGIN
  CREATE TABLE studio.dataset (
    dataset_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_dataset PRIMARY KEY DEFAULT NEWID(),
    dataset_name nvarchar(150) NOT NULL,
    description nvarchar(1000) NULL,
    connection_id uniqueidentifier NOT NULL REFERENCES studio.connection(connection_id),
    source_schema sysname NOT NULL,
    source_name sysname NOT NULL,
    source_type varchar(20) NOT NULL CHECK (source_type IN ('BASE TABLE','VIEW')),
    access_mode varchar(10) NOT NULL CHECK (access_mode IN ('DIRECT','STORED')),
    storage_status varchar(20) NOT NULL CHECK (storage_status IN ('LIVE','PENDING','READY','FAILED')),
    created_by nvarchar(100) NOT NULL,
    created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_studio_dataset_name UNIQUE(dataset_name)
  );
END;
GO
