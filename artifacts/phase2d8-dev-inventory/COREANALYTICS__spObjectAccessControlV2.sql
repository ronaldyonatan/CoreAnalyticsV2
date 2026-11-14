
/* No admin group is automatically privileged. A DBA must explicitly populate
   studio.object_access_admin_group after reviewing dbo.core_group. */
CREATE   PROCEDURE studio.spObjectAccessControlV2
    @ActorUserID uniqueidentifier,
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
       @ObjectType IS NULL OR @ObjectType NOT IN ('CONNECTION','DATASET','PIPELINE','SCHEDULE','CHART','DASHBOARD')
        THROW 52601, 'INVALID_OBJECT_ACCESS_INPUT', 1;
    IF @Action IS NULL OR @Action NOT IN ('GET','CHECK','REGISTER','GRANT','REVOKE','TRANSFER','ADMIN_ASSIGN')
        THROW 52602, 'INVALID_OBJECT_ACCESS_ACTION', 1;

    IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@ActorUserID)
        THROW 52603, 'ACTOR_NOT_FOUND', 1;

    DECLARE @IsAdmin bit=0,
            @Owner uniqueidentifier=NULL,
            @SourceOwner uniqueidentifier=NULL,
            @SourceExists bit=0,
            @OldRole varchar(8)=NULL,
            @EffectiveRole varchar(8)='NONE';
    IF EXISTS
    (
        SELECT 1 FROM studio.object_access_admin_group ag
        JOIN dbo.core_user_group ug ON ug.group_id=ag.group_id AND ug.user_id=@ActorUserID
        JOIN dbo.core_group g ON g.group_id=ag.group_id AND g.is_active=1
    ) SET @IsAdmin=1;

    BEGIN TRY
        IF @Action NOT IN ('GET','CHECK') BEGIN TRAN;
        SELECT @Owner=owner_user_id
          FROM studio.object_ownership WITH (UPDLOCK,HOLDLOCK)
          WHERE object_type=@ObjectType AND object_id=@ObjectID;

        /* Verify object against original metadata before any creation/claim.
           Source owner must match login ID exactly; do not trust strings or
           claim unknown/legacy owners without a DBA-approved admin assignment. */
        IF @Action IN ('REGISTER','ADMIN_ASSIGN')
        BEGIN
            IF @ObjectType='CONNECTION'
                SELECT @SourceExists=1, @SourceOwner=CASE WHEN LEN(LTRIM(RTRIM(created_by)))=36 THEN TRY_CONVERT(uniqueidentifier,created_by) END
                FROM studio.connection WHERE connection_id=@ObjectID;
            ELSE IF @ObjectType='DATASET'
                SELECT @SourceExists=1, @SourceOwner=CASE WHEN LEN(LTRIM(RTRIM(created_by)))=36 THEN TRY_CONVERT(uniqueidentifier,created_by) END
                FROM studio.dataset WHERE dataset_id=@ObjectID;
            ELSE IF @ObjectType='PIPELINE'
                SELECT @SourceExists=1, @SourceOwner=created_by
                FROM studio.pipeline WHERE pipeline_id=@ObjectID;
            ELSE IF @ObjectType='SCHEDULE'
                SELECT @SourceExists=1, @SourceOwner=created_by
                FROM studio.scheduler_schedule WHERE schedule_id=@ObjectID;
            ELSE IF @ObjectType='CHART'
                SELECT @SourceExists=1, @SourceOwner=owner_user_id
                FROM studio.chart WHERE chart_id=@ObjectID;
            /* No studio.dashboard table was present in the supplied SQL export.
               DASHBOARD registration is deliberately blocked until verified. */
            IF @SourceExists=0 THROW 52604, 'SOURCE_OBJECT_NOT_FOUND_OR_UNSUPPORTED', 1;
        END;

        IF @Action='REGISTER'
        BEGIN
            IF @SourceOwner IS NULL OR @SourceOwner<>@ActorUserID
                THROW 52605, 'SOURCE_OWNER_NOT_VERIFIED', 1;
            IF @Owner IS NULL
            BEGIN
                INSERT studio.object_ownership(object_type,object_id,owner_user_id)
                VALUES(@ObjectType,@ObjectID,@ActorUserID);
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,'REGISTER',@ActorUserID);
                SET @Owner=@ActorUserID;
            END
            ELSE IF @Owner<>@ActorUserID THROW 52606, 'OWNER_ALREADY_REGISTERED', 1;
        END
        ELSE IF @Action='ADMIN_ASSIGN'
        BEGIN
            IF @IsAdmin<>1 THROW 52607, 'ADMIN_REQUIRED', 1;
            IF @NewOwnerUserID IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@NewOwnerUserID)
                THROW 52608, 'TARGET_USER_NOT_FOUND', 1;
            IF @Owner IS NULL
                INSERT studio.object_ownership(object_type,object_id,owner_user_id)
                VALUES(@ObjectType,@ObjectID,@NewOwnerUserID);
            ELSE
            BEGIN
                DELETE studio.object_access
                  WHERE object_type=@ObjectType AND object_id=@ObjectID
                  AND principal_type='USER' AND principal_id=@NewOwnerUserID;
                UPDATE studio.object_ownership SET owner_user_id=@NewOwnerUserID,
                    updated_at_utc=SYSUTCDATETIME()
                WHERE object_type=@ObjectType AND object_id=@ObjectID;
            END;
            INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,previous_owner_user_id,new_owner_user_id)
            VALUES(@ActorUserID,@ObjectType,@ObjectID,CASE WHEN @Owner IS NULL THEN 'CLAIM_LEGACY' ELSE 'ADMIN_ASSIGN' END,@Owner,@NewOwnerUserID);
            SET @Owner=@NewOwnerUserID;
        END
        ELSE
        BEGIN
            IF @Owner IS NULL THROW 52609, 'OBJECT_NOT_REGISTERED', 1;

            IF @Action='CHECK'
            BEGIN
                IF @IsAdmin=1 SET @EffectiveRole='ADMIN';
                ELSE IF @Owner=@ActorUserID SET @EffectiveRole='OWNER';
                ELSE IF EXISTS
                (
                    SELECT 1 FROM studio.object_access a WHERE a.object_type=@ObjectType
                       AND a.object_id=@ObjectID AND a.access_role='EDITOR'
                       AND (
                           (a.principal_type='USER' AND a.principal_id=@ActorUserID)
                           OR (a.principal_type='GROUP' AND EXISTS
                              (SELECT 1 FROM dbo.core_user_group ug
                               JOIN dbo.core_group g ON g.group_id=ug.group_id AND g.is_active=1
                               WHERE ug.user_id=@ActorUserID AND ug.group_id=a.principal_id))
                       )
                ) SET @EffectiveRole='EDITOR';
                ELSE IF EXISTS
                (
                    SELECT 1 FROM studio.object_access a WHERE a.object_type=@ObjectType
                       AND a.object_id=@ObjectID AND a.access_role='VIEWER'
                       AND (
                           (a.principal_type='USER' AND a.principal_id=@ActorUserID)
                           OR (a.principal_type='GROUP' AND EXISTS
                              (SELECT 1 FROM dbo.core_user_group ug
                               JOIN dbo.core_group g ON g.group_id=ug.group_id AND g.is_active=1
                               WHERE ug.user_id=@ActorUserID AND ug.group_id=a.principal_id))
                       )
                ) SET @EffectiveRole='VIEWER';
                IF @EffectiveRole='NONE' THROW 52610, 'OBJECT_ACCESS_DENIED', 1;
            END
            ELSE IF @Action<>'GET' AND @Owner<>@ActorUserID AND @IsAdmin<>1
                THROW 52611, 'OWNER_REQUIRED', 1;
            ELSE IF @Action='GET' AND @Owner<>@ActorUserID AND @IsAdmin<>1
                THROW 52611, 'OWNER_REQUIRED', 1;

            IF @Action='GRANT'
            BEGIN
                IF @PrincipalType IS NULL OR @PrincipalType NOT IN ('USER','GROUP') OR @PrincipalID IS NULL
                   OR @AccessRole IS NULL OR @AccessRole NOT IN ('VIEWER','EDITOR')
                    THROW 52612, 'INVALID_GRANT_INPUT', 1;
                IF (@PrincipalType='USER' AND NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@PrincipalID))
                   OR (@PrincipalType='GROUP' AND NOT EXISTS(SELECT 1 FROM dbo.core_group WHERE group_id=@PrincipalID AND is_active=1))
                    THROW 52613, 'PRINCIPAL_NOT_FOUND_OR_INACTIVE', 1;
                IF @PrincipalType='USER' AND @PrincipalID=@Owner
                    THROW 52614, 'OWNER_CANNOT_BE_SHARED', 1;
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
                VALUES(@ActorUserID,@ObjectType,@ObjectID,CASE WHEN @OldRole IS NULL THEN 'GRANT' ELSE 'CHANGE_ROLE' END,@PrincipalType,@PrincipalID,@OldRole,@AccessRole);
            END
            ELSE IF @Action='REVOKE'
            BEGIN
                IF @PrincipalType IS NULL OR @PrincipalType NOT IN ('USER','GROUP') OR @PrincipalID IS NULL
                    THROW 52615, 'INVALID_REVOKE_INPUT', 1;
                SELECT @OldRole=access_role FROM studio.object_access WITH (UPDLOCK,HOLDLOCK)
                  WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
                IF @OldRole IS NULL THROW 52616, 'GRANT_NOT_FOUND', 1;
                DELETE studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID
                     AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,target_principal_type,target_principal_id,old_access_role)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,'REVOKE',@PrincipalType,@PrincipalID,@OldRole);
            END
            ELSE IF @Action='TRANSFER'
            BEGIN
                IF @NewOwnerUserID IS NULL OR @NewOwnerUserID=@Owner
                   OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@NewOwnerUserID)
                    THROW 52617, 'INVALID_NEW_OWNER', 1;
                DELETE studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID
                      AND principal_type='USER' AND principal_id=@NewOwnerUserID;
                UPDATE studio.object_ownership SET owner_user_id=@NewOwnerUserID,
                    updated_at_utc=SYSUTCDATETIME()
                WHERE object_type=@ObjectType AND object_id=@ObjectID;
                INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,previous_owner_user_id,new_owner_user_id)
                VALUES(@ActorUserID,@ObjectType,@ObjectID,'TRANSFER',@Owner,@NewOwnerUserID);
            END;
        END;
        IF @Action NOT IN ('GET','CHECK') COMMIT TRAN;

        IF @Action='GET'
        BEGIN
            SELECT object_type,object_id,owner_user_id,created_at_utc,updated_at_utc
                FROM studio.object_ownership WHERE object_type=@ObjectType AND object_id=@ObjectID;
            SELECT principal_type,principal_id,access_role,granted_by_user_id,granted_at_utc
                FROM studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID;
            SELECT CAST(1 AS bit) AS success, CAST('GET' AS varchar(24)) AS action_type,
                   @IsAdmin AS is_admin;
        END
        ELSE IF @Action='CHECK'
            SELECT CAST(1 AS bit) AS success, 'CHECK' AS action_type, @EffectiveRole AS effective_role;
        ELSE
            SELECT CAST(1 AS bit) AS success, @Action AS action_type;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT>0 ROLLBACK TRAN;
        THROW;
    END CATCH;
END;
