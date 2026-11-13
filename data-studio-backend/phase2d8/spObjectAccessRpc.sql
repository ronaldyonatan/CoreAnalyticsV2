/* Signed gateway: do not trust ActorUserID alone, even if BEAM has an x-token.
   JSON shape: {"Request":"<JSON string>","IssuedAtUtc":"yyyy-MM-ddTHH:mm:ss",
                "Nonce":"<GUID>","Signature":"<64-char hex>"}
   HMAC bytes = UTF-16LE(IssuedAtUtc + '|' + lower(Nonce) + '|' + Request).
   Replay: GUID nonce consumed in SQL atomically, 120s clock skew tolerance.
   This entry point never accepts TRANSFER or ADMIN_ASSIGN until BEAM's legacy
   metadata owner restrictions and data-plane permissions are synchronized.
*/
ALTER PROCEDURE studio.spObjectAccessRpc
    @Payload nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@Payload)<>1
    BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_INVALID_ENVELOPE' AS code; RETURN; END;
    DECLARE @Request nvarchar(max)=NULL,
            @IssuedAtUtc varchar(19)=NULL,
            @NonceText varchar(36)=NULL,
            @Signature varchar(64)=NULL,
            @Nonce uniqueidentifier=NULL,
            @Issued datetime2(0)=NULL,
            @Secret varbinary(32)=NULL,
            @Expected varchar(64)=NULL;

    SELECT @Request=req,@IssuedAtUtc=issued,@NonceText=nonce,@Signature=signature
    FROM OPENJSON(@Payload) WITH
    (
       req nvarchar(max) '$.Request',
       issued varchar(19) '$.IssuedAtUtc',
       nonce varchar(36) '$.Nonce',
       signature varchar(64) '$.Signature'
    );

    SET @Nonce=TRY_CONVERT(uniqueidentifier,@NonceText);
    SET @Issued=TRY_CONVERT(datetime2(0),@IssuedAtUtc,126);
    IF @Nonce IS NULL OR @Issued IS NULL OR @Request IS NULL
       OR @NonceText<>LOWER(CONVERT(varchar(36),@Nonce))
       OR LEN(@IssuedAtUtc)<>19 OR LEN(@Signature)<>64 OR ISJSON(@Request)<>1
       OR ABS(DATEDIFF(SECOND,@Issued,SYSUTCDATETIME()))>120
    BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_ENVELOPE_EXPIRED_OR_INVALID' AS code; RETURN; END;

    SELECT @Secret=key_bytes FROM studio.object_access_rpc_key WHERE key_id=1 AND enabled=1;
    IF @Secret IS NULL
    BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_GATEWAY_DISABLED' AS code; RETURN; END;

    SET @Expected=studio.fnObjectAccessHmac256(
      @Secret,CONVERT(nvarchar(max),@IssuedAtUtc)+N'|'+CONVERT(nvarchar(max),@NonceText)+N'|'+@Request
    );
    IF @Expected IS NULL OR UPPER(@Signature)<>UPPER(@Expected)
    BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_SIGNATURE_INVALID' AS code; RETURN; END;

    DECLARE @ActorUserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,'$.ActorUserID')),
            @ObjectID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,'$.ObjectID')),
            @ObjectType varchar(32)=UPPER(JSON_VALUE(@Request,'$.ObjectType')),
            @Action varchar(24)=UPPER(JSON_VALUE(@Request,'$.Action')),
            @PrincipalType varchar(8)=UPPER(JSON_VALUE(@Request,'$.PrincipalType')),
            @PrincipalID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,'$.PrincipalID')),
            @AccessRole varchar(8)=UPPER(JSON_VALUE(@Request,'$.AccessRole'));

    IF @ActorUserID IS NULL OR @ObjectID IS NULL
       OR @ObjectType NOT IN ('CONNECTION','DATASET','PIPELINE','SCHEDULE','CHART','DASHBOARD')
       OR @Action NOT IN ('GET','CHECK','REGISTER','GRANT','REVOKE')
    BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_ACTION_INVALID' AS code; RETURN; END;

    IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@ActorUserID AND is_active=1 AND ISNULL(is_locked,0)=0)
    BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_ACTOR_INACTIVE' AS code; RETURN; END;

    /* Consume nonce before performing any metadata read or write. */
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS(SELECT 1 FROM studio.object_access_rpc_nonce WITH (UPDLOCK,HOLDLOCK) WHERE nonce_id=@Nonce)
            THROW 52701,'OBJECT_ACCESS_NONCE_REPLAY',1;
        INSERT studio.object_access_rpc_nonce(nonce_id) VALUES(@Nonce);
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_NONCE_REPLAY_OR_DB_ERROR' AS code;
        RETURN;
    END CATCH;

    /* GET is returned as ONE resultset: BEAM Core API normally serializes only
       the first set. Do not expose share list to Viewer/Editor. */
    IF @Action='GET'
    BEGIN
        DECLARE @Owner uniqueidentifier=NULL,@IsAdmin bit=0;
        SELECT @Owner=owner_user_id FROM studio.object_ownership
          WHERE object_type=@ObjectType AND object_id=@ObjectID;
        IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0
        BEGIN SELECT CAST(0 AS bit) AS success,'OBJECT_NOT_REGISTERED' AS code; RETURN; END;
        IF EXISTS(SELECT 1 FROM studio.object_access_admin_group ag
           JOIN dbo.core_user_group ug ON ug.group_id=ag.group_id AND ug.user_id=@ActorUserID
           JOIN dbo.core_group g ON g.group_id=ag.group_id AND g.is_active=1)
            SET @IsAdmin=1;
        IF @Owner<>@ActorUserID AND @IsAdmin=0 AND
          (CASE WHEN @ObjectType='SCHEDULE' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0
        BEGIN SELECT CAST(0 AS bit) AS success,'OWNER_REQUIRED' AS code; RETURN; END;

        SELECT CAST(1 AS bit) AS success,'ACCESS_INFO' AS code,
          CONVERT(varchar(36),@Owner) AS owner_user_id,
          @IsAdmin AS is_admin,
          COALESCE((SELECT principal_type,CONVERT(varchar(36),principal_id) AS principal_id,
                          access_role,CONVERT(varchar(36),granted_by_user_id) AS granted_by_user_id,
                          granted_at_utc
                    FROM studio.object_access
                    WHERE object_type=@ObjectType AND object_id=@ObjectID
                    FOR JSON PATH),'[]') AS shares_json;
        RETURN;
    END;

    /* V2 enforces owner/admin for mutations, source owner match for REGISTER,
       group membership / role hierarchy for CHECK. No owner reassignment exposed. */
    BEGIN TRY
        EXEC studio.spObjectAccessControlV2
            @ActorUserID=@ActorUserID,
            @Action=@Action,
            @ObjectType=@ObjectType,
            @ObjectID=@ObjectID,
            @PrincipalType=@PrincipalType,
            @PrincipalID=@PrincipalID,
            @AccessRole=@AccessRole,
            @NewOwnerUserID=NULL;
    END TRY
    BEGIN CATCH
        SELECT CAST(0 AS bit) AS success,'OBJECT_ACCESS_OPERATION_DENIED' AS code;
    END CATCH;
END;
