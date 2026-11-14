/* READ-ONLY DEV TEST. Run on the SOURCE SQL Server, in a fresh session as an
   administrator who can impersonate BI's CoreAnalytics_QueryReader_Dev user.
   No permissions, objects, linked-server mappings or data are changed.
   Reads at most one source row but returns only a presence bit. The fixed
   cross-database test reads msdb metadata only if isolation unexpectedly fails.
   No linked server is contacted. Results are evidence, not a security proof.

   This tests a possible BI-only first release. It does not install or enable
   the query feature; its application's guard still uses a LOGIN context. */
USE [BI];
SET NOCOUNT ON;
IF @@TRANCOUNT<>0 THROW 53330,'RUN_WITHOUT_OPEN_TRANSACTION',1;
DECLARE @user sysname=N'CoreAnalytics_QueryReader_Dev', @cookie varbinary(8000),
 @actual_user sysname, @has_row bit=0, @can_select int, @can_insert int,
 @can_update int, @can_delete int, @can_control int, @db_control int,
 @db_alter int, @msdb_accessed bit=0, @msdb_error int=NULL,
 @bare_revert_blocked bit=0, @bare_revert_error int=NULL;
IF USER_ID(@user) IS NULL THROW 53331,'BI_RESTRICTED_USER_NOT_FOUND',1;
IF OBJECT_ID(N'dbo.BI_DailyTracking',N'U') IS NULL AND OBJECT_ID(N'dbo.BI_DailyTracking',N'V') IS NULL
 THROW 53332,'BI_SOURCE_OBJECT_NOT_FOUND',1;
EXECUTE AS USER=@user WITH COOKIE INTO @cookie;
BEGIN TRY
 SELECT @actual_user=USER_NAME(),
  @can_select=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'SELECT'),
  @can_insert=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'INSERT'),
  @can_update=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'UPDATE'),
  @can_delete=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'DELETE'),
  @can_control=HAS_PERMS_BY_NAME(N'dbo.BI_DailyTracking',N'OBJECT',N'CONTROL'),
  @db_control=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'CONTROL'),
  @db_alter=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'ALTER');
 IF @actual_user<>@user THROW 53333,'UNEXPECTED_EXECUTION_USER',1;
 SELECT TOP(1) @has_row=1 FROM dbo.BI_DailyTracking;
 BEGIN TRY
  /* Dynamic SQL makes cross-database permission errors catchable. */
  EXEC sys.sp_executesql N'SELECT TOP(1) @found=1 FROM msdb.sys.objects;',
       N'@found bit OUTPUT',@found=@msdb_accessed OUTPUT;
  /* Success even with zero objects means the query was not blocked. */
  SET @msdb_accessed=1;
 END TRY
 BEGIN CATCH
  SET @msdb_error=ERROR_NUMBER();
 END CATCH;
 BEGIN TRY
  EXEC sys.sp_executesql N'REVERT;';
 END TRY
 BEGIN CATCH
  SET @bare_revert_error=ERROR_NUMBER();
  IF @bare_revert_error IN (15196,15589,15591) SET @bare_revert_blocked=1;
 END CATCH;
 IF USER_NAME()<>@user THROW 53334,'EXECUTION_USER_CHANGED',1;
 REVERT WITH COOKIE=@cookie;
END TRY
BEGIN CATCH
 IF USER_NAME()=@user REVERT WITH COOKIE=@cookie;
 THROW;
END CATCH;
SELECT (SELECT N'BI' AS [database_name],@actual_user AS [execution_user],
 @has_row AS [source_has_row],@can_select AS [source_select],
 @can_insert AS [source_insert],@can_update AS [source_update],@can_delete AS [source_delete],
 @can_control AS [source_control],@db_control AS [database_control],@db_alter AS [database_alter],
 @msdb_accessed AS [cross_database_query_succeeded],@msdb_error AS [cross_database_error],
 @bare_revert_blocked AS [bare_revert_blocked],@bare_revert_error AS [bare_revert_error],
 N'DEV_EVIDENCE_ONLY_LINKED_SERVERS_NOT_TESTED' AS [assessment]
 FOR XML PATH('query_bi_user_isolation_test'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
