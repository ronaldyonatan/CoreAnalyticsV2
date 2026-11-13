USE [CoreAnalytics];
GO
SELECT name,type_desc FROM sys.objects WHERE object_id IN
(
    OBJECT_ID(N'studio.spObjectAccessControlV2'),
    OBJECT_ID(N'studio.object_access_admin_group')
);
SELECT COUNT_BIG(*) AS registered_objects FROM studio.object_ownership;
SELECT COUNT_BIG(*) AS shared_permissions FROM studio.object_access;
SELECT COUNT_BIG(*) AS audit_events FROM studio.object_access_audit;
SELECT COUNT_BIG(*) AS explicitly_configured_admin_groups FROM studio.object_access_admin_group;
SELECT group_id,group_code,group_name,is_active
FROM dbo.core_group
ORDER BY group_code;
GO
