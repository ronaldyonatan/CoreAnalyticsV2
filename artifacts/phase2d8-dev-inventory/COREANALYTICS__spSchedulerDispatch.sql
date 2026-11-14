CREATE   PROCEDURE studio.spSchedulerDispatch @Action varchar(10)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @Action<>'Tick' THROW 52110,'SCHEDULER_ACTION_INVALID',1;
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
  UPDATE studio.scheduler_schedule SET next_run_at=CASE WHEN @bad=1 THEN NULL ELSE studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,
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