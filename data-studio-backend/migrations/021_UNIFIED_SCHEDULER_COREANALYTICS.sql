/* CoreAnalyticsV2 Phase 3.1 - Unified Scheduler
   SQL Server 2016 SP2+, CoreAnalytics DEVELOPMENT FIRST. Run manually.
   Requires studio.dataset / dataset_ingest_run (016/019), studio.pipeline_* (006/007).
   No source DB changes; no edits to existing pipeline/dataset procedures.
   Schedules use Asia/Jakarta (WIB, UTC+7); no DST. Future timezones are out of scope.
   DB backup and review permissions before execution. Scheduler remains inert until daemon runs.
*/
USE [CoreAnalytics];
GO
SET XACT_ABORT ON;
IF OBJECT_ID(N'studio.dataset_ingest_run',N'U') IS NULL OR OBJECT_ID(N'studio.pipeline_run',N'U') IS NULL
    THROW 52100,'Scheduler requires STORED Dataset and Pipeline metadata migrations',1;
GO
IF OBJECT_ID(N'studio.scheduler_schedule',N'U') IS NULL
BEGIN
 CREATE TABLE studio.scheduler_schedule(
  schedule_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_scheduler_schedule PRIMARY KEY DEFAULT NEWID(),
  created_by uniqueidentifier NOT NULL REFERENCES dbo.core_user(user_id),
  schedule_name nvarchar(150) NOT NULL,
  target_type varchar(12) NOT NULL CONSTRAINT CK_sched_target CHECK(target_type IN ('STORED','PIPELINE')),
  target_id uniqueidentifier NOT NULL,
  pipeline_version int NULL,
  frequency varchar(12) NOT NULL CONSTRAINT CK_sched_frequency CHECK(frequency IN ('INTERVAL','DAILY','WEEKLY','MONTHLY')),
  interval_minutes int NULL,
  time_of_day char(5) NULL,
  week_day tinyint NULL,
  month_day tinyint NULL,
  timezone_name varchar(32) NOT NULL CONSTRAINT DF_sched_timezone DEFAULT 'Asia/Jakarta',
  enabled bit NOT NULL CONSTRAINT DF_sched_enabled DEFAULT 0,
  next_run_at datetime2(3) NULL,
  last_run_at datetime2(3) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_sched_created DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_sched_updated DEFAULT SYSUTCDATETIME(),
  CONSTRAINT CK_sched_version CHECK ((target_type='STORED' AND pipeline_version IS NULL) OR (target_type='PIPELINE' AND pipeline_version>0)),
  CONSTRAINT CK_sched_timezone CHECK(timezone_name='Asia/Jakarta'),
  CONSTRAINT CK_sched_interval CHECK ((frequency='INTERVAL' AND interval_minutes BETWEEN 5 AND 10080) OR (frequency<>'INTERVAL' AND interval_minutes IS NULL)),
  CONSTRAINT CK_sched_week CHECK(week_day IS NULL OR week_day BETWEEN 1 AND 7),
  CONSTRAINT CK_sched_month CHECK(month_day IS NULL OR month_day BETWEEN 1 AND 31)
 );
 CREATE INDEX IX_sched_due ON studio.scheduler_schedule(enabled,next_run_at) INCLUDE(created_by,target_type,target_id);
 CREATE INDEX IX_sched_owner ON studio.scheduler_schedule(created_by,updated_at DESC);
END;
GO
IF OBJECT_ID(N'studio.scheduler_event',N'U') IS NULL
BEGIN
 CREATE TABLE studio.scheduler_event(
  event_id uniqueidentifier NOT NULL CONSTRAINT PK_studio_scheduler_event PRIMARY KEY DEFAULT NEWID(),
  schedule_id uniqueidentifier NOT NULL REFERENCES studio.scheduler_schedule(schedule_id),
  scheduled_at datetime2(3) NOT NULL,
  attempt tinyint NOT NULL CONSTRAINT DF_sched_attempt DEFAULT 0,
  result varchar(24) NOT NULL CHECK(result IN ('QUEUED','SKIPPED_BUSY','SKIPPED_INVALID')),
  run_id uniqueidentifier NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_sched_event_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_sched_event_slot UNIQUE(schedule_id,scheduled_at,attempt)
 );
 CREATE INDEX IX_sched_event_schedule ON studio.scheduler_event(schedule_id,created_at DESC) INCLUDE(result,run_id);
