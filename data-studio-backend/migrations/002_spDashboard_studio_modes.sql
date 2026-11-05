/* Stage 5B additive block. Paste inside dbo.spDashboard after existing CoreUserSession modes.
   Requires [CoreAnalytics].studio.connection from migration 001.
   All access decisions MUST be enforced by Flask; BEAM is a trusted service credential.
*/
IF @Mode IN ('CoreStudioConnectionList','CoreStudioConnectionCreate','CoreStudioConnectionSetActive')
BEGIN
    DECLARE @StudioUserID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload,'$.UserID'));
    IF @StudioUserID IS NULL
    BEGIN
        SELECT CAST(0 AS bit) AS success, 'USER_ID_REQUIRED' AS code;
        RETURN;
    END;
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@StudioUserID AND is_active=1 AND is_locked=0)
    BEGIN
        SELECT CAST(0 AS bit) AS success, 'USER_UNAVAILABLE' AS code;
        RETURN;
    END;

    IF @Mode='CoreStudioConnectionList'
    BEGIN
        SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_name, connection_type,
               server_host,server_port,database_name,auth_type,login_username,
               encrypt_transport,trust_server_certificate,connection_timeout_seconds,
               is_active,created_by,created_at,updated_by,updated_at
        FROM [CoreAnalytics].studio.connection ORDER BY connection_name;
        RETURN;
    END;

    IF @Mode='CoreStudioConnectionCreate'
    BEGIN
        DECLARE @StudioName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.ConnectionName'))),''),
                @StudioHost nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.ServerHost'))),''),
                @StudioDB nvarchar(128)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.DatabaseName'))),''),
                @StudioLogin nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,'$.LoginUsername'))),''),
                @StudioPort int=ISNULL(TRY_CONVERT(int,JSON_VALUE(@Payload,'$.ServerPort')),1433),
                @StudioTimeout int=ISNULL(TRY_CONVERT(int,JSON_VALUE(@Payload,'$.ConnectionTimeoutSeconds')),10),
                @StudioVersion smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,'$.EncryptionKeyVersion')),
                @StudioEncrypted64 nvarchar(max)=JSON_VALUE(@Payload,'$.EncryptedPasswordBase64'),
                @StudioEncrypted varbinary(max),
                @StudioTLS bit=CASE WHEN JSON_VALUE(@Payload,'$.EncryptTransport') IN ('true','1') THEN 1 ELSE 0 END,
                @StudioTrust bit=CASE WHEN JSON_VALUE(@Payload,'$.TrustServerCertificate') IN ('true','1') THEN 1 ELSE 0 END;
        IF @StudioName IS NULL OR @StudioHost IS NULL OR @StudioDB IS NULL OR @StudioLogin IS NULL
           OR @StudioPort NOT BETWEEN 1 AND 65535 OR @StudioTimeout NOT BETWEEN 1 AND 60
           OR @StudioVersion IS NULL OR @StudioEncrypted64 IS NULL
        BEGIN
            SELECT CAST(0 AS bit) AS success,'STUDIO_INPUT_INVALID' AS code;
            RETURN;
        END;
        BEGIN TRY
            SET @StudioEncrypted=CAST(N'' AS xml).value('xs:base64Binary(sql:variable("@StudioEncrypted64"))','varbinary(max)');
            IF DATALENGTH(@StudioEncrypted)=0
            BEGIN
                SELECT CAST(0 AS bit) AS success,'STUDIO_SECRET_INVALID' AS code;
                RETURN;
            END;
            DECLARE @StudioNewID uniqueidentifier=NEWID();
            INSERT INTO [CoreAnalytics].studio.connection
                (connection_id,connection_name,connection_type,server_host,server_port,database_name,
                 auth_type,login_username,encrypted_password,encryption_key_version,encrypt_transport,
                 trust_server_certificate,connection_timeout_seconds,is_active,created_by)
            VALUES (@StudioNewID,@StudioName,'SQLSERVER',@StudioHost,@StudioPort,@StudioDB,
                    'SQL_LOGIN',@StudioLogin,@StudioEncrypted,@StudioVersion,@StudioTLS,
                    @StudioTrust,@StudioTimeout,1,CONVERT(nvarchar(100),@StudioUserID));
            SELECT CAST(1 AS bit) AS success,'STUDIO_CONNECTION_CREATED' AS code,
                   CONVERT(varchar(36),@StudioNewID) AS connection_id;
            RETURN;
        END TRY
        BEGIN CATCH
            SELECT CAST(0 AS bit) AS success,
                   CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN 'STUDIO_CONNECTION_DUPLICATE' ELSE 'STUDIO_CONNECTION_CREATE_FAILED' END AS code;
            RETURN;
        END CATCH;
    END;

    IF @Mode='CoreStudioConnectionSetActive'
    BEGIN
        DECLARE @StudioConnectionID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')),
                @StudioActive bit=CASE JSON_VALUE(@Payload,'$.IsActive') WHEN 'true' THEN 1 WHEN 'false' THEN 0 WHEN '1' THEN 1 WHEN '0' THEN 0 ELSE NULL END;
        IF @StudioConnectionID IS NULL OR @StudioActive IS NULL
        BEGIN
            SELECT CAST(0 AS bit) AS success,'STUDIO_INPUT_INVALID' AS code;
            RETURN;
        END;
        UPDATE [CoreAnalytics].studio.connection SET is_active=@StudioActive,
            updated_by=CONVERT(nvarchar(100),@StudioUserID),updated_at=SYSUTCDATETIME()
        WHERE connection_id=@StudioConnectionID;
        IF @@ROWCOUNT=0
        BEGIN
            SELECT CAST(0 AS bit) AS success,'STUDIO_CONNECTION_NOT_FOUND' AS code;
            RETURN;
        END;
        SELECT CAST(1 AS bit) AS success,'STUDIO_CONNECTION_STATUS_UPDATED' AS code;
        RETURN;
    END;
END;
