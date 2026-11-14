/* PEMERIKSAAN SAJA: login khusus read-only harus sudah dibuat di server sumber.
   File ini TIDAK membuat login. Jangan mengganti placeholder dengan sa.
   Jika belum ada login khusus, tunggu skrip penyiapannya dan penentuan objek
   yang boleh dibaca sebelum menjalankan file ini.

   READ-ONLY review of a pre-provisioned SQL Server execution login.
   1. Connect to the SOURCE DEV server. This example selects database BI.
   2. Uses CoreAnalytics_QueryReader_Dev after the DEV setup script succeeds.
   3. Run in DEV first; save the single XML output.
   Requires permission to impersonate that login. Does not create any login,
   grant access, execute a user query or modify data.

   IMPORTANT: the output is only an initial assessment. Object-level grants,
   executable modules/functions, ownership chaining, impersonation, linked
   servers and access to every other reachable database require separate audit.
   An apparently clean result does not establish that a login is read-only.
   Before sharing, inspect XML for source login and database names. */
USE [BI];
SET NOCOUNT ON;
DECLARE @login sysname=N'CoreAnalytics_QueryReader_Dev';
IF @login IS NULL
    THROW 53120,'LOGIN_TERBATAS_BELUM_DIISI_JANGAN_GUNAKAN_SA',1;
IF LOWER(@login) IN (N'sa',N'dbo') OR SUSER_ID(@login) IS NULL
    THROW 53121,'EXECUTION_LOGIN_INVALID_OR_NOT_VISIBLE',1;

DECLARE @cookie varbinary(8000), @actual sysname, @database sysname,
        @sysadmin int, @owner int, @control int, @alter int,
        @insert int, @update int, @delete int, @execute int;
EXECUTE AS LOGIN=@login WITH COOKIE INTO @cookie;
BEGIN TRY
    SELECT @actual=SUSER_SNAME(), @database=DB_NAME(),
           @sysadmin=IS_SRVROLEMEMBER(N'sysadmin'), @owner=IS_ROLEMEMBER(N'db_owner'),
           @control=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'CONTROL'),
           @alter=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'ALTER'),
           @insert=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'INSERT'),
           @update=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'UPDATE'),
           @delete=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'DELETE'),
           @execute=HAS_PERMS_BY_NAME(NULL,N'DATABASE',N'EXECUTE');
    REVERT WITH COOKIE=@cookie;
END TRY
BEGIN CATCH
    REVERT WITH COOKIE=@cookie;
    THROW;
END CATCH;

SELECT (
    SELECT @database AS [database_name],@actual AS [execution_login],
           @sysadmin AS [is_sysadmin],@owner AS [is_db_owner],
           @control AS [database_control],@alter AS [database_alter],
           @insert AS [database_insert],@update AS [database_update],
           @delete AS [database_delete],@execute AS [database_execute],
           N'OBJECT_AND_CROSS_DATABASE_ACCESS_REVIEW_REQUIRED' AS [assessment]
    FOR XML PATH('query_execution_identity_review'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
