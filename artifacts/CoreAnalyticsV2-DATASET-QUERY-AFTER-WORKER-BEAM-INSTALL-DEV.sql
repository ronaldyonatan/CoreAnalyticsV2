/* SQL QUERY DATASET AFTER WORKER BEAM — DEV CANDIDATE — install manually in CoreAnalytics.
   Hash-checks the reviewed BI gateway before editing it. Does not change keys,
   grants, source data or connection rows. Run in an exclusive DEV deployment
   window without an open transaction. Integration tests are still required.
   SQL scripts use the Connection account privileges, including linked servers. */
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
    THROW 53221,'DATASET_QUERY_PREREQUISITES_REQUIRED',1;
 IF OBJECT_ID(N'studio.dataset_query_source') IS NOT NULL OR OBJECT_ID(N'studio.spDatasetQueryRpc') IS NOT NULL
    OR OBJECT_ID(N'studio.dataset_query_gateway_backup') IS NOT NULL
    THROW 53225,'EXISTING_QUERY_OBJECT_REVIEW_REQUIRED',1;
 DECLARE @before nvarchar(max),@after nvarchar(max),@installed nvarchar(max),@statement nvarchar(max),
         @declaration int,@marker int,@a int,@b int,
         @needle nvarchar(128)=N'IF @Mode = ''CoreStudioObjectAccess''',
         @insert nvarchar(max)=N'IF @Mode = ''CoreStudioDatasetQuery'' BEGIN EXEC [CoreAnalytics].studio.spDatasetQueryRpc @Payload=@Payload; RETURN; END;'+CHAR(10);
 SELECT @before=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @before IS NULL THROW 53222,'GATEWAY_DEFINITION_NOT_VISIBLE',1;
 IF CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@before)),2)
   <> '32FD006231EFF08FCC19DF564B3C9A112C3E54F3F308A66EEB641596A4D37123'
    THROW 53223,'UNREVIEWED_GATEWAY_DEFINITION',1;
 SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);
 IF @declaration=0 SET @declaration=CHARINDEX(N'ALTER PROCEDURE [dbo].[spDashboard]',@before);
 SET @marker=CHARINDEX(@needle,@before);
 IF @declaration=0 OR @marker=0 OR @marker<=@declaration
    OR CHARINDEX(@needle,@before,@marker+1)>0 OR CHARINDEX(N'CoreStudioDatasetQuery',@before)>0
    THROW 53224,'GATEWAY_PATCH_ANCHOR_INVALID',1;
 IF OBJECT_ID(N'studio.worker_beam_gateway_backup',N'U') IS NULL
    OR OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NULL
    THROW 53227,'WORKER_BACKUP_REQUIRED',1;
 IF NOT EXISTS(SELECT 1 FROM studio.worker_beam_gateway_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE object_name=N'BI.dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
    AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
   OR NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
    AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
    THROW 53228,'GATEWAY_BACKUP_MISMATCH',1;
 SET @after=STUFF(@before,@marker,0,@insert);
 IF SUBSTRING(@after,@declaration,6)=N'CREATE' SET @after=STUFF(@after,@declaration,6,N'ALTER');

CREATE TABLE studio.dataset_query_source (
    dataset_id uniqueidentifier NOT NULL PRIMARY KEY,
    source_query nvarchar(max) NOT NULL,
    dialect varchar(16) NOT NULL,
    created_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_dataset_query_source_dataset FOREIGN KEY(dataset_id)
        REFERENCES studio.dataset(dataset_id),
    CONSTRAINT CK_dataset_query_source_dialect CHECK(dialect='sqlserver'),
    CONSTRAINT CK_dataset_query_source_length CHECK(DATALENGTH(source_query) BETWEEN 2 AND 64000)
);
 EXEC sys.sp_executesql N'CREATE PROCEDURE studio.spDatasetQueryRpc @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 DECLARE @Request nvarchar(max),@IssuedAt varchar(19),@NonceText varchar(36),
         @Signature varchar(64),@Nonce uniqueidentifier,@Issued datetime2(0),
         @Secret varbinary(32),@Expected varchar(64);
 IF ISJSON(@Payload)<>1 THROW 53200,''DATASET_QUERY_ENVELOPE_INVALID'',1;
 SELECT @Request=req,@IssuedAt=issued,@NonceText=nonce,@Signature=signature
 FROM OPENJSON(@Payload) WITH (req nvarchar(max) ''$.Request'',issued varchar(19) ''$.IssuedAtUtc'',
                              nonce varchar(36) ''$.Nonce'',signature varchar(64) ''$.Signature'');
 SET @Nonce=TRY_CONVERT(uniqueidentifier,@NonceText);
 SET @Issued=TRY_CONVERT(datetime2(0),@IssuedAt,126);
 IF @Request IS NULL OR ISJSON(@Request)<>1 OR @Nonce IS NULL OR @Issued IS NULL
    OR @NonceText IS NULL OR @NonceText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(varchar(36),@Nonce)) COLLATE Latin1_General_100_BIN2
    OR @IssuedAt IS NULL OR LEN(@IssuedAt)<>19 OR @Signature IS NULL OR LEN(@Signature)<>64
    OR ABS(DATEDIFF(SECOND,@Issued,SYSUTCDATETIME()))>120
    THROW 53200,''DATASET_QUERY_ENVELOPE_INVALID'',1;
 SELECT @Secret=key_bytes FROM studio.object_access_rpc_key WHERE key_id=1 AND enabled=1;
 IF @Secret IS NULL THROW 53201,''DATASET_QUERY_GATEWAY_DISABLED'',1;
 SET @Expected=studio.fnObjectAccessHmac256(@Secret,CONVERT(nvarchar(max),@IssuedAt)
       +N''|''+CONVERT(nvarchar(max),@NonceText)+N''|''+@Request);
 IF @Expected IS NULL OR UPPER(@Signature) COLLATE Latin1_General_100_BIN2<>UPPER(@Expected) COLLATE Latin1_General_100_BIN2
    THROW 53202,''DATASET_QUERY_SIGNATURE_INVALID'',1;

 DECLARE @Purpose nvarchar(40),@Action varchar(12),@Actor uniqueidentifier,@Dataset uniqueidentifier,
         @Connection uniqueidentifier,@Name nvarchar(max),@Description nvarchar(max),@Query nvarchar(max);
 SELECT @Purpose=purpose,@Action=action,@Actor=TRY_CONVERT(uniqueidentifier,actor),
        @Dataset=TRY_CONVERT(uniqueidentifier,dataset),@Connection=TRY_CONVERT(uniqueidentifier,connection),
        @Name=dataset_name,@Description=description,@Query=query_text
 FROM OPENJSON(@Request) WITH (purpose nvarchar(40) ''$.Purpose'',action varchar(12) ''$.Action'',
      actor varchar(36) ''$.ActorUserID'',dataset varchar(36) ''$.DatasetID'',connection varchar(36) ''$.ConnectionID'',
      dataset_name nvarchar(max) ''$.Name'',description nvarchar(max) ''$.Description'',query_text nvarchar(max) ''$.Query'');
 IF @Purpose IS NULL OR @Purpose COLLATE Latin1_General_100_BIN2<>N''DATASET_QUERY_V1'' COLLATE Latin1_General_100_BIN2
    OR @Action IS NULL OR @Action NOT IN (''CREATE'',''GET'',''STATUS'') OR @Actor IS NULL
    THROW 53203,''DATASET_QUERY_REQUEST_INVALID'',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@Actor AND is_active=1 AND ISNULL(is_locked,0)=0)
    THROW 53204,''DATASET_QUERY_ACTOR_INACTIVE'',1;

 BEGIN TRY
  BEGIN TRAN;
  IF EXISTS(SELECT 1 FROM studio.object_access_rpc_nonce WITH(UPDLOCK,HOLDLOCK) WHERE nonce_id=@Nonce)
      THROW 53205,''DATASET_QUERY_NONCE_REPLAY'',1;
  INSERT studio.object_access_rpc_nonce(nonce_id) VALUES(@Nonce);
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH;

 IF @Action=''STATUS''
 BEGIN
  SELECT CAST(1 AS bit) success,''DATASET_QUERY_READY'' code;
  RETURN;
 END;

 IF @Action=''CREATE''
 BEGIN
  IF @Connection IS NULL OR @Name IS NULL OR NULLIF(LTRIM(RTRIM(@Name)),N'''') IS NULL
     OR DATALENGTH(@Name)>300 OR @Description IS NULL OR DATALENGTH(@Description)>2000
     OR @Query IS NULL OR NULLIF(LTRIM(RTRIM(@Query)),N'''') IS NULL OR DATALENGTH(@Query)>64000
     THROW 53206,''DATASET_QUERY_INPUT_INVALID'',1;
  BEGIN TRY
   BEGIN TRAN;
   IF ISNULL(studio.fnStudioAccessLevel(@Actor,''CONNECTION'',@Connection),0)<20
      OR NOT EXISTS(SELECT 1 FROM studio.connection WHERE connection_id=@Connection AND is_active=1 AND LOWER(connection_type)=''sqlserver'')
      THROW 53207,''DATASET_QUERY_CONNECTION_DENIED'',1;
   SET @Dataset=NEWID();
   /* The sentinel is not a source database view. Existing workers must fail
      closed on query datasets until a guarded ingest path is installed. */
   INSERT studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)
   VALUES(@Dataset,LTRIM(RTRIM(@Name)),@Description,@Connection,N''__coreanalytics_query__'',CONVERT(nvarchar(36),@Dataset),''VIEW'',''STORED'',''PENDING'',CONVERT(nvarchar(100),@Actor));
   INSERT studio.dataset_query_source(dataset_id,source_query,dialect) VALUES(@Dataset,@Query,''sqlserver'');
   INSERT studio.object_ownership(object_type,object_id,owner_user_id) VALUES(''DATASET'',@Dataset,@Actor);
   INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
      VALUES(@Actor,''DATASET'',@Dataset,''REGISTER'',@Actor);
   COMMIT;
   SELECT CAST(1 AS bit) success,''DATASET_QUERY_CREATED'' code,CONVERT(varchar(36),@Dataset) dataset_id;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   THROW;
  END CATCH;
  RETURN;
 END;
 BEGIN TRY
  BEGIN TRAN;
  IF @Dataset IS NULL OR ISNULL(studio.fnStudioAccessLevel(@Actor,''DATASET'',@Dataset),0)<20
     THROW 53208,''DATASET_QUERY_ACCESS_DENIED'',1;
  SELECT CAST(1 AS bit) success,''DATASET_QUERY_INFO'' code,
         CONVERT(varchar(36),d.dataset_id) dataset_id,CONVERT(varchar(36),d.connection_id) connection_id,
         q.dialect,q.source_query
  FROM studio.dataset d JOIN studio.dataset_query_source q ON q.dataset_id=d.dataset_id
  WHERE d.dataset_id=@Dataset AND d.access_mode=''STORED'';
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH;
END;';

 CREATE TABLE studio.dataset_query_gateway_backup(object_name nvarchar(256) NOT NULL PRIMARY KEY,
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
    THROW 53226,'GATEWAY_POST_INSTALL_VERIFICATION_FAILED',1;
 INSERT studio.dataset_query_gateway_backup(object_name,previous_definition,installed_definition)
 VALUES(N'BI.dbo.spDashboard',@before,@installed);
 UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@installed
  WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 /* Worker rollback remains guarded until this query migration is rolled back. */
 COMMIT;
 SELECT (SELECT N'DATASET_QUERY_METADATA_INSTALLED_DEV_TRIALS_REQUIRED' AS [status],SYSUTCDATETIME() AS [verified_at_utc],
   N'Signed metadata only; SQL scripts use Connection privileges.' AS [scope]
   FOR XML PATH('dataset_query_install'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
