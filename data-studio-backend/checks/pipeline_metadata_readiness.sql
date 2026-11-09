/* READ ONLY. Run in SSMS on the chosen development/staging SQL Server.
   Does not CREATE, ALTER, INSERT, UPDATE, DELETE, or execute pipeline jobs. */
USE [CoreAnalytics];
GO
SELECT DB_NAME() AS selected_database,
       compatibility_level,
       CASE WHEN compatibility_level>=130 THEN 'READY' ELSE 'NEEDS_DBA_REVIEW' END AS json_compatibility
FROM sys.databases WHERE database_id=DB_ID();

SELECT N'dbo.core_user' AS object_name,
 CASE WHEN OBJECT_ID(N'dbo.core_user',N'U') IS NOT NULL
       AND COL_LENGTH(N'dbo.core_user',N'user_id') IS NOT NULL
       AND COL_LENGTH(N'dbo.core_user',N'is_active') IS NOT NULL
       AND COL_LENGTH(N'dbo.core_user',N'is_locked') IS NOT NULL
 THEN 'READY' ELSE 'MISSING_OR_NOT_VISIBLE' END AS readiness;

SELECT name AS user_column, TYPE_NAME(system_type_id) AS actual_type,
 CASE WHEN name=N'user_id' AND TYPE_NAME(system_type_id)=N'uniqueidentifier' THEN 'READY'
      WHEN name=N'user_id' THEN 'TYPE_MISMATCH_REVIEW_REQUIRED'
      ELSE 'REVIEW_STATUS_COLUMN' END AS readiness
FROM sys.columns WHERE object_id=OBJECT_ID(N'dbo.core_user') AND name IN (N'user_id',N'is_active',N'is_locked');

SELECT requested.object_name,
 CASE WHEN OBJECT_ID(requested.object_name,N'U') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING_OR_NOT_VISIBLE' END AS readiness
FROM (VALUES (N'studio.pipeline'),(N'studio.pipeline_version'),
             (N'studio.pipeline_run'),(N'studio.pipeline_output_version')) requested(object_name);

SELECT N'studio.pipeline_run.cancel_requested' AS column_name,
 CASE WHEN COL_LENGTH(N'studio.pipeline_run',N'cancel_requested') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING_OR_NOT_VISIBLE' END AS readiness;

SELECT N'studio.spPipelineControl' AS procedure_name,
 CASE WHEN OBJECT_ID(N'studio.spPipelineControl',N'P') IS NOT NULL THEN 'EXISTS' ELSE 'MISSING_OR_NOT_VISIBLE' END AS readiness,
 HAS_PERMS_BY_NAME(N'studio.spPipelineControl',N'OBJECT',N'EXECUTE') AS current_identity_can_execute;
GO
