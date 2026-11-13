/* Safe rollback: disable the new gateway. Preserves audit, shares and all old modes. */
USE [CoreAnalytics];
GO
IF OBJECT_ID('studio.object_access_rpc_key','U') IS NOT NULL
    UPDATE studio.object_access_rpc_key SET enabled=0 WHERE key_id=1;
GO
/* To restore dbo.spDashboard, run the supplied spDashboard_ROLLBACK_BASELINE.sql
   in its owning database (ONLY if no other changes since patch). */
