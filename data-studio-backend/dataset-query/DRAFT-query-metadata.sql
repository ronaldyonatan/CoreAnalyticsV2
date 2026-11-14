/* DRAFT ONLY — DO NOT EXECUTE OR INSTALL.
   SQL Server 2016 SP2 candidate for signed query-dataset metadata.
   Must be reviewed together with gateway changes, worker security and tests.
   This draft stores SQL text but NEVER executes it. The application/worker
   must execute only under the independently audited restricted identity.
   Security prerequisites: restrict direct access to the new table/procedure;
   protect the existing RPC key; verify module/ownership chain and BEAM grants.
*/
USE [CoreAnalytics];
GO
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
GO
CREATE OR ALTER PROCEDURE studio.spDatasetQueryRpc @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 DECLARE @Request nvarchar(max),@IssuedAt varchar(19),@NonceText varchar(36),
         @Signature varchar(64),@Nonce uniqueidentifier,@Issued datetime2(0),
         @Secret varbinary(32),@Expected varchar(64);
 IF ISJSON(@Payload)<>1 THROW 53200,'DATASET_QUERY_ENVELOPE_INVALID',1;
 SELECT @Request=req,@IssuedAt=issued,@NonceText=nonce,@Signature=signature
 FROM OPENJSON(@Payload) WITH (req nvarchar(max) '$.Request',issued varchar(19) '$.IssuedAtUtc',
                              nonce varchar(36) '$.Nonce',signature varchar(64) '$.Signature');
 SET @Nonce=TRY_CONVERT(uniqueidentifier,@NonceText);
 SET @Issued=TRY_CONVERT(datetime2(0),@IssuedAt,126);
 IF @Request IS NULL OR ISJSON(@Request)<>1 OR @Nonce IS NULL OR @Issued IS NULL
    OR @NonceText IS NULL OR @NonceText COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(varchar(36),@Nonce)) COLLATE Latin1_General_100_BIN2
    OR @IssuedAt IS NULL OR LEN(@IssuedAt)<>19 OR @Signature IS NULL OR LEN(@Signature)<>64
    OR ABS(DATEDIFF(SECOND,@Issued,SYSUTCDATETIME()))>120
    THROW 53200,'DATASET_QUERY_ENVELOPE_INVALID',1;
 SELECT @Secret=key_bytes FROM studio.object_access_rpc_key WHERE key_id=1 AND enabled=1;
 IF @Secret IS NULL THROW 53201,'DATASET_QUERY_GATEWAY_DISABLED',1;
 SET @Expected=studio.fnObjectAccessHmac256(@Secret,CONVERT(nvarchar(max),@IssuedAt)
       +N'|'+CONVERT(nvarchar(max),@NonceText)+N'|'+@Request);
 IF @Expected IS NULL OR UPPER(@Signature) COLLATE Latin1_General_100_BIN2<>UPPER(@Expected) COLLATE Latin1_General_100_BIN2
    THROW 53202,'DATASET_QUERY_SIGNATURE_INVALID',1;

 DECLARE @Purpose nvarchar(40),@Action varchar(12),@Actor uniqueidentifier,@Dataset uniqueidentifier,
         @Connection uniqueidentifier,@Name nvarchar(max),@Description nvarchar(max),@Query nvarchar(max);
 SELECT @Purpose=purpose,@Action=action,@Actor=TRY_CONVERT(uniqueidentifier,actor),
        @Dataset=TRY_CONVERT(uniqueidentifier,dataset),@Connection=TRY_CONVERT(uniqueidentifier,connection),
        @Name=dataset_name,@Description=description,@Query=query_text
 FROM OPENJSON(@Request) WITH (purpose nvarchar(40) '$.Purpose',action varchar(12) '$.Action',
      actor varchar(36) '$.ActorUserID',dataset varchar(36) '$.DatasetID',connection varchar(36) '$.ConnectionID',
      dataset_name nvarchar(max) '$.Name',description nvarchar(max) '$.Description',query_text nvarchar(max) '$.Query');
 IF @Purpose IS NULL OR @Purpose COLLATE Latin1_General_100_BIN2<>N'DATASET_QUERY_V1' COLLATE Latin1_General_100_BIN2
    OR @Action IS NULL OR @Action NOT IN ('CREATE','GET','STATUS') OR @Actor IS NULL
    THROW 53203,'DATASET_QUERY_REQUEST_INVALID',1;
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@Actor AND is_active=1 AND ISNULL(is_locked,0)=0)
    THROW 53204,'DATASET_QUERY_ACTOR_INACTIVE',1;

 BEGIN TRY
  BEGIN TRAN;
  IF EXISTS(SELECT 1 FROM studio.object_access_rpc_nonce WITH(UPDLOCK,HOLDLOCK) WHERE nonce_id=@Nonce)
      THROW 53205,'DATASET_QUERY_NONCE_REPLAY',1;
  INSERT studio.object_access_rpc_nonce(nonce_id) VALUES(@Nonce);
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH;

 IF @Action='STATUS'
 BEGIN
  SELECT CAST(1 AS bit) success,'DATASET_QUERY_READY' code;
  RETURN;
 END;

 IF @Action='CREATE'
 BEGIN
  IF @Connection IS NULL OR @Name IS NULL OR NULLIF(LTRIM(RTRIM(@Name)),N'') IS NULL
     OR DATALENGTH(@Name)>300 OR @Description IS NULL OR DATALENGTH(@Description)>2000
     OR @Query IS NULL OR NULLIF(LTRIM(RTRIM(@Query)),N'') IS NULL OR DATALENGTH(@Query)>64000
     THROW 53206,'DATASET_QUERY_INPUT_INVALID',1;
  BEGIN TRY
   BEGIN TRAN;
   IF ISNULL(studio.fnStudioAccessLevel(@Actor,'CONNECTION',@Connection),0)<20
      OR NOT EXISTS(SELECT 1 FROM studio.connection WHERE connection_id=@Connection AND is_active=1 AND LOWER(connection_type)='sqlserver')
      THROW 53207,'DATASET_QUERY_CONNECTION_DENIED',1;
   SET @Dataset=NEWID();
   /* The sentinel is not a source database view. Existing workers must fail
      closed on query datasets until a guarded ingest path is installed. */
   INSERT studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)
   VALUES(@Dataset,LTRIM(RTRIM(@Name)),@Description,@Connection,N'__coreanalytics_query__',CONVERT(nvarchar(36),@Dataset),'VIEW','STORED','PENDING',CONVERT(nvarchar(100),@Actor));
   INSERT studio.dataset_query_source(dataset_id,source_query,dialect) VALUES(@Dataset,@Query,'sqlserver');
   INSERT studio.object_ownership(object_type,object_id,owner_user_id) VALUES('DATASET',@Dataset,@Actor);
   INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
      VALUES(@Actor,'DATASET',@Dataset,'REGISTER',@Actor);
   COMMIT;
   SELECT CAST(1 AS bit) success,'DATASET_QUERY_CREATED' code,CONVERT(varchar(36),@Dataset) dataset_id;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   THROW;
  END CATCH;
  RETURN;
 END;
 BEGIN TRY
  BEGIN TRAN;
  IF @Dataset IS NULL OR ISNULL(studio.fnStudioAccessLevel(@Actor,'DATASET',@Dataset),0)<20
     THROW 53208,'DATASET_QUERY_ACCESS_DENIED',1;
  SELECT CAST(1 AS bit) success,'DATASET_QUERY_INFO' code,
         CONVERT(varchar(36),d.dataset_id) dataset_id,CONVERT(varchar(36),d.connection_id) connection_id,
         q.dialect,q.source_query
  FROM studio.dataset d JOIN studio.dataset_query_source q ON q.dataset_id=d.dataset_id
  WHERE d.dataset_id=@Dataset AND d.access_mode='STORED';
  COMMIT;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW;
 END CATCH;
END;
GO
