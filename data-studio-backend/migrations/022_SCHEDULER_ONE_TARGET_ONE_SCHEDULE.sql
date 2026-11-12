/* Phase 3.1B: one schedule per owner + work target.
   A pipeline's Parquet output versions all point to the same pipeline_id.
   Apply manually in DEVELOPMENT CoreAnalytics database after migration 021.
   Does not delete or merge existing schedules; aborts safely on duplicates.
*/
SET XACT_ABORT ON;
IF OBJECT_ID(N'studio.scheduler_schedule',N'U') IS NULL
    THROW 52130, 'Run migration 021 before 022; nothing changed.', 1;

IF EXISTS (
  SELECT 1 FROM studio.scheduler_schedule
  GROUP BY created_by,target_type,target_id
  HAVING COUNT_BIG(*)>1
)
BEGIN
    SELECT created_by,target_type,target_id,COUNT_BIG(*) AS existing_schedule_count
    FROM studio.scheduler_schedule
    GROUP BY created_by,target_type,target_id
    HAVING COUNT_BIG(*)>1;
    THROW 52131,'Duplicate schedules exist for the same target. Review them manually before applying 022; nothing changed.',1;
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id=OBJECT_ID(N'studio.scheduler_schedule')
      AND name=N'UX_sched_owner_target'
)
BEGIN
    CREATE UNIQUE INDEX UX_sched_owner_target
    ON studio.scheduler_schedule(created_by,target_type,target_id);
END
ELSE IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id=OBJECT_ID(N'studio.scheduler_schedule')
      AND name=N'UX_sched_owner_target' AND is_unique=1
)
    THROW 52132,'An index named UX_sched_owner_target already exists but is not unique.',1;

SELECT 'Scheduler one-target-one-schedule guard installed' AS result;
