/* Proposed metadata schema for the separate Spark cluster. Review/apply separately.
   No existing tables/procedures are altered. No output data is stored in SQL Server.
   Apply 007 next; the existing BEAM dispatcher needs the reviewed 008 hook. */
USE [CoreAnalytics];
GO
IF SCHEMA_ID(N'studio') IS NULL EXEC(N'CREATE SCHEMA studio');
GO
IF OBJECT_ID(N'studio.pipeline',N'U') IS NULL
CREATE TABLE studio.pipeline (
 pipeline_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_pipeline PRIMARY KEY DEFAULT NEWID(),
 pipeline_name nvarchar(150) NOT NULL,
 created_by uniqueidentifier NOT NULL,
 created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 updated_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT FK_studio_pipeline_user FOREIGN KEY(created_by) REFERENCES dbo.core_user(user_id)
);
GO
IF OBJECT_ID(N'studio.pipeline_version',N'U') IS NULL
CREATE TABLE studio.pipeline_version (
 pipeline_id uniqueidentifier NOT NULL,
 version int NOT NULL CHECK(version>0),
 graph_version int NOT NULL DEFAULT 1 CHECK(graph_version=1),
 graph_json nvarchar(max) NOT NULL CHECK(ISJSON(graph_json)=1),
 created_by uniqueidentifier NOT NULL,
 created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_studio_pipeline_version PRIMARY KEY(pipeline_id,version),
 CONSTRAINT FK_studio_pipeline_version FOREIGN KEY(pipeline_id) REFERENCES studio.pipeline(pipeline_id)
);
GO
IF OBJECT_ID(N'studio.pipeline_run',N'U') IS NULL
BEGIN
 CREATE TABLE studio.pipeline_run (
  run_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_pipeline_run PRIMARY KEY DEFAULT NEWID(),
  pipeline_id uniqueidentifier NOT NULL,
  version int NOT NULL,
  requested_by uniqueidentifier NOT NULL,
  request_id uniqueidentifier NOT NULL,
  status varchar(12) NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED')),
  created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
  started_at datetime2(3) NULL,
  finished_at datetime2(3) NULL,
  heartbeat_at datetime2(3) NULL,
  cancel_requested bit NOT NULL DEFAULT 0,
  lease_owner uniqueidentifier NULL,
  lease_expires_at datetime2(3) NULL,
  spark_application_id varchar(150) NULL,
  error_code varchar(100) NULL,
  error_detail nvarchar(1000) NULL,
  CONSTRAINT FK_studio_pipeline_run_version FOREIGN KEY(pipeline_id,version) REFERENCES studio.pipeline_version(pipeline_id,version),
  CONSTRAINT UQ_studio_pipeline_run_request UNIQUE(requested_by,request_id)
 );
 CREATE INDEX IX_studio_pipeline_run_queue ON studio.pipeline_run(status,created_at) INCLUDE(lease_expires_at);
END;
GO
IF OBJECT_ID(N'studio.pipeline_output_version',N'U') IS NULL
CREATE TABLE studio.pipeline_output_version (
 output_version_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_pipeline_output_version PRIMARY KEY DEFAULT NEWID(),
 run_id uniqueidentifier NOT NULL REFERENCES studio.pipeline_run(run_id),
 output_node_id nvarchar(80) NOT NULL,
 output_name nvarchar(150) NOT NULL,
 storage_relative_path nvarchar(512) NOT NULL,
 row_count bigint NOT NULL CHECK(row_count>=0),
 schema_json nvarchar(max) NOT NULL CHECK(ISJSON(schema_json)=1),
 created_at datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_studio_pipeline_output_run_node UNIQUE(run_id,output_node_id)
);
GO
