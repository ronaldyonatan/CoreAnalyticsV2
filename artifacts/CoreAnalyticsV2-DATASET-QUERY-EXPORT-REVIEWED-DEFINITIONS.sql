/* Dataset query-source preparation: READ ONLY, DEV only.
   Exports the exact current definitions needed to review dataset creation.
   Preconditions: the objects must still match the 2026-11-13 preflight hashes.
   One XML result; inspect the contents for sensitive literals before sharing.
   No database objects, permissions, keys or data are modified.
   This is NOT an installer and does not enable query datasets. */
USE [CoreAnalytics];
SET NOCOUNT ON;

IF DB_ID(N'BI') IS NULL THROW 53101, 'BI_DATABASE_REQUIRED', 1;
DECLARE @stored nvarchar(max)=OBJECT_DEFINITION(OBJECT_ID(N'studio.spStoredDatasetCreate',N'P')),
        @gateway nvarchar(max),
        @stored_hash varchar(64), @gateway_hash varchar(64);

SELECT @gateway=m.definition
FROM BI.sys.sql_modules m
JOIN BI.sys.objects o ON o.object_id=m.object_id
JOIN BI.sys.schemas s ON s.schema_id=o.schema_id
WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';

IF @stored IS NULL OR @gateway IS NULL THROW 53102, 'DEFINITION_MISSING_OR_NOT_VISIBLE', 1;
SET @stored_hash=CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@stored)),2);
SET @gateway_hash=CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@gateway)),2);
IF @stored_hash<>'CBE6D0E1ACB9C9B9A80C868189FE2E673897488C3809786724AFC9847948FBB6'
   OR @gateway_hash<>'D6E5A2CD61E081132FCAA1183EF9FBAB3F7AA00D5565DE08E39EDA5184ED022E'
    THROW 53103, 'DEFINITION_CHANGED_SINCE_PREFLIGHT_REVIEW_FIRST', 1;

SELECT (
    SELECT DB_NAME() AS [database_name],
           CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [captured_at_utc],
           (SELECT N'CoreAnalytics.studio.spStoredDatasetCreate' AS [name],
                   @stored_hash AS [definition_sha256], @stored AS [definition]
            FOR XML PATH('module'), TYPE),
           (SELECT N'BI.dbo.spDashboard' AS [name],
                   @gateway_hash AS [definition_sha256], @gateway AS [definition]
            FOR XML PATH('module'), TYPE)
    FOR XML PATH('dataset_query_definitions'), TYPE
) AS [OPEN_AND_SAVE_THIS_XML];
