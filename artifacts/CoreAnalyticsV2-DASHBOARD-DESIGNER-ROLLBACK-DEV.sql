/* DEV only. Refuses to drop saved dashboards or overwrite gateway drift.
   Run before rolling back the query-dataset gateway. Backup retained for audit. */
USE [CoreAnalytics];
SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53330,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID(N'studio.designer_gateway_backup',N'U') IS NULL OR OBJECT_ID(N'studio.designer_dashboard',N'U') IS NULL
    OR OBJECT_ID(N'studio.spDesignerDashboardRpc',N'P') IS NULL THROW 53331,'DESIGNER_ROLLBACK_PREREQUISITES_REQUIRED',1;
 IF EXISTS(SELECT 1 FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK)) THROW 53332,'ROLLBACK_BLOCKED_SAVED_DASHBOARDS_EXIST',1;
 DECLARE @old nvarchar(max),@expected nvarchar(max),@actual nvarchar(max),@restore nvarchar(max),@statement nvarchar(max),@declaration int,@a int,@b int;
 SELECT @old=previous_definition,@expected=installed_definition FROM studio.designer_gateway_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=N'BI.dbo.spDashboard';
 SELECT @actual=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @old IS NULL OR @expected IS NULL OR @actual IS NULL OR DATALENGTH(@expected)<>DATALENGTH(@actual) OR @expected COLLATE Latin1_General_100_BIN2<>@actual COLLATE Latin1_General_100_BIN2 THROW 53333,'GATEWAY_CHANGED_AFTER_DESIGNER_INSTALL',1;
 IF NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@actual) AND installed_definition COLLATE Latin1_General_100_BIN2=@actual COLLATE Latin1_General_100_BIN2)
 OR NOT EXISTS(SELECT 1 FROM studio.dataset_query_gateway_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=N'BI.dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@old) AND installed_definition COLLATE Latin1_General_100_BIN2=@old COLLATE Latin1_General_100_BIN2) THROW 53334,'ROLLBACK_BACKUP_MISMATCH',1;
 SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old);
 IF @declaration=0 SET @declaration=CHARINDEX(N'ALTER PROCEDURE [dbo].[spDashboard]',@old);
 IF @declaration=0 THROW 53335,'BACKUP_DEFINITION_UNRECOGNIZED',1;
 SET @restore=@old;
 IF SUBSTRING(@restore,@declaration,6)=N'CREATE' SET @restore=STUFF(@restore,@declaration,6,N'ALTER');
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@restore;
 SELECT @actual=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 SET @a=CHARINDEX(N'@Mode',@old); SET @b=CHARINDEX(N'@Mode',@actual);
 IF @actual IS NULL OR @a=0 OR @b=0 OR DATALENGTH(SUBSTRING(@old,@a,LEN(@old)))<>DATALENGTH(SUBSTRING(@actual,@b,LEN(@actual))) OR SUBSTRING(@old,@a,LEN(@old)) COLLATE Latin1_General_100_BIN2<>SUBSTRING(@actual,@b,LEN(@actual)) COLLATE Latin1_General_100_BIN2 THROW 53336,'ROLLBACK_VERIFY_FAILED',1;
 UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@actual WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 DROP PROCEDURE studio.spDesignerDashboardRpc;
 DROP TABLE studio.designer_dashboard;
 COMMIT;
 SELECT (SELECT N'DESIGNER_ROLLED_BACK_BACKUP_RETAINED' AS [status] FOR XML PATH('dashboard_designer_rollback'),TYPE) AS OPEN_AND_SAVE_XML;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
