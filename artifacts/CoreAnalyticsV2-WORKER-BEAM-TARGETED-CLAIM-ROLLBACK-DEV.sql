/* DEV rollback: restores the worker gateway before targeted claims. It refuses
   unknown drift and leaves keys, nonces, scheduler and existing jobs unchanged. */
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53420,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID(N'studio.worker_beam_targeted_backup',N'U') IS NULL THROW 53421,'TARGETED_BACKUP_NOT_FOUND',1;
 DECLARE @old nvarchar(max),@installed nvarchar(max),@actual nvarchar(max),@restore nvarchar(max),@restored nvarchar(max),
  @oldBody nvarchar(max),@actualBody nvarchar(max),@decl int,@a int,@b int;
 SELECT @old=previous_definition,@installed=installed_definition FROM studio.worker_beam_targeted_backup WITH(UPDLOCK,HOLDLOCK)
  WHERE object_name=N'studio.spWorkerBeamRpc';
 SET @actual=OBJECT_DEFINITION(OBJECT_ID(N'studio.spWorkerBeamRpc'));
 IF @old IS NULL OR @installed IS NULL OR @actual IS NULL OR DATALENGTH(@actual)<>DATALENGTH(@installed)
  OR @actual COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2
  THROW 53422,'WORKER_GATEWAY_CHANGED_AFTER_INSTALL',1;
 SET @restore=@old;
 SET @decl=CHARINDEX(N'CREATE PROCEDURE studio.spWorkerBeamRpc',@restore);
 IF @decl>0 SET @restore=STUFF(@restore,@decl,6,N'ALTER');
 ELSE IF CHARINDEX(N'ALTER PROCEDURE studio.spWorkerBeamRpc',@restore)=0 THROW 53423,'WORKER_BACKUP_HEADER_UNRECOGNIZED',1;
 EXEC sys.sp_executesql @restore;
 SET @restored=OBJECT_DEFINITION(OBJECT_ID(N'studio.spWorkerBeamRpc'));
 SET @a=CHARINDEX(N'@Payload',@old); SET @b=CHARINDEX(N'@Payload',@restored);
 IF @restored IS NULL OR @a=0 OR @b=0 THROW 53424,'WORKER_ROLLBACK_NOT_VISIBLE',1;
 SET @oldBody=REPLACE(SUBSTRING(@old,@a,LEN(@old)),CHAR(13),N'');
 SET @actualBody=REPLACE(SUBSTRING(@restored,@b,LEN(@restored)),CHAR(13),N'');
 IF DATALENGTH(@oldBody)<>DATALENGTH(@actualBody) OR @oldBody COLLATE Latin1_General_100_BIN2<>@actualBody COLLATE Latin1_General_100_BIN2
  THROW 53425,'WORKER_ROLLBACK_VERIFY_FAILED',1;
 COMMIT;
 SELECT (SELECT N'TARGETED_WORKER_CLAIM_ROLLED_BACK' status,SYSUTCDATETIME() verified_at_utc
  FOR XML PATH('worker_beam_targeted_rollback'),TYPE) AS OPEN_AND_SAVE_XML;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