END;
GO
CREATE OR ALTER FUNCTION studio.fnSchedulerNextUtc(
 @frequency varchar(12), @interval_minutes int, @clock char(5),
 @week_day tinyint, @month_day tinyint, @after_utc datetime2(3)
) RETURNS datetime2(3)
AS
BEGIN
 DECLARE @utc datetime2(3)=ISNULL(@after_utc,SYSUTCDATETIME());
 IF @frequency='INTERVAL' RETURN DATEADD(minute,@interval_minutes,@utc);
 DECLARE @local datetime2(3)=DATEADD(hour,7,@utc), @d date=CONVERT(date,DATEADD(hour,7,@utc));
 DECLARE @minute int=CONVERT(int,LEFT(@clock,2))*60+CONVERT(int,RIGHT(@clock,2));
 DECLARE @candidate datetime2(3)=DATEADD(minute,@minute,CONVERT(datetime2(3),@d));
 IF @frequency='DAILY'
 BEGIN
  IF @candidate<=@local SET @candidate=DATEADD(day,1,@candidate);
 END
 ELSE IF @frequency='WEEKLY'
 BEGIN
  DECLARE @dow int=(DATEDIFF(day,CONVERT(date,'19000101'),@d)%7)+1;
  SET @candidate=DATEADD(day,(@week_day-@dow+7)%7,@candidate);
  IF @candidate<=@local SET @candidate=DATEADD(day,7,@candidate);
 END
 ELSE IF @frequency='MONTHLY'
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
END;
GO
CREATE OR ALTER PROCEDURE studio.spSchedulerControl @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,'SCHEDULER_INPUT_INVALID' code; RETURN; END;
 DECLARE @action varchar(20)=JSON_VALUE(@Payload,'$.Action'),
         @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.UserID')),
         @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ScheduleID')),
         @target uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.TargetID')),
         @kind varchar(12)=JSON_VALUE(@Payload,'$.TargetType'),
         @ver int=TRY_CONVERT(int,JSON_VALUE(@Payload,'$.PipelineVersion')),
         @name nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.ScheduleName'))),''),
         @freq varchar(12)=JSON_VALUE(@Payload,'$.Frequency'),
         @interval int=TRY_CONVERT(int,JSON_VALUE(@Payload,'$.IntervalMinutes')),
         @clock char(5)=JSON_VALUE(@Payload,'$.TimeOfDay'),
         @weekday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,'$.WeekDay')),
         @monthday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,'$.MonthDay')),
         @enabled bit=TRY_CONVERT(bit,JSON_VALUE(@Payload,'$.Enabled')),
         @now datetime2(3)=SYSUTCDATETIME();
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
 BEGIN SELECT CAST(0 AS bit) success,'SCHEDULER_ACCESS_DENIED' code; RETURN; END;
 IF @action='Status'
 BEGIN SELECT CAST(1 AS bit) success,'SCHEDULER_READY' code,1 schema_version; RETURN; END;
 IF @action='List'
 BEGIN
  SELECT CAST(1 AS bit) success,'SCHEDULER_LIST' code,
   (SELECT CONVERT(varchar(36),s.schedule_id) schedule_id,s.schedule_name,s.target_type,
      CONVERT(varchar(36),s.target_id) target_id,s.pipeline_version,s.frequency,s.interval_minutes,
      s.time_of_day,s.week_day,s.month_day,s.timezone_name,s.enabled,s.next_run_at,s.last_run_at,s.updated_at,
      COALESCE(d.dataset_name,p.pipeline_name) target_name
    FROM studio.scheduler_schedule s
    LEFT JOIN studio.dataset d ON s.target_type='STORED' AND d.dataset_id=s.target_id
    LEFT JOIN studio.pipeline p ON s.target_type='PIPELINE' AND p.pipeline_id=s.target_id
    WHERE s.created_by=@owner ORDER BY s.updated_at DESC,s.schedule_id
    FOR JSON PATH) items_json;
  RETURN;
 END;
 IF @action='History'
 BEGIN
  SELECT CAST(1 AS bit) success,'SCHEDULER_HISTORY' code,
   (SELECT TOP(150) CONVERT(varchar(36),e.event_id) event_id,CONVERT(varchar(36),s.schedule_id) schedule_id,
      s.schedule_name,s.target_type,COALESCE(d.dataset_name,p.pipeline_name) target_name,
      e.scheduled_at,e.attempt,e.result,CONVERT(varchar(36),e.run_id) run_id,e.created_at,
      COALESCE(dr.status,pr.status,e.result) status,COALESCE(dr.error_code,pr.error_code) error_code,
      COALESCE(dr.finished_at,pr.finished_at) finished_at
    FROM studio.scheduler_event e JOIN studio.scheduler_schedule s ON s.schedule_id=e.schedule_id
    LEFT JOIN studio.dataset d ON s.target_type='STORED' AND d.dataset_id=s.target_id
    LEFT JOIN studio.pipeline p ON s.target_type='PIPELINE' AND p.pipeline_id=s.target_id
    LEFT JOIN studio.dataset_ingest_run dr ON s.target_type='STORED' AND dr.run_id=e.run_id
    LEFT JOIN studio.pipeline_run pr ON s.target_type='PIPELINE' AND pr.run_id=e.run_id
    WHERE s.created_by=@owner ORDER BY e.created_at DESC,e.event_id DESC FOR JSON PATH) items_json;
  RETURN;
 END;
 IF @action='Save'
 BEGIN
  IF @name IS NULL OR LEN(@name)>150 OR @target IS NULL OR @enabled IS NULL OR
     @kind NOT IN ('STORED','PIPELINE') OR @freq NOT IN ('INTERVAL','DAILY','WEEKLY','MONTHLY') OR
     (@freq='INTERVAL' AND (@interval IS NULL OR @interval NOT BETWEEN 5 AND 10080)) OR
     (@freq<>'INTERVAL' AND (@clock IS NULL OR LEN(@clock)<>5 OR @clock NOT LIKE '[0-2][0-9]:[0-5][0-9]' OR LEFT(@clock,2)>'23')) OR
     (@freq='WEEKLY' AND (@weekday IS NULL OR @weekday NOT BETWEEN 1 AND 7)) OR
     (@freq='MONTHLY' AND (@monthday IS NULL OR @monthday NOT BETWEEN 1 AND 31)) OR
     (@kind='STORED' AND @ver IS NOT NULL) OR (@kind='PIPELINE' AND (@ver IS NULL OR @ver<1))
  BEGIN SELECT CAST(0 AS bit) success,'SCHEDULER_INPUT_INVALID' code; RETURN; END;
  IF (@kind='STORED' AND NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode='STORED' AND created_by=CONVERT(nvarchar(100),@owner))) OR
     (@kind='PIPELINE' AND NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id AND v.version=@ver WHERE p.pipeline_id=@target AND p.created_by=@owner AND JSON_QUERY(v.graph_json,'$.graph') IS NOT NULL))
  BEGIN SELECT CAST(0 AS bit) success,'SCHEDULER_TARGET_NOT_FOUND' code; RETURN; END;
  BEGIN TRY
   BEGIN TRANSACTION;
   IF @id IS NULL
   BEGIN
    IF (SELECT COUNT(*) FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE created_by=@owner)>=100
       THROW 52101,'SCHEDULER_LIMIT_REACHED',1;
    SET @id=NEWID();
    INSERT studio.scheduler_schedule(schedule_id,created_by,schedule_name,target_type,target_id,pipeline_version,frequency,interval_minutes,time_of_day,week_day,month_day,enabled,next_run_at)
    VALUES(@id,@owner,@name,@kind,@target,@ver,@freq,CASE WHEN @freq='INTERVAL' THEN @interval END,
       CASE WHEN @freq<>'INTERVAL' THEN @clock END,CASE WHEN @freq='WEEKLY' THEN @weekday END,CASE WHEN @freq='MONTHLY' THEN @monthday END,
       @enabled,CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtc(@freq,@interval,@clock,@weekday,@monthday,@now) END);
   END
   ELSE
   BEGIN
    IF NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE schedule_id=@id AND created_by=@owner)
        THROW 52102,'SCHEDULER_NOT_FOUND',1;
    UPDATE studio.scheduler_schedule SET schedule_name=@name,target_type=@kind,target_id=@target,pipeline_version=@ver,frequency=@freq,
       interval_minutes=CASE WHEN @freq='INTERVAL' THEN @interval END,
       time_of_day=CASE WHEN @freq<>'INTERVAL' THEN @clock END,
       week_day=CASE WHEN @freq='WEEKLY' THEN @weekday END,
       month_day=CASE WHEN @freq='MONTHLY' THEN @monthday END,
       enabled=@enabled,next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtc(@freq,@interval,@clock,@weekday,@monthday,@now) END,
       updated_at=@now WHERE schedule_id=@id AND created_by=@owner;
   END;
   COMMIT TRANSACTION;
   SELECT CAST(1 AS bit) success,'SCHEDULER_SAVED' code,CONVERT(varchar(36),@id) schedule_id;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=52101 THEN 'SCHEDULER_LIMIT_REACHED' WHEN ERROR_NUMBER()=52102 THEN 'SCHEDULER_NOT_FOUND' ELSE 'SCHEDULER_SAVE_FAILED' END code;
  END CATCH;
  RETURN;
 END;
 IF @action='Toggle'
 BEGIN
  IF @id IS NULL OR @enabled IS NULL
  BEGIN SELECT CAST(0 AS bit) success,'SCHEDULER_INPUT_INVALID' code; RETURN; END;
  UPDATE studio.scheduler_schedule SET enabled=@enabled,
    next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtc(frequency,interval_minutes,time_of_day,week_day,month_day,@now) END,
    updated_at=@now WHERE schedule_id=@id AND created_by=@owner;
  IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,'SCHEDULER_NOT_FOUND' code;
  ELSE SELECT CAST(1 AS bit) success,'SCHEDULER_UPDATED' code,CONVERT(varchar(36),@id) schedule_id;
  RETURN;
 END;
 SELECT CAST(0 AS bit) success,'SCHEDULER_ACTION_INVALID' code;
