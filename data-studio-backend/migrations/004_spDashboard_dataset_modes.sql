/* Add this block inside dbo.spDashboard. Flask enforces Data Studio access. */
IF @Mode IN ('CoreStudioConnectionGetSecret','CoreStudioDatasetList','CoreStudioDatasetCreate')
BEGIN
 DECLARE @DSUser uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.UserID'));
 IF @DSUser IS NULL OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@DSUser AND is_active=1 AND is_locked=0)
 BEGIN SELECT CAST(0 AS bit) AS success,'USER_UNAVAILABLE' AS code; RETURN; END;
 IF @Mode='CoreStudioConnectionGetSecret'
 BEGIN
  SELECT CONVERT(varchar(36),connection_id) AS connection_id, server_host,server_port,database_name,login_username,
    CAST('' AS xml).value('xs:base64Binary(sql:column("encrypted_password"))','varchar(max)') AS encrypted_password_base64,
    encryption_key_version,encrypt_transport,trust_server_certificate,connection_timeout_seconds
  FROM [CoreAnalytics].studio.connection
  WHERE connection_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')) AND is_active=1;
  RETURN;
 END;
 IF @Mode='CoreStudioDatasetList'
 BEGIN
  IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.dataset)
  BEGIN SELECT CAST(1 AS bit) AS success,'DATASET_LIST_EMPTY' AS code; RETURN; END;
  SELECT CONVERT(varchar(36),d.dataset_id) AS dataset_id,d.dataset_name,d.description,
   CONVERT(varchar(36),d.connection_id) AS connection_id,c.connection_name,d.source_schema,d.source_name,
   d.source_type,d.access_mode,d.storage_status,d.created_at
  FROM [CoreAnalytics].studio.dataset d JOIN [CoreAnalytics].studio.connection c ON c.connection_id=d.connection_id
  ORDER BY d.created_at DESC;
  RETURN;
 END;
 IF @Mode='CoreStudioDatasetCreate'
 BEGIN
  DECLARE @DSName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.DatasetName'))),''),
    @DSDescription nvarchar(1000)=JSON_VALUE(@Payload,'$.Description'),
    @DSConnection uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')),
    @DSSchema sysname=JSON_VALUE(@Payload,'$.SourceSchema'), @DSTable sysname=JSON_VALUE(@Payload,'$.SourceName'),
    @DSType varchar(20)=JSON_VALUE(@Payload,'$.SourceType');
  IF @DSName IS NULL OR NULLIF(@DSSchema,'') IS NULL OR NULLIF(@DSTable,'') IS NULL OR @DSType NOT IN ('BASE TABLE','VIEW')
    OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@DSConnection AND is_active=1)
  BEGIN SELECT CAST(0 AS bit) AS success,'DATASET_INPUT_INVALID' AS code; RETURN; END;
  BEGIN TRY
   DECLARE @DSID uniqueidentifier=NEWID();
   INSERT INTO [CoreAnalytics].studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)
   VALUES(@DSID,@DSName,@DSDescription,@DSConnection,@DSSchema,@DSTable,@DSType,'DIRECT','LIVE',CONVERT(nvarchar(100),@DSUser));
   SELECT CAST(1 AS bit) AS success,'DATASET_CREATED' AS code,CONVERT(varchar(36),@DSID) AS dataset_id; RETURN;
  END TRY
  BEGIN CATCH
   SELECT CAST(0 AS bit) AS success, CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN 'DATASET_DUPLICATE' ELSE 'DATASET_CREATE_FAILED' END AS code; RETURN;
  END CATCH;
 END;
END;
