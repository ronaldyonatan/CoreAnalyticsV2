/* Safe nonce cleanup: older than 5 minutes; run periodically under DBA control. */
USE [CoreAnalytics];
GO
DELETE FROM studio.object_access_rpc_nonce
WHERE used_at_utc < DATEADD(MINUTE,-5,SYSUTCDATETIME());
GO
