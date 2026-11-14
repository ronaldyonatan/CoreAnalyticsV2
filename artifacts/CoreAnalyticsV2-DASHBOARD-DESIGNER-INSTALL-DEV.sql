/* DASHBOARD DESIGNER — DEV CANDIDATE — install manually in CoreAnalytics.
   Hash-checks the reviewed BI gateway before editing it. Does not change keys,
   grants, source data or connection rows. Run in an exclusive DEV deployment
   window without an open transaction. Integration tests are still required.
   Dashboard metadata is owner-scoped; no source query is executed by this installer. */
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53220,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF DB_ID(N'BI') IS NULL OR OBJECT_ID(N'studio.fnStudioAccessLevel') IS NULL
    OR OBJECT_ID(N'studio.fnObjectAccessHmac256') IS NULL
    OR OBJECT_ID(N'studio.object_access_rpc_key',N'U') IS NULL
    OR OBJECT_ID(N'studio.object_access_rpc_nonce',N'U') IS NULL
    THROW 53221,'DASHBOARD_PREREQUISITES_REQUIRED',1;
 IF OBJECT_ID(N'studio.designer_dashboard') IS NOT NULL OR OBJECT_ID(N'studio.spDesignerDashboardRpc') IS NOT NULL
    OR OBJECT_ID(N'studio.designer_gateway_backup') IS NOT NULL
    THROW 53225,'EXISTING_QUERY_OBJECT_REVIEW_REQUIRED',1;
 DECLARE @before nvarchar(max),@after nvarchar(max),@installed nvarchar(max),@statement nvarchar(max),
         @declaration int,@marker int,@a int,@b int,
         @needle nvarchar(128)=N'IF @Mode = ''CoreStudioObjectAccess''',
         @insert nvarchar(max)=N'IF @Mode = ''CoreStudioDesignerDashboard'' BEGIN EXEC [CoreAnalytics].studio.spDesignerDashboardRpc @Payload=@Payload; RETURN; END;'+CHAR(10);
 SELECT @before=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @before IS NULL THROW 53222,'GATEWAY_DEFINITION_NOT_VISIBLE',1;
 IF CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@before)),2)
   <> 'B4A7FF8CFB81E2E7EF323A604C9B7843AEACB60A8EEA35B40D3B95B893684604'
    THROW 53223,'UNREVIEWED_GATEWAY_DEFINITION',1;
 SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);
 IF @declaration=0 SET @declaration=CHARINDEX(N'ALTER PROCEDURE [dbo].[spDashboard]',@before);
 SET @marker=CHARINDEX(@needle,@before);
 IF @declaration=0 OR @marker=0 OR @marker<=@declaration
    OR CHARINDEX(@needle,@before,@marker+1)>0 OR CHARINDEX(N'CoreStudioDesignerDashboard',@before)>0
    THROW 53224,'GATEWAY_PATCH_ANCHOR_INVALID',1;
 IF OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NULL OR NOT EXISTS
  (SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
    AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
  THROW 53321,'PHASE2D8_BACKUP_MISMATCH',1;
 IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NULL
    OR NOT EXISTS(SELECT 1 FROM studio.dataset_query_gateway_backup WITH(UPDLOCK,HOLDLOCK)
      WHERE object_name=N'BI.dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
       AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
    THROW 53320,'QUERY_BACKUP_MISMATCH',1;
 SET @after=STUFF(@before,@marker,0,@insert);
 IF SUBSTRING(@after,@declaration,6)=N'CREATE' SET @after=STUFF(@after,@declaration,6,N'ALTER');

CREATE TABLE studio.designer_dashboard (
 dashboard_id uniqueidentifier NOT NULL PRIMARY KEY,owner_user_id uniqueidentifier NOT NULL,
 dashboard_name nvarchar(150) NOT NULL,document_json nvarchar(max) NOT NULL,version int NOT NULL,
 created_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),updated_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT CK_designer_dashboard_json CHECK(ISJSON(document_json)=1),CONSTRAINT CK_designer_dashboard_version CHECK(version>0));
CREATE INDEX IX_designer_dashboard_owner ON studio.designer_dashboard(owner_user_id,updated_at_utc DESC);
 EXEC sys.sp_executesql N'CREATE PROCEDURE studio.spDesignerDashboardRpc @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 DECLARE @Request nvarchar(max),@IssuedAt varchar(19),@NonceText varchar(36),
         @Signature varchar(64),@Nonce uniqueidentifier,@Issued datetime2(0),
         @Secret varbinary(32),@Expected varchar(64);
 IF ISJSON(@Payload)<>1 THROW 53200,''DASHBOARD_ENVELOPE_INVALID'',1;
 SELECT @Request=req,@IssuedAt=issued,@NonceText=nonce,@Signature=signature
 FROM OPENJSON(@Payload) WITH (req nvarchar(max) ''$.Request'',issued varchar(19) ''$.IssuedAtUtc'',
                              nonce varchar(36) ''$.Nonce'',signature varchar(64) ''$.Signature'');
 SET @Nonce=TRY_CONVERT(uniqueidentifier,@NonceText);
 SET @Issued=TRY_CONVERT(datetime2(0),@IssuedAt,126);
 IF @Request IS NULL OR ISJSON(@Request)<>1 OR @Nonce IS NULL OR @Issued IS NULL
    OR @NonceText IS NULL OR @NonceText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(varchar(36),@Nonce)) COLLATE Latin1_General_100_BIN2
    OR @IssuedAt IS NULL OR LEN(@IssuedAt)<>19 OR @Signature IS NULL OR LEN(@Signature)<>64
    OR ABS(DATEDIFF(SECOND,@Issued,SYSUTCDATETIME()))>120
    THROW 53200,''DASHBOARD_ENVELOPE_INVALID'',1;
 SELECT @Secret=key_bytes FROM studio.object_access_rpc_key WHERE key_id=1 AND enabled=1;
 IF @Secret IS NULL THROW 53201,''DASHBOARD_GATEWAY_DISABLED'',1;
 SET @Expected=studio.fnObjectAccessHmac256(@Secret,CONVERT(nvarchar(max),@IssuedAt)
       +N''|''+CONVERT(nvarchar(max),@NonceText)+N''|''+@Request);
 IF @Expected IS NULL OR UPPER(@Signature) COLLATE Latin1_General_100_BIN2<>UPPER(@Expected) COLLATE Latin1_General_100_BIN2
    THROW 53202,''DASHBOARD_SIGNATURE_INVALID'',1;

 DECLARE @Purpose nvarchar(40),@Action varchar(12),@Actor uniqueidentifier;
 SELECT @Purpose=purpose,@Action=action,@Actor=TRY_CONVERT(uniqueidentifier,actor)
 FROM OPENJSON(@Request) WITH (purpose nvarchar(40) ''$.Purpose'',action varchar(12) ''$.Action'',actor varchar(36) ''$.ActorUserID'');
 IF @Purpose IS NULL OR @Purpose COLLATE Latin1_General_100_BIN2<>N''DASHBOARD_DESIGNER_V1'' COLLATE Latin1_General_100_BIN2
    OR @Action IS NULL OR @Action NOT IN (''LIST'',''GET'',''SAVE'',''DELETE'') OR @Actor IS NULL
    THROW 53203,''DASHBOARD_REQUEST_INVALID'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@Actor AND is_active=1 AND ISNULL(is_locked,0)=0)
    THROW 53204,''DASHBOARD_ACTOR_INACTIVE'',1;

 BEGIN TRY
  BEGIN TRAN;
  IF EXISTS(SELECT 1 FROM studio.object_access_rpc_nonce WITH(UPDLOCK,HOLDLOCK) WHERE nonce_id=@Nonce)
      THROW 53205,''DASHBOARD_NONCE_REPLAY'',1;
  INSERT studio.object_access_rpc_nonce(nonce_id) VALUES(@Nonce);
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH;

