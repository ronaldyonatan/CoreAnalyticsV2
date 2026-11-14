/* DEV rollback. Disables worker signing and removes only the reviewed dashboard
   route. Preserves the key/nonce tables and gateway for audit; does not reset jobs.
   Refuses to overwrite later changes to BI.dbo.spDashboard. */
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53340,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID(N'studio.worker_beam_gateway_backup',N'U') IS NULL OR OBJECT_ID(N'studio.worker_beam_key',N'U') IS NULL
  THROW 53341,'WORKER_BEAM_BACKUP_NOT_FOUND',1;
 DECLARE @before nvarchar(max),@installed nvarchar(max),@current nvarchar(max),@restore nvarchar(max),
  @actual nvarchar(max),@old029 nvarchar(max),@statement nvarchar(max),@decl int,@a int,@b int;
 SELECT @before=previous_definition,@installed=installed_definition
 FROM studio.worker_beam_gateway_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=N'BI.dbo.spDashboard';
 SELECT @current=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @before IS NULL OR @installed IS NULL OR @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed)
    OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2
  THROW 53342,'GATEWAY_CHANGED_AFTER_WORKER_INSTALL',1;
 SELECT @old029=installed_definition FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
  WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 IF @old029 IS NOT NULL AND (DATALENGTH(@old029)<>DATALENGTH(@current) OR @old029 COLLATE Latin1_General_100_BIN2<>@current COLLATE Latin1_General_100_BIN2)
  THROW 53343,'PREVIOUS_BACKUP_CHANGED',1;
 SET @decl=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);
 IF @decl=0 THROW 53344,'BACKUP_DECLARATION_UNSUPPORTED',1;
 SET @restore=STUFF(@before,@decl,6,N'ALTER');
 UPDATE studio.worker_beam_key SET enabled=0;
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@restore;
 SELECT @actual=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 SET @a=CHARINDEX(N'@Mode',@restore); SET @b=CHARINDEX(N'@Mode',@actual);
 IF @actual IS NULL OR @a=0 OR @b=0 OR DATALENGTH(SUBSTRING(@restore,@a,LEN(@restore)))<>DATALENGTH(SUBSTRING(@actual,@b,LEN(@actual)))
  OR SUBSTRING(@restore,@a,LEN(@restore)) COLLATE Latin1_General_100_BIN2<>SUBSTRING(@actual,@b,LEN(@actual)) COLLATE Latin1_General_100_BIN2
  THROW 53345,'ROLLBACK_VERIFY_FAILED',1;
 IF @old029 IS NOT NULL UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@actual
  WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 COMMIT;
 SELECT (SELECT N'WORKER_BEAM_DISABLED_ROUTE_RESTORED' status,SYSUTCDATETIME() verified_at_utc
  FOR XML PATH('worker_beam_rollback'),TYPE) AS OPEN_AND_SAVE_XML;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
