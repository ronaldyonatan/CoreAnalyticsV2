/* Manual DEV rollback of 029 only. Does not undo confirmed 028 owner-only sharing.
   Run after reviewing why rollback is necessary; backend must match SQL version. */
USE [CoreAnalytics]; SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 52900,'RUN_IN_SESSION_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 DECLARE @db nvarchar(128),@object nvarchar(256),@old nvarchar(max),@installed nvarchar(max),@current nvarchar(max),@sql nvarchar(max);
 DECLARE restore_objects CURSOR LOCAL FAST_FORWARD FOR
 SELECT database_name,object_name,previous_definition,installed_definition
 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
 WHERE previous_definition IS NOT NULL ORDER BY database_name,object_name;
 OPEN restore_objects; FETCH NEXT FROM restore_objects INTO @db,@object,@old,@installed;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @current=NULL; SET @sql=N'USE '+QUOTENAME(@db)+N'; SELECT @d=OBJECT_DEFINITION(OBJECT_ID(@o));';
  EXEC sys.sp_executesql @sql,N'@o nvarchar(256),@d nvarchar(max) OUTPUT',@object,@current OUTPUT;
  IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2
    THROW 52909,'ROLLBACK_REFUSES_CHANGED_DEFINITION',1;
  SET @old=LTRIM(@old);
  /* Header conversion only; comments may precede CREATE. */
  DECLARE @start int,@create int,@param nvarchar(40),@prefix nvarchar(max),@reverseCreate int;
  SET @param=CASE WHEN @object='studio.spObjectAccessControlV2' THEN '@ActorUserID' WHEN @object IN ('studio.spDatasetIngestWorker','studio.spSchedulerDispatch') THEN '@Action' WHEN @object='dbo.spDashboard' THEN '@Mode' ELSE '@Payload' END;
  SET @prefix=LEFT(@old,CHARINDEX(@param,@old)-1);
  SET @reverseCreate=CHARINDEX('ETAERC',REVERSE(UPPER(@prefix)));
  SET @create=CASE WHEN @reverseCreate>0 THEN DATALENGTH(@prefix)/2-@reverseCreate-4 ELSE 0 END;
  SET @start=CHARINDEX('PROCEDURE',UPPER(@old),CASE WHEN @create>0 THEN @create ELSE 1 END);
  IF @create>0 AND @create<@start AND CHARINDEX('OR ALTER',UPPER(SUBSTRING(@old,@create,@start-@create)))=0 SET @old=STUFF(@old,@create,@start-@create,N'ALTER ');
  SET @sql=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
  EXEC sys.sp_executesql @sql,N'@statement nvarchar(max)',@old;
  FETCH NEXT FROM restore_objects INTO @db,@object,@old,@installed;
 END;
 CLOSE restore_objects; DEALLOCATE restore_objects;
SET @current=OBJECT_DEFINITION(OBJECT_ID('studio.fnStudioChartSourceAllowed'));
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name='CoreAnalytics' AND object_name='studio.fnStudioChartSourceAllowed';
 IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2 THROW 52909,'ROLLBACK_REFUSES_CHANGED_FUNCTION',1;
 DROP FUNCTION studio.fnStudioChartSourceAllowed;
SET @current=OBJECT_DEFINITION(OBJECT_ID('studio.fnStudioGraphSourcesAllowed'));
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name='CoreAnalytics' AND object_name='studio.fnStudioGraphSourcesAllowed';
 IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2 THROW 52909,'ROLLBACK_REFUSES_CHANGED_FUNCTION',1;
 DROP FUNCTION studio.fnStudioGraphSourcesAllowed;
SET @current=OBJECT_DEFINITION(OBJECT_ID('studio.fnStudioScheduleAccess'));
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name='CoreAnalytics' AND object_name='studio.fnStudioScheduleAccess';
 IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2 THROW 52909,'ROLLBACK_REFUSES_CHANGED_FUNCTION',1;
 DROP FUNCTION studio.fnStudioScheduleAccess;
SET @current=OBJECT_DEFINITION(OBJECT_ID('studio.fnStudioAccessLevel'));
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name='CoreAnalytics' AND object_name='studio.fnStudioAccessLevel';
 IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2 THROW 52909,'ROLLBACK_REFUSES_CHANGED_FUNCTION',1;
 DROP FUNCTION studio.fnStudioAccessLevel;
DELETE studio.phase2d8_dataplane_backup;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT N'029_ROLLED_BACK_028_PRESERVED' AS result;
