/* READ-ONLY DEV inventory: run on the SOURCE SQL Server as an administrator
   allowed to impersonate CoreAnalytics_QueryReader_Dev. This script does not
   execute user SQL, change permissions, or read source-table rows.

   It inventories effective permissions visible to the restricted identity in
   BI, master, msdb and tempdb. Metadata visibility may hide objects; an empty
   list is NOT proof of safety. Review public/guest, signed modules, functions,
   ownership chains, linked servers, external access and cross-db access before
   enabling general SQL. Output may contain sensitive database/object names. */
USE [BI];
SET NOCOUNT ON;
IF @@TRANCOUNT<>0 THROW 53300,'RUN_WITHOUT_OPEN_TRANSACTION',1;
DECLARE @login sysname=N'CoreAnalytics_QueryReader_Dev', @cookie varbinary(8000),
        @db sysname, @sql nvarchar(max), @info xml, @item xml, @linked xml;
IF SUSER_ID(@login) IS NULL THROW 53301,'QUERY_READER_NOT_FOUND',1;
SET @linked=(SELECT name AS [name],product AS [product],is_linked AS [is_linked]
            FROM sys.servers WHERE is_linked=1 ORDER BY name FOR XML PATH('server'),TYPE);
DECLARE @audit TABLE(db_name sysname NOT NULL, has_access int NULL, info xml NULL);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR
 SELECT name FROM sys.databases WHERE name IN (N'BI',N'master',N'msdb',N'tempdb') AND state=0;
OPEN c;
EXECUTE AS LOGIN=@login WITH COOKIE INTO @cookie;
BEGIN TRY
 FETCH NEXT FROM c INTO @db;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @info=NULL;
  IF HAS_DBACCESS(@db)=1
  BEGIN
   SET @sql=N'USE '+QUOTENAME(@db)+N';
    SELECT @result=(SELECT DB_NAME() AS [database_name],USER_NAME() AS [database_user],
      (SELECT permission_name AS [permission] FROM sys.fn_my_permissions(NULL,''DATABASE'')
       ORDER BY permission_name FOR XML PATH(''item''),TYPE) AS [database_permissions],
      (SELECT COUNT_BIG(*) FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
       WHERE o.type IN (''U'',''V'',''P'',''PC'',''FN'',''FS'',''FT'',''IF'',''TF'') AND
        (HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''INSERT'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''UPDATE'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''DELETE'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''ALTER'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''CONTROL'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''EXECUTE'')=1)) AS [visible_risky_object_count],
      (SELECT TOP(200) s.name AS [schema_name],o.name AS [object_name],o.type_desc AS [type],
        HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''INSERT'') AS [can_insert],
        HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''UPDATE'') AS [can_update],
        HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''DELETE'') AS [can_delete],
        HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''ALTER'') AS [can_alter],
        HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''CONTROL'') AS [can_control],
        HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''EXECUTE'') AS [can_execute]
       FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
       WHERE o.type IN (''U'',''V'',''P'',''PC'',''FN'',''FS'',''FT'',''IF'',''TF'') AND
        (HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''INSERT'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''UPDATE'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''DELETE'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''ALTER'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''CONTROL'')=1 OR
         HAS_PERMS_BY_NAME(QUOTENAME(s.name)+''.''+QUOTENAME(o.name),''OBJECT'',''EXECUTE'')=1)
       ORDER BY s.name,o.name FOR XML PATH(''object''),TYPE) AS [visible_risky_objects]
      FOR XML PATH(''details''),TYPE);';
   EXEC sys.sp_executesql @sql,N'@result xml OUTPUT',@result=@info OUTPUT;
  END;
  INSERT @audit(db_name,has_access,info) VALUES(@db,HAS_DBACCESS(@db),@info);
  FETCH NEXT FROM c INTO @db;
 END;
 REVERT WITH COOKIE=@cookie;
END TRY
BEGIN CATCH
 IF SUSER_SNAME()=@login REVERT WITH COOKIE=@cookie;
 CLOSE c; DEALLOCATE c;
 THROW;
END CATCH;
CLOSE c; DEALLOCATE c;
SELECT (SELECT @login AS [execution_login],200 AS [object_list_limit],
 (SELECT db_name AS [name],has_access,info FROM @audit ORDER BY db_name FOR XML PATH('database'),TYPE) AS [databases],
 @linked AS [linked_servers],N'REVIEW_REQUIRED_NOT_PROOF_OF_SAFETY' AS [assessment]
 FOR XML PATH('query_reachable_db_audit'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