/* Appended to the reviewed signed envelope verifier. All operations are owner-scoped. */
DECLARE @Dashboard uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,''$.DashboardID'')),
        @Name nvarchar(max),@Document nvarchar(max),@ExpectedVersion int=TRY_CONVERT(int,JSON_VALUE(@Request,''$.ExpectedVersion'')),
        @CurrentVersion int;
SELECT @Name=dashboard_name,@Document=document FROM OPENJSON(@Request)
WITH (dashboard_name nvarchar(max) ''$.Name'',document nvarchar(max) ''$.Document'');
IF @Action=''LIST''
BEGIN
 SELECT CAST(1 AS bit) success,COALESCE((SELECT CONVERT(varchar(36),dashboard_id) dashboard_id,dashboard_name,version,created_at_utc,updated_at_utc
   FROM studio.designer_dashboard WHERE owner_user_id=@Actor ORDER BY updated_at_utc DESC,dashboard_id FOR JSON PATH),N''[]'') items_json;
 RETURN;
END;
IF @Action=''GET''
BEGIN
 IF @Dashboard IS NULL OR NOT EXISTS(SELECT 1 FROM studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor)
 BEGIN SELECT CAST(0 AS bit) success,''DASHBOARD_NOT_FOUND'' code; RETURN; END;
 SELECT CAST(1 AS bit) success,CONVERT(varchar(36),dashboard_id) dashboard_id,dashboard_name,version,document_json
 FROM studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
 RETURN;
