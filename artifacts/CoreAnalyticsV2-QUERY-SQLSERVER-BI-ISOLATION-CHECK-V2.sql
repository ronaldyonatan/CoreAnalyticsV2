/* READ-ONLY DEV diagnostic. Run on the same source server in a fresh session.
   Tests database-user impersonation against two distinct cross-database
   operations. No permissions, mappings or data are changed; no linked server
   is contacted. sysjobs is compiled using TOP(0), so no job rows are read.
   Results do not establish that arbitrary SQL or linked servers are safe. */
USE [BI];
SET NOCOUNT ON;
IF @@TRANCOUNT<>0 THROW 53340,'RUN_WITHOUT_OPEN_TRANSACTION',1;
DECLARE @user sysname=N'CoreAnalytics_QueryReader_Dev',@cookie varbinary(8000),
 @initial_user sysname,@after_user sysname,@after_database sysname,
 @switch_succeeded bit=0,@switch_database sysname=NULL,@switch_error int=NULL,
 @object_query_succeeded bit=0,@object_error int=NULL;
IF USER_ID(@user) IS NULL THROW 53341,'BI_RESTRICTED_USER_NOT_FOUND',1;
IF OBJECT_ID(N'msdb.dbo.sysjobs',N'U') IS NULL THROW 53342,'MSDB_SYSJOBS_NOT_VISIBLE',1;
EXECUTE AS USER=@user WITH COOKIE INTO @cookie;
BEGIN TRY
 SET @initial_user=USER_NAME();
 BEGIN TRY
  EXEC sys.sp_executesql N'USE [msdb]; SELECT @db=DB_NAME();',
      N'@db sysname OUTPUT',@db=@switch_database OUTPUT;
  SET @switch_succeeded=1;
 END TRY
 BEGIN CATCH
  SET @switch_error=ERROR_NUMBER();
 END CATCH;
 BEGIN TRY
  EXEC sys.sp_executesql N'DECLARE @x uniqueidentifier; SELECT TOP(0) @x=job_id FROM [msdb].[dbo].[sysjobs];';
  SET @object_query_succeeded=1;
 END TRY
 BEGIN CATCH
  SET @object_error=ERROR_NUMBER();
 END CATCH;
 SELECT @after_user=USER_NAME(),@after_database=DB_NAME();
 IF @after_user<>@user OR @after_database<>N'BI' THROW 53343,'EXECUTION_CONTEXT_CHANGED',1;
 REVERT WITH COOKIE=@cookie;
END TRY
BEGIN CATCH
 IF USER_NAME()=@user REVERT WITH COOKIE=@cookie;
 THROW;
END CATCH;
SELECT (SELECT @initial_user AS [execution_user],@after_user AS [execution_user_after_tests],
 @after_database AS [database_after_tests],@switch_succeeded AS [use_msdb_succeeded],
 @switch_database AS [database_seen_after_use],@switch_error AS [use_msdb_error],
 @object_query_succeeded AS [msdb_sysjobs_query_succeeded],@object_error AS [msdb_sysjobs_query_error],
 N'LINKED_SERVER_ACCESS_NOT_TESTED' AS [assessment]
 FOR XML PATH('query_bi_isolation_check_v2'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
