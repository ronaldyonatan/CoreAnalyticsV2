/* Manual DEV rollback of 030 only. Roll back 030 before rolling back 029. */
USE [CoreAnalytics]; SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53000,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 DECLARE @object nvarchar(256),@before nvarchar(max),@installed nvarchar(max),@current nvarchar(max),@parameter nvarchar(40),@restore nvarchar(max);
 DECLARE restore_schedule_checks CURSOR LOCAL FAST_FORWARD FOR
  SELECT object_name,previous_definition,installed_definition FROM studio.phase2d8_schedule_check_backup WITH(UPDLOCK,HOLDLOCK);
 OPEN restore_schedule_checks; FETCH NEXT FROM restore_schedule_checks INTO @object,@before,@installed;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @current=OBJECT_DEFINITION(OBJECT_ID(@object));
  IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2
   THROW 53005,'ROLLBACK_REFUSES_CHANGED_DEFINITION',1;
  SET @parameter=CASE WHEN @object='studio.spObjectAccessControlV2' THEN '@ActorUserID' ELSE '@Payload' END;
  IF CHARINDEX(@parameter,@before)=0 THROW 53003,'UNREVIEWED_SIGNATURE',1;
  SET @restore=N'ALTER PROCEDURE '+@object+N' '+SUBSTRING(@before,CHARINDEX(@parameter,@before),LEN(@before));
  EXEC sys.sp_executesql @restore;
  FETCH NEXT FROM restore_schedule_checks INTO @object,@before,@installed;
 END;
 CLOSE restore_schedule_checks; DEALLOCATE restore_schedule_checks;
 DELETE studio.phase2d8_schedule_check_backup;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT N'030_ROLLED_BACK_029_PRESERVED' AS result;
