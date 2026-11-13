/* 030 SCHEDULE_CHECK_REV2: correct inherited SCHEDULE permission pre-checks in installed 029.
   Owner-only sharing/delete is unchanged. No grant rows or keys are modified.
   Run the whole file manually in DEV after 029. One XML result.
   Strict code-baseline guards and transaction; no normalization of SQL content.
*/
USE [CoreAnalytics]; SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53000,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID('studio.fnStudioScheduleAccess','FN') IS NULL OR OBJECT_ID('studio.fnStudioAccessLevel','FN') IS NULL
  THROW 53000,'SHARED_ACCESS_029_REQUIRED',1;
 IF OBJECT_ID('studio.phase2d8_schedule_check_backup','U') IS NULL
  CREATE TABLE studio.phase2d8_schedule_check_backup(
   object_name nvarchar(256) NOT NULL PRIMARY KEY,previous_definition nvarchar(max) NOT NULL,
   installed_definition nvarchar(max) NOT NULL,installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 DECLARE @object nvarchar(256),@parameter nvarchar(40),@before nvarchar(max),@expected nvarchar(max),
  @actual nvarchar(max),@recorded nvarchar(max),@new nvarchar(max),@message nvarchar(2048);
SET @object=N'studio.spObjectAccessControlV2'; SET @parameter=N'@ActorUserID'; SET @expected=N'@ActorUserID uniqueidentifier,
    @Action varchar(24),
    @ObjectType varchar(32),
    @ObjectID uniqueidentifier,
    @PrincipalType varchar(8) = NULL,
    @PrincipalID uniqueidentifier = NULL,
    @AccessRole varchar(8) = NULL,
    @NewOwnerUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    IF @ActorUserID IS NULL OR @ObjectID IS NULL OR
       @ObjectType IS NULL OR @ObjectType NOT IN (''CONNECTION'',''DATASET'',''PIPELINE'',''SCHEDULE'',''CHART'',''DASHBOARD'')
        THROW 52601, ''INVALID_OBJECT_ACCESS_INPUT'', 1;
    IF @Action IS NULL OR @Action NOT IN (''GET'',''CHECK'',''REGISTER'',''GRANT'',''REVOKE'',''TRANSFER'',''ADMIN_ASSIGN'')
        THROW 52602, ''INVALID_OBJECT_ACCESS_ACTION'', 1;

    IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@ActorUserID AND is_active=1 AND ISNULL(is_locked,0)=0)
        THROW 52603, ''ACTOR_NOT_FOUND'', 1;

    DECLARE @IsAdmin bit=0,
            @Owner uniqueidentifier=NULL,
            @SourceOwner uniqueidentifier=NULL,
            @SourceExists bit=0,
            @OldRole varchar(8)=NULL,
            @EffectiveRole varchar(8)=''NONE'';
    IF EXISTS
    (
        SELECT 1 FROM studio.object_access_admin_group ag
        JOIN dbo.core_user_group ug ON ug.group_id=ag.group_id AND ug.user_id=@ActorUserID
        JOIN dbo.core_group g ON g.group_id=ag.group_id AND g.is_active=1
    ) SET @IsAdmin=1;

    BEGIN TRY
        IF @Action NOT IN (''GET'',''CHECK'') BEGIN TRAN;
        SELECT @Owner=owner_user_id
          FROM studio.object_ownership WITH (UPDLOCK,HOLDLOCK)
          WHERE object_type=@ObjectType AND object_id=@ObjectID;

        /* Verify object against original metadata before any creation/claim.
           Source owner must match login ID exactly; do not trust strings or
           claim unknown/legacy owners without a DBA-approved admin assignment. */
        IF @Action IN (''REGISTER'',''ADMIN_ASSIGN'')
        BEGIN
            IF @ObjectType=''CONNECTION''
                SELECT @SourceExists=1, @SourceOwner=CASE WHEN LEN(LTRIM(RTRIM(created_by)))=36 THEN TRY_CONVERT(uniqueidentifier,created_by) END
                FROM studio.connection WHERE connection_id=@ObjectID;
            ELSE IF @ObjectType=''DATASET''
                SELECT @SourceExists=1, @SourceOwner=CASE WHEN LEN(LTRIM(RTRIM(created_by)))=36 THEN TRY_CONVERT(uniqueidentifier,created_by) END
                FROM studio.dataset WHERE dataset_id=@ObjectID;
            ELSE IF @ObjectType=''PIPELINE''
                SELECT @SourceExists=1, @SourceOwner=created_by
                FROM studio.pipeline WHERE pipeline_id=@ObjectID;
            ELSE IF @ObjectType=''SCHEDULE''
                SELECT @SourceExists=1, @SourceOwner=created_by
                FROM studio.scheduler_schedule WHERE schedule_id=@ObjectID;
            ELSE IF @ObjectType=''CHART''
                SELECT @SourceExists=1, @SourceOwner=owner_user_id
                FROM studio.chart WHERE chart_id=@ObjectID;
            /* No studio.dashboard table was present in the supplied SQL export.
               DASHBOARD registration is deliberately blocked until verified. */
            IF @SourceExists=0 THROW 52604, ''SOURCE_OBJECT_NOT_FOUND_OR_UNSUPPORTED'', 1;
        END;

        IF @Action=''REGISTER''
        BEGIN
            IF @SourceOwner IS NULL OR @SourceOwner<>@ActorUserID
                THROW 52605, ''SOURCE_OWNER_NOT_VERIFIED'', 1;
            IF @Owner IS NULL
            BEGIN
                INSERT studio.object_ownership(object_type,object_id,owner_user_id)
                VALUES(@ObjectType,@ObjectID,@ActorUserID);
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,''REGISTER'',@ActorUserID);
                SET @Owner=@ActorUserID;
            END
            ELSE IF @Owner<>@ActorUserID THROW 52606, ''OWNER_ALREADY_REGISTERED'', 1;
        END
        ELSE IF @Action=''ADMIN_ASSIGN''
        BEGIN
            IF @IsAdmin<>1 THROW 52607, ''ADMIN_REQUIRED'', 1;
            IF @NewOwnerUserID IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@NewOwnerUserID)
                THROW 52608, ''TARGET_USER_NOT_FOUND'', 1;
            IF @Owner IS NULL
                INSERT studio.object_ownership(object_type,object_id,owner_user_id)
                VALUES(@ObjectType,@ObjectID,@NewOwnerUserID);
            ELSE
            BEGIN
                DELETE studio.object_access
                  WHERE object_type=@ObjectType AND object_id=@ObjectID
                  AND principal_type=''USER'' AND principal_id=@NewOwnerUserID;
                UPDATE studio.object_ownership SET owner_user_id=@NewOwnerUserID,
                    updated_at_utc=SYSUTCDATETIME()
                WHERE object_type=@ObjectType AND object_id=@ObjectID;
            END;
            INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,previous_owner_user_id,new_owner_user_id)
            VALUES(@ActorUserID,@ObjectType,@ObjectID,CASE WHEN @Owner IS NULL THEN ''CLAIM_LEGACY'' ELSE ''ADMIN_ASSIGN'' END,@Owner,@NewOwnerUserID);
            SET @Owner=@NewOwnerUserID;
        END
        ELSE
        BEGIN
            IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0 THROW 52609, ''OBJECT_NOT_REGISTERED'', 1;

            IF @Action=''CHECK''
            BEGIN
                DECLARE @level int=CASE WHEN @ObjectType=''SCHEDULE'' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID)
                    ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END;
                SET @EffectiveRole=CASE @level WHEN 30 THEN ''OWNER'' WHEN 20 THEN ''EDITOR'' WHEN 10 THEN ''ADMIN'' ELSE ''NONE'' END;
                IF @level=0 THROW 52610, ''OBJECT_ACCESS_DENIED'', 1;
            END
            ELSE IF @Action<>''GET'' AND @Owner<>@ActorUserID
                THROW 52611, ''OWNER_REQUIRED'', 1;
            ELSE IF @Action=''GET'' AND @Owner<>@ActorUserID AND @IsAdmin<>1
                THROW 52611, ''OWNER_REQUIRED'', 1;

            IF @Action=''GRANT''
            BEGIN
                IF @PrincipalType IS NULL OR @PrincipalType NOT IN (''USER'',''GROUP'') OR @PrincipalID IS NULL
                   OR @AccessRole IS NULL OR @AccessRole NOT IN (''VIEWER'',''EDITOR'')
                    THROW 52612, ''INVALID_GRANT_INPUT'', 1;
                IF (@PrincipalType=''USER'' AND NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@PrincipalID AND is_active=1 AND ISNULL(is_locked,0)=0))
                   OR (@PrincipalType=''GROUP'' AND NOT EXISTS(SELECT 1 FROM dbo.core_group WHERE group_id=@PrincipalID AND is_active=1))
                    THROW 52613, ''PRINCIPAL_NOT_FOUND_OR_INACTIVE'', 1;
                IF @PrincipalType=''USER'' AND @PrincipalID=@Owner
                    THROW 52614, ''OWNER_CANNOT_BE_SHARED'', 1;
                SELECT @OldRole=access_role FROM studio.object_access WITH (UPDLOCK,HOLDLOCK)
                    WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
                IF @OldRole IS NULL
                    INSERT studio.object_access(object_type,object_id,principal_type,principal_id,access_role,granted_by_user_id)
                    VALUES(@ObjectType,@ObjectID,@PrincipalType,@PrincipalID,@AccessRole,@ActorUserID);
                ELSE
                    UPDATE studio.object_access SET access_role=@AccessRole,granted_by_user_id=@ActorUserID,
                        granted_at_utc=SYSUTCDATETIME()
                    WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,target_principal_type,target_principal_id,old_access_role,new_access_role)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,CASE WHEN @OldRole IS NULL THEN ''GRANT'' ELSE ''CHANGE_ROLE'' END,@PrincipalType,@PrincipalID,@OldRole,@AccessRole);
            END
            ELSE IF @Action=''REVOKE''
            BEGIN
                IF @PrincipalType IS NULL OR @PrincipalType NOT IN (''USER'',''GROUP'') OR @PrincipalID IS NULL
                    THROW 52615, ''INVALID_REVOKE_INPUT'', 1;
                SELECT @OldRole=access_role FROM studio.object_access WITH (UPDLOCK,HOLDLOCK)
                  WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
                IF @OldRole IS NULL THROW 52616, ''GRANT_NOT_FOUND'', 1;
                DELETE studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID
                     AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,target_principal_type,target_principal_id,old_access_role)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,''REVOKE'',@PrincipalType,@PrincipalID,@OldRole);
            END
            ELSE IF @Action=''TRANSFER''
            BEGIN
                IF @NewOwnerUserID IS NULL OR @NewOwnerUserID=@Owner
                   OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@NewOwnerUserID)
                    THROW 52617, ''INVALID_NEW_OWNER'', 1;
                DELETE studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID
                      AND principal_type=''USER'' AND principal_id=@NewOwnerUserID;
                UPDATE studio.object_ownership SET owner_user_id=@NewOwnerUserID,
                    updated_at_utc=SYSUTCDATETIME()
                WHERE object_type=@ObjectType AND object_id=@ObjectID;
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,previous_owner_user_id,new_owner_user_id)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,''TRANSFER'',@Owner,@NewOwnerUserID);
            END;
        END;
        IF @Action NOT IN (''GET'',''CHECK'') COMMIT TRAN;

        IF @Action=''GET''
        BEGIN
            SELECT object_type,object_id,owner_user_id,created_at_utc,updated_at_utc
                FROM studio.object_ownership WHERE object_type=@ObjectType AND object_id=@ObjectID;
            SELECT principal_type,principal_id,access_role,granted_by_user_id,granted_at_utc
                FROM studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID;
            SELECT CAST(1 AS bit) AS success, CAST(''GET'' AS varchar(24)) AS action_type,
                   @IsAdmin AS is_admin;
        END
        ELSE IF @Action=''CHECK''
            SELECT CAST(1 AS bit) AS success, ''CHECK'' AS action_type, @EffectiveRole AS effective_role;
        ELSE
            SELECT CAST(1 AS bit) AS success, @Action AS action_type;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK TRAN;
        THROW;
    END CATCH;
