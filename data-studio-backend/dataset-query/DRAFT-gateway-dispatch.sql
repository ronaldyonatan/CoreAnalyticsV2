/* DRAFT ONLY — DO NOT EXECUTE OR INSTALL.
   Candidate BI gateway dispatch for signed Dataset Query metadata.
   This draft is not a complete installer. It requires reviewed RPC/table
   installation, permission review, rollback, and full worker safety tests.
   The pinned hash is from the user's 2026-11-13 DEV inventory; any drift
   fails closed and must be reviewed. Never bypass the hash guard.
*/
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53220,'RUN_WITHOUT_OPEN_TRANSACTION',1;
IF DB_ID(N'BI') IS NULL OR OBJECT_ID(N'studio.spDatasetQueryRpc',N'P') IS NULL
    THROW 53221,'DATASET_QUERY_PREREQUISITES_REQUIRED',1;

DECLARE @before nvarchar(max),@after nvarchar(max),@statement nvarchar(max),
        @declaration int,@marker int,
        @needle nvarchar(128)=N'IF @Mode = ''CoreStudioObjectAccess''',
        @insert nvarchar(max)=N'IF @Mode = ''CoreStudioDatasetQuery'' BEGIN EXEC [CoreAnalytics].studio.spDatasetQueryRpc @Payload=@Payload; RETURN; END;'+CHAR(10);
SELECT @before=m.definition FROM BI.sys.sql_modules m
JOIN BI.sys.objects o ON o.object_id=m.object_id
JOIN BI.sys.schemas s ON s.schema_id=o.schema_id
WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
IF @before IS NULL THROW 53222,'GATEWAY_DEFINITION_NOT_VISIBLE',1;
IF CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@before)),2)
    <> 'D6E5A2CD61E081132FCAA1183EF9FBAB3F7AA00D5565DE08E39EDA5184ED022E'
    THROW 53223,'UNREVIEWED_GATEWAY_DEFINITION',1;
SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);
SET @marker=CHARINDEX(@needle,@before);
IF @declaration=0 OR @marker=0
   OR CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before,@declaration+1)>0
   OR CHARINDEX(@needle,@before,@marker+1)>0 OR @marker<=@declaration
   OR CHARINDEX(N'CoreStudioDatasetQuery',@before)>0
    THROW 53224,'GATEWAY_PATCH_ANCHOR_INVALID',1;

/* Insert from the end backwards so declaration offsets remain unchanged. */
SET @after=STUFF(@before,@marker,0,@insert);
SET @after=STUFF(@after,@declaration,6,N'ALTER');
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NOT NULL
     THROW 53225,'EXISTING_GATEWAY_BACKUP_REVIEW_REQUIRED',1;
 CREATE TABLE studio.dataset_query_gateway_backup(
   object_name nvarchar(256) NOT NULL PRIMARY KEY,
   previous_definition nvarchar(max) NOT NULL,
   installed_definition nvarchar(max) NOT NULL,
   installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@after;
 DECLARE @installed nvarchar(max);
 SELECT @installed=m.definition FROM BI.sys.sql_modules m
 JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id
 WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @installed IS NULL OR CHARINDEX(@insert,@installed)=0
    THROW 53226,'GATEWAY_POST_INSTALL_VERIFICATION_FAILED',1;
 INSERT studio.dataset_query_gateway_backup(object_name,previous_definition,installed_definition)
 VALUES(N'BI.dbo.spDashboard',@before,@installed);
 COMMIT;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
