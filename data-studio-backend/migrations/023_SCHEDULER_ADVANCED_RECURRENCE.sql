/* Phase 3.1C UI recurrence extension, CoreAnalytics DEVELOPMENT first.
   Requires migrations 021 and 022 and existing 021B BEAM route.
   Adds nullable week_days_mask/repeat_minutes, preserving all existing schedules.
   No job dispatch until scheduler worker is started. Verify backups and SQL permissions.
   SQL Server 2016+ compatible. REVIEW against current spSchedulerControl/Dispatch before running.
*/
USE [CoreAnalytics];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRANSACTION;
 IF OBJECT_ID('studio.scheduler_schedule','U') IS NULL OR
    OBJECT_ID('studio.spSchedulerControl','P') IS NULL OR
    OBJECT_ID('studio.spSchedulerDispatch','P') IS NULL OR
    OBJECT_ID('studio.fnSchedulerNextUtc','FN') IS NULL
    THROW 52300,'Scheduler 021 must be installed before 023',1;
 DECLARE @controlOld nvarchar(max)=(SELECT definition FROM sys.sql_modules WHERE object_id=OBJECT_ID('studio.spSchedulerControl','P'));
 DECLARE @dispatchOld nvarchar(max)=(SELECT definition FROM sys.sql_modules WHERE object_id=OBJECT_ID('studio.spSchedulerDispatch','P'));
 IF @controlOld IS NULL OR @dispatchOld IS NULL OR
    CHARINDEX('SCHEDULER_SAVED',@controlOld)=0 OR
    CHARINDEX('SKIPPED_BUSY',@dispatchOld)=0
    THROW 52301,'Unexpected Scheduler procedure version. Nothing changed; review migration manually.',1;
 IF COL_LENGTH('studio.scheduler_schedule','week_days_mask') IS NOT NULL AND
    COL_LENGTH('studio.scheduler_schedule','repeat_minutes') IS NOT NULL AND
    OBJECT_ID('studio.fnSchedulerNextUtcEx','FN') IS NOT NULL AND
    CHARINDEX('fnSchedulerNextUtcEx',@controlOld)>0 AND CHARINDEX('fnSchedulerNextUtcEx',@dispatchOld)>0
 BEGIN PRINT 'Scheduler recurrence 023 already installed.'; END
 ELSE
 BEGIN
 IF CHARINDEX('studio.fnSchedulerNextUtc(',@controlOld)=0 OR CHARINDEX('studio.fnSchedulerNextUtc(',@dispatchOld)=0
   THROW 52301,'Unexpected Scheduler procedure version. Nothing changed; review manually.',1;
 IF COL_LENGTH('studio.scheduler_schedule','week_days_mask') IS NOT NULL OR COL_LENGTH('studio.scheduler_schedule','repeat_minutes') IS NOT NULL
    THROW 52302,'Scheduler recurrence columns already present but not fully installed. Review manually.',1;
 ALTER TABLE studio.scheduler_schedule ADD
    week_days_mask tinyint NULL,
    repeat_minutes smallint NULL;
 ALTER TABLE studio.scheduler_schedule WITH CHECK ADD CONSTRAINT CK_sched_week_mask
    CHECK (week_days_mask IS NULL OR (frequency='WEEKLY' AND week_days_mask BETWEEN 1 AND 127));
 ALTER TABLE studio.scheduler_schedule WITH CHECK ADD CONSTRAINT CK_sched_repeat
    CHECK (repeat_minutes IS NULL OR (frequency='DAILY' AND repeat_minutes BETWEEN 5 AND 1440));
 EXEC sys.sp_executesql N'CREATE OR ALTER FUNCTION studio.fnSchedulerNextUtcEx(
 @frequency varchar(12), @interval_minutes int, @clock char(5),
 @week_day tinyint, @month_day tinyint, @after_utc datetime2(3),
 @week_days_mask tinyint, @repeat_minutes smallint
) RETURNS datetime2(3)
AS
BEGIN
 DECLARE @utc datetime2(3)=ISNULL(@after_utc,SYSUTCDATETIME());
 IF @frequency=''INTERVAL'' RETURN DATEADD(minute,@interval_minutes,@utc);
 DECLARE @local datetime2(3)=DATEADD(hour,7,@utc), @d date=CONVERT(date,DATEADD(hour,7,@utc));
 DECLARE @minute int=CONVERT(int,LEFT(@clock,2))*60+CONVERT(int,RIGHT(@clock,2));
 DECLARE @candidate datetime2(3)=DATEADD(minute,@minute,CONVERT(datetime2(3),@d));
 IF @frequency=''DAILY''
 BEGIN
  IF @repeat_minutes IS NOT NULL
  BEGIN
   DECLARE @anchor datetime2(3)=@candidate;
   DECLARE @elapsed int=DATEDIFF(minute,@anchor,@local);
   IF @elapsed>=0
   BEGIN
    -- Strictly future slot: skip the current minute, even if seconds have elapsed.
    SET @candidate=DATEADD(minute,((@elapsed / @repeat_minutes)+1)*@repeat_minutes,@anchor);
   END;
   IF CONVERT(date,@candidate)<>@d SET @candidate=DATEADD(day,1,@anchor);
  END
  ELSE IF @candidate<=@local SET @candidate=DATEADD(day,1,@candidate);
 END
 ELSE IF @frequency=''WEEKLY''
 BEGIN
  DECLARE @mask int=COALESCE(CONVERT(int,@week_days_mask),POWER(2,CONVERT(int,@week_day)-1));
  DECLARE @i int=0,@found bit=0,@dow int,@day date,@trial datetime2(3);
  WHILE @i<=7
  BEGIN
   SET @day=DATEADD(day,@i,@d);
   SET @dow=(DATEDIFF(day,CONVERT(date,''19000101''),@day)%7)+1;
   IF (@mask & POWER(2,@dow-1))<>0
   BEGIN
    SET @trial=DATEADD(minute,@minute,CONVERT(datetime2(3),@day));
    IF @trial>@local BEGIN SET @candidate=@trial; SET @found=1; BREAK; END;
   END;
   SET @i=@i+1;
  END;
  IF @found=0 RETURN NULL;
 END
 ELSE IF @frequency=''MONTHLY''
 BEGIN
  DECLARE @start date=DATEFROMPARTS(YEAR(@d),MONTH(@d),1);
  DECLARE @actual int=CASE WHEN @month_day>DAY(EOMONTH(@start)) THEN DAY(EOMONTH(@start)) ELSE @month_day END;
  SET @candidate=DATEADD(minute,@minute,DATEADD(day,@actual-1,CONVERT(datetime2(3),@start)));
  IF @candidate<=@local
  BEGIN
   SET @start=DATEADD(month,1,@start);
   SET @actual=CASE WHEN @month_day>DAY(EOMONTH(@start)) THEN DAY(EOMONTH(@start)) ELSE @month_day END;
   SET @candidate=DATEADD(minute,@minute,DATEADD(day,@actual-1,CONVERT(datetime2(3),@start)));
  END;
 END;
 RETURN DATEADD(hour,-7,@candidate);
