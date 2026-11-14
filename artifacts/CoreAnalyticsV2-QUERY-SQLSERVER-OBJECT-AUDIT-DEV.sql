/* DEV READ-ONLY security inventory for CoreAnalytics_QueryReader_Dev.
   Run on the SOURCE SQL Server, as an administrator allowed to impersonate
   the restricted login. Does not execute source data queries or change any
   data, grants, logins or objects. It tests whether a bare REVERT is blocked.

   This is evidence for review, not proof that arbitrary SQL is safe. Review
   permissions in every reachable DB, public/guest, ownership chains, signed
   modules, functions, linked servers, impersonation and external access.
   Metadata visibility limits the objects shown. Review XML before sharing. */
USE [BI];
SET NOCOUNT ON;
IF @@TRANCOUNT<>0 THROW 53140,'RUN_WITHOUT_OPEN_TRANSACTION',1;
DECLARE @login sysname=N'CoreAnalytics_QueryReader_Dev',
        @cookie varbinary(8000),@object_select int,@object_insert int,
        @object_update int,@object_delete int,@object_alter int,@object_control int,
        @bare_revert_blocked bit=0,@bare_revert_error int=NULL,
        @actual_login sysname,@db_access xml,@object_permissions xml,@server_permissions xml;
IF SUSER_ID(@login) IS NULL OR LOWER(@login) IN (N'sa',N'dbo')
    THROW 53141,'QUERY_EXECUTION_LOGIN_NOT_FOUND_OR_INVALID',1;
IF OBJECT_ID(N'dbo.BI_DailyTracking',N'U') IS NULL AND OBJECT_ID(N'dbo.BI_DailyTracking',N'V') IS NULL
    THROW 53142,'SOURCE_OBJECT_NOT_FOUND_OR_NOT_VISIBLE',1;

DECLARE @databases TABLE(name sysname NOT NULL PRIMARY KEY);
INSERT @databases(name) SELECT name FROM sys.databases WHERE state=0;

EXECUTE AS LOGIN=@login WITH COOKIE INTO @cookie;
BEGIN TRY
    SELECT @actual_login=SUSER_SNAME(),
           @object_select=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'SELECT'),
           @object_insert=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'INSERT'),
           @object_update=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'UPDATE'),
           @object_delete=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'DELETE'),
           @object_alter=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'ALTER'),
           @object_control=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'CONTROL');
    SET @db_access=(SELECT name AS [name],HAS_DBACCESS(name) AS [has_access]
                    FROM @databases ORDER BY name FOR XML PATH('database'),TYPE);
    SET @object_permissions=(
        SELECT TOP (300) s.name AS [schema_name],o.name AS [object_name],o.type_desc AS [type],
          HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'INSERT') AS [can_insert],
          HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'UPDATE') AS [can_update],
          HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'DELETE') AS [can_delete],
          HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'ALTER') AS [can_alter],
          HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'CONTROL') AS [can_control],
          CASE WHEN o.type IN ('P','FN','IF','TF') THEN
            HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'EXECUTE') END AS [can_execute]
        FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
        WHERE o.is_ms_shipped=0 AND o.type IN ('U','V','P','FN','IF','TF')
          AND (HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'INSERT')=1
            OR HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'UPDATE')=1
            OR HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'DELETE')=1
            OR HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'ALTER')=1
            OR HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'CONTROL')=1
            OR (o.type IN ('P','FN','IF','TF') AND HAS_PERMS_BY_NAME(QUOTENAME(s.name)+N'.'+QUOTENAME(o.name),N'OBJECT',N'EXECUTE')=1))
        ORDER BY s.name,o.name FOR XML PATH('object'),TYPE);
    SET @server_permissions=(SELECT permission_name AS [permission]
      FROM sys.fn_my_permissions(NULL,N'SERVER') ORDER BY permission_name FOR XML PATH('item'),TYPE);

    /* Nested query cannot access the cookie declared in this batch. */
    BEGIN TRY
        EXEC sys.sp_executesql N'REVERT;';
    END TRY
    BEGIN CATCH
        SET @bare_revert_error=ERROR_NUMBER();
        /* Other failures (for example missing EXECUTE permission) do not
           establish that the cookie prevented REVERT. */
        IF @bare_revert_error IN (15196,15589,15591) SET @bare_revert_blocked=1;
    END CATCH;
    IF SUSER_SNAME()<>@login
        THROW 53143,'IDENTITY_CHANGED_DURING_REVERT_TEST',1;
    REVERT WITH COOKIE=@cookie;
END TRY
BEGIN CATCH
    IF SUSER_SNAME()=@login REVERT WITH COOKIE=@cookie;
    THROW;
END CATCH;

SELECT (
 SELECT DB_NAME() AS [database_name],@actual_login AS [execution_login],
   N'dbo.BI_DailyTracking' AS [object_name],
   @object_select AS [object_select],@object_insert AS [object_insert],
   @object_update AS [object_update],@object_delete AS [object_delete],
   @object_alter AS [object_alter],@object_control AS [object_control],
   @bare_revert_blocked AS [bare_revert_blocked],@bare_revert_error AS [bare_revert_error],
   @db_access AS [database_access],@object_permissions AS [visible_objects_with_write_control_or_execute],
   @server_permissions AS [effective_server_permissions],
   300 AS [object_report_limit],
   N'ADDITIONAL_SECURITY_REVIEW_REQUIRED' AS [assessment]
 FOR XML PATH('query_identity_object_audit'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
