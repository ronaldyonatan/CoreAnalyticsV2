CREATE OR ALTER FUNCTION studio.fnStudioScheduleAccess(@actor uniqueidentifier,@id uniqueidentifier)
RETURNS int AS BEGIN
 DECLARE @level int=studio.fnStudioAccessLevel(@actor,'SCHEDULE',@id),@target uniqueidentifier,@kind varchar(12),@targetLevel int;
 IF @level=30 RETURN 30;
 SELECT @target=target_id,@kind=target_type FROM studio.scheduler_schedule WITH(HOLDLOCK) WHERE schedule_id=@id;
 SET @targetLevel=studio.fnStudioAccessLevel(@actor,CASE WHEN @kind='STORED' THEN 'DATASET' WHEN @kind='PIPELINE' THEN 'PIPELINE' ELSE '' END,@target);
 IF @targetLevel>=20 RETURN 20;
 RETURN @level;
END;