END;
IF @Action=''SAVE''
BEGIN
 IF @ExpectedVersion IS NULL OR @ExpectedVersion<0 OR @ExpectedVersion>=2147483647 OR @Name IS NULL OR NULLIF(LTRIM(RTRIM(@Name)),N'''') IS NULL OR DATALENGTH(@Name)>300
    OR @Document IS NULL OR ISJSON(@Document)<>1 OR DATALENGTH(@Document)>12000000
 BEGIN SELECT CAST(0 AS bit) success,''DASHBOARD_INPUT_INVALID'' code; RETURN; END;
 BEGIN TRY
  BEGIN TRAN;
  IF @ExpectedVersion=0
  BEGIN
   IF @Dashboard IS NULL SET @Dashboard=NEWID();
   SELECT @CurrentVersion=version FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK) WHERE dashboard_id=@Dashboard;
   IF @CurrentVersion IS NULL
   BEGIN
    SET @CurrentVersion=1;
    INSERT studio.designer_dashboard(dashboard_id,owner_user_id,dashboard_name,document_json,version)
    VALUES(@Dashboard,@Actor,LTRIM(RTRIM(@Name)),@Document,@CurrentVersion);
   END
   ELSE IF NOT EXISTS(SELECT 1 FROM studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor AND version=1
     AND DATALENGTH(dashboard_name)=DATALENGTH(LTRIM(RTRIM(@Name))) AND dashboard_name COLLATE Latin1_General_100_BIN2=LTRIM(RTRIM(@Name)) COLLATE Latin1_General_100_BIN2
     AND DATALENGTH(document_json)=DATALENGTH(@Document) AND document_json COLLATE Latin1_General_100_BIN2=@Document COLLATE Latin1_General_100_BIN2)
    THROW 53310,''DASHBOARD_VERSION_CONFLICT'',1;
  END
  ELSE
  BEGIN
   IF @Dashboard IS NULL THROW 53311,''DASHBOARD_NOT_FOUND'',1;
   SELECT @CurrentVersion=version FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK) WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
   IF @CurrentVersion IS NULL THROW 53311,''DASHBOARD_NOT_FOUND'',1;
   IF @CurrentVersion<>@ExpectedVersion THROW 53310,''DASHBOARD_VERSION_CONFLICT'',1;
   SET @CurrentVersion=@CurrentVersion+1;
   UPDATE studio.designer_dashboard SET dashboard_name=LTRIM(RTRIM(@Name)),document_json=@Document,version=@CurrentVersion,updated_at_utc=SYSUTCDATETIME()
   WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
  END;
  COMMIT;
  SELECT CAST(1 AS bit) success,CONVERT(varchar(36),@Dashboard) dashboard_id,@CurrentVersion version;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  IF ERROR_NUMBER()=53310 SELECT CAST(0 AS bit) success,''DASHBOARD_VERSION_CONFLICT'' code;
  ELSE IF ERROR_NUMBER()=53311 SELECT CAST(0 AS bit) success,''DASHBOARD_NOT_FOUND'' code;
  ELSE THROW;
 END CATCH;
 RETURN;
END;
IF @Action=''DELETE''
BEGIN
 IF @Dashboard IS NULL OR @ExpectedVersion IS NULL OR @ExpectedVersion<1
 BEGIN SELECT CAST(0 AS bit) success,''DASHBOARD_INPUT_INVALID'' code; RETURN; END;
 BEGIN TRY
  BEGIN TRAN;
  SELECT @CurrentVersion=version FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK) WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
  IF @CurrentVersion IS NULL THROW 53311,''DASHBOARD_NOT_FOUND'',1;
  IF @CurrentVersion<>@ExpectedVersion THROW 53310,''DASHBOARD_VERSION_CONFLICT'',1;
  DELETE studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
  COMMIT;
  SELECT CAST(1 AS bit) success,''DASHBOARD_DELETED'' code;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  IF ERROR_NUMBER()=53310 SELECT CAST(0 AS bit) success,''DASHBOARD_VERSION_CONFLICT'' code;
  ELSE IF ERROR_NUMBER()=53311 SELECT CAST(0 AS bit) success,''DASHBOARD_NOT_FOUND'' code;
  ELSE THROW;
 END CATCH;
 RETURN;
END;
END;
';

 CREATE TABLE studio.designer_gateway_backup(object_name nvarchar(256) NOT NULL PRIMARY KEY,
  previous_definition nvarchar(max) NOT NULL,installed_definition nvarchar(max) NOT NULL,
  installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@after;
 SELECT @installed=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 SET @a=CHARINDEX(N'@Mode',@after); SET @b=CHARINDEX(N'@Mode',@installed);
 IF @installed IS NULL OR @a=0 OR @b=0
  OR DATALENGTH(SUBSTRING(@after,@a,LEN(@after)))<>DATALENGTH(SUBSTRING(@installed,@b,LEN(@installed)))
  OR SUBSTRING(@after,@a,LEN(@after)) COLLATE Latin1_General_100_BIN2<>SUBSTRING(@installed,@b,LEN(@installed)) COLLATE Latin1_General_100_BIN2
  THROW 53322,'GATEWAY_POST_INSTALL_VERIFICATION_FAILED',1;
 INSERT studio.designer_gateway_backup(object_name,previous_definition,installed_definition) VALUES(N'BI.dbo.spDashboard',@before,@installed);
 UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@installed WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 /* Query rollback remains guarded until the designer gateway is rolled back. */
 COMMIT;
 SELECT (SELECT N'DASHBOARD_DESIGNER_INSTALLED_DEV_TRIALS_REQUIRED' AS [status],SYSUTCDATETIME() AS [verified_at_utc]
  FOR XML PATH('dashboard_designer_install'),TYPE) AS OPEN_AND_SAVE_XML;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
