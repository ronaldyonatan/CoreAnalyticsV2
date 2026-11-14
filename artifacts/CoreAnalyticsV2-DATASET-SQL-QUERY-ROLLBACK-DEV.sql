/* DEV rollback for CoreAnalyticsV2-DATASET-SQL-QUERY-INSTALL-DEV.sql.
   Run manually in an exclusive deployment window with no open transaction.
   Refuses to drop query metadata if any saved query definitions exist.
   Keeps the backup table for audit; future reinstall requires manual review.
   Any unrecognized gateway drift aborts and rolls back the entire batch. */
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53240,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NULL
    OR OBJECT_ID(N'studio.dataset_query_source',N'U') IS NULL
    OR OBJECT_ID(N'studio.spDatasetQueryRpc',N'P') IS NULL
    THROW 53241,'QUERY_ROLLBACK_PREREQUISITES_REQUIRED',1;
 IF EXISTS(SELECT 1 FROM studio.dataset_query_source WITH(UPDLOCK,HOLDLOCK))
    THROW 53242,'QUERY_ROLLBACK_BLOCKED_SAVED_DEFINITIONS_EXIST',1;
 DECLARE @old nvarchar(max),@expected nvarchar(max),@actual nvarchar(max),@restore nvarchar(max),
         @statement nvarchar(max),@declaration int,@a int,@b int;
 SELECT @old=previous_definition,@expected=installed_definition
 FROM studio.dataset_query_gateway_backup WITH(UPDLOCK,HOLDLOCK)
 WHERE object_name=N'BI.dbo.spDashboard';
 SELECT @actual=m.definition FROM BI.sys.sql_modules m
 JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @old IS NULL OR @expected IS NULL OR @actual IS NULL
    OR DATALENGTH(@expected)<>DATALENGTH(@actual)
    OR @expected COLLATE Latin1_General_100_BIN2<>@actual COLLATE Latin1_General_100_BIN2
    THROW 53243,'GATEWAY_CHANGED_AFTER_QUERY_INSTALL',1;
 SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old);
 IF @declaration=0 OR CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old,@declaration+1)>0
    THROW 53244,'BACKUP_DEFINITION_UNRECOGNIZED',1;
 SET @restore=STUFF(@old,@declaration,6,N'ALTER');
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@restore;
 SELECT @actual=m.definition FROM BI.sys.sql_modules m
 JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 SET @a=CHARINDEX(N'@Mode',@old); SET @b=CHARINDEX(N'@Mode',@actual);
 IF @actual IS NULL OR @a=0 OR @b=0
    OR DATALENGTH(SUBSTRING(@old,@a,LEN(@old)))<>DATALENGTH(SUBSTRING(@actual,@b,LEN(@actual)))
    OR SUBSTRING(@old,@a,LEN(@old)) COLLATE Latin1_General_100_BIN2<>SUBSTRING(@actual,@b,LEN(@actual)) COLLATE Latin1_General_100_BIN2
    THROW 53245,'GATEWAY_ROLLBACK_VERIFICATION_FAILED',1;
 DROP PROCEDURE studio.spDatasetQueryRpc;
 DROP TABLE studio.dataset_query_source;
 COMMIT;
 SELECT (SELECT N'DATASET_QUERY_METADATA_ROLLED_BACK_BACKUP_RETAINED' AS [status],SYSUTCDATETIME() AS [verified_at_utc]
  FOR XML PATH('dataset_query_rollback'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