END;';
 EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE studio.spSchedulerControl @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;
 DECLARE @action varchar(20)=JSON_VALUE(@Payload,''$.Action''),
         @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),
         @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ScheduleID'')),
         @target uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.TargetID'')),
         @kind varchar(12)=JSON_VALUE(@Payload,''$.TargetType''),
         @ver int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.PipelineVersion'')),
         @name nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ScheduleName''))),''''),
         @freq varchar(12)=JSON_VALUE(@Payload,''$.Frequency''),
         @interval int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.IntervalMinutes'')),
         @clock char(5)=JSON_VALUE(@Payload,''$.TimeOfDay''),
         @weekday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.WeekDay'')),
         @weekmask tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.WeekDaysMask'')),
         @repeat smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,''$.RepeatMinutes'')),
         @monthday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.MonthDay'')),
         @enabled bit=TRY_CONVERT(bit,JSON_VALUE(@Payload,''$.Enabled'')),
         @now datetime2(3)=SYSUTCDATETIME();
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
 BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_ACCESS_DENIED'' code; RETURN; END;
 IF @action=''Status''
 BEGIN SELECT CAST(1 AS bit) success,''SCHEDULER_READY'' code,1 schema_version; RETURN; END;
 IF @action=''List''
 BEGIN
  SELECT CAST(1 AS bit) success,''SCHEDULER_LIST'' code,
   (SELECT CONVERT(varchar(36),s.schedule_id) schedule_id,s.schedule_name,s.target_type,
      CONVERT(varchar(36),s.target_id) target_id,s.pipeline_version,s.frequency,s.interval_minutes,
      s.time_of_day,s.week_day,s.month_day,s.week_days_mask,s.repeat_minutes,s.timezone_name,s.enabled,s.next_run_at,s.last_run_at,s.updated_at,
      COALESCE(d.dataset_name,p.pipeline_name) target_name
    FROM studio.scheduler_schedule s
    LEFT JOIN studio.dataset d ON s.target_type=''STORED'' AND d.dataset_id=s.target_id
    LEFT JOIN studio.pipeline p ON s.target_type=''PIPELINE'' AND p.pipeline_id=s.target_id
    WHERE s.created_by=@owner ORDER BY s.updated_at DESC,s.schedule_id
    FOR JSON PATH) items_json;
  RETURN;
 END;
 IF @action=''History''
 BEGIN
  SELECT CAST(1 AS bit) success,''SCHEDULER_HISTORY'' code,
   (SELECT TOP(150) CONVERT(varchar(36),e.event_id) event_id,CONVERT(varchar(36),s.schedule_id) schedule_id,
      s.schedule_name,s.target_type,COALESCE(d.dataset_name,p.pipeline_name) target_name,
      e.scheduled_at,e.attempt,e.result,CONVERT(varchar(36),e.run_id) run_id,e.created_at,
      COALESCE(dr.status,pr.status,e.result) status,COALESCE(dr.error_code,pr.error_code) error_code,
      COALESCE(dr.finished_at,pr.finished_at) finished_at
    FROM studio.scheduler_event e JOIN studio.scheduler_schedule s ON s.schedule_id=e.schedule_id
    LEFT JOIN studio.dataset d ON s.target_type=''STORED'' AND d.dataset_id=s.target_id
    LEFT JOIN studio.pipeline p ON s.target_type=''PIPELINE'' AND p.pipeline_id=s.target_id
    LEFT JOIN studio.dataset_ingest_run dr ON s.target_type=''STORED'' AND dr.run_id=e.run_id
    LEFT JOIN studio.pipeline_run pr ON s.target_type=''PIPELINE'' AND pr.run_id=e.run_id
    WHERE s.created_by=@owner ORDER BY e.created_at DESC,e.event_id DESC FOR JSON PATH) items_json;
  RETURN;
 END;
 IF @action=''Save''
 BEGIN
  -- New weekly masks are additive; keep legacy week_day as the first selected day.
  IF @freq=''WEEKLY'' AND @weekmask IS NULL AND @weekday BETWEEN 1 AND 7
    SET @weekmask=POWER(2,@weekday-1);
  IF @freq=''WEEKLY'' AND @weekmask IS NOT NULL
  BEGIN
   SET @weekday=1;
   WHILE @weekday<7 AND (@weekmask & POWER(2,@weekday-1))=0 SET @weekday=@weekday+1;
  END;
  IF @name IS NULL OR LEN(@name)>150 OR @target IS NULL OR @enabled IS NULL OR
     @kind NOT IN (''STORED'',''PIPELINE'') OR @freq NOT IN (''INTERVAL'',''DAILY'',''WEEKLY'',''MONTHLY'') OR
     (@freq=''INTERVAL'' AND (@interval IS NULL OR @interval NOT BETWEEN 5 AND 10080)) OR
     (@freq<>''INTERVAL'' AND (@clock IS NULL OR LEN(@clock)<>5 OR @clock NOT LIKE ''[0-2][0-9]:[0-5][0-9]'' OR LEFT(@clock,2)>''23'')) OR
     (@freq=''WEEKLY'' AND (@weekmask IS NULL OR @weekmask NOT BETWEEN 1 AND 127)) OR
     (@freq<>''WEEKLY'' AND @weekmask IS NOT NULL) OR
     (@freq=''DAILY'' AND @repeat IS NOT NULL AND @repeat NOT BETWEEN 5 AND 1440) OR
     (@freq<>''DAILY'' AND @repeat IS NOT NULL) OR
     (JSON_VALUE(@Payload,''$.RepeatMinutes'') IS NOT NULL AND @repeat IS NULL) OR
     (JSON_VALUE(@Payload,''$.WeekDaysMask'') IS NOT NULL AND @weekmask IS NULL) OR
     (@freq=''MONTHLY'' AND (@monthday IS NULL OR @monthday NOT BETWEEN 1 AND 31)) OR
     (@kind=''STORED'' AND @ver IS NOT NULL) OR (@kind=''PIPELINE'' AND (@ver IS NULL OR @ver<1))
  BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;
  IF (@kind=''STORED'' AND NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode=''STORED'' AND created_by=CONVERT(nvarchar(100),@owner))) OR
     (@kind=''PIPELINE'' AND NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id AND v.version=@ver WHERE p.pipeline_id=@target AND p.created_by=@owner AND JSON_QUERY(v.graph_json,''$.graph'') IS NOT NULL))
  BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_TARGET_NOT_FOUND'' code; RETURN; END;
  BEGIN TRY
   BEGIN TRANSACTION;
   IF @id IS NULL
   BEGIN
    IF (SELECT COUNT(*) FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE created_by=@owner)>=100
       THROW 52101,''SCHEDULER_LIMIT_REACHED'',1;
    SET @id=NEWID();
    INSERT studio.scheduler_schedule(schedule_id,created_by,schedule_name,target_type,target_id,pipeline_version,frequency,interval_minutes,time_of_day,week_day,month_day,week_days_mask,repeat_minutes,enabled,next_run_at)
    VALUES(@id,@owner,@name,@kind,@target,@ver,@freq,CASE WHEN @freq=''INTERVAL'' THEN @interval END,
       CASE WHEN @freq<>''INTERVAL'' THEN @clock END,CASE WHEN @freq=''WEEKLY'' THEN @weekday END,CASE WHEN @freq=''MONTHLY'' THEN @monthday END,
       CASE WHEN @freq=''WEEKLY'' THEN @weekmask END, CASE WHEN @freq=''DAILY'' THEN @repeat END, @enabled,CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END);
   END
   ELSE
   BEGIN
    IF NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE schedule_id=@id AND created_by=@owner)
        THROW 52102,''SCHEDULER_NOT_FOUND'',1;
    UPDATE studio.scheduler_schedule SET schedule_name=@name,target_type=@kind,target_id=@target,pipeline_version=@ver,frequency=@freq,
       interval_minutes=CASE WHEN @freq=''INTERVAL'' THEN @interval END,
       time_of_day=CASE WHEN @freq<>''INTERVAL'' THEN @clock END,
       week_day=CASE WHEN @freq=''WEEKLY'' THEN @weekday END,
       month_day=CASE WHEN @freq=''MONTHLY'' THEN @monthday END,
       week_days_mask=CASE WHEN @freq=''WEEKLY'' THEN @weekmask END,
       repeat_minutes=CASE WHEN @freq=''DAILY'' THEN @repeat END,
       enabled=@enabled,next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,
       updated_at=@now WHERE schedule_id=@id AND created_by=@owner;
   END;
   COMMIT TRANSACTION;
   SELECT CAST(1 AS bit) success,''SCHEDULER_SAVED'' code,CONVERT(varchar(36),@id) schedule_id;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=52101 THEN ''SCHEDULER_LIMIT_REACHED'' WHEN ERROR_NUMBER()=52102 THEN ''SCHEDULER_NOT_FOUND'' ELSE ''SCHEDULER_SAVE_FAILED'' END code;
  END CATCH;
  RETURN;
 END;
 IF @action=''Toggle''
 BEGIN
  IF @id IS NULL OR @enabled IS NULL
  BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;
  UPDATE studio.scheduler_schedule SET enabled=@enabled,
    next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(frequency,interval_minutes,time_of_day,week_day,month_day,@now,week_days_mask,repeat_minutes) END,
    updated_at=@now WHERE schedule_id=@id AND created_by=@owner;
  IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,''SCHEDULER_NOT_FOUND'' code;
  ELSE SELECT CAST(1 AS bit) success,''SCHEDULER_UPDATED'' code,CONVERT(varchar(36),@id) schedule_id;
  RETURN;
 END;
 SELECT CAST(0 AS bit) success,''SCHEDULER_ACTION_INVALID'' code;
END;';
 EXEC sys.sp_executesql N'CREATE OR ALTER PROCEDURE studio.spSchedulerDispatch @Action varchar(10)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @Action<>''Tick'' THROW 52110,''SCHEDULER_ACTION_INVALID'',1;
 DECLARE @now datetime2(3)=SYSUTCDATETIME(),@id uniqueidentifier,@owner uniqueidentifier,@target uniqueidentifier,
         @kind varchar(12),@freq varchar(12),@interval int,@clock char(5),@weekday tinyint,@monthday tinyint,@weekmask tinyint,@repeat smallint,
         @ver int,@slot datetime2(3),@run uniqueidentifier,@result varchar(24),@bad bit=0;
 BEGIN TRY
  BEGIN TRANSACTION;
  SELECT TOP(1) @id=s.schedule_id,@owner=s.created_by,@target=s.target_id,@kind=s.target_type,@freq=s.frequency,
    @interval=s.interval_minutes,@clock=s.time_of_day,@weekday=s.week_day,@monthday=s.month_day,@weekmask=s.week_days_mask,@repeat=s.repeat_minutes,
    @ver=s.pipeline_version,@slot=s.next_run_at
  FROM studio.scheduler_schedule s WITH(UPDLOCK,READPAST,ROWLOCK)
  WHERE s.enabled=1 AND s.next_run_at<=@now ORDER BY s.next_run_at,s.schedule_id;
  IF @id IS NULL
  BEGIN COMMIT TRANSACTION; SELECT CAST(0 AS bit) has_event; RETURN; END;
  IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
      SET @bad=1;
  IF @kind=''STORED''
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode=''STORED'' AND created_by=CONVERT(nvarchar(100),@owner)) SET @bad=1;
  END
  ELSE IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON p.pipeline_id=v.pipeline_id AND v.version=@ver
       WHERE p.pipeline_id=@target AND p.created_by=@owner AND JSON_QUERY(v.graph_json,''$.graph'') IS NOT NULL) SET @bad=1;
  IF @bad=1 SET @result=''SKIPPED_INVALID'';
  ELSE IF @kind=''STORED'' AND EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH(UPDLOCK,HOLDLOCK)
       WHERE dataset_id=@target AND status IN (''QUEUED'',''RUNNING'')) SET @result=''SKIPPED_BUSY'';
  ELSE IF @kind=''PIPELINE'' AND EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK)
       WHERE pipeline_id=@target AND status IN (''QUEUED'',''RUNNING'')) SET @result=''SKIPPED_BUSY'';
  ELSE
  BEGIN
   SET @run=NEWID(); SET @result=''QUEUED'';
   IF @kind=''STORED''
     INSERT studio.dataset_ingest_run(run_id,dataset_id,requested_by,request_id) VALUES(@run,@target,@owner,NEWID());
   ELSE
     INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@target,@ver,@owner,NEWID());
  END;
  INSERT studio.scheduler_event(schedule_id,scheduled_at,result,run_id) VALUES(@id,@slot,@result,@run);
  UPDATE studio.scheduler_schedule SET next_run_at=CASE WHEN @bad=1 THEN NULL ELSE studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,
   enabled=CASE WHEN @bad=1 THEN 0 ELSE enabled END,
   last_run_at=@now,updated_at=@now WHERE schedule_id=@id;
  COMMIT TRANSACTION;
  SELECT CAST(1 AS bit) has_event,CONVERT(varchar(36),@id) schedule_id,
   @result result,CONVERT(varchar(36),@run) run_id;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW 52111,''SCHEDULER_DISPATCH_FAILED'',1;
 END CATCH;
END;';
 IF CHARINDEX('fnSchedulerNextUtcEx',OBJECT_DEFINITION(OBJECT_ID('studio.spSchedulerControl')))=0 OR
    CHARINDEX('fnSchedulerNextUtcEx',OBJECT_DEFINITION(OBJECT_ID('studio.spSchedulerDispatch')))=0
    THROW 52303,'Scheduler recurrence procedure verification failed',1;
 END;
 COMMIT TRANSACTION;
 PRINT 'Scheduler recurrence 023 installed; existing schedules preserved.';
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
GO
SELECT COL_LENGTH('studio.scheduler_schedule','week_days_mask') AS weekly_mask_column,
       COL_LENGTH('studio.scheduler_schedule','repeat_minutes') AS daily_repeat_column,
       OBJECT_ID('studio.fnSchedulerNextUtcEx','FN') AS recurrence_function;
GO