END;
GO
/* A single atomic scheduler tick creates at most one existing worker job.
   Two daemon instances cannot claim the same schedule: UPDLOCK + READPAST + transaction.
   Existing STORED and PIPELINE workers remain responsible for execution/completion.
   Missed slots are skipped, no catch-up storm. Busy targets are skipped and logged.
   No automatic retry in phase 3.1A; retry policy is a separate opt-in milestone.
*/
CREATE OR ALTER PROCEDURE studio.spSchedulerDispatch @Action varchar(10)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @Action<>'Tick' THROW 52110,'SCHEDULER_ACTION_INVALID',1;
 DECLARE @now datetime2(3)=SYSUTCDATETIME(),@id uniqueidentifier,@owner uniqueidentifier,@target uniqueidentifier,
         @kind varchar(12),@freq varchar(12),@interval int,@clock char(5),@weekday tinyint,@monthday tinyint,
         @ver int,@slot datetime2(3),@run uniqueidentifier,@result varchar(24),@bad bit=0;
 BEGIN TRY
  BEGIN TRANSACTION;
  SELECT TOP(1) @id=s.schedule_id,@owner=s.created_by,@target=s.target_id,@kind=s.target_type,@freq=s.frequency,
    @interval=s.interval_minutes,@clock=s.time_of_day,@weekday=s.week_day,@monthday=s.month_day,
    @ver=s.pipeline_version,@slot=s.next_run_at
  FROM studio.scheduler_schedule s WITH(UPDLOCK,READPAST,ROWLOCK)
  WHERE s.enabled=1 AND s.next_run_at<=@now ORDER BY s.next_run_at,s.schedule_id;
  IF @id IS NULL
  BEGIN COMMIT TRANSACTION; SELECT CAST(0 AS bit) has_event; RETURN; END;
  IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
      SET @bad=1;
  IF @kind='STORED'
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode='STORED' AND created_by=CONVERT(nvarchar(100),@owner)) SET @bad=1;
  END
  ELSE IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON p.pipeline_id=v.pipeline_id AND v.version=@ver
       WHERE p.pipeline_id=@target AND p.created_by=@owner AND JSON_QUERY(v.graph_json,'$.graph') IS NOT NULL) SET @bad=1;
  IF @bad=1 SET @result='SKIPPED_INVALID';
  ELSE IF @kind='STORED' AND EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH(UPDLOCK,HOLDLOCK)
       WHERE dataset_id=@target AND status IN ('QUEUED','RUNNING')) SET @result='SKIPPED_BUSY';
  ELSE IF @kind='PIPELINE' AND EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK)
       WHERE pipeline_id=@target AND status IN ('QUEUED','RUNNING')) SET @result='SKIPPED_BUSY';
  ELSE
  BEGIN
   SET @run=NEWID(); SET @result='QUEUED';
   IF @kind='STORED'
     INSERT studio.dataset_ingest_run(run_id,dataset_id,requested_by,request_id) VALUES(@run,@target,@owner,NEWID());
   ELSE
     INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@target,@ver,@owner,NEWID());
  END;
  INSERT studio.scheduler_event(schedule_id,scheduled_at,result,run_id) VALUES(@id,@slot,@result,@run);
  UPDATE studio.scheduler_schedule SET next_run_at=CASE WHEN @bad=1 THEN NULL ELSE studio.fnSchedulerNextUtc(@freq,@interval,@clock,@weekday,@monthday,@now) END,
   enabled=CASE WHEN @bad=1 THEN 0 ELSE enabled END,
   last_run_at=@now,updated_at=@now WHERE schedule_id=@id;
  COMMIT TRANSACTION;
  SELECT CAST(1 AS bit) has_event,CONVERT(varchar(36),@id) schedule_id,
   @result result,CONVERT(varchar(36),@run) run_id;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW 52111,'SCHEDULER_DISPATCH_FAILED',1;
 END CATCH;
END;
GO
/* Read-only installation verification */
SELECT OBJECT_ID('studio.scheduler_schedule','U') schedules,
 OBJECT_ID('studio.scheduler_event','U') events,
 OBJECT_ID('studio.spSchedulerControl','P') control_proc,
 OBJECT_ID('studio.spSchedulerDispatch','P') dispatch_proc;
GO