END;';
SET @before=OBJECT_DEFINITION(OBJECT_ID(@object));
 IF @before IS NULL THROW 53001,'PROCEDURE_DEFINITION_NOT_VISIBLE',1;
 IF EXISTS(SELECT 1 FROM studio.phase2d8_schedule_check_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=@object)
 BEGIN
  SELECT @recorded=installed_definition FROM studio.phase2d8_schedule_check_backup WHERE object_name=@object;
  IF DATALENGTH(@before)<>DATALENGTH(@recorded) OR @before COLLATE Latin1_General_100_BIN2<>@recorded COLLATE Latin1_General_100_BIN2
   THROW 53002,'PROCEDURE_CHANGED_AFTER_030_INSTALL',1;
 END
 ELSE
 BEGIN
  IF CHARINDEX(@parameter,@before)=0 THROW 53003,'UNREVIEWED_SIGNATURE',1;
  SET @actual=LTRIM(RTRIM(REPLACE(SUBSTRING(@before,CHARINDEX(@parameter,@before),LEN(@before)),CHAR(13),'')));
  SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
  WHILE UNICODE(LEFT(@actual,1)) IN(9,10,32) SET @actual=LTRIM(STUFF(@actual,1,1,N''));
  WHILE UNICODE(RIGHT(@actual,1)) IN(9,10,32) SET @actual=RTRIM(LEFT(@actual,LEN(@actual)-1));
  WHILE UNICODE(LEFT(@expected,1)) IN(9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
  WHILE UNICODE(RIGHT(@expected,1)) IN(9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
  IF DATALENGTH(@actual)<>DATALENGTH(@expected) OR @actual COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
  BEGIN
   SELECT (SELECT @object AS [object_name],@actual AS [actual_body] FOR XML PATH('phase2d8_030_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
   SET @message=N'UNREVIEWED_029_DEFINITION: '+@object; THROW 53004,@message,1;
  END;
  SET @new=REPLACE(@before,N'IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0',N'IF @Owner IS NULL OR (CASE WHEN @ObjectType=''SCHEDULE'' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0');
  /* Persisted module headers may say CREATE even after an ALTER deployment.
     Use a fixed ALTER header; preserve parameters and body from the checked definition. */
  SET @new=N'ALTER PROCEDURE '+@object+N' '+SUBSTRING(@new,CHARINDEX(@parameter,@new),LEN(@new));
  EXEC sys.sp_executesql @new;
  INSERT studio.phase2d8_schedule_check_backup(object_name,previous_definition,installed_definition)
   VALUES(@object,@before,OBJECT_DEFINITION(OBJECT_ID(@object)));
 END;
SET @object=N'studio.spObjectAccessRpc'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@Payload)<>1
    BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_INVALID_ENVELOPE'' AS code; RETURN; END;
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
       req nvarchar(max) ''$.Request'',
       issued varchar(19) ''$.IssuedAtUtc'',
       nonce varchar(36) ''$.Nonce'',
       signature varchar(64) ''$.Signature''
    );

    SET @Nonce=TRY_CONVERT(uniqueidentifier,@NonceText);
    SET @Issued=TRY_CONVERT(datetime2(0),@IssuedAtUtc,126);
    IF @Nonce IS NULL OR @Issued IS NULL OR @Request IS NULL
       OR @NonceText<>LOWER(CONVERT(varchar(36),@Nonce))
       OR LEN(@IssuedAtUtc)<>19 OR LEN(@Signature)<>64 OR ISJSON(@Request)<>1
       OR ABS(DATEDIFF(SECOND,@Issued,SYSUTCDATETIME()))>120
    BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_ENVELOPE_EXPIRED_OR_INVALID'' AS code; RETURN; END;

    SELECT @Secret=key_bytes FROM studio.object_access_rpc_key WHERE key_id=1 AND enabled=1;
    IF @Secret IS NULL
    BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_GATEWAY_DISABLED'' AS code; RETURN; END;

    SET @Expected=studio.fnObjectAccessHmac256(
      @Secret,CONVERT(nvarchar(max),@IssuedAtUtc)+N''|''+CONVERT(nvarchar(max),@NonceText)+N''|''+@Request
    );
    IF @Expected IS NULL OR UPPER(@Signature)<>UPPER(@Expected)
    BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_SIGNATURE_INVALID'' AS code; RETURN; END;

    DECLARE @ActorUserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,''$.ActorUserID'')),
            @ObjectID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,''$.ObjectID'')),
            @ObjectType varchar(32)=UPPER(JSON_VALUE(@Request,''$.ObjectType'')),
            @Action varchar(24)=UPPER(JSON_VALUE(@Request,''$.Action'')),
            @PrincipalType varchar(8)=UPPER(JSON_VALUE(@Request,''$.PrincipalType'')),
            @PrincipalID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,''$.PrincipalID'')),
            @AccessRole varchar(8)=UPPER(JSON_VALUE(@Request,''$.AccessRole''));

    IF @ActorUserID IS NULL OR @ObjectID IS NULL
       OR @ObjectType NOT IN (''CONNECTION'',''DATASET'',''PIPELINE'',''SCHEDULE'',''CHART'',''DASHBOARD'')
       OR @Action NOT IN (''GET'',''CHECK'',''REGISTER'',''GRANT'',''REVOKE'')
    BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_ACTION_INVALID'' AS code; RETURN; END;

    IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@ActorUserID AND is_active=1 AND ISNULL(is_locked,0)=0)
    BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_ACTOR_INACTIVE'' AS code; RETURN; END;

    /* Consume nonce before performing any metadata read or write. */
    BEGIN TRY
        BEGIN TRAN;
        IF EXISTS(SELECT 1 FROM studio.object_access_rpc_nonce WITH (UPDLOCK,HOLDLOCK) WHERE nonce_id=@Nonce)
            THROW 52701,''OBJECT_ACCESS_NONCE_REPLAY'',1;
        INSERT studio.object_access_rpc_nonce(nonce_id) VALUES(@Nonce);
        COMMIT;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK;
        SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_NONCE_REPLAY_OR_DB_ERROR'' AS code;
        RETURN;
    END CATCH;

    /* GET is returned as ONE resultset: BEAM Core API normally serializes only
       the first set. Do not expose share list to Viewer/Editor. */
    IF @Action=''GET''
    BEGIN
        DECLARE @Owner uniqueidentifier=NULL,@IsAdmin bit=0;
        SELECT @Owner=owner_user_id FROM studio.object_ownership
          WHERE object_type=@ObjectType AND object_id=@ObjectID;
        IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0
        BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_NOT_REGISTERED'' AS code; RETURN; END;
        IF EXISTS(SELECT 1 FROM studio.object_access_admin_group ag
           JOIN dbo.core_user_group ug ON ug.group_id=ag.group_id AND ug.user_id=@ActorUserID
           JOIN dbo.core_group g ON g.group_id=ag.group_id AND g.is_active=1)
            SET @IsAdmin=1;
        IF @Owner<>@ActorUserID AND @IsAdmin=0 AND
          (CASE WHEN @ObjectType=''SCHEDULE'' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0
        BEGIN SELECT CAST(0 AS bit) AS success,''OWNER_REQUIRED'' AS code; RETURN; END;

        SELECT CAST(1 AS bit) AS success,''ACCESS_INFO'' AS code,
          CONVERT(varchar(36),@Owner) AS owner_user_id,
          @IsAdmin AS is_admin,
          COALESCE((SELECT principal_type,CONVERT(varchar(36),principal_id) AS principal_id,
                          access_role,CONVERT(varchar(36),granted_by_user_id) AS granted_by_user_id,
                          granted_at_utc
                    FROM studio.object_access
                    WHERE object_type=@ObjectType AND object_id=@ObjectID
                    FOR JSON PATH),''[]'') AS shares_json;
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
        SELECT CAST(0 AS bit) AS success,''OBJECT_ACCESS_OPERATION_DENIED'' AS code;
    END CATCH;
END;';
SET @before=OBJECT_DEFINITION(OBJECT_ID(@object));
 IF @before IS NULL THROW 53001,'PROCEDURE_DEFINITION_NOT_VISIBLE',1;
 IF EXISTS(SELECT 1 FROM studio.phase2d8_schedule_check_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=@object)
 BEGIN
  SELECT @recorded=installed_definition FROM studio.phase2d8_schedule_check_backup WHERE object_name=@object;
  IF DATALENGTH(@before)<>DATALENGTH(@recorded) OR @before COLLATE Latin1_General_100_BIN2<>@recorded COLLATE Latin1_General_100_BIN2
   THROW 53002,'PROCEDURE_CHANGED_AFTER_030_INSTALL',1;
 END
 ELSE
 BEGIN
  IF CHARINDEX(@parameter,@before)=0 THROW 53003,'UNREVIEWED_SIGNATURE',1;
  SET @actual=LTRIM(RTRIM(REPLACE(SUBSTRING(@before,CHARINDEX(@parameter,@before),LEN(@before)),CHAR(13),'')));
  SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
  WHILE UNICODE(LEFT(@actual,1)) IN(9,10,32) SET @actual=LTRIM(STUFF(@actual,1,1,N''));
  WHILE UNICODE(RIGHT(@actual,1)) IN(9,10,32) SET @actual=RTRIM(LEFT(@actual,LEN(@actual)-1));
  WHILE UNICODE(LEFT(@expected,1)) IN(9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
  WHILE UNICODE(RIGHT(@expected,1)) IN(9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
  IF DATALENGTH(@actual)<>DATALENGTH(@expected) OR @actual COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
  BEGIN
   SELECT (SELECT @object AS [object_name],@actual AS [actual_body] FOR XML PATH('phase2d8_030_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
   SET @message=N'UNREVIEWED_029_DEFINITION: '+@object; THROW 53004,@message,1;
  END;
  SET @new=REPLACE(@before,N'IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0',N'IF @Owner IS NULL OR (CASE WHEN @ObjectType=''SCHEDULE'' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0');
  /* Persisted module headers may say CREATE even after an ALTER deployment.
     Use a fixed ALTER header; preserve parameters and body from the checked definition. */
  SET @new=N'ALTER PROCEDURE '+@object+N' '+SUBSTRING(@new,CHARINDEX(@parameter,@new),LEN(@new));
  EXEC sys.sp_executesql @new;
  INSERT studio.phase2d8_schedule_check_backup(object_name,previous_definition,installed_definition)
   VALUES(@object,@before,OBJECT_DEFINITION(OBJECT_ID(@object)));
 END;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT (SELECT N'SCHEDULE_INHERITED_CHECK_030_INSTALLED_DEV_TRIALS_REQUIRED' AS [status],
 CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [verified_at_utc],
 N'Schedule CHECK/GET now use the same target inheritance as list/edit. Owner-only sharing/delete unchanged.' AS [scope]
 FOR XML PATH('phase2d8_schedule_check_fix'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
