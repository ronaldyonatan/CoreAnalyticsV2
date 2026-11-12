/* Read-only recurrence smoke tests. CoreAnalytics DEVELOPMENT only; after 023. */
USE [CoreAnalytics];
GO
SELECT 'multi_weekday_M_W_F' AS test_case,
       studio.fnSchedulerNextUtcEx('WEEKLY',NULL,'08:00',1,NULL,CAST('2026-11-11T04:00:00' AS datetime2(3)),21,NULL) AS calculated_utc,
       CAST('2026-11-13T01:00:00' AS datetime2(3)) AS expected_utc;
SELECT 'daily_6h_anchor_02' AS test_case,
       studio.fnSchedulerNextUtcEx('DAILY',NULL,'02:00',NULL,NULL,CAST('2026-11-11T03:00:00' AS datetime2(3)),NULL,360) AS calculated_utc,
       CAST('2026-11-11T07:00:00' AS datetime2(3)) AS expected_utc;
SELECT 'daily_30m_anchor_09' AS test_case,
       studio.fnSchedulerNextUtcEx('DAILY',NULL,'09:00',NULL,NULL,CAST('2026-11-11T03:13:00' AS datetime2(3)),NULL,30) AS calculated_utc,
       CAST('2026-11-11T03:30:00' AS datetime2(3)) AS expected_utc;
GO
