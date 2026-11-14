/* KANDIDAT DEV: siapkan login eksekusi query untuk BI.dbo.BI_DailyTracking.
   Tinjau dan jalankan hanya pada SQL Server sumber DEV yang benar.

   Membuat login/user baru CoreAnalytics_QueryReader_Dev dan memberikan
   SELECT eksplisit hanya pada BI.dbo.BI_DailyTracking. Tidak mengubah sa.
   Password acak dibuat di server dan tidak ditampilkan; audit/tracing SQL
   dapat mencatat statement administratif, jadi batasi akses ke log.

   Script berhenti jika login/user sudah ada atau objek tidak terlihat.
   Hak turunan dari public, guest, objek lain, executable modules, dan semua
   database lain tetap harus diaudit. Sukses BUKAN bukti login aman.
   Belum mengaktifkan Query Dataset; pengujian keamanan/integrasi diperlukan.
   Membutuhkan hak CREATE LOGIN, CREATE USER, dan GRANT SELECT pada objek.
   Akun connection selain sa mungkin perlu izin IMPERSONATE secara terpisah;
   script ini tidak memberikan izin tersebut secara otomatis.
*/
USE [BI];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53130,'RUN_WITHOUT_OPEN_TRANSACTION',1;
IF DB_NAME()<>N'BI' THROW 53131,'BI_DATABASE_REQUIRED',1;
IF OBJECT_ID(N'dbo.BI_DailyTracking',N'U') IS NULL
   AND OBJECT_ID(N'dbo.BI_DailyTracking',N'V') IS NULL
    THROW 53132,'BI_DBO_BI_DAILYTRACKING_NOT_FOUND_OR_NOT_VISIBLE',1;

DECLARE @login sysname=N'CoreAnalytics_QueryReader_Dev',
        @password nvarchar(100), @statement nvarchar(max);
IF EXISTS(SELECT 1 FROM sys.server_principals WHERE name=@login)
   OR EXISTS(SELECT 1 FROM sys.database_principals WHERE name=@login)
    THROW 53133,'QUERY_READER_ALREADY_EXISTS_REVIEW_MANUALLY',1;

BEGIN TRY
    BEGIN TRANSACTION;
    SET @password=N'Aa1!'+CONVERT(nvarchar(64),CRYPT_GEN_RANDOM(32),2);
    SET @statement=N'CREATE LOGIN '+QUOTENAME(@login)+N' WITH PASSWORD = '
                  +QUOTENAME(@password,'''')+N', CHECK_POLICY = ON, CHECK_EXPIRATION = OFF';
    EXEC sys.sp_executesql @statement;
    SET @statement=N'CREATE USER '+QUOTENAME(@login)+N' FOR LOGIN '+QUOTENAME(@login);
    EXEC sys.sp_executesql @statement;
    SET @statement=N'GRANT SELECT ON OBJECT::[dbo].[BI_DailyTracking] TO '+QUOTENAME(@login);
    EXEC sys.sp_executesql @statement;
    SET @password=NULL; SET @statement=NULL;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    SET @password=NULL; SET @statement=NULL;
    IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT (
    SELECT DB_NAME() AS [database_name], @login AS [execution_login],
           N'dbo.BI_DailyTracking' AS [explicit_select_object],
           N'LOGIN_CREATED_AUDIT_AND_INTEGRATION_TESTS_REQUIRED' AS [status],
           CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [created_at_utc]
    FOR XML PATH('query_reader_setup'),TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
