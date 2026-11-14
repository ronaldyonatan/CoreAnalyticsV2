/* READ-ONLY SQL Server source account inspection.
   Connect to the SOURCE SQL Server using the exact login configured for the
   proposed query Dataset, then select the source database before execution.
   This is NOT a privilege grant, enforcement mechanism or proof of safety.
   Review the XML before sharing: it includes the source login, database and
   effective server/database permission names. No table data or credentials.
   Database/object-level permissions, ownership chaining, impersonation,
   linked servers and other databases require separate review. */
SET NOCOUNT ON;

SELECT (
    SELECT DB_NAME() AS [database_name],
           ORIGINAL_LOGIN() AS [original_login],
           SUSER_SNAME() AS [effective_login],
           USER_NAME() AS [database_user],
           CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [captured_at_utc],
           IS_SRVROLEMEMBER(N'sysadmin') AS [is_sysadmin],
           IS_ROLEMEMBER(N'db_owner') AS [is_db_owner],
           IS_ROLEMEMBER(N'db_datawriter') AS [is_db_datawriter],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'CONTROL') AS [database_control],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'ALTER') AS [database_alter],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'INSERT') AS [database_insert],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'UPDATE') AS [database_update],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'DELETE') AS [database_delete],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'EXECUTE') AS [database_execute],
           HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'CREATE TABLE') AS [database_create_table],
           N'REVIEW_REQUIRED_NOT_PROOF_OF_READ_ONLY' AS [assessment],
           (SELECT permission_name AS [permission]
            FROM sys.fn_my_permissions(NULL,N'SERVER')
            ORDER BY permission_name FOR XML PATH('item'), TYPE) AS [effective_server_permissions],
           (SELECT permission_name AS [permission]
            FROM sys.fn_my_permissions(NULL,N'DATABASE')
            ORDER BY permission_name FOR XML PATH('item'), TYPE) AS [effective_database_permissions]
    FOR XML PATH('query_source_permission_check'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
