/* Read-only functional smoke test in CoreAnalytics DEVELOPMENT after migration 021. */
USE [CoreAnalytics];
GO
SELECT OBJECT_ID('studio.scheduler_schedule','U') schedules_table,
       OBJECT_ID('studio.scheduler_event','U') history_table,
       OBJECT_ID('studio.spSchedulerControl','P') control_procedure,
       OBJECT_ID('studio.spSchedulerDispatch','P') dispatch_procedure,
       OBJECT_ID('studio.fnSchedulerNextUtc','FN') recurrence_function;
GO
SELECT studio.fnSchedulerNextUtc('DAILY',NULL,'07:00',NULL,NULL,CONVERT(datetime2(3),'2026-11-11T00:00:00')) next_daily_utc,
       studio.fnSchedulerNextUtc('WEEKLY',NULL,'08:00',1,NULL,CONVERT(datetime2(3),'2026-11-11T00:00:00')) next_monday_utc,
       studio.fnSchedulerNextUtc('MONTHLY',NULL,'09:00',NULL,31,CONVERT(datetime2(3),'2026-02-01T00:00:00')) february_month_end_utc,
       studio.fnSchedulerNextUtc('INTERVAL',15,NULL,NULL,NULL,CONVERT(datetime2(3),'2026-11-11T00:00:00')) next_interval_utc;
GO
