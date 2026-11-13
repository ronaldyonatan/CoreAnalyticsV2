/* Phase2D8 / 029 SHARED_EDIT_DEV_REV2. One file, one XML result.
   Based on user DEV export 2026-11-12 + confirmed installed owner-only 028.
   Explicit USER/GROUP shares (legacy VIEWER included) permit read/edit/run/schedule.
   Delete, sharing and transfer remain primary-owner-only. Admin alone is read-only.
   Preserves atomic registration, worker leases, recurrence, tombstones and legacy dashboards.
   Run manually in DEV. No key/configuration/grant rows are changed.
   Includes exact normalized definition guards; any unknown drift rolls back ALL changes.
   SQL Server execution/integration trials are still required; this is a DEV candidate.
*/
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 52900,'RUN_IN_SESSION_WITHOUT_OPEN_TRANSACTION',1;
IF DB_ID(N'BI') IS NULL THROW 52900,'BI_GATEWAY_REQUIRED',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID('studio.phase2d8_dataplane_backup','U') IS NULL
  CREATE TABLE studio.phase2d8_dataplane_backup(
   database_name nvarchar(128) NOT NULL,object_name nvarchar(256) NOT NULL,
   previous_definition nvarchar(max) NULL,installed_definition nvarchar(max) NOT NULL,
   installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
   CONSTRAINT PK_phase2d8_dataplane_backup PRIMARY KEY(database_name,object_name));
 DECLARE @db nvarchar(128),@object nvarchar(256),@parameter nvarchar(40),@old nvarchar(max),
  @expected nvarchar(max),@new nvarchar(max),@body nvarchar(max),@installed nvarchar(max),@probe nvarchar(max),@message nvarchar(2048);
SET @db=N'CoreAnalytics'; SET @object=N'studio.fnStudioAccessLevel'; SET @parameter=N'@actor'; SET @expected=NULL; SET @new=N'CREATE OR ALTER FUNCTION studio.fnStudioAccessLevel(@actor uniqueidentifier,@kind varchar(32),@id uniqueidentifier)
RETURNS int
AS
BEGIN
 /* SHARED_EDIT_029: all explicit USER/GROUP shares permit edit/run, never delete/share.
    HOLDLOCK retains authorization locks until the calling transaction ends. */
 IF @actor IS NULL OR @id IS NULL RETURN 0;
 IF @kind NOT IN (''CONNECTION'',''DATASET'',''PIPELINE'',''SCHEDULE'',''CHART'') RETURN 0;
 IF @kind=''CONNECTION'' AND NOT EXISTS(SELECT 1 FROM studio.connection WHERE connection_id=@id) RETURN 0;
 IF @kind=''DATASET'' AND NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@id) RETURN 0;
 IF @kind=''PIPELINE'' AND NOT EXISTS(SELECT 1 FROM studio.pipeline WHERE pipeline_id=@id) RETURN 0;
 IF @kind=''SCHEDULE'' AND NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WHERE schedule_id=@id) RETURN 0;
 IF @kind=''CHART'' AND NOT EXISTS(SELECT 1 FROM studio.chart WHERE chart_id=@id) RETURN 0;
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WITH(HOLDLOCK) WHERE user_id=@actor AND is_active=1 AND is_locked=0) RETURN 0;
 DECLARE @owner uniqueidentifier;
 SELECT @owner=owner_user_id FROM studio.object_ownership WITH(HOLDLOCK) WHERE object_type=@kind AND object_id=@id;
 IF @owner IS NULL RETURN 0;
 IF @owner=@actor RETURN 30;
 IF EXISTS(SELECT 1 FROM studio.object_access a WITH(HOLDLOCK) WHERE a.object_type=@kind AND a.object_id=@id
   AND a.access_role IN (''VIEWER'',''EDITOR'') AND
   ((a.principal_type=''USER'' AND a.principal_id=@actor) OR
    (a.principal_type=''GROUP'' AND EXISTS(SELECT 1 FROM dbo.core_user_group ug WITH(HOLDLOCK)
     JOIN dbo.core_group g WITH(HOLDLOCK) ON g.group_id=ug.group_id AND g.is_active=1
     WHERE ug.user_id=@actor AND ug.group_id=a.principal_id)))) RETURN 20;
 IF EXISTS(SELECT 1 FROM studio.object_access_admin_group ag WITH(HOLDLOCK)
    JOIN dbo.core_user_group ug WITH(HOLDLOCK) ON ug.group_id=ag.group_id AND ug.user_id=@actor
    JOIN dbo.core_group g WITH(HOLDLOCK) ON g.group_id=ag.group_id AND g.is_active=1) RETURN 10;
 RETURN 0;
END;';
SET @old=OBJECT_DEFINITION(OBJECT_ID(@object));
IF NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 IF @old IS NOT NULL THROW 52901,'UNREVIEWED_EXISTING_AUTHORIZATION_FUNCTION',1;
 EXEC sys.sp_executesql @new;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,NULL,OBJECT_DEFINITION(OBJECT_ID(@object)));
END
ELSE
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF @old IS NULL OR DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
  THROW 52902,'AUTHORIZATION_FUNCTION_CHANGED_AFTER_INSTALL',1;
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.fnStudioScheduleAccess'; SET @parameter=N'@actor'; SET @expected=NULL; SET @new=N'CREATE OR ALTER FUNCTION studio.fnStudioScheduleAccess(@actor uniqueidentifier,@id uniqueidentifier)
RETURNS int AS BEGIN
 DECLARE @level int=studio.fnStudioAccessLevel(@actor,''SCHEDULE'',@id),@target uniqueidentifier,@kind varchar(12),@targetLevel int;
 IF @level=30 RETURN 30;
 SELECT @target=target_id,@kind=target_type FROM studio.scheduler_schedule WITH(HOLDLOCK) WHERE schedule_id=@id;
 SET @targetLevel=studio.fnStudioAccessLevel(@actor,CASE WHEN @kind=''STORED'' THEN ''DATASET'' WHEN @kind=''PIPELINE'' THEN ''PIPELINE'' ELSE '''' END,@target);
 IF @targetLevel>=20 RETURN 20;
 RETURN @level;
END;';
SET @old=OBJECT_DEFINITION(OBJECT_ID(@object));
IF NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 IF @old IS NOT NULL THROW 52901,'UNREVIEWED_EXISTING_AUTHORIZATION_FUNCTION',1;
 EXEC sys.sp_executesql @new;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,NULL,OBJECT_DEFINITION(OBJECT_ID(@object)));
END
ELSE
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF @old IS NULL OR DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
  THROW 52902,'AUTHORIZATION_FUNCTION_CHANGED_AFTER_INSTALL',1;
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.fnStudioGraphSourcesAllowed'; SET @parameter=N'@actor'; SET @expected=NULL; SET @new=N'CREATE OR ALTER FUNCTION studio.fnStudioGraphSourcesAllowed(@actor uniqueidentifier,@document nvarchar(max))
RETURNS bit AS BEGIN
 IF ISJSON(@document)<>1 RETURN 0;
 IF EXISTS(SELECT 1 FROM OPENJSON(@document,''$.graph.sources'') WITH(kind varchar(20),dataset_id uniqueidentifier) s
   WHERE s.kind=''dataset'' AND (studio.fnStudioAccessLevel(@actor,''DATASET'',s.dataset_id)<10
    OR NOT EXISTS(SELECT 1 FROM studio.dataset d WHERE d.dataset_id=s.dataset_id AND d.access_mode=''DIRECT''))) RETURN 0;
 RETURN 1;
END;';
SET @old=OBJECT_DEFINITION(OBJECT_ID(@object));
IF NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 IF @old IS NOT NULL THROW 52901,'UNREVIEWED_EXISTING_AUTHORIZATION_FUNCTION',1;
 EXEC sys.sp_executesql @new;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,NULL,OBJECT_DEFINITION(OBJECT_ID(@object)));
END
ELSE
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF @old IS NULL OR DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
  THROW 52902,'AUTHORIZATION_FUNCTION_CHANGED_AFTER_INSTALL',1;
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.fnStudioChartSourceAllowed'; SET @parameter=N'@actor'; SET @expected=NULL; SET @new=N'CREATE OR ALTER FUNCTION studio.fnStudioChartSourceAllowed(@actor uniqueidentifier,@config nvarchar(max))
RETURNS bit AS BEGIN
 IF ISJSON(@config)<>1 RETURN 0;
 DECLARE @kind varchar(20)=JSON_VALUE(@config,''$.dataset_kind''),@id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@config,''$.dataset_id''));
 IF @kind=''DIRECT'' AND EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@id AND access_mode=''DIRECT'')
  AND studio.fnStudioAccessLevel(@actor,''DATASET'',@id)>=10 RETURN 1;
 IF @kind=''PARQUET'' AND EXISTS(SELECT 1 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id
  WHERE o.output_version_id=@id AND r.status=''SUCCEEDED'' AND studio.fnStudioAccessLevel(@actor,''PIPELINE'',r.pipeline_id)>=10
  AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)) RETURN 1;
 RETURN 0;
END;';
SET @old=OBJECT_DEFINITION(OBJECT_ID(@object));
IF NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 IF @old IS NOT NULL THROW 52901,'UNREVIEWED_EXISTING_AUTHORIZATION_FUNCTION',1;
 EXEC sys.sp_executesql @new;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,NULL,OBJECT_DEFINITION(OBJECT_ID(@object)));
END
ELSE
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF @old IS NULL OR DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
  THROW 52902,'AUTHORIZATION_FUNCTION_CHANGED_AFTER_INSTALL',1;
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spObjectAccessControlV2'; SET @parameter=N'@ActorUserID'; SET @expected=N'@ActorUserID uniqueidentifier,
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
            IF @Owner IS NULL THROW 52609, ''OBJECT_NOT_REGISTERED'', 1;

            IF @Action=''CHECK''
            BEGIN
                IF @Owner=@ActorUserID SET @EffectiveRole=''OWNER'';
                ELSE IF @IsAdmin=1 SET @EffectiveRole=''ADMIN'';
                ELSE IF EXISTS
                (
                    SELECT 1 FROM studio.object_access a WHERE a.object_type=@ObjectType
                       AND a.object_id=@ObjectID AND a.access_role=''EDITOR''
                       AND (
                           (a.principal_type=''USER'' AND a.principal_id=@ActorUserID)
                           OR (a.principal_type=''GROUP'' AND EXISTS
                              (SELECT 1 FROM dbo.core_user_group ug
                               JOIN dbo.core_group g ON g.group_id=ug.group_id AND g.is_active=1
                               WHERE ug.user_id=@ActorUserID AND ug.group_id=a.principal_id))
                       )
                ) SET @EffectiveRole=''EDITOR'';
                ELSE IF EXISTS
                (
                    SELECT 1 FROM studio.object_access a WHERE a.object_type=@ObjectType
                       AND a.object_id=@ObjectID AND a.access_role=''VIEWER''
                       AND (
                           (a.principal_type=''USER'' AND a.principal_id=@ActorUserID)
                           OR (a.principal_type=''GROUP'' AND EXISTS
                              (SELECT 1 FROM dbo.core_user_group ug
                               JOIN dbo.core_group g ON g.group_id=ug.group_id AND g.is_active=1
                               WHERE ug.user_id=@ActorUserID AND ug.group_id=a.principal_id))
                       )
                ) SET @EffectiveRole=''VIEWER'';
                IF @EffectiveRole=''NONE'' THROW 52610, ''OBJECT_ACCESS_DENIED'', 1;
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
END;'; SET @new=N'ALTER PROCEDURE studio.spObjectAccessControlV2
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
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spObjectAccessRpc'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max)
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
        IF @Owner IS NULL
        BEGIN SELECT CAST(0 AS bit) AS success,''OBJECT_NOT_REGISTERED'' AS code; RETURN; END;
        IF EXISTS(SELECT 1 FROM studio.object_access_admin_group ag
           JOIN dbo.core_user_group ug ON ug.group_id=ag.group_id AND ug.user_id=@ActorUserID
           JOIN dbo.core_group g ON g.group_id=ag.group_id AND g.is_active=1)
            SET @IsAdmin=1;
        IF @Owner<>@ActorUserID AND @IsAdmin=0
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
END;'; SET @new=N'/* Signed gateway: do not trust ActorUserID alone, even if BEAM has an x-token.
   JSON shape: {"Request":"<JSON string>","IssuedAtUtc":"yyyy-MM-ddTHH:mm:ss",
                "Nonce":"<GUID>","Signature":"<64-char hex>"}
   HMAC bytes = UTF-16LE(IssuedAtUtc + ''|'' + lower(Nonce) + ''|'' + Request).
   Replay: GUID nonce consumed in SQL atomically, 120s clock skew tolerance.
   This entry point never accepts TRANSFER or ADMIN_ASSIGN until BEAM''s legacy
   metadata owner restrictions and data-plane permissions are synchronized.
*/
ALTER PROCEDURE studio.spObjectAccessRpc
    @Payload nvarchar(max)
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
END;
';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spPipelineControl'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  SET XACT_ABORT ON;  DECLARE @action varchar(30)=JSON_VALUE(@Payload,''$.Action''),  @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),  @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.PipelineID'')),  @run uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RunID'')),  @output uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.OutputVersionID'')),  @worker uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.WorkerID'')),  @request uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RequestID'')),  @version int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.Version'')),  @expected int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.ExpectedVersion'')),  @name nvarchar(150)=JSON_VALUE(@Payload,''$.PipelineName''),  @document nvarchar(max)=JSON_VALUE(@Payload,''$.GraphJSON''),  @outputs nvarchar(max)=JSON_VALUE(@Payload,''$.OutputsJSON''),  @status varchar(12)=JSON_VALUE(@Payload,''$.Status''),  @error varchar(100)=JSON_VALUE(@Payload,''$.ErrorCode''),  @now datetime2(3)=SYSUTCDATETIME(), @current int, @existing uniqueidentifier,  @recovery bit=0, @cancel bit=0;  /* JSON_VALUE truncates long strings at 4000 characters; OPENJSON preserves them. */  SELECT @document=GraphJSON,@outputs=OutputsJSON FROM OPENJSON(@Payload)  WITH(GraphJSON nvarchar(max) ''$.GraphJSON'',OutputsJSON nvarchar(max) ''$.OutputsJSON'');  IF @action NOT IN (''Claim'',''Heartbeat'',''Complete'') AND NOT EXISTS  (SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''PIPELINE_NOT_FOUND'' code; RETURN; END;  BEGIN TRY  IF @action=''Status''  BEGIN SELECT CAST(1 AS bit) success,CAST(1 AS bit) metadata_ready,1 AS uuid_transport_version,1 AS output_path_version,  CAST(CASE WHEN EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status=''RUNNING'' AND lease_expires_at>@now) THEN 1 ELSE 0 END AS bit) active_job; RETURN; END;  IF @action=''List''  BEGIN  SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),p.pipeline_id)) AS pipeline_id,p.pipeline_name,MAX(v.version) version,p.updated_at  FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id  WHERE p.created_by=@owner GROUP BY p.pipeline_id,p.pipeline_name,p.updated_at ORDER BY p.updated_at DESC FOR JSON PATH) items_json; RETURN;  END;  IF @action=''Get''  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id WHERE p.pipeline_id=@id AND p.created_by=@owner AND (@version IS NULL OR v.version=@version))  BEGIN SELECT CAST(0 AS bit) success,''PIPELINE_NOT_FOUND'' code; RETURN; END;  SELECT TOP(1) CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),p.pipeline_id)) AS pipeline_id,p.pipeline_name,v.version,v.graph_json  FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id  WHERE p.pipeline_id=@id AND p.created_by=@owner AND (@version IS NULL OR v.version=@version) ORDER BY v.version DESC; RETURN;  END;  IF @action=''Save''  BEGIN  IF @expected IS NULL OR @expected<0 OR LEN(LTRIM(RTRIM(@name)))=0 OR ISJSON(@document)<>1  BEGIN SELECT CAST(0 AS bit) success,''PIPELINE_INPUT_INVALID'' code; RETURN; END;  BEGIN TRAN;  IF @id IS NULL  BEGIN  IF @expected<>0 THROW 50001,''PIPELINE_VERSION_CONFLICT'',1;  SET @id=NEWID();  INSERT studio.pipeline(pipeline_id,pipeline_name,created_by) VALUES(@id,@name,@owner);
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''PIPELINE'',@id,@owner);
    INSERT INTO studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@owner,''PIPELINE'',@id,''REGISTER'',@owner);
  SET @current=0;  END  ELSE  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline WITH(UPDLOCK,HOLDLOCK) WHERE pipeline_id=@id AND created_by=@owner) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT @current=ISNULL(MAX(version),0) FROM studio.pipeline_version WHERE pipeline_id=@id;  IF @current<>@expected THROW 50001,''PIPELINE_VERSION_CONFLICT'',1;  END;  SET @version=@current+1;  INSERT studio.pipeline_version(pipeline_id,version,graph_json,created_by) VALUES(@id,@version,@document,@owner);  UPDATE studio.pipeline SET pipeline_name=@name,updated_at=@now WHERE pipeline_id=@id;  COMMIT;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@id)) AS pipeline_id,@name pipeline_name,@version version; RETURN;  END;  IF @action=''Submit''  BEGIN  BEGIN TRAN;  SELECT @existing=run_id FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE requested_by=@owner AND request_id=@request;  IF @existing IS NOT NULL  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@existing AND pipeline_id=@id AND version=@version) THROW 50001,''PIPELINE_REQUEST_REUSED'',1;  COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),run_id)) AS run_id,status,version FROM studio.pipeline_run WHERE run_id=@existing; RETURN;  END;  IF @request IS NULL OR NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id WHERE p.pipeline_id=@id AND p.created_by=@owner AND v.version=@version) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SET @run=NEWID();  INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@id,@version,@owner,@request);  COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@run)) AS run_id,''QUEUED'' status,@version version; RETURN;  END;     IF @action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'')   BEGIN    DECLARE @DeletePath nvarchar(512),@DeleteRun uniqueidentifier,@DeleteState varchar(12);    IF @output IS NULL OR @run IS NULL THROW 50001,''PIPELINE_DELETE_INVALID'',1;    BEGIN TRAN;    SELECT @DeletePath=o.storage_relative_path,@DeleteRun=o.run_id     FROM studio.pipeline_output_version o WITH(UPDLOCK,HOLDLOCK)     JOIN studio.pipeline_run r WITH(UPDLOCK,HOLDLOCK) ON r.run_id=o.run_id     JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id     WHERE o.output_version_id=@output AND o.run_id=@run AND r.status=''SUCCEEDED''      AND r.requested_by=@owner AND p.created_by=@owner;    IF @DeletePath IS NULL THROW 50001,''PIPELINE_DELETE_NOT_FOUND'',1;    IF EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status IN (''QUEUED'',''RUNNING''))      OR EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE status IN (''QUEUED'',''RUNNING''))      THROW 50001,''PIPELINE_DELETE_JOB_ACTIVE'',1;    SELECT @DeleteState=state FROM studio.parquet_delete_state WITH(UPDLOCK,HOLDLOCK)     WHERE kind=''ETL_OUTPUT'' AND target_id=@output;    IF @action=''CheckDelete''    BEGIN     IF @DeleteState IS NOT NULL THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     COMMIT;     SELECT CAST(1 AS bit) success,''PIPELINE_DELETE_ALLOWED'' code,      LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@output)) output_version_id,@DeletePath storage_relative_path;     RETURN;    END;    IF @action=''BeginDelete''    BEGIN     IF @DeleteState IS NOT NULL THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     INSERT studio.parquet_delete_state(kind,target_id,run_id,owner_id,storage_relative_path)     VALUES(''ETL_OUTPUT'',@output,@DeleteRun,@owner,@DeletePath);    END    ELSE IF @action=''FinishDelete''    BEGIN     IF @DeleteState<>''PENDING'' THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     UPDATE studio.parquet_delete_state SET state=''DELETED'',finished_at=SYSUTCDATETIME()      WHERE kind=''ETL_OUTPUT'' AND target_id=@output AND owner_id=@owner;    END    ELSE IF @action=''AbortDelete''    BEGIN     IF @DeleteState<>''PENDING'' THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     DELETE studio.parquet_delete_state WHERE kind=''ETL_OUTPUT'' AND target_id=@output AND owner_id=@owner;    END;    COMMIT;    SELECT CAST(1 AS bit) success,''PIPELINE_DELETE_OK'' code,     LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@output)) output_version_id,@DeletePath storage_relative_path;    RETURN;   END;  IF @action=''Outputs''  BEGIN  SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_name,o.row_count,o.created_at,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version  FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id  WHERE r.status=''SUCCEEDED'' AND r.requested_by=@owner AND p.created_by=@owner AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)  ORDER BY o.created_at DESC,o.output_version_id FOR JSON PATH) items_json; RETURN;  END;  IF @action=''Output''  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id  WHERE o.output_version_id=@output AND r.status=''SUCCEEDED'' AND r.requested_by=@owner AND p.created_by=@owner AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)) THROW 50001,''PIPELINE_OUTPUT_NOT_FOUND'',1;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_node_id,o.output_name,o.row_count,o.schema_json,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,r.version  FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id WHERE o.output_version_id=@output AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id); RETURN;  END;  IF @action=''Jobs''  BEGIN  SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,r.cancel_requested,  (SELECT COUNT(*) FROM studio.pipeline_output_version o WHERE o.run_id=r.run_id AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)) output_count  FROM studio.pipeline_run r JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id  WHERE r.requested_by=@owner ORDER BY r.created_at DESC FOR JSON PATH) items_json; RETURN;  END;  IF @action=''Job''  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@run AND requested_by=@owner) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,r.cancel_requested,  (SELECT LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_node_id,o.output_name,o.row_count,o.schema_json FROM studio.pipeline_output_version o WHERE o.run_id=r.run_id AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id) FOR JSON PATH) outputs_json  FROM studio.pipeline_run r JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id WHERE r.run_id=@run AND r.requested_by=@owner; RETURN;  END;  IF @action=''Cancel''  BEGIN  UPDATE studio.pipeline_run SET cancel_requested=1,  status=CASE WHEN status=''QUEUED'' THEN ''CANCELLED'' ELSE status END,  finished_at=CASE WHEN status=''QUEUED'' THEN @now ELSE finished_at END  WHERE run_id=@run AND requested_by=@owner AND status IN (''QUEUED'',''RUNNING'');  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@run AND requested_by=@owner) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),run_id)) AS run_id,status,cancel_requested FROM studio.pipeline_run WHERE run_id=@run AND requested_by=@owner; RETURN;  END;  IF @action=''Claim''  BEGIN  IF @worker IS NULL THROW 50001,''PIPELINE_INPUT_INVALID'',1;  BEGIN TRAN;  SELECT TOP(1) @run=run_id,@recovery=CASE WHEN status=''RUNNING'' THEN 1 ELSE 0 END  FROM studio.pipeline_run WITH(UPDLOCK,READPAST,ROWLOCK)  WHERE status=''QUEUED'' OR (status=''RUNNING'' AND lease_expires_at<=@now) ORDER BY created_at;  IF @run IS NULL BEGIN COMMIT; SELECT CAST(1 AS bit) success,CAST(0 AS bit) has_job; RETURN; END;  UPDATE studio.pipeline_run SET status=''RUNNING'',started_at=ISNULL(started_at,@now),heartbeat_at=@now,lease_owner=@worker,lease_expires_at=DATEADD(second,90,@now) WHERE run_id=@run;  COMMIT;  SELECT CAST(1 AS bit) success,CAST(1 AS bit) has_job,@recovery is_recovery,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.requested_by)) AS requested_by,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,r.version,r.cancel_requested,v.graph_json  FROM studio.pipeline_run r JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run; RETURN;  END;  IF @action=''Heartbeat''  BEGIN  UPDATE studio.pipeline_run SET heartbeat_at=@now,lease_expires_at=DATEADD(second,90,@now)  WHERE run_id=@run AND status=''RUNNING'' AND lease_owner=@worker AND lease_expires_at>@now;  IF @@ROWCOUNT=0 THROW 50001,''PIPELINE_LEASE_LOST'',1;  SELECT CAST(1 AS bit) success,cancel_requested FROM studio.pipeline_run WHERE run_id=@run; RETURN;  END;  IF @action=''Complete''  BEGIN  IF @status NOT IN (''SUCCEEDED'',''FAILED'',''CANCELLED'') OR @status IS NULL THROW 50001,''PIPELINE_STATUS_INVALID'',1;  BEGIN TRAN;  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@run AND status=''RUNNING'' AND lease_owner=@worker AND lease_expires_at>@now) THROW 50001,''PIPELINE_LEASE_LOST'',1;  SELECT @cancel=cancel_requested FROM studio.pipeline_run WHERE run_id=@run;  IF @cancel=1 SET @status=''CANCELLED'';  IF @status=''SUCCEEDED''  BEGIN  IF ISJSON(@outputs)<>1 OR LEFT(LTRIM(@outputs),1)<>''['' THROW 50001,''PIPELINE_OUTPUT_INVALID'',1;  DECLARE @out TABLE(ordinal int,id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max));  INSERT @out  SELECT TRY_CONVERT(int,j.[key]),o.id,o.name,o.path,o.row_count,o.schema_json  FROM OPENJSON(@outputs) j CROSS APPLY OPENJSON(j.value)  WITH(id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max) ''$.schema'' AS JSON) o;  SELECT @document=v.graph_json FROM studio.pipeline_run r JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run;  IF (SELECT COUNT(*) FROM @out) NOT BETWEEN 1 AND 6 OR (SELECT COUNT(*) FROM @out)<>(SELECT COUNT(*) FROM OPENJSON(@document,''$.graph.outputs'')) OR  EXISTS(SELECT id FROM @out GROUP BY id HAVING COUNT(*)>1) OR  EXISTS(SELECT 1 FROM @out o WHERE o.id IS NULL OR o.name IS NULL OR o.path IS NULL OR o.row_count IS NULL OR o.row_count<0 OR ISJSON(o.schema_json)<>1 OR o.schema_json IS NULL OR o.ordinal IS NULL OR o.ordinal NOT BETWEEN 0 AND 5  OR o.path COLLATE Latin1_General_BIN2 <> (LOWER(CONVERT(nvarchar(36),@run))+N''/output-''+CONVERT(nvarchar(10),o.ordinal)) COLLATE Latin1_General_BIN2  OR DATALENGTH(o.path) <> DATALENGTH(LOWER(CONVERT(nvarchar(36),@run))+N''/output-''+CONVERT(nvarchar(10),o.ordinal)) OR NOT EXISTS(SELECT 1 FROM OPENJSON(@document,''$.graph.outputs'') expected CROSS APPLY OPENJSON(expected.value) WITH(id nvarchar(80),name nvarchar(150)) x WHERE TRY_CONVERT(int,expected.[key])=o.ordinal AND x.id=o.id AND x.name=o.name)) THROW 50001,''PIPELINE_OUTPUT_INVALID'',1;  INSERT studio.pipeline_output_version(run_id,output_node_id,output_name,storage_relative_path,row_count,schema_json) SELECT @run,id,name,path,row_count,schema_json FROM @out;  END;  UPDATE studio.pipeline_run SET status=@status,finished_at=@now,error_code=CASE WHEN @status=''FAILED'' THEN @error ELSE NULL END,lease_owner=NULL,lease_expires_at=NULL WHERE run_id=@run;  COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@run)) AS run_id,@status status; RETURN;  END;  SELECT CAST(0 AS bit) success,''PIPELINE_ACTION_INVALID'' code;  END TRY  BEGIN CATCH  IF XACT_STATE()<>0 ROLLBACK;  SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=50001 THEN ERROR_MESSAGE() ELSE ''PIPELINE_METADATA_UNAVAILABLE'' END code;  END CATCH; END;'; SET @new=N'ALTER PROCEDURE studio.spPipelineControl @Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  SET XACT_ABORT ON;  DECLARE @action varchar(30)=JSON_VALUE(@Payload,''$.Action''),  @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),  @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.PipelineID'')),  @run uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RunID'')),  @output uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.OutputVersionID'')),  @worker uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.WorkerID'')),  @request uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RequestID'')),  @version int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.Version'')),  @expected int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.ExpectedVersion'')),  @name nvarchar(150)=JSON_VALUE(@Payload,''$.PipelineName''),  @document nvarchar(max)=JSON_VALUE(@Payload,''$.GraphJSON''),  @outputs nvarchar(max)=JSON_VALUE(@Payload,''$.OutputsJSON''),  @status varchar(12)=JSON_VALUE(@Payload,''$.Status''),  @error varchar(100)=JSON_VALUE(@Payload,''$.ErrorCode''),  @now datetime2(3)=SYSUTCDATETIME(), @current int, @existing uniqueidentifier,  @recovery bit=0, @cancel bit=0;  /* JSON_VALUE truncates long strings at 4000 characters; OPENJSON preserves them. */  SELECT @document=GraphJSON,@outputs=OutputsJSON FROM OPENJSON(@Payload)  WITH(GraphJSON nvarchar(max) ''$.GraphJSON'',OutputsJSON nvarchar(max) ''$.OutputsJSON'');  IF @action NOT IN (''Claim'',''Heartbeat'',''Complete'') AND NOT EXISTS  (SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''PIPELINE_NOT_FOUND'' code; RETURN; END;  BEGIN TRY  DECLARE @requiredLevel int=CASE WHEN @action IN (''Save'',''Submit'',''Cancel'') THEN 20 WHEN @action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'') THEN 30 ELSE 10 END; IF @action=''Status''  BEGIN SELECT CAST(1 AS bit) success,CAST(1 AS bit) metadata_ready,1 AS uuid_transport_version,1 AS output_path_version,  CAST(CASE WHEN EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status=''RUNNING'' AND lease_expires_at>@now AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',pipeline_id)>=10) THEN 1 ELSE 0 END AS bit) active_job; RETURN; END;  IF @action=''List''  BEGIN  SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),p.pipeline_id)) AS pipeline_id,p.pipeline_name,MAX(v.version) version,p.updated_at  FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id  WHERE studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel GROUP BY p.pipeline_id,p.pipeline_name,p.updated_at ORDER BY p.updated_at DESC FOR JSON PATH) items_json; RETURN;  END;  IF @action=''Get''  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id WHERE p.pipeline_id=@id AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel AND (@version IS NULL OR v.version=@version))  BEGIN SELECT CAST(0 AS bit) success,''PIPELINE_NOT_FOUND'' code; RETURN; END;  SELECT TOP(1) CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),p.pipeline_id)) AS pipeline_id,p.pipeline_name,v.version,v.graph_json  FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id  WHERE p.pipeline_id=@id AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel AND (@version IS NULL OR v.version=@version) ORDER BY v.version DESC; RETURN;  END;  IF @action=''Save''  BEGIN IF studio.fnStudioGraphSourcesAllowed(@owner,@document)=0 THROW 50001,''PIPELINE_SOURCE_ACCESS_DENIED'',1;  IF @expected IS NULL OR @expected<0 OR LEN(LTRIM(RTRIM(@name)))=0 OR ISJSON(@document)<>1  BEGIN SELECT CAST(0 AS bit) success,''PIPELINE_INPUT_INVALID'' code; RETURN; END;  BEGIN TRAN;  IF @id IS NULL  BEGIN  IF @expected<>0 THROW 50001,''PIPELINE_VERSION_CONFLICT'',1;  SET @id=NEWID();  INSERT studio.pipeline(pipeline_id,pipeline_name,created_by) VALUES(@id,@name,@owner);
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''PIPELINE'',@id,@owner);
    INSERT INTO studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@owner,''PIPELINE'',@id,''REGISTER'',@owner);
  SET @current=0;  END  ELSE  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline WITH(UPDLOCK,HOLDLOCK) WHERE pipeline_id=@id AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',pipeline_id)>=20) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT @current=ISNULL(MAX(version),0) FROM studio.pipeline_version WHERE pipeline_id=@id;  IF @current<>@expected THROW 50001,''PIPELINE_VERSION_CONFLICT'',1;  END;  SET @version=@current+1;  INSERT studio.pipeline_version(pipeline_id,version,graph_json,created_by) VALUES(@id,@version,@document,@owner);  UPDATE studio.pipeline SET pipeline_name=@name,updated_at=@now WHERE pipeline_id=@id;  COMMIT;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@id)) AS pipeline_id,@name pipeline_name,@version version; RETURN;  END;  IF @action=''Submit''  BEGIN  BEGIN TRAN; IF studio.fnStudioAccessLevel(@owner,''PIPELINE'',@id)<20 OR NOT EXISTS(SELECT 1 FROM studio.pipeline_version WHERE pipeline_id=@id AND version=@version AND studio.fnStudioGraphSourcesAllowed(@owner,graph_json)=1) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT @existing=run_id FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE requested_by=@owner AND request_id=@request;  IF @existing IS NOT NULL  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@existing AND pipeline_id=@id AND version=@version) THROW 50001,''PIPELINE_REQUEST_REUSED'',1;  COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),run_id)) AS run_id,status,version FROM studio.pipeline_run WHERE run_id=@existing; RETURN;  END;  IF @request IS NULL OR NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id WHERE p.pipeline_id=@id AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel AND v.version=@version) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SET @run=NEWID();  INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@id,@version,@owner,@request);  COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@run)) AS run_id,''QUEUED'' status,@version version; RETURN;  END;     IF @action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'')   BEGIN    DECLARE @DeletePath nvarchar(512),@DeleteRun uniqueidentifier,@DeleteState varchar(12);    IF @output IS NULL OR @run IS NULL THROW 50001,''PIPELINE_DELETE_INVALID'',1;    BEGIN TRAN;    SELECT @DeletePath=o.storage_relative_path,@DeleteRun=o.run_id     FROM studio.pipeline_output_version o WITH(UPDLOCK,HOLDLOCK)     JOIN studio.pipeline_run r WITH(UPDLOCK,HOLDLOCK) ON r.run_id=o.run_id     JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id     WHERE o.output_version_id=@output AND o.run_id=@run AND r.status=''SUCCEEDED''      AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel;    IF @DeletePath IS NULL THROW 50001,''PIPELINE_DELETE_NOT_FOUND'',1;    IF EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status IN (''QUEUED'',''RUNNING''))      OR EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE status IN (''QUEUED'',''RUNNING''))      THROW 50001,''PIPELINE_DELETE_JOB_ACTIVE'',1;    SELECT @DeleteState=state FROM studio.parquet_delete_state WITH(UPDLOCK,HOLDLOCK)     WHERE kind=''ETL_OUTPUT'' AND target_id=@output;    IF @action=''CheckDelete''    BEGIN     IF @DeleteState IS NOT NULL THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     COMMIT;     SELECT CAST(1 AS bit) success,''PIPELINE_DELETE_ALLOWED'' code,      LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@output)) output_version_id,@DeletePath storage_relative_path;     RETURN;    END;    IF @action=''BeginDelete''    BEGIN     IF @DeleteState IS NOT NULL THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     INSERT studio.parquet_delete_state(kind,target_id,run_id,owner_id,storage_relative_path)     VALUES(''ETL_OUTPUT'',@output,@DeleteRun,@owner,@DeletePath);    END    ELSE IF @action=''FinishDelete''    BEGIN     IF @DeleteState<>''PENDING'' THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     UPDATE studio.parquet_delete_state SET state=''DELETED'',finished_at=SYSUTCDATETIME()      WHERE kind=''ETL_OUTPUT'' AND target_id=@output AND owner_id=@owner;    END    ELSE IF @action=''AbortDelete''    BEGIN     IF @DeleteState<>''PENDING'' THROW 50001,''PIPELINE_DELETE_UNAVAILABLE'',1;     DELETE studio.parquet_delete_state WHERE kind=''ETL_OUTPUT'' AND target_id=@output AND owner_id=@owner;    END;    COMMIT;    SELECT CAST(1 AS bit) success,''PIPELINE_DELETE_OK'' code,     LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@output)) output_version_id,@DeletePath storage_relative_path;    RETURN;   END;  IF @action=''Outputs''  BEGIN  SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_name,o.row_count,o.created_at,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version  FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id  WHERE r.status=''SUCCEEDED'' AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)  ORDER BY o.created_at DESC,o.output_version_id FOR JSON PATH) items_json; RETURN;  END;  IF @action=''Output''  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id  WHERE o.output_version_id=@output AND r.status=''SUCCEEDED'' AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=@requiredLevel AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)) THROW 50001,''PIPELINE_OUTPUT_NOT_FOUND'',1;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_node_id,o.output_name,o.row_count,o.schema_json,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,r.version  FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id WHERE o.output_version_id=@output AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',r.pipeline_id)>=10 AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id); RETURN;  END;  IF @action=''Jobs''  BEGIN  SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,r.cancel_requested,  (SELECT COUNT(*) FROM studio.pipeline_output_version o WHERE o.run_id=r.run_id AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id)) output_count  FROM studio.pipeline_run r JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id  WHERE studio.fnStudioAccessLevel(@owner,''PIPELINE'',r.pipeline_id)>=10 ORDER BY r.created_at DESC FOR JSON PATH) items_json; RETURN;  END;  IF @action=''Job''  BEGIN  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@run AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',pipeline_id)>=@requiredLevel) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,r.cancel_requested,  (SELECT LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_node_id,o.output_name,o.row_count,o.schema_json FROM studio.pipeline_output_version o WHERE o.run_id=r.run_id AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''ETL_OUTPUT'' AND z.target_id=o.output_version_id) FOR JSON PATH) outputs_json  FROM studio.pipeline_run r JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id WHERE r.run_id=@run AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',r.pipeline_id)>=10; RETURN;  END;  IF @action=''Cancel''  BEGIN  UPDATE studio.pipeline_run SET cancel_requested=1,  status=CASE WHEN status=''QUEUED'' THEN ''CANCELLED'' ELSE status END,  finished_at=CASE WHEN status=''QUEUED'' THEN @now ELSE finished_at END  WHERE run_id=@run AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',pipeline_id)>=@requiredLevel AND status IN (''QUEUED'',''RUNNING'');  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@run AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',pipeline_id)>=@requiredLevel) THROW 50001,''PIPELINE_NOT_FOUND'',1;  SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),run_id)) AS run_id,status,cancel_requested FROM studio.pipeline_run WHERE run_id=@run AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',pipeline_id)>=@requiredLevel; RETURN;  END;  IF @action=''Claim''  BEGIN  IF @worker IS NULL THROW 50001,''PIPELINE_INPUT_INVALID'',1;  BEGIN TRAN;  SELECT TOP(1) @run=run_id,@recovery=CASE WHEN status=''RUNNING'' THEN 1 ELSE 0 END  FROM studio.pipeline_run WITH(UPDLOCK,READPAST,ROWLOCK)  WHERE status=''QUEUED'' OR (status=''RUNNING'' AND lease_expires_at<=@now) ORDER BY created_at;  IF @run IS NULL BEGIN COMMIT; SELECT CAST(1 AS bit) success,CAST(0 AS bit) has_job; RETURN; END;  UPDATE studio.pipeline_run SET status=''RUNNING'',started_at=ISNULL(started_at,@now),heartbeat_at=@now,lease_owner=@worker,lease_expires_at=DATEADD(second,90,@now) WHERE run_id=@run;  COMMIT;  SELECT CAST(1 AS bit) success,CAST(1 AS bit) has_job,@recovery is_recovery,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.requested_by)) AS requested_by,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,r.version,r.cancel_requested,v.graph_json  FROM studio.pipeline_run r JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run; RETURN;  END;  IF @action=''Heartbeat''  BEGIN  UPDATE studio.pipeline_run SET heartbeat_at=@now,lease_expires_at=DATEADD(second,90,@now)  WHERE run_id=@run AND status=''RUNNING'' AND lease_owner=@worker AND lease_expires_at>@now;  IF @@ROWCOUNT=0 THROW 50001,''PIPELINE_LEASE_LOST'',1;  SELECT CAST(1 AS bit) success,cancel_requested FROM studio.pipeline_run WHERE run_id=@run; RETURN;  END;  IF @action=''Complete''  BEGIN  IF @status NOT IN (''SUCCEEDED'',''FAILED'',''CANCELLED'') OR @status IS NULL THROW 50001,''PIPELINE_STATUS_INVALID'',1;  BEGIN TRAN;  IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@run AND status=''RUNNING'' AND lease_owner=@worker AND lease_expires_at>@now) THROW 50001,''PIPELINE_LEASE_LOST'',1;  SELECT @cancel=cancel_requested FROM studio.pipeline_run WHERE run_id=@run;  IF @cancel=1 SET @status=''CANCELLED'';  IF @status=''SUCCEEDED''  BEGIN IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run r WHERE r.run_id=@run AND studio.fnStudioAccessLevel(r.requested_by,''PIPELINE'',r.pipeline_id)>=20) THROW 50001,''PIPELINE_ACCESS_REVOKED'',1;  IF ISJSON(@outputs)<>1 OR LEFT(LTRIM(@outputs),1)<>''['' THROW 50001,''PIPELINE_OUTPUT_INVALID'',1;  DECLARE @out TABLE(ordinal int,id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max));  INSERT @out  SELECT TRY_CONVERT(int,j.[key]),o.id,o.name,o.path,o.row_count,o.schema_json  FROM OPENJSON(@outputs) j CROSS APPLY OPENJSON(j.value)  WITH(id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max) ''$.schema'' AS JSON) o;  SELECT @document=v.graph_json FROM studio.pipeline_run r JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run;  IF (SELECT COUNT(*) FROM @out) NOT BETWEEN 1 AND 6 OR (SELECT COUNT(*) FROM @out)<>(SELECT COUNT(*) FROM OPENJSON(@document,''$.graph.outputs'')) OR  EXISTS(SELECT id FROM @out GROUP BY id HAVING COUNT(*)>1) OR  EXISTS(SELECT 1 FROM @out o WHERE o.id IS NULL OR o.name IS NULL OR o.path IS NULL OR o.row_count IS NULL OR o.row_count<0 OR ISJSON(o.schema_json)<>1 OR o.schema_json IS NULL OR o.ordinal IS NULL OR o.ordinal NOT BETWEEN 0 AND 5  OR o.path COLLATE Latin1_General_BIN2 <> (LOWER(CONVERT(nvarchar(36),@run))+N''/output-''+CONVERT(nvarchar(10),o.ordinal)) COLLATE Latin1_General_BIN2  OR DATALENGTH(o.path) <> DATALENGTH(LOWER(CONVERT(nvarchar(36),@run))+N''/output-''+CONVERT(nvarchar(10),o.ordinal)) OR NOT EXISTS(SELECT 1 FROM OPENJSON(@document,''$.graph.outputs'') expected CROSS APPLY OPENJSON(expected.value) WITH(id nvarchar(80),name nvarchar(150)) x WHERE TRY_CONVERT(int,expected.[key])=o.ordinal AND x.id=o.id AND x.name=o.name)) THROW 50001,''PIPELINE_OUTPUT_INVALID'',1;  INSERT studio.pipeline_output_version(run_id,output_node_id,output_name,storage_relative_path,row_count,schema_json) SELECT @run,id,name,path,row_count,schema_json FROM @out;  END;  UPDATE studio.pipeline_run SET status=@status,finished_at=@now,error_code=CASE WHEN @status=''FAILED'' THEN @error ELSE NULL END,lease_owner=NULL,lease_expires_at=NULL WHERE run_id=@run;  COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@run)) AS run_id,@status status; RETURN;  END;  SELECT CAST(0 AS bit) success,''PIPELINE_ACTION_INVALID'' code;  END TRY  BEGIN CATCH  IF XACT_STATE()<>0 ROLLBACK;  SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=50001 THEN ERROR_MESSAGE() ELSE ''PIPELINE_METADATA_UNAVAILABLE'' END code;  END CATCH; END; ';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spDatasetIngestControl'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,''INGEST_INVALID_PAYLOAD'' code; RETURN; END;  DECLARE @Action varchar(20)=JSON_VALUE(@Payload,''$.Action''),          @UserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),          @DatasetID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.DatasetID'')),          @RequestID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RequestID'')),          @RunID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RunID''));  IF @UserID IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@UserID AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''INGEST_USER_UNAVAILABLE'' code; RETURN; END;  IF @Action=''Submit''  BEGIN   IF @DatasetID IS NULL OR @RequestID IS NULL BEGIN SELECT CAST(0 AS bit) success,''INGEST_INVALID_REQUEST'' code; RETURN; END;   IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@DatasetID AND created_by=CONVERT(nvarchar(100),@UserID) AND access_mode=''STORED'')   BEGIN SELECT CAST(0 AS bit) success,''INGEST_DATASET_NOT_FOUND'' code; RETURN; END;   BEGIN TRY    BEGIN TRANSACTION;    IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE requested_by=@UserID AND request_id=@RequestID)    BEGIN     IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE dataset_id=@DatasetID AND status IN (''QUEUED'',''RUNNING''))     BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,''INGEST_ALREADY_PENDING'' code; RETURN; END;     INSERT studio.dataset_ingest_run(dataset_id,requested_by,request_id) VALUES(@DatasetID,@UserID,@RequestID);    END;    IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID AND dataset_id=@DatasetID)    BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,''INGEST_REQUEST_REUSED'' code; RETURN; END;    SELECT CAST(1 AS bit) success,''INGEST_QUEUED'' code,CONVERT(varchar(36),run_id) run_id,status      FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID;    COMMIT;   END TRY   BEGIN CATCH    IF @@TRANCOUNT>0 ROLLBACK;    SELECT CAST(0 AS bit) success,''INGEST_SUBMIT_FAILED'' code;   END CATCH;   RETURN;  END;  IF @Action=''Jobs''  BEGIN   SELECT CAST(1 AS bit) success,''INGEST_JOBS'' code,    (SELECT CONVERT(varchar(36),r.run_id) run_id,CONVERT(varchar(36),r.dataset_id) dataset_id,     r.status,r.created_at,r.started_at,r.finished_at,r.error_code,       (SELECT TOP (1) o.row_count        FROM studio.dataset_ingest_output AS o        WHERE o.run_id=r.run_id AND o.dataset_id=r.dataset_id) AS row_count /* DATASET_ROWCOUNT_020 */     FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id     WHERE r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID) AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''STORED'' AND z.run_id=r.run_id)     ORDER BY r.created_at DESC FOR JSON PATH) items_json;   RETURN;  END;  IF @Action=''Job''  BEGIN   SELECT TOP 1 CAST(1 AS bit) success,''INGEST_JOB'' code,CONVERT(varchar(36),r.run_id) run_id,    CONVERT(varchar(36),r.dataset_id) dataset_id,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,       (SELECT TOP (1) o.row_count        FROM studio.dataset_ingest_output AS o        WHERE o.run_id=r.run_id AND o.dataset_id=r.dataset_id) AS row_count /* DATASET_ROWCOUNT_020 */   FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id   WHERE r.run_id=@RunID AND r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID) AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''STORED'' AND z.run_id=r.run_id);   IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,''INGEST_JOB_NOT_FOUND'' code;   RETURN;  END; 
 IF @Action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'')
 BEGIN
  DECLARE @DeleteOutput uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.OutputVersionID''));
  DECLARE @DeletePath nvarchar(512),@DeleteRun uniqueidentifier,@DeleteStatus varchar(12),@DeleteState varchar(12);
  IF @DatasetID IS NULL OR @RunID IS NULL
  BEGIN SELECT CAST(0 AS bit) success,''INGEST_DELETE_INVALID'' code; RETURN; END;
  BEGIN TRY
   BEGIN TRANSACTION;
   SELECT @DeletePath=o.storage_relative_path,@DeleteRun=o.run_id,@DeleteStatus=r.status,@DeleteOutput=o.output_version_id
   FROM studio.dataset_ingest_output o WITH(UPDLOCK,HOLDLOCK)
   JOIN studio.dataset_ingest_run r WITH(UPDLOCK,HOLDLOCK) ON r.run_id=o.run_id
   JOIN studio.dataset d ON d.dataset_id=o.dataset_id
   WHERE (@DeleteOutput IS NULL OR o.output_version_id=@DeleteOutput) AND o.dataset_id=@DatasetID AND o.run_id=@RunID
     AND r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID) AND d.access_mode=''STORED'';
   IF @DeletePath IS NULL OR @DeleteStatus<>''SUCCEEDED'' THROW 51000,''INGEST_DELETE_NOT_FOUND'',1;
   IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE dataset_id=@DatasetID AND status IN (''QUEUED'',''RUNNING''))
      THROW 51000,''INGEST_DELETE_JOB_ACTIVE'',1;
   IF EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status IN (''QUEUED'',''RUNNING''))
      THROW 51000,''INGEST_DELETE_JOB_ACTIVE'',1;
   SELECT @DeleteState=state FROM studio.parquet_delete_state WITH(UPDLOCK,HOLDLOCK)
    WHERE kind=''STORED'' AND target_id=@DeleteOutput;
   IF @Action=''CheckDelete''
   BEGIN
    IF @DeleteState IS NOT NULL THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    COMMIT;
    SELECT CAST(1 AS bit) success,''INGEST_DELETE_ALLOWED'' code,
     LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@DeleteOutput)) output_version_id,@DeletePath storage_relative_path;
    RETURN;
   END;
   IF @Action=''BeginDelete''
   BEGIN
    IF @DeleteState IS NOT NULL THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    INSERT studio.parquet_delete_state(kind,target_id,run_id,owner_id,storage_relative_path)
    VALUES(''STORED'',@DeleteOutput,@DeleteRun,@UserID,@DeletePath);
    UPDATE studio.dataset SET active_ingest_output_version_id=NULL
      WHERE dataset_id=@DatasetID AND active_ingest_output_version_id=@DeleteOutput;
   END
   ELSE IF @Action=''FinishDelete''
   BEGIN
    IF @DeleteState<>''PENDING'' THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    UPDATE studio.parquet_delete_state SET state=''DELETED'',finished_at=SYSUTCDATETIME()
     WHERE kind=''STORED'' AND target_id=@DeleteOutput AND owner_id=@UserID;
   END
   ELSE IF @Action=''AbortDelete''
   BEGIN
    IF @DeleteState<>''PENDING'' THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    DELETE studio.parquet_delete_state WHERE kind=''STORED'' AND target_id=@DeleteOutput AND owner_id=@UserID;
   END;
   COMMIT;
   SELECT CAST(1 AS bit) success,''INGEST_DELETE_OK'' code,
    LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@DeleteOutput)) output_version_id,@DeletePath storage_relative_path;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   SELECT CAST(0 AS bit) success,
    CASE WHEN ERROR_NUMBER()=51000 THEN ERROR_MESSAGE() ELSE ''INGEST_DELETE_METADATA_UNAVAILABLE'' END code;
  END CATCH;
  RETURN;
 END;
 SELECT CAST(0 AS bit) success,''INGEST_ACTION_INVALID'' code; END;'; SET @new=N'ALTER PROCEDURE studio.spDatasetIngestControl     @Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,''INGEST_INVALID_PAYLOAD'' code; RETURN; END;  DECLARE @Action varchar(20)=JSON_VALUE(@Payload,''$.Action''),          @UserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),          @DatasetID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.DatasetID'')),          @RequestID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RequestID'')),          @RunID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.RunID''));  IF @UserID IS NULL OR NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@UserID AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''INGEST_USER_UNAVAILABLE'' code; RETURN; END;  IF @Action=''Submit''  BEGIN   IF @DatasetID IS NULL OR @RequestID IS NULL BEGIN SELECT CAST(0 AS bit) success,''INGEST_INVALID_REQUEST'' code; RETURN; END;   IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@DatasetID AND studio.fnStudioAccessLevel(@UserID,''DATASET'',dataset_id)>=20 AND access_mode=''STORED'')   BEGIN SELECT CAST(0 AS bit) success,''INGEST_DATASET_NOT_FOUND'' code; RETURN; END;   BEGIN TRY    BEGIN TRANSACTION; IF studio.fnStudioAccessLevel(@UserID,''DATASET'',@DatasetID)<20 THROW 51000,''INGEST_DATASET_NOT_FOUND'',1;    IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE requested_by=@UserID AND request_id=@RequestID)    BEGIN     IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK) WHERE dataset_id=@DatasetID AND status IN (''QUEUED'',''RUNNING''))     BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,''INGEST_ALREADY_PENDING'' code; RETURN; END;     INSERT studio.dataset_ingest_run(dataset_id,requested_by,request_id) VALUES(@DatasetID,@UserID,@RequestID);    END;    IF NOT EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID AND dataset_id=@DatasetID)    BEGIN ROLLBACK; SELECT CAST(0 AS bit) success,''INGEST_REQUEST_REUSED'' code; RETURN; END;    SELECT CAST(1 AS bit) success,''INGEST_QUEUED'' code,CONVERT(varchar(36),run_id) run_id,status      FROM studio.dataset_ingest_run WHERE requested_by=@UserID AND request_id=@RequestID;    COMMIT;   END TRY   BEGIN CATCH    IF @@TRANCOUNT>0 ROLLBACK;    SELECT CAST(0 AS bit) success,''INGEST_SUBMIT_FAILED'' code;   END CATCH;   RETURN;  END;  IF @Action=''Jobs''  BEGIN   SELECT CAST(1 AS bit) success,''INGEST_JOBS'' code,    (SELECT CONVERT(varchar(36),r.run_id) run_id,CONVERT(varchar(36),r.dataset_id) dataset_id,     r.status,r.created_at,r.started_at,r.finished_at,r.error_code,       (SELECT TOP (1) o.row_count        FROM studio.dataset_ingest_output AS o        WHERE o.run_id=r.run_id AND o.dataset_id=r.dataset_id) AS row_count /* DATASET_ROWCOUNT_020 */     FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id     WHERE studio.fnStudioAccessLevel(@UserID,''DATASET'',d.dataset_id)>=CASE WHEN @Action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'') THEN 30 ELSE 10 END AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''STORED'' AND z.run_id=r.run_id)     ORDER BY r.created_at DESC FOR JSON PATH) items_json;   RETURN;  END;  IF @Action=''Job''  BEGIN   SELECT TOP 1 CAST(1 AS bit) success,''INGEST_JOB'' code,CONVERT(varchar(36),r.run_id) run_id,    CONVERT(varchar(36),r.dataset_id) dataset_id,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,       (SELECT TOP (1) o.row_count        FROM studio.dataset_ingest_output AS o        WHERE o.run_id=r.run_id AND o.dataset_id=r.dataset_id) AS row_count /* DATASET_ROWCOUNT_020 */   FROM studio.dataset_ingest_run r JOIN studio.dataset d ON d.dataset_id=r.dataset_id   WHERE r.run_id=@RunID AND studio.fnStudioAccessLevel(@UserID,''DATASET'',d.dataset_id)>=CASE WHEN @Action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'') THEN 30 ELSE 10 END AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind=''STORED'' AND z.run_id=r.run_id);   IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,''INGEST_JOB_NOT_FOUND'' code;   RETURN;  END; 
 IF @Action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'')
 BEGIN
  DECLARE @DeleteOutput uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.OutputVersionID''));
  DECLARE @DeletePath nvarchar(512),@DeleteRun uniqueidentifier,@DeleteStatus varchar(12),@DeleteState varchar(12);
  IF @DatasetID IS NULL OR @RunID IS NULL
  BEGIN SELECT CAST(0 AS bit) success,''INGEST_DELETE_INVALID'' code; RETURN; END;
  BEGIN TRY
   BEGIN TRANSACTION;
   SELECT @DeletePath=o.storage_relative_path,@DeleteRun=o.run_id,@DeleteStatus=r.status,@DeleteOutput=o.output_version_id
   FROM studio.dataset_ingest_output o WITH(UPDLOCK,HOLDLOCK)
   JOIN studio.dataset_ingest_run r WITH(UPDLOCK,HOLDLOCK) ON r.run_id=o.run_id
   JOIN studio.dataset d ON d.dataset_id=o.dataset_id
   WHERE (@DeleteOutput IS NULL OR o.output_version_id=@DeleteOutput) AND o.dataset_id=@DatasetID AND o.run_id=@RunID
     AND studio.fnStudioAccessLevel(@UserID,''DATASET'',d.dataset_id)>=CASE WHEN @Action IN (''CheckDelete'',''BeginDelete'',''FinishDelete'',''AbortDelete'') THEN 30 ELSE 10 END AND d.access_mode=''STORED'';
   IF @DeletePath IS NULL OR @DeleteStatus<>''SUCCEEDED'' THROW 51000,''INGEST_DELETE_NOT_FOUND'',1;
   IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WHERE dataset_id=@DatasetID AND status IN (''QUEUED'',''RUNNING''))
      THROW 51000,''INGEST_DELETE_JOB_ACTIVE'',1;
   IF EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status IN (''QUEUED'',''RUNNING''))
      THROW 51000,''INGEST_DELETE_JOB_ACTIVE'',1;
   SELECT @DeleteState=state FROM studio.parquet_delete_state WITH(UPDLOCK,HOLDLOCK)
    WHERE kind=''STORED'' AND target_id=@DeleteOutput;
   IF @Action=''CheckDelete''
   BEGIN
    IF @DeleteState IS NOT NULL THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    COMMIT;
    SELECT CAST(1 AS bit) success,''INGEST_DELETE_ALLOWED'' code,
     LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@DeleteOutput)) output_version_id,@DeletePath storage_relative_path;
    RETURN;
   END;
   IF @Action=''BeginDelete''
   BEGIN
    IF @DeleteState IS NOT NULL THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    INSERT studio.parquet_delete_state(kind,target_id,run_id,owner_id,storage_relative_path)
    VALUES(''STORED'',@DeleteOutput,@DeleteRun,@UserID,@DeletePath);
    UPDATE studio.dataset SET active_ingest_output_version_id=NULL
      WHERE dataset_id=@DatasetID AND active_ingest_output_version_id=@DeleteOutput;
   END
   ELSE IF @Action=''FinishDelete''
   BEGIN
    IF @DeleteState<>''PENDING'' THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    UPDATE studio.parquet_delete_state SET state=''DELETED'',finished_at=SYSUTCDATETIME()
     WHERE kind=''STORED'' AND target_id=@DeleteOutput AND owner_id=@UserID;
   END
   ELSE IF @Action=''AbortDelete''
   BEGIN
    IF @DeleteState<>''PENDING'' THROW 51000,''INGEST_DELETE_UNAVAILABLE'',1;
    DELETE studio.parquet_delete_state WHERE kind=''STORED'' AND target_id=@DeleteOutput AND owner_id=@UserID;
   END;
   COMMIT;
   SELECT CAST(1 AS bit) success,''INGEST_DELETE_OK'' code,
    LOWER(CONVERT(varchar(36),@DeleteRun)) run_id,LOWER(CONVERT(varchar(36),@DeleteOutput)) output_version_id,@DeletePath storage_relative_path;
  END TRY
  BEGIN CATCH
   IF @@TRANCOUNT>0 ROLLBACK;
   SELECT CAST(0 AS bit) success,
    CASE WHEN ERROR_NUMBER()=51000 THEN ERROR_MESSAGE() ELSE ''INGEST_DELETE_METADATA_UNAVAILABLE'' END code;
  END CATCH;
  RETURN;
 END;
 SELECT CAST(0 AS bit) success,''INGEST_ACTION_INVALID'' code; END;
';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spDatasetIngestWorker'; SET @parameter=N'@Action'; SET @expected=N'@Action varchar(16),
    @WorkerID uniqueidentifier,
    @RunID uniqueidentifier = NULL,
    @RowCount bigint = NULL,
    @SchemaJson nvarchar(max) = NULL,
    @StorageRelativePath nvarchar(512) = NULL,
    @ErrorCode varchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @now datetime2(3)=SYSUTCDATETIME();
    IF @WorkerID IS NULL THROW 51800,''INGEST_WORKER_INVALID'',1;

    IF @Action=''Claim''
    BEGIN
        DECLARE @claimed TABLE(run_id uniqueidentifier,dataset_id uniqueidentifier,requested_by uniqueidentifier);
        BEGIN TRANSACTION;
        ;WITH next_job AS (
            SELECT TOP(1) r.* FROM studio.dataset_ingest_run r WITH (UPDLOCK,READPAST,ROWLOCK)
            JOIN studio.dataset d ON d.dataset_id=r.dataset_id
            JOIN dbo.core_user u ON u.user_id=r.requested_by
            WHERE r.status=''QUEUED'' AND d.access_mode=''STORED'' AND
                  d.created_by=CONVERT(nvarchar(100),r.requested_by) AND
                  u.is_active=1 AND u.is_locked=0
            ORDER BY r.created_at,r.run_id
        )
        UPDATE next_job SET status=''RUNNING'',started_at=@now,heartbeat_at=@now,
            lease_owner=@WorkerID,lease_expires_at=DATEADD(second,120,@now)
        OUTPUT inserted.run_id,inserted.dataset_id,inserted.requested_by INTO @claimed;
        COMMIT TRANSACTION;
        SELECT CONVERT(varchar(36),run_id) AS run_id,
               CONVERT(varchar(36),dataset_id) AS dataset_id,
               CONVERT(varchar(36),requested_by) AS requested_by FROM @claimed;
        RETURN;
    END;

    IF @RunID IS NULL THROW 51801,''INGEST_RUN_REQUIRED'',1;
    IF @Action=''Heartbeat''
    BEGIN
        UPDATE studio.dataset_ingest_run SET heartbeat_at=@now,lease_expires_at=DATEADD(second,120,@now)
        WHERE run_id=@RunID AND status=''RUNNING'' AND lease_owner=@WorkerID
          AND lease_expires_at>@now;
        SELECT @@ROWCOUNT AS affected;
        RETURN;
    END;
    IF @Action=''Fail''
    BEGIN
        IF @ErrorCode IS NULL OR @ErrorCode NOT IN (
            ''INGEST_BIND_FAILED'',''INGEST_DRIVER_FAILED'',''INGEST_TIMEOUT'',
            ''INGEST_MANIFEST_INVALID'',''INGEST_PUBLISH_FAILED'',''INGEST_WORKER_STOPPED'')
            SET @ErrorCode=''INGEST_DRIVER_FAILED'';
        UPDATE studio.dataset_ingest_run SET status=''FAILED'',error_code=@ErrorCode,
            finished_at=@now,lease_expires_at=NULL
        WHERE run_id=@RunID AND status=''RUNNING'' AND lease_owner=@WorkerID
          AND lease_expires_at>@now;
        SELECT @@ROWCOUNT AS affected;
        RETURN;
    END;
    IF @Action=''Complete''
    BEGIN
        IF @RowCount IS NULL OR @RowCount<0 OR @SchemaJson IS NULL OR ISJSON(@SchemaJson)<>1
            THROW 51802,''INGEST_OUTPUT_INVALID'',1;
        IF @StorageRelativePath IS NULL OR
           @StorageRelativePath<>CONVERT(varchar(36),@RunID)+''/output-0''
            THROW 51803,''INGEST_STORAGE_PATH_INVALID'',1;
        DECLARE @affected int=0;
        BEGIN TRANSACTION;
        IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK)
            WHERE run_id=@RunID AND status=''RUNNING'' AND lease_owner=@WorkerID
              AND lease_expires_at>@now)
        BEGIN
            DECLARE @dataset uniqueidentifier=(SELECT dataset_id FROM studio.dataset_ingest_run WHERE run_id=@RunID);
            DECLARE @version uniqueidentifier=NEWID();
            INSERT studio.dataset_ingest_output(output_version_id,dataset_id,run_id,storage_relative_path,row_count,schema_json)
            VALUES(@version,@dataset,@RunID,@StorageRelativePath,@RowCount,@SchemaJson);
            UPDATE studio.dataset SET active_ingest_output_version_id=@version
                WHERE dataset_id=@dataset AND access_mode=''STORED'';
            IF @@ROWCOUNT<>1 THROW 51804,''INGEST_DATASET_INVALID'',1;
            UPDATE studio.dataset_ingest_run SET status=''SUCCEEDED'',finished_at=@now,
                heartbeat_at=@now,lease_expires_at=NULL WHERE run_id=@RunID;
            SET @affected=1;
        END;
        COMMIT TRANSACTION;
        SELECT @affected AS affected;
        RETURN;
    END;
    THROW 51805,''INGEST_WORKER_ACTION_INVALID'',1;
END;'; SET @new=N'ALTER PROCEDURE studio.spDatasetIngestWorker
    @Action varchar(16),
    @WorkerID uniqueidentifier,
    @RunID uniqueidentifier = NULL,
    @RowCount bigint = NULL,
    @SchemaJson nvarchar(max) = NULL,
    @StorageRelativePath nvarchar(512) = NULL,
    @ErrorCode varchar(100) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @now datetime2(3)=SYSUTCDATETIME();
    IF @WorkerID IS NULL THROW 51800,''INGEST_WORKER_INVALID'',1;

    IF @Action=''Claim''
    BEGIN
        DECLARE @claimed TABLE(run_id uniqueidentifier,dataset_id uniqueidentifier,requested_by uniqueidentifier);
        BEGIN TRANSACTION;
        UPDATE studio.dataset_ingest_run SET status=''FAILED'',error_code=''INGEST_BIND_FAILED'',finished_at=@now
        WHERE status=''QUEUED'' AND studio.fnStudioAccessLevel(requested_by,''DATASET'',dataset_id)<20;
        ;WITH next_job AS (
            SELECT TOP(1) r.* FROM studio.dataset_ingest_run r WITH (UPDLOCK,READPAST,ROWLOCK)
            JOIN studio.dataset d ON d.dataset_id=r.dataset_id
            JOIN dbo.core_user u ON u.user_id=r.requested_by
            WHERE r.status=''QUEUED'' AND d.access_mode=''STORED'' AND
                  studio.fnStudioAccessLevel(r.requested_by,''DATASET'',d.dataset_id)>=20 AND
                  u.is_active=1 AND u.is_locked=0
            ORDER BY r.created_at,r.run_id
        )
        UPDATE next_job SET status=''RUNNING'',started_at=@now,heartbeat_at=@now,
            lease_owner=@WorkerID,lease_expires_at=DATEADD(second,120,@now)
        OUTPUT inserted.run_id,inserted.dataset_id,inserted.requested_by INTO @claimed;
        COMMIT TRANSACTION;
        SELECT CONVERT(varchar(36),run_id) AS run_id,
               CONVERT(varchar(36),dataset_id) AS dataset_id,
               CONVERT(varchar(36),requested_by) AS requested_by FROM @claimed;
        RETURN;
    END;

    IF @RunID IS NULL THROW 51801,''INGEST_RUN_REQUIRED'',1;
    IF @Action=''Heartbeat''
    BEGIN
        UPDATE studio.dataset_ingest_run SET heartbeat_at=@now,lease_expires_at=DATEADD(second,120,@now)
        WHERE run_id=@RunID AND status=''RUNNING'' AND lease_owner=@WorkerID
          AND lease_expires_at>@now;
        SELECT @@ROWCOUNT AS affected;
        RETURN;
    END;
    IF @Action=''Fail''
    BEGIN
        IF @ErrorCode IS NULL OR @ErrorCode NOT IN (
            ''INGEST_BIND_FAILED'',''INGEST_DRIVER_FAILED'',''INGEST_TIMEOUT'',
            ''INGEST_MANIFEST_INVALID'',''INGEST_PUBLISH_FAILED'',''INGEST_WORKER_STOPPED'')
            SET @ErrorCode=''INGEST_DRIVER_FAILED'';
        UPDATE studio.dataset_ingest_run SET status=''FAILED'',error_code=@ErrorCode,
            finished_at=@now,lease_expires_at=NULL
        WHERE run_id=@RunID AND status=''RUNNING'' AND lease_owner=@WorkerID
          AND lease_expires_at>@now;
        SELECT @@ROWCOUNT AS affected;
        RETURN;
    END;
    IF @Action=''Complete''
    BEGIN
        IF @RowCount IS NULL OR @RowCount<0 OR @SchemaJson IS NULL OR ISJSON(@SchemaJson)<>1
            THROW 51802,''INGEST_OUTPUT_INVALID'',1;
        IF @StorageRelativePath IS NULL OR
           @StorageRelativePath<>CONVERT(varchar(36),@RunID)+''/output-0''
            THROW 51803,''INGEST_STORAGE_PATH_INVALID'',1;
        DECLARE @affected int=0;
        BEGIN TRANSACTION;
        IF EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH (UPDLOCK,HOLDLOCK)
            WHERE run_id=@RunID AND status=''RUNNING'' AND lease_owner=@WorkerID
              AND lease_expires_at>@now AND studio.fnStudioAccessLevel(requested_by,''DATASET'',dataset_id)>=20)
        BEGIN
            DECLARE @dataset uniqueidentifier=(SELECT dataset_id FROM studio.dataset_ingest_run WHERE run_id=@RunID);
            DECLARE @version uniqueidentifier=NEWID();
            INSERT studio.dataset_ingest_output(output_version_id,dataset_id,run_id,storage_relative_path,row_count,schema_json)
            VALUES(@version,@dataset,@RunID,@StorageRelativePath,@RowCount,@SchemaJson);
            UPDATE studio.dataset SET active_ingest_output_version_id=@version
                WHERE dataset_id=@dataset AND access_mode=''STORED'';
            IF @@ROWCOUNT<>1 THROW 51804,''INGEST_DATASET_INVALID'',1;
            UPDATE studio.dataset_ingest_run SET status=''SUCCEEDED'',finished_at=@now,
                heartbeat_at=@now,lease_expires_at=NULL WHERE run_id=@RunID;
            SET @affected=1;
        END;
        COMMIT TRANSACTION;
        SELECT @affected AS affected;
        RETURN;
    END;
    THROW 51805,''INGEST_WORKER_ACTION_INVALID'',1;
END;
';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spSchedulerControl'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON; SET XACT_ABORT ON;  IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;  DECLARE @action varchar(20)=JSON_VALUE(@Payload,''$.Action''),          @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),          @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ScheduleID'')),          @target uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.TargetID'')),          @kind varchar(12)=JSON_VALUE(@Payload,''$.TargetType''),          @ver int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.PipelineVersion'')),          @name nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ScheduleName''))),''''),          @freq varchar(12)=JSON_VALUE(@Payload,''$.Frequency''),          @interval int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.IntervalMinutes'')),          @clock char(5)=JSON_VALUE(@Payload,''$.TimeOfDay''),          @weekday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.WeekDay'')),          @weekmask tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.WeekDaysMask'')),          @repeat smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,''$.RepeatMinutes'')),          @monthday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.MonthDay'')),          @enabled bit=TRY_CONVERT(bit,JSON_VALUE(@Payload,''$.Enabled'')),          @now datetime2(3)=SYSUTCDATETIME();  IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_ACCESS_DENIED'' code; RETURN; END;  IF @action=''Status''  BEGIN SELECT CAST(1 AS bit) success,''SCHEDULER_READY'' code,1 schema_version; RETURN; END;  IF @action=''List''  BEGIN   SELECT CAST(1 AS bit) success,''SCHEDULER_LIST'' code,    (SELECT CONVERT(varchar(36),s.schedule_id) schedule_id,s.schedule_name,s.target_type,       CONVERT(varchar(36),s.target_id) target_id,s.pipeline_version,s.frequency,s.interval_minutes,       s.time_of_day,s.week_day,s.month_day,s.week_days_mask,s.repeat_minutes,s.timezone_name,s.enabled,s.next_run_at,s.last_run_at,s.updated_at,       COALESCE(d.dataset_name,p.pipeline_name) target_name     FROM studio.scheduler_schedule s     LEFT JOIN studio.dataset d ON s.target_type=''STORED'' AND d.dataset_id=s.target_id     LEFT JOIN studio.pipeline p ON s.target_type=''PIPELINE'' AND p.pipeline_id=s.target_id     WHERE s.created_by=@owner ORDER BY s.updated_at DESC,s.schedule_id     FOR JSON PATH) items_json;   RETURN;  END;  IF @action=''History''  BEGIN   SELECT CAST(1 AS bit) success,''SCHEDULER_HISTORY'' code,    (SELECT TOP(150) CONVERT(varchar(36),e.event_id) event_id,CONVERT(varchar(36),s.schedule_id) schedule_id,       s.schedule_name,s.target_type,COALESCE(d.dataset_name,p.pipeline_name) target_name,       e.scheduled_at,e.attempt,e.result,CONVERT(varchar(36),e.run_id) run_id,e.created_at,       COALESCE(dr.status,pr.status,e.result) status,COALESCE(dr.error_code,pr.error_code) error_code,       COALESCE(dr.finished_at,pr.finished_at) finished_at     FROM studio.scheduler_event e JOIN studio.scheduler_schedule s ON s.schedule_id=e.schedule_id     LEFT JOIN studio.dataset d ON s.target_type=''STORED'' AND d.dataset_id=s.target_id     LEFT JOIN studio.pipeline p ON s.target_type=''PIPELINE'' AND p.pipeline_id=s.target_id     LEFT JOIN studio.dataset_ingest_run dr ON s.target_type=''STORED'' AND dr.run_id=e.run_id     LEFT JOIN studio.pipeline_run pr ON s.target_type=''PIPELINE'' AND pr.run_id=e.run_id     WHERE s.created_by=@owner ORDER BY e.created_at DESC,e.event_id DESC FOR JSON PATH) items_json;   RETURN;  END;  IF @action=''Save''  BEGIN   /* New weekly masks are additive; keep legacy week_day as the first selected day. */   IF @freq=''WEEKLY'' AND @weekmask IS NULL AND @weekday BETWEEN 1 AND 7     SET @weekmask=POWER(2,@weekday-1);   IF @freq=''WEEKLY'' AND @weekmask IS NOT NULL   BEGIN    SET @weekday=1;    WHILE @weekday<7 AND (@weekmask & POWER(2,@weekday-1))=0 SET @weekday=@weekday+1;   END;   IF @name IS NULL OR LEN(@name)>150 OR @target IS NULL OR @enabled IS NULL OR       @kind NOT IN (''STORED'',''PIPELINE'') OR @freq NOT IN (''INTERVAL'',''DAILY'',''WEEKLY'',''MONTHLY'') OR      (@freq=''INTERVAL'' AND (@interval IS NULL OR @interval NOT BETWEEN 5 AND 10080)) OR      (@freq<>''INTERVAL'' AND (@clock IS NULL OR LEN(@clock)<>5 OR @clock NOT LIKE ''[0-2][0-9]:[0-5][0-9]'' OR LEFT(@clock,2)>''23'')) OR      (@freq=''WEEKLY'' AND (@weekmask IS NULL OR @weekmask NOT BETWEEN 1 AND 127)) OR      (@freq<>''WEEKLY'' AND @weekmask IS NOT NULL) OR      (@freq=''DAILY'' AND @repeat IS NOT NULL AND @repeat NOT BETWEEN 5 AND 1440) OR      (@freq<>''DAILY'' AND @repeat IS NOT NULL) OR      (JSON_VALUE(@Payload,''$.RepeatMinutes'') IS NOT NULL AND @repeat IS NULL) OR      (JSON_VALUE(@Payload,''$.WeekDaysMask'') IS NOT NULL AND @weekmask IS NULL) OR      (@freq=''MONTHLY'' AND (@monthday IS NULL OR @monthday NOT BETWEEN 1 AND 31)) OR      (@kind=''STORED'' AND @ver IS NOT NULL) OR (@kind=''PIPELINE'' AND (@ver IS NULL OR @ver<1))   BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;   IF (@kind=''STORED'' AND NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode=''STORED'' AND created_by=CONVERT(nvarchar(100),@owner))) OR      (@kind=''PIPELINE'' AND NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id AND v.version=@ver WHERE p.pipeline_id=@target AND p.created_by=@owner AND JSON_QUERY(v.graph_json,''$.graph'') IS NOT NULL))   BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_TARGET_NOT_FOUND'' code; RETURN; END;   BEGIN TRY    BEGIN TRANSACTION;    IF @id IS NULL    BEGIN     IF (SELECT COUNT(*) FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE created_by=@owner)>=100        THROW 52101,''SCHEDULER_LIMIT_REACHED'',1;     SET @id=NEWID();     INSERT studio.scheduler_schedule(schedule_id,created_by,schedule_name,target_type,target_id,pipeline_version,frequency,interval_minutes,time_of_day,week_day,month_day,week_days_mask,repeat_minutes,enabled,next_run_at)     VALUES(@id,@owner,@name,@kind,@target,@ver,@freq,CASE WHEN @freq=''INTERVAL'' THEN @interval END,        CASE WHEN @freq<>''INTERVAL'' THEN @clock END,CASE WHEN @freq=''WEEKLY'' THEN @weekday END,CASE WHEN @freq=''MONTHLY'' THEN @monthday END,        CASE WHEN @freq=''WEEKLY'' THEN @weekmask END, CASE WHEN @freq=''DAILY'' THEN @repeat END, @enabled,CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END);
        /* PHASE2D3_ATOMIC_OWNERSHIP: same transaction as schedule INSERT */
        INSERT INTO studio.object_ownership (object_type, object_id, owner_user_id)
        VALUES (''SCHEDULE'', @id, @owner);
        INSERT INTO studio.object_access_audit
            (actor_user_id, object_type, object_id, action_type, new_owner_user_id)
        VALUES (@owner, ''SCHEDULE'', @id, ''REGISTER'', @owner);
    END
    ELSE
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE schedule_id=@id AND created_by=@owner)         THROW 52102,''SCHEDULER_NOT_FOUND'',1;     UPDATE studio.scheduler_schedule SET schedule_name=@name,target_type=@kind,target_id=@target,pipeline_version=@ver,frequency=@freq,        interval_minutes=CASE WHEN @freq=''INTERVAL'' THEN @interval END,        time_of_day=CASE WHEN @freq<>''INTERVAL'' THEN @clock END,        week_day=CASE WHEN @freq=''WEEKLY'' THEN @weekday END,        month_day=CASE WHEN @freq=''MONTHLY'' THEN @monthday END,        week_days_mask=CASE WHEN @freq=''WEEKLY'' THEN @weekmask END,        repeat_minutes=CASE WHEN @freq=''DAILY'' THEN @repeat END,        enabled=@enabled,next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,        updated_at=@now WHERE schedule_id=@id AND created_by=@owner;    END;    COMMIT TRANSACTION;    SELECT CAST(1 AS bit) success,''SCHEDULER_SAVED'' code,CONVERT(varchar(36),@id) schedule_id;   END TRY   BEGIN CATCH    IF @@TRANCOUNT>0 ROLLBACK;    SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=52101 THEN ''SCHEDULER_LIMIT_REACHED'' WHEN ERROR_NUMBER()=52102 THEN ''SCHEDULER_NOT_FOUND'' ELSE ''SCHEDULER_SAVE_FAILED'' END code;   END CATCH;   RETURN;  END;  IF @action=''Toggle''  BEGIN   IF @id IS NULL OR @enabled IS NULL   BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;   UPDATE studio.scheduler_schedule SET enabled=@enabled,     next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(frequency,interval_minutes,time_of_day,week_day,month_day,@now,week_days_mask,repeat_minutes) END,     updated_at=@now WHERE schedule_id=@id AND created_by=@owner;   IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,''SCHEDULER_NOT_FOUND'' code;   ELSE SELECT CAST(1 AS bit) success,''SCHEDULER_UPDATED'' code,CONVERT(varchar(36),@id) schedule_id;   RETURN;  END;  SELECT CAST(0 AS bit) success,''SCHEDULER_ACTION_INVALID'' code; END;'; SET @new=N'ALTER PROCEDURE studio.spSchedulerControl @Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON; SET XACT_ABORT ON;  IF ISJSON(@Payload)<>1 BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;  DECLARE @action varchar(20)=JSON_VALUE(@Payload,''$.Action''),          @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),          @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ScheduleID'')),          @target uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.TargetID'')),          @kind varchar(12)=JSON_VALUE(@Payload,''$.TargetType''),          @ver int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.PipelineVersion'')),          @name nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ScheduleName''))),''''),          @freq varchar(12)=JSON_VALUE(@Payload,''$.Frequency''),          @interval int=TRY_CONVERT(int,JSON_VALUE(@Payload,''$.IntervalMinutes'')),          @clock char(5)=JSON_VALUE(@Payload,''$.TimeOfDay''),          @weekday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.WeekDay'')),          @weekmask tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.WeekDaysMask'')),          @repeat smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,''$.RepeatMinutes'')),          @monthday tinyint=TRY_CONVERT(tinyint,JSON_VALUE(@Payload,''$.MonthDay'')),          @enabled bit=TRY_CONVERT(bit,JSON_VALUE(@Payload,''$.Enabled'')),          @now datetime2(3)=SYSUTCDATETIME();  IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_ACCESS_DENIED'' code; RETURN; END;  IF @action=''Status''  BEGIN SELECT CAST(1 AS bit) success,''SCHEDULER_READY'' code,1 schema_version; RETURN; END;  IF @action=''List''  BEGIN   SELECT CAST(1 AS bit) success,''SCHEDULER_LIST'' code,    (SELECT CONVERT(varchar(36),s.schedule_id) schedule_id,s.schedule_name,s.target_type,       CONVERT(varchar(36),s.target_id) target_id,s.pipeline_version,s.frequency,s.interval_minutes,       s.time_of_day,s.week_day,s.month_day,s.week_days_mask,s.repeat_minutes,s.timezone_name,s.enabled,s.next_run_at,s.last_run_at,s.updated_at,       COALESCE(d.dataset_name,p.pipeline_name) target_name     FROM studio.scheduler_schedule s     LEFT JOIN studio.dataset d ON s.target_type=''STORED'' AND d.dataset_id=s.target_id     LEFT JOIN studio.pipeline p ON s.target_type=''PIPELINE'' AND p.pipeline_id=s.target_id     WHERE studio.fnStudioScheduleAccess(@owner,s.schedule_id)>=10 AND studio.fnStudioAccessLevel(@owner,CASE WHEN s.target_type=''STORED'' THEN ''DATASET'' ELSE ''PIPELINE'' END,s.target_id)>=10 ORDER BY s.updated_at DESC,s.schedule_id     FOR JSON PATH) items_json;   RETURN;  END;  IF @action=''History''  BEGIN   SELECT CAST(1 AS bit) success,''SCHEDULER_HISTORY'' code,    (SELECT TOP(150) CONVERT(varchar(36),e.event_id) event_id,CONVERT(varchar(36),s.schedule_id) schedule_id,       s.schedule_name,s.target_type,COALESCE(d.dataset_name,p.pipeline_name) target_name,       e.scheduled_at,e.attempt,e.result,CONVERT(varchar(36),e.run_id) run_id,e.created_at,       COALESCE(dr.status,pr.status,e.result) status,COALESCE(dr.error_code,pr.error_code) error_code,       COALESCE(dr.finished_at,pr.finished_at) finished_at     FROM studio.scheduler_event e JOIN studio.scheduler_schedule s ON s.schedule_id=e.schedule_id     LEFT JOIN studio.dataset d ON s.target_type=''STORED'' AND d.dataset_id=s.target_id     LEFT JOIN studio.pipeline p ON s.target_type=''PIPELINE'' AND p.pipeline_id=s.target_id     LEFT JOIN studio.dataset_ingest_run dr ON s.target_type=''STORED'' AND dr.run_id=e.run_id     LEFT JOIN studio.pipeline_run pr ON s.target_type=''PIPELINE'' AND pr.run_id=e.run_id     WHERE studio.fnStudioScheduleAccess(@owner,s.schedule_id)>=10 AND studio.fnStudioAccessLevel(@owner,CASE WHEN s.target_type=''STORED'' THEN ''DATASET'' ELSE ''PIPELINE'' END,s.target_id)>=10 ORDER BY e.created_at DESC,e.event_id DESC FOR JSON PATH) items_json;   RETURN;  END;  IF @action=''Save''  BEGIN   /* New weekly masks are additive; keep legacy week_day as the first selected day. */   IF @freq=''WEEKLY'' AND @weekmask IS NULL AND @weekday BETWEEN 1 AND 7     SET @weekmask=POWER(2,@weekday-1);   IF @freq=''WEEKLY'' AND @weekmask IS NOT NULL   BEGIN    SET @weekday=1;    WHILE @weekday<7 AND (@weekmask & POWER(2,@weekday-1))=0 SET @weekday=@weekday+1;   END;   IF @name IS NULL OR LEN(@name)>150 OR @target IS NULL OR @enabled IS NULL OR       @kind NOT IN (''STORED'',''PIPELINE'') OR @freq NOT IN (''INTERVAL'',''DAILY'',''WEEKLY'',''MONTHLY'') OR      (@freq=''INTERVAL'' AND (@interval IS NULL OR @interval NOT BETWEEN 5 AND 10080)) OR      (@freq<>''INTERVAL'' AND (@clock IS NULL OR LEN(@clock)<>5 OR @clock NOT LIKE ''[0-2][0-9]:[0-5][0-9]'' OR LEFT(@clock,2)>''23'')) OR      (@freq=''WEEKLY'' AND (@weekmask IS NULL OR @weekmask NOT BETWEEN 1 AND 127)) OR      (@freq<>''WEEKLY'' AND @weekmask IS NOT NULL) OR      (@freq=''DAILY'' AND @repeat IS NOT NULL AND @repeat NOT BETWEEN 5 AND 1440) OR      (@freq<>''DAILY'' AND @repeat IS NOT NULL) OR      (JSON_VALUE(@Payload,''$.RepeatMinutes'') IS NOT NULL AND @repeat IS NULL) OR      (JSON_VALUE(@Payload,''$.WeekDaysMask'') IS NOT NULL AND @weekmask IS NULL) OR      (@freq=''MONTHLY'' AND (@monthday IS NULL OR @monthday NOT BETWEEN 1 AND 31)) OR      (@kind=''STORED'' AND @ver IS NOT NULL) OR (@kind=''PIPELINE'' AND (@ver IS NULL OR @ver<1))   BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;   IF (@kind=''STORED'' AND NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode=''STORED'' AND studio.fnStudioAccessLevel(@owner,''DATASET'',dataset_id)>=20)) OR      (@kind=''PIPELINE'' AND NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id AND v.version=@ver WHERE p.pipeline_id=@target AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=20 AND JSON_QUERY(v.graph_json,''$.graph'') IS NOT NULL))   BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_TARGET_NOT_FOUND'' code; RETURN; END;   BEGIN TRY    BEGIN TRANSACTION; IF studio.fnStudioAccessLevel(@owner,CASE WHEN @kind=''STORED'' THEN ''DATASET'' ELSE ''PIPELINE'' END,@target)<20 THROW 52102,''SCHEDULER_NOT_FOUND'',1; IF @id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WHERE schedule_id=@id AND studio.fnStudioAccessLevel(created_by,CASE WHEN @kind=''STORED'' THEN ''DATASET'' ELSE ''PIPELINE'' END,@target)>=20) THROW 52102,''SCHEDULER_NOT_FOUND'',1;    IF @id IS NULL    BEGIN     IF (SELECT COUNT(*) FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE created_by=@owner)>=100        THROW 52101,''SCHEDULER_LIMIT_REACHED'',1;     SET @id=NEWID();     INSERT studio.scheduler_schedule(schedule_id,created_by,schedule_name,target_type,target_id,pipeline_version,frequency,interval_minutes,time_of_day,week_day,month_day,week_days_mask,repeat_minutes,enabled,next_run_at)     VALUES(@id,@owner,@name,@kind,@target,@ver,@freq,CASE WHEN @freq=''INTERVAL'' THEN @interval END,        CASE WHEN @freq<>''INTERVAL'' THEN @clock END,CASE WHEN @freq=''WEEKLY'' THEN @weekday END,CASE WHEN @freq=''MONTHLY'' THEN @monthday END,        CASE WHEN @freq=''WEEKLY'' THEN @weekmask END, CASE WHEN @freq=''DAILY'' THEN @repeat END, @enabled,CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END);
        /* PHASE2D3_ATOMIC_OWNERSHIP: same transaction as schedule INSERT */
        INSERT INTO studio.object_ownership (object_type, object_id, owner_user_id)
        VALUES (''SCHEDULE'', @id, @owner);
        INSERT INTO studio.object_access_audit
            (actor_user_id, object_type, object_id, action_type, new_owner_user_id)
        VALUES (@owner, ''SCHEDULE'', @id, ''REGISTER'', @owner);
    END
    ELSE
    BEGIN
        IF NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WITH(UPDLOCK,HOLDLOCK) WHERE schedule_id=@id AND studio.fnStudioScheduleAccess(@owner,schedule_id)>=20)         THROW 52102,''SCHEDULER_NOT_FOUND'',1;     UPDATE studio.scheduler_schedule SET schedule_name=@name,target_type=@kind,target_id=@target,pipeline_version=@ver,frequency=@freq,        interval_minutes=CASE WHEN @freq=''INTERVAL'' THEN @interval END,        time_of_day=CASE WHEN @freq<>''INTERVAL'' THEN @clock END,        week_day=CASE WHEN @freq=''WEEKLY'' THEN @weekday END,        month_day=CASE WHEN @freq=''MONTHLY'' THEN @monthday END,        week_days_mask=CASE WHEN @freq=''WEEKLY'' THEN @weekmask END,        repeat_minutes=CASE WHEN @freq=''DAILY'' THEN @repeat END,        enabled=@enabled,next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,        updated_at=@now WHERE schedule_id=@id AND studio.fnStudioScheduleAccess(@owner,schedule_id)>=20;    END;    COMMIT TRANSACTION;    SELECT CAST(1 AS bit) success,''SCHEDULER_SAVED'' code,CONVERT(varchar(36),@id) schedule_id;   END TRY   BEGIN CATCH    IF @@TRANCOUNT>0 ROLLBACK;    SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=52101 THEN ''SCHEDULER_LIMIT_REACHED'' WHEN ERROR_NUMBER()=52102 THEN ''SCHEDULER_NOT_FOUND'' ELSE ''SCHEDULER_SAVE_FAILED'' END code;   END CATCH;   RETURN;  END;  IF @action=''Toggle''  BEGIN IF NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WHERE schedule_id=@id AND studio.fnStudioScheduleAccess(@owner,schedule_id)>=20 AND studio.fnStudioAccessLevel(@owner,CASE WHEN target_type=''STORED'' THEN ''DATASET'' ELSE ''PIPELINE'' END,target_id)>=20) BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_NOT_FOUND'' code; RETURN; END;   IF @id IS NULL OR @enabled IS NULL   BEGIN SELECT CAST(0 AS bit) success,''SCHEDULER_INPUT_INVALID'' code; RETURN; END;   UPDATE studio.scheduler_schedule SET enabled=@enabled,     next_run_at=CASE WHEN @enabled=1 THEN studio.fnSchedulerNextUtcEx(frequency,interval_minutes,time_of_day,week_day,month_day,@now,week_days_mask,repeat_minutes) END,     updated_at=@now WHERE schedule_id=@id AND studio.fnStudioScheduleAccess(@owner,schedule_id)>=20;   IF @@ROWCOUNT=0 SELECT CAST(0 AS bit) success,''SCHEDULER_NOT_FOUND'' code;   ELSE SELECT CAST(1 AS bit) success,''SCHEDULER_UPDATED'' code,CONVERT(varchar(36),@id) schedule_id;   RETURN;  END;  SELECT CAST(0 AS bit) success,''SCHEDULER_ACTION_INVALID'' code; END;
';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spSchedulerDispatch'; SET @parameter=N'@Action'; SET @expected=N'@Action varchar(10)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @Action<>''Tick'' THROW 52110,''SCHEDULER_ACTION_INVALID'',1;
 DECLARE @now datetime2(3)=SYSUTCDATETIME(),@id uniqueidentifier,@owner uniqueidentifier,@target uniqueidentifier,
         @kind varchar(12),@freq varchar(12),@interval int,@clock char(5),@weekday tinyint,@monthday tinyint,@weekmask tinyint,@repeat smallint,
         @ver int,@slot datetime2(3),@run uniqueidentifier,@result varchar(24),@bad bit=0;
 BEGIN TRY
  BEGIN TRANSACTION;
  SELECT TOP(1) @id=s.schedule_id,@owner=s.created_by,@target=s.target_id,@kind=s.target_type,@freq=s.frequency,
    @interval=s.interval_minutes,@clock=s.time_of_day,@weekday=s.week_day,@monthday=s.month_day,@weekmask=s.week_days_mask,@repeat=s.repeat_minutes,
    @ver=s.pipeline_version,@slot=s.next_run_at
  FROM studio.scheduler_schedule s WITH(UPDLOCK,READPAST,ROWLOCK)
  WHERE s.enabled=1 AND s.next_run_at<=@now ORDER BY s.next_run_at,s.schedule_id;
  IF @id IS NULL
  BEGIN COMMIT TRANSACTION; SELECT CAST(0 AS bit) has_event; RETURN; END;
  IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
      SET @bad=1;
  IF @kind=''STORED''
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode=''STORED'' AND created_by=CONVERT(nvarchar(100),@owner)) SET @bad=1;
  END
  ELSE IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON p.pipeline_id=v.pipeline_id AND v.version=@ver
       WHERE p.pipeline_id=@target AND p.created_by=@owner AND JSON_QUERY(v.graph_json,''$.graph'') IS NOT NULL) SET @bad=1;
  IF @bad=1 SET @result=''SKIPPED_INVALID'';
  ELSE IF @kind=''STORED'' AND EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH(UPDLOCK,HOLDLOCK)
       WHERE dataset_id=@target AND status IN (''QUEUED'',''RUNNING'')) SET @result=''SKIPPED_BUSY'';
  ELSE IF @kind=''PIPELINE'' AND EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK)
       WHERE pipeline_id=@target AND status IN (''QUEUED'',''RUNNING'')) SET @result=''SKIPPED_BUSY'';
  ELSE
  BEGIN
   SET @run=NEWID(); SET @result=''QUEUED'';
   IF @kind=''STORED''
     INSERT studio.dataset_ingest_run(run_id,dataset_id,requested_by,request_id) VALUES(@run,@target,@owner,NEWID());
   ELSE
     INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@target,@ver,@owner,NEWID());
  END;
  INSERT studio.scheduler_event(schedule_id,scheduled_at,result,run_id) VALUES(@id,@slot,@result,@run);
  UPDATE studio.scheduler_schedule SET next_run_at=CASE WHEN @bad=1 THEN NULL ELSE studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,
   enabled=CASE WHEN @bad=1 THEN 0 ELSE enabled END,
   last_run_at=@now,updated_at=@now WHERE schedule_id=@id;
  COMMIT TRANSACTION;
  SELECT CAST(1 AS bit) has_event,CONVERT(varchar(36),@id) schedule_id,
   @result result,CONVERT(varchar(36),@run) run_id;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW 52111,''SCHEDULER_DISPATCH_FAILED'',1;
 END CATCH;
END;'; SET @new=N'ALTER PROCEDURE studio.spSchedulerDispatch @Action varchar(10)
AS
BEGIN
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @Action<>''Tick'' THROW 52110,''SCHEDULER_ACTION_INVALID'',1;
 DECLARE @now datetime2(3)=SYSUTCDATETIME(),@id uniqueidentifier,@owner uniqueidentifier,@target uniqueidentifier,
         @kind varchar(12),@freq varchar(12),@interval int,@clock char(5),@weekday tinyint,@monthday tinyint,@weekmask tinyint,@repeat smallint,
         @ver int,@slot datetime2(3),@run uniqueidentifier,@result varchar(24),@bad bit=0;
 BEGIN TRY
  BEGIN TRANSACTION;
  SELECT TOP(1) @id=s.schedule_id,@owner=s.created_by,@target=s.target_id,@kind=s.target_type,@freq=s.frequency,
    @interval=s.interval_minutes,@clock=s.time_of_day,@weekday=s.week_day,@monthday=s.month_day,@weekmask=s.week_days_mask,@repeat=s.repeat_minutes,
    @ver=s.pipeline_version,@slot=s.next_run_at
  FROM studio.scheduler_schedule s WITH(UPDLOCK,READPAST,ROWLOCK)
  WHERE s.enabled=1 AND s.next_run_at<=@now ORDER BY s.next_run_at,s.schedule_id;
  IF @id IS NULL
  BEGIN COMMIT TRANSACTION; SELECT CAST(0 AS bit) has_event; RETURN; END;
  IF NOT EXISTS(SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
      SET @bad=1;
  IF @kind=''STORED''
  BEGIN
    IF NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@target AND access_mode=''STORED'' AND studio.fnStudioAccessLevel(@owner,''DATASET'',dataset_id)>=20) SET @bad=1;
  END
  ELSE IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON p.pipeline_id=v.pipeline_id AND v.version=@ver
       WHERE p.pipeline_id=@target AND studio.fnStudioAccessLevel(@owner,''PIPELINE'',p.pipeline_id)>=20 AND studio.fnStudioGraphSourcesAllowed(@owner,v.graph_json)=1 AND JSON_QUERY(v.graph_json,''$.graph'') IS NOT NULL) SET @bad=1;
  IF studio.fnStudioScheduleAccess(@owner,@id)<20 SET @bad=1;
  IF @bad=1 SET @result=''SKIPPED_INVALID'';
  ELSE IF @kind=''STORED'' AND EXISTS(SELECT 1 FROM studio.dataset_ingest_run WITH(UPDLOCK,HOLDLOCK)
       WHERE dataset_id=@target AND status IN (''QUEUED'',''RUNNING'')) SET @result=''SKIPPED_BUSY'';
  ELSE IF @kind=''PIPELINE'' AND EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK)
       WHERE pipeline_id=@target AND status IN (''QUEUED'',''RUNNING'')) SET @result=''SKIPPED_BUSY'';
  ELSE
  BEGIN
   SET @run=NEWID(); SET @result=''QUEUED'';
   IF @kind=''STORED''
     INSERT studio.dataset_ingest_run(run_id,dataset_id,requested_by,request_id) VALUES(@run,@target,@owner,NEWID());
   ELSE
     INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@target,@ver,@owner,NEWID());
  END;
  INSERT studio.scheduler_event(schedule_id,scheduled_at,result,run_id) VALUES(@id,@slot,@result,@run);
  UPDATE studio.scheduler_schedule SET next_run_at=CASE WHEN @bad=1 THEN NULL ELSE studio.fnSchedulerNextUtcEx(@freq,@interval,@clock,@weekday,@monthday,@now,@weekmask,@repeat) END,
   enabled=CASE WHEN @bad=1 THEN 0 ELSE enabled END,
   last_run_at=@now,updated_at=@now WHERE schedule_id=@id;
  COMMIT TRANSACTION;
  SELECT CAST(1 AS bit) has_event,CONVERT(varchar(36),@id) schedule_id,
   @result result,CONVERT(varchar(36),@run) run_id;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK;
  THROW 52111,''SCHEDULER_DISPATCH_FAILED'',1;
 END CATCH;
END;';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spChartControl'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max) AS BEGIN     SET NOCOUNT ON;     SET XACT_ABORT ON;      IF @Payload IS NULL OR ISJSON(@Payload) <> 1     BEGIN         SELECT CAST(0 AS bit) AS success, ''CHART_INPUT_INVALID'' AS code;         RETURN;     END;      DECLARE @User uniqueidentifier =         TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.UserID''));      IF @User IS NULL        OR NOT EXISTS           (               SELECT 1               FROM dbo.core_user               WHERE user_id = @User                 AND is_active = 1                 AND is_locked = 0           )     BEGIN         SELECT CAST(0 AS bit) AS success, ''CHART_USER_UNAVAILABLE'' AS code;         RETURN;     END;      DECLARE @Action varchar(10) =         UPPER(ISNULL(JSON_VALUE(@Payload, ''$.Action''), ''''));      IF @Action = ''LIST''     BEGIN         SELECT CAST(1 AS bit) AS success,                ''CHART_LIST'' AS code,                (                    SELECT LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,                           chart_name AS name,                           version,                           JSON_QUERY(config_json) AS config,                           created_at,                           updated_at                    FROM studio.chart                    WHERE owner_user_id = @User                    ORDER BY updated_at DESC, chart_id                    FOR JSON PATH                ) AS items_json;         RETURN;     END;      IF @Action = ''GET''     BEGIN         DECLARE @GetID uniqueidentifier =             TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ChartID''));          IF @GetID IS NULL         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_ID_INVALID'' AS code;             RETURN;         END;          IF NOT EXISTS         (             SELECT 1             FROM studio.chart             WHERE chart_id = @GetID               AND owner_user_id = @User         )         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_NOT_FOUND'' AS code;             RETURN;         END;          SELECT CAST(1 AS bit) AS success,                ''CHART_GET'' AS code,                LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,                chart_name,                version,                created_at,                updated_at,                config_json         FROM studio.chart         WHERE chart_id = @GetID           AND owner_user_id = @User;         RETURN;     END;      IF @Action = ''SAVE''     BEGIN         DECLARE @Name nvarchar(150) =             NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ChartName''))), '''');          /* ConfigJSON is a JSON string (json.dumps in Python). OPENJSON keeps            the full value instead of JSON_VALUE''s 4000-character limit. */         DECLARE @Config nvarchar(max);         SELECT @Config = CAST([value] AS nvarchar(max))         FROM OPENJSON(@Payload)         WHERE [key] = N''ConfigJSON'';          DECLARE @Expected int =             ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ExpectedVersion'')), 0);          DECLARE @SaveID uniqueidentifier =             TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ChartID''));          IF @Name IS NULL            OR LEN(@Name) > 150            OR @Config IS NULL            OR ISJSON(@Config) <> 1            OR DATALENGTH(@Config) > 262144            OR @Expected < 0            OR (JSON_VALUE(@Payload, ''$.ChartID'') IS NOT NULL AND @SaveID IS NULL)         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_INPUT_INVALID'' AS code;             RETURN;         END;          IF @SaveID IS NULL         BEGIN             DECLARE @NewID uniqueidentifier = NEWID();              BEGIN TRY
                BEGIN TRANSACTION;
                INSERT INTO studio.chart                 (chart_id, chart_name, config_json, version, owner_user_id)             VALUES                 (@NewID, @Name, @Config, 1, @User);
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''CHART'',@NewID,@User);
    INSERT INTO studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@User,''CHART'',@NewID,''REGISTER'',@User);
                COMMIT TRANSACTION;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
                THROW;
            END CATCH;
              SELECT CAST(1 AS bit) AS success,                    ''CHART_SAVED'' AS code,                    LOWER(CONVERT(varchar(36), @NewID)) AS chart_id,                    1 AS version;             RETURN;         END;          BEGIN TRY             BEGIN TRANSACTION;              UPDATE studio.chart WITH (UPDLOCK, ROWLOCK)             SET chart_name = @Name,                 config_json = @Config,                 version = version + 1,                 updated_at = SYSUTCDATETIME()             WHERE chart_id = @SaveID               AND owner_user_id = @User               AND version = @Expected;              IF @@ROWCOUNT = 0             BEGIN                 ROLLBACK TRANSACTION;                  IF EXISTS                 (                     SELECT 1                     FROM studio.chart                     WHERE chart_id = @SaveID                       AND owner_user_id = @User                 )                     SELECT CAST(0 AS bit) AS success,                            ''CHART_VERSION_CONFLICT'' AS code;                 ELSE                     SELECT CAST(0 AS bit) AS success,                            ''CHART_NOT_FOUND'' AS code;                 RETURN;              END;              COMMIT TRANSACTION;              SELECT CAST(1 AS bit) AS success,                    ''CHART_UPDATED'' AS code,                    LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,                    version             FROM studio.chart             WHERE chart_id = @SaveID;             RETURN;         END TRY         BEGIN CATCH             IF @@TRANCOUNT > 0                 ROLLBACK TRANSACTION;              SELECT CAST(0 AS bit) AS success, ''CHART_SAVE_FAILED'' AS code;             RETURN;         END CATCH;     END;      IF @Action = ''DELETE''     BEGIN         DECLARE @DeleteID uniqueidentifier =             TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ChartID''));          IF @DeleteID IS NULL         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_ID_INVALID'' AS code;             RETURN;         END;          DELETE FROM studio.chart         WHERE chart_id = @DeleteID           AND owner_user_id = @User;          IF @@ROWCOUNT = 0         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_NOT_FOUND'' AS code;             RETURN;         END;          SELECT CAST(1 AS bit) AS success, ''CHART_DELETED'' AS code;         RETURN;     END;      SELECT CAST(0 AS bit) AS success, ''CHART_ACTION_INVALID'' AS code; END;'; SET @new=N' ALTER PROCEDURE studio.spChartControl     @Payload nvarchar(max) AS BEGIN     SET NOCOUNT ON;     SET XACT_ABORT ON;      IF @Payload IS NULL OR ISJSON(@Payload) <> 1     BEGIN         SELECT CAST(0 AS bit) AS success, ''CHART_INPUT_INVALID'' AS code;         RETURN;     END;      DECLARE @User uniqueidentifier =         TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.UserID''));      IF @User IS NULL        OR NOT EXISTS           (               SELECT 1               FROM dbo.core_user               WHERE user_id = @User                 AND is_active = 1                 AND is_locked = 0           )     BEGIN         SELECT CAST(0 AS bit) AS success, ''CHART_USER_UNAVAILABLE'' AS code;         RETURN;     END;      DECLARE @Action varchar(10) =         UPPER(ISNULL(JSON_VALUE(@Payload, ''$.Action''), ''''));      IF @Action = ''LIST''     BEGIN         SELECT CAST(1 AS bit) AS success,                ''CHART_LIST'' AS code,                (                    SELECT LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,                           chart_name AS name,                           version,                           JSON_QUERY(config_json) AS config,                           created_at,                           updated_at                    FROM studio.chart                    WHERE studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=CASE WHEN @Action=''DELETE'' THEN 30 WHEN @Action=''SAVE'' THEN 20 ELSE 10 END AND (@Action NOT IN (''LIST'',''GET'') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1)                    AND studio.fnStudioChartSourceAllowed(@User,config_json)=1 ORDER BY updated_at DESC, chart_id                    FOR JSON PATH                ) AS items_json;         RETURN;     END;      IF @Action = ''GET''     BEGIN IF NOT EXISTS(SELECT 1 FROM studio.chart WHERE chart_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ChartID'')) AND studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=10 AND studio.fnStudioChartSourceAllowed(@User,config_json)=1) BEGIN SELECT CAST(0 AS bit) success,''CHART_NOT_FOUND'' code; RETURN; END;         DECLARE @GetID uniqueidentifier =             TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ChartID''));          IF @GetID IS NULL         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_ID_INVALID'' AS code;             RETURN;         END;          IF NOT EXISTS         (             SELECT 1             FROM studio.chart             WHERE chart_id = @GetID               AND studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=CASE WHEN @Action=''DELETE'' THEN 30 WHEN @Action=''SAVE'' THEN 20 ELSE 10 END AND (@Action NOT IN (''LIST'',''GET'') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1)         )         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_NOT_FOUND'' AS code;             RETURN;         END;          SELECT CAST(1 AS bit) AS success,                ''CHART_GET'' AS code,                LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,                chart_name,                version,                created_at,                updated_at,                config_json         FROM studio.chart         WHERE chart_id = @GetID           AND studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=CASE WHEN @Action=''DELETE'' THEN 30 WHEN @Action=''SAVE'' THEN 20 ELSE 10 END AND (@Action NOT IN (''LIST'',''GET'') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1);         RETURN;     END;      IF @Action = ''SAVE''     BEGIN         DECLARE @Name nvarchar(150) =             NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ChartName''))), '''');          /* ConfigJSON is a JSON string (json.dumps in Python). OPENJSON keeps            the full value instead of JSON_VALUE''s 4000-character limit. */         DECLARE @Config nvarchar(max);         SELECT @Config = CAST([value] AS nvarchar(max))         FROM OPENJSON(@Payload)         WHERE [key] = N''ConfigJSON'';          DECLARE @Expected int =             ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ExpectedVersion'')), 0);          DECLARE @SaveID uniqueidentifier =             TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ChartID''));          IF @Name IS NULL            OR LEN(@Name) > 150            OR @Config IS NULL            OR ISJSON(@Config) <> 1            OR DATALENGTH(@Config) > 262144            OR @Expected < 0            OR (JSON_VALUE(@Payload, ''$.ChartID'') IS NOT NULL AND @SaveID IS NULL)         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_INPUT_INVALID'' AS code;             RETURN;         END;          IF studio.fnStudioChartSourceAllowed(@User,@Config)=0 BEGIN SELECT CAST(0 AS bit) success,''CHART_DATASET_NOT_FOUND'' code; RETURN; END; IF @SaveID IS NULL         BEGIN             DECLARE @NewID uniqueidentifier = NEWID();              BEGIN TRY
                BEGIN TRANSACTION;
                INSERT INTO studio.chart                 (chart_id, chart_name, config_json, version, owner_user_id)             VALUES                 (@NewID, @Name, @Config, 1, @User);
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''CHART'',@NewID,@User);
    INSERT INTO studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@User,''CHART'',@NewID,''REGISTER'',@User);
                COMMIT TRANSACTION;
            END TRY
            BEGIN CATCH
                IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
                THROW;
            END CATCH;
              SELECT CAST(1 AS bit) AS success,                    ''CHART_SAVED'' AS code,                    LOWER(CONVERT(varchar(36), @NewID)) AS chart_id,                    1 AS version;             RETURN;         END;          BEGIN TRY             BEGIN TRANSACTION; IF studio.fnStudioChartSourceAllowed(@User,@Config)=0 THROW 52910,''CHART_DATASET_NOT_FOUND'',1;              UPDATE studio.chart WITH (UPDLOCK, ROWLOCK)             SET chart_name = @Name,                 config_json = @Config,                 version = version + 1,                 updated_at = SYSUTCDATETIME()             WHERE chart_id = @SaveID               AND studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=CASE WHEN @Action=''DELETE'' THEN 30 WHEN @Action=''SAVE'' THEN 20 ELSE 10 END AND (@Action NOT IN (''LIST'',''GET'') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1)               AND version = @Expected;              IF @@ROWCOUNT = 0             BEGIN                 ROLLBACK TRANSACTION;                  IF EXISTS                 (                     SELECT 1                     FROM studio.chart                     WHERE chart_id = @SaveID                       AND studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=CASE WHEN @Action=''DELETE'' THEN 30 WHEN @Action=''SAVE'' THEN 20 ELSE 10 END AND (@Action NOT IN (''LIST'',''GET'') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1)                 )                     SELECT CAST(0 AS bit) AS success,                            ''CHART_VERSION_CONFLICT'' AS code;                 ELSE                     SELECT CAST(0 AS bit) AS success,                            ''CHART_NOT_FOUND'' AS code;                 RETURN;              END;              COMMIT TRANSACTION;              SELECT CAST(1 AS bit) AS success,                    ''CHART_UPDATED'' AS code,                    LOWER(CONVERT(varchar(36), chart_id)) AS chart_id,                    version             FROM studio.chart             WHERE chart_id = @SaveID;             RETURN;         END TRY         BEGIN CATCH             IF @@TRANCOUNT > 0                 ROLLBACK TRANSACTION;              SELECT CAST(0 AS bit) AS success, ''CHART_SAVE_FAILED'' AS code;             RETURN;         END CATCH;     END;      IF @Action = ''DELETE''     BEGIN         DECLARE @DeleteID uniqueidentifier =             TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ChartID''));          IF @DeleteID IS NULL         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_ID_INVALID'' AS code;             RETURN;         END;          DELETE FROM studio.chart         WHERE chart_id = @DeleteID           AND studio.fnStudioAccessLevel(@User,''CHART'',chart_id)>=CASE WHEN @Action=''DELETE'' THEN 30 WHEN @Action=''SAVE'' THEN 20 ELSE 10 END AND (@Action NOT IN (''LIST'',''GET'') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1);          IF @@ROWCOUNT = 0         BEGIN             SELECT CAST(0 AS bit) AS success, ''CHART_NOT_FOUND'' AS code;             RETURN;         END;          SELECT CAST(1 AS bit) AS success, ''CHART_DELETED'' AS code;         RETURN;     END;      SELECT CAST(0 AS bit) AS success, ''CHART_ACTION_INVALID'' AS code; END; ';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'CoreAnalytics'; SET @object=N'studio.spStoredDatasetCreate'; SET @parameter=N'@Payload'; SET @expected=N'@Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  IF ISJSON(@Payload) <> 1 BEGIN SELECT CAST(0 AS bit) success, ''DATASET_INPUT_INVALID'' code; RETURN; END;  DECLARE @UserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),          @ConnectionID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')),          @Name nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.DatasetName''))),''''),          @Description nvarchar(1000)=JSON_VALUE(@Payload,''$.Description''),          @Schema sysname=JSON_VALUE(@Payload,''$.SourceSchema''),          @Source sysname=JSON_VALUE(@Payload,''$.SourceName''),          @Type varchar(20)=JSON_VALUE(@Payload,''$.SourceType'');  IF @UserID IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.core_user WHERE user_id=@UserID AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''USER_UNAVAILABLE'' code; RETURN; END;  IF @Name IS NULL OR @Schema IS NULL OR @Source IS NULL OR @Type NOT IN (''BASE TABLE'',''VIEW'')     OR @ConnectionID IS NULL OR NOT EXISTS (SELECT 1 FROM studio.connection WHERE connection_id=@ConnectionID AND is_active=1)   BEGIN SELECT CAST(0 AS bit) success,''DATASET_INPUT_INVALID'' code; RETURN; END;  BEGIN TRY   BEGIN TRANSACTION; DECLARE @DatasetID uniqueidentifier=NEWID();   INSERT studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)   VALUES(@DatasetID,@Name,@Description,@ConnectionID,@Schema,@Source,@Type,''STORED'',''PENDING'',CONVERT(nvarchar(100),@UserID));
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''DATASET'',@DatasetID,@UserID);
    INSERT INTO studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@UserID,''DATASET'',@DatasetID,''REGISTER'',@UserID);
 COMMIT TRANSACTION;   SELECT CAST(1 AS bit) success,''DATASET_CREATED'' code,CONVERT(varchar(36),@DatasetID) dataset_id;  END TRY  BEGIN CATCH   IF @@TRANCOUNT>0 ROLLBACK TRANSACTION; SELECT CAST(0 AS bit) success, CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN ''DATASET_DUPLICATE'' ELSE ''DATASET_CREATE_FAILED'' END code;  END CATCH; END;'; SET @new=N'ALTER PROCEDURE studio.spStoredDatasetCreate     @Payload nvarchar(max) AS BEGIN  SET NOCOUNT ON;  IF ISJSON(@Payload) <> 1 BEGIN SELECT CAST(0 AS bit) success, ''DATASET_INPUT_INVALID'' code; RETURN; END;  DECLARE @UserID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID'')),          @ConnectionID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')),          @Name nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.DatasetName''))),''''),          @Description nvarchar(1000)=JSON_VALUE(@Payload,''$.Description''),          @Schema sysname=JSON_VALUE(@Payload,''$.SourceSchema''),          @Source sysname=JSON_VALUE(@Payload,''$.SourceName''),          @Type varchar(20)=JSON_VALUE(@Payload,''$.SourceType'');  IF @UserID IS NULL OR NOT EXISTS (SELECT 1 FROM dbo.core_user WHERE user_id=@UserID AND is_active=1 AND is_locked=0)  BEGIN SELECT CAST(0 AS bit) success,''USER_UNAVAILABLE'' code; RETURN; END;  IF @Name IS NULL OR @Schema IS NULL OR @Source IS NULL OR @Type NOT IN (''BASE TABLE'',''VIEW'')     OR @ConnectionID IS NULL OR NOT EXISTS (SELECT 1 FROM studio.connection WHERE connection_id=@ConnectionID AND is_active=1 AND studio.fnStudioAccessLevel(@UserID,''CONNECTION'',connection_id)>=20)   BEGIN SELECT CAST(0 AS bit) success,''DATASET_INPUT_INVALID'' code; RETURN; END;  BEGIN TRY   BEGIN TRANSACTION; IF studio.fnStudioAccessLevel(@UserID,''CONNECTION'',@ConnectionID)<20 THROW 52910,''DATASET_SOURCE_INVALID'',1; DECLARE @DatasetID uniqueidentifier=NEWID();   INSERT studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)   VALUES(@DatasetID,@Name,@Description,@ConnectionID,@Schema,@Source,@Type,''STORED'',''PENDING'',CONVERT(nvarchar(100),@UserID));
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''DATASET'',@DatasetID,@UserID);
    INSERT INTO studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@UserID,''DATASET'',@DatasetID,''REGISTER'',@UserID);
 COMMIT TRANSACTION;   SELECT CAST(1 AS bit) success,''DATASET_CREATED'' code,CONVERT(varchar(36),@DatasetID) dataset_id;  END TRY  BEGIN CATCH   IF @@TRANCOUNT>0 ROLLBACK TRANSACTION; SELECT CAST(0 AS bit) success, CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN ''DATASET_DUPLICATE'' ELSE ''DATASET_CREATE_FAILED'' END code;  END CATCH; END; ';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
SET @db=N'BI'; SET @object=N'dbo.spDashboard'; SET @parameter=N'@Mode'; SET @expected=N'@Mode varchar(100) = '''',               
    @HealthcareID varchar(3) = '''',               
    @Periode varchar(7) = '''',               
    @Payload nvarchar(max) = ''''               
)               
AS               
               
SET NOCOUNT ON;  
  
-- PHASE 2D Ownership & Sharing: signed BEAM -> CoreAnalytics RPC.  
-- All previous spDashboard dispatchers and modes remain unchanged.  
IF @Mode = ''CoreStudioObjectAccess''  
BEGIN  
    EXEC [CoreAnalytics].studio.spObjectAccessRpc @Payload = @Payload;  
    RETURN;  
END;  
   
IF @Mode = ''CoreStudioScheduler'' BEGIN EXEC [CoreAnalytics].studio.spSchedulerControl @Payload=@Payload; RETURN; END;   
   
IF @Mode = ''CoreStudioStoredDatasetCreate'' BEGIN EXEC [CoreAnalytics].studio.spStoredDatasetCreate @Payload=@Payload; RETURN; END;   
IF @Mode = ''CoreStudioIngest''   
BEGIN EXEC [CoreAnalytics].studio.spDatasetIngestControl @Payload = @Payload; RETURN; END;      
      
/* Chart Library metadata. Requires CoreAnalytics migration 013. */     
IF @Mode = ''CoreStudioCharts''     
BEGIN     
    EXEC [CoreAnalytics].studio.spChartControl @Payload = @Payload;     
    RETURN;     
END;     
     
/* Pipeline metadata/job routing. Requires CoreAnalytics migrations 006 and 007. */      
IF @Mode = ''CoreStudioPipelines''      
BEGIN      
    EXEC [CoreAnalytics].studio.spPipelineControl @Payload=@Payload;      
    RETURN;      
END;      
               
               
DECLARE @CurrentYear INT = YEAR(GETDATE());               
DECLARE @LastYear INT = @CurrentYear - 1;               
DECLARE @PrevYear INT = @CurrentYear - 2;               
DECLARE @SQL NVARCHAR(MAX);               
DECLARE @PeriodeAwal date, @PeriodeAkhir date;               
               
-- =============================================================               
-- CORE PAYLOAD PARSER               
-- Existing dashboard modes tetap memakai HealthcareID / Periode.               
-- Semua mode Core* memakai Payload JSON.               
-- =============================================================               
               
IF LEFT(ISNULL(@Mode,''''), 4) = ''Core''               
   AND ISNULL(@Payload,'''') <> ''''               
   AND ISJSON(@Payload) <> 1               
BEGIN               
    SELECT               
        CAST(0 AS bit) AS success,               
        ''INVALID_PAYLOAD'' AS code,               
        ''Payload JSON tidak valid.'' AS message;               
    RETURN;               
END;               
               
DECLARE               
    @CoreUsername varchar(100) = NULL,               
    @CoreDisplayName varchar(200) = NULL,               
    @CoreEmail varchar(320) = NULL,               
    @CoreEmailNormalized varchar(320) = NULL,               
    @CorePasswordHash varchar(500) = NULL,               
    @CoreUserID uniqueidentifier = NULL,               
               
    @CoreVoiceProfileID uniqueidentifier = NULL,               
    @CoreModelName varchar(100) = NULL,               
    @CoreModelVersion varchar(50) = NULL,               
    @CoreEmbeddingDimension int = NULL,               
    @CoreCentroidEmbeddingBase64 varchar(max) = NULL,               
    @CoreThreshold decimal(8,6) = NULL,               
    @CoreSampleCount int = NULL,               
               
    @CoreSampleNo int = NULL,               
    @CoreStoragePath varchar(500) = NULL,               
    @CoreDurationMs int = NULL,               
    @CoreQualityScore decimal(8,6) = NULL,               
    @CoreEmbeddingBase64 varchar(max) = NULL,               
    @CoreIsValid bit = 1,               
          
    @CoreDetectedUserID uniqueidentifier = NULL,               
    @CoreBestScore decimal(8,6) = NULL,               
    @CoreSecondBestScore decimal(8,6) = NULL,               
    @CoreScoreMargin decimal(8,6) = NULL,               
    @CoreThresholdUsed decimal(8,6) = NULL,               
    @CoreDecision varchar(30) = NULL,               
               
    -- User management list/status               
    @CorePage int = 1,               
    @CorePageSize int = 20,               
    @CoreSearch varchar(320) = NULL,               
    @CoreStatus varchar(20) = ''all'',               
    @CoreSetIsActive bit = NULL,               
           
    -- Authentication security / audit           
   @CoreSessionID uniqueidentifier = NULL,           
    @CoreAuthMethod varchar(20) = NULL,           
    @CoreIsSuccess bit = NULL,           
    @CoreFailureCode varchar(100) = NULL,           
    @CoreFailureDetail nvarchar(1000) = NULL,           
    @CoreIPAddress varchar(45) = NULL,           
    @CoreUserAgent nvarchar(1000) = NULL,           
           
    -- Password reset / OTP           
    @CoreResetIdentifier varchar(320) = NULL,           
    @CoreResetTokenID uniqueidentifier = NULL,           
    @CoreResetTokenHash varchar(128) = NULL,           
    @CoreResetSessionHash varchar(128) = NULL,           
    @CoreResetTTLMinutes int = 10,           
    @CoreResetMaxRequests int = 3,           
    @CoreResetWindowMinutes int = 15,           
    @CoreResetMaxAttempts int = 5,           
                   
    @CoreGroupID uniqueidentifier = NULL,               
    @CoreGroupCode varchar(50) = NULL,               
    @CoreGroupName varchar(150) = NULL,               
    @CoreGroupDescription varchar(500) = NULL;              
               
IF ISJSON(@Payload) = 1               
BEGIN               
    SET @CoreUsername =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Username''))), '''');               
               
    SET @CoreDisplayName =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.DisplayName''))), '''');               
               
               
    SET @CoreEmail =                NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Email''))), '''');               
           
    SET @CoreEmailNormalized =               
        LOWER(@CoreEmail);               
    SET @CorePasswordHash =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.PasswordHash''))), '''');               
               
    SET @CoreUserID =               
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.UserID''));               
               
    SET @CoreVoiceProfileID =               
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.VoiceProfileID''));               
               
    SET @CoreModelName =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ModelName''))), '''');               
               
    SET @CoreModelVersion =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ModelVersion''))), '''');               
               
    SET @CoreEmbeddingDimension =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.EmbeddingDimension''));               
               
    SET @CoreCentroidEmbeddingBase64 =               
        JSON_VALUE(@Payload, ''$.CentroidEmbeddingBase64'');               
               
    SET @CoreThreshold =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.Threshold''));               
               
    SET @CoreSampleCount =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.SampleCount''));               
               
    SET @CoreSampleNo =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.SampleNo''));               
               
    SET @CoreStoragePath =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.StoragePath''))), '''');               
               
    SET @CoreDurationMs =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.DurationMs''));        
               
    SET @CoreQualityScore =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.QualityScore''));               
               
    SET @CoreEmbeddingBase64 =               
        JSON_VALUE(@Payload, ''$.EmbeddingBase64'');               
               
    SET @CoreIsValid =               
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, ''$.IsValid''), ''true''))               
            WHEN ''true'' THEN 1               
            WHEN ''false'' THEN 0               
            ELSE ISNULL(               
                TRY_CONVERT(bit, JSON_VALUE(@Payload, ''$.IsValid'')),               
                1               
            )               
        END;               
               
    SET @CoreDetectedUserID =               
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.DetectedUserID''));               
               
    SET @CoreBestScore =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.BestScore''));               
               
    SET @CoreSecondBestScore =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.SecondBestScore''));               
               
    SET @CoreScoreMargin =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.ScoreMargin''));               
               
    SET @CoreThresholdUsed =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.ThresholdUsed''));               
               
    SET @CoreDecision =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Decision''))), '''');               
               
    SET @CorePage =               
      ISNULL(               
            TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.Page'')),          
            1               
        );               
               
    SET @CorePageSize =               
        ISNULL(               
            TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.PageSize'')),               
            20               
        );               
               
    SET @CoreSearch =               
        NULLIF(               
            LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Search''))),               
            ''''               
        );               
               
    SET @CoreStatus =               
        LOWER(               
            ISNULL(               
                NULLIF(               
                    LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Status''))),               
                    ''''               
                ),               
                ''all''               
            )               
        );               
               
    SET @CoreSetIsActive =               
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, ''$.IsActive''), ''''))               
            WHEN ''true'' THEN 1               
            WHEN ''false'' THEN 0               
            WHEN ''1'' THEN 1               
            WHEN ''0'' THEN 0               
            ELSE TRY_CONVERT(bit, JSON_VALUE(@Payload, ''$.IsActive''))               
        END;              
    SET @CoreSessionID =           
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.SessionID''));           
           
    SET @CoreAuthMethod =           
        UPPER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.AuthMethod''))), ''''));           
           
    SET @CoreIsSuccess =           
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, ''$.IsSuccess''), ''''))           
            WHEN ''true'' THEN 1           
            WHEN ''false'' THEN 0           
            WHEN ''1'' THEN 1           
            WHEN ''0'' THEN 0           
            ELSE TRY_CONVERT(bit, JSON_VALUE(@Payload, ''$.IsSuccess''))           
        END;           
           
    SET @CoreFailureCode =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.FailureCode''))), '''');           
           
    SET @CoreFailureDetail =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.FailureDetail''))), '''');           
           
    SET @CoreIPAddress =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.IPAddress''))), '''');           
           
    SET @CoreUserAgent =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.UserAgent''))), '''');           
           
    SET @CoreResetIdentifier =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Identifier''))), '''');           
           
    SET @CoreResetTokenID =           
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ResetTokenID''));           
           
    SET @CoreResetTokenHash =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ResetTokenHash''))), '''');           
           
    SET @CoreResetSessionHash =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ResetSessionHash''))), '''');           
           
    SET @CoreResetTTLMinutes =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetTTLMinutes'')), 10);           
          
    SET @CoreResetMaxRequests =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetMaxRequests'')), 3);           
           
    SET @CoreResetWindowMinutes =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetWindowMinutes'')), 15);           
           
    SET @CoreResetMaxAttempts =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetMaxAttempts'')), 5);           
               
    SET @CoreGroupID =               
        TRY_CONVERT(               
            uniqueidentifier,               
            JSON_VALUE(@Payload, ''$.GroupID'')               
        );               
               
    SET @CoreGroupCode =               
        NULLIF(               
 UPPER(               
                LTRIM(               
                    RTRIM(               
                        JSON_VALUE(@Payload, ''$.GroupCode'')               
                    )               
                )               
            ),               
            ''''               
        );               
               
    SET @CoreGroupName =               
        NULLIF(               
            LTRIM(               
                RTRIM(               
                    JSON_VALUE(@Payload, ''$.GroupName'')               
                )               
            ),               
            ''''               
        );               
               
    SET @CoreGroupDescription =               
        NULLIF(               
            LTRIM(               
                RTRIM(               
                    JSON_VALUE(@Payload, ''$.Description'')               
                )               
            ),               
            ''''               
        );                       
END;               
               
               
-- =============================================================               
-- CORE USER REGISTER               
--               
-- Payload:               
-- {               
--   "Username": "...",               
--   "DisplayName": "...",               
--   "Email": "...",               
--   "PasswordHash": "..."               
-- }               
--               
-- PasswordHash harus sudah dibuat oleh Python menggunakan Argon2.               
-- Plaintext password tidak boleh dikirim ke SQL Server.               
-- =============================================================               
IF @Mode = ''CoreUserRegister''               
BEGIN               
    IF @CoreUsername IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USERNAME_REQUIRED'' AS code,               
               ''Username wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    IF @CoreDisplayName IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''DISPLAY_NAME_REQUIRED'' AS code,               
               ''Display name wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    IF @CoreEmail IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMAIL_REQUIRED'' AS code,               
               ''Email wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    -- Basic email validation. Validasi utama tetap dilakukan di Python.               
    IF @CoreEmail NOT LIKE ''%_@_%._%'' OR LEN(@CoreEmail) > 320               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMAIL_INVALID'' AS code,               
               ''Format email tidak valid.'' AS message;               
        RETURN;               
    END;               
           
    IF @CorePasswordHash IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''PASSWORD_HASH_REQUIRED'' AS code,               
               ''PasswordHash wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    IF EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE username = @CoreUsername               
    )               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USERNAME_EXISTS'' AS code,               
               ''Username sudah digunakan.'' AS message;               
        RETURN;               
    END;               
           
    IF EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE email_normalized = @CoreEmailNormalized               
    )               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMAIL_EXISTS'' AS code,               
               ''Email sudah digunakan.'' AS message;               
        RETURN;               
    END;               
           
    BEGIN TRY               
        DECLARE @NewUserID uniqueidentifier = NEWID();               
           
        INSERT INTO [CoreAnalytics].dbo.core_user               
        (               
            user_id,               
            username,               
         display_name,               
            email,               
            email_normalized,               
            password_hash,               
            is_active,               
            created_at               
        )               
        VALUES               
        (               
            @NewUserID,                      @CoreUsername,               
            @CoreDisplayName,               
            @CoreEmail,               
            @CoreEmailNormalized,               
            @CorePasswordHash,               
            1,               
            SYSDATETIME()               
        );               
           
        SELECT               
            CAST(1 AS bit) AS success,               
            ''USER_REGISTERED'' AS code,               
            ''User registered successfully.'' AS message,               
            CONVERT(varchar(36), @NewUserID) AS user_id,               
            username,               
            display_name,               
            email,               
     is_active,               
            created_at               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @NewUserID;               
           
        RETURN;               
    END TRY               
    BEGIN CATCH               
        -- Unique index remains the final protection against race conditions.               
        IF ERROR_NUMBER() IN (2601, 2627)               
        BEGIN               
            SELECT CAST(0 AS bit) AS success,               
                   ''USER_DUPLICATE'' AS code,               
                   ''Username atau email sudah digunakan.'' AS message;               
            RETURN;    
        END;               
           
        SELECT CAST(0 AS bit) AS success,               
               ''USER_REGISTER_ERROR'' AS code,               
               ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
           
           
-- =============================================================               
-- CORE USER AUTH GET               
-- =============================================================               
IF @Mode = ''CoreUserAuthGet''               
BEGIN               
    IF @CoreUsername IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USERNAME_REQUIRED'' AS code,               
               ''Username wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    SELECT TOP 1               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,               
        username,               
        display_name,               
        email,         
        password_hash,               
        is_active,           
        is_locked,           
        failed_login_count,           
        locked_at,           
        lock_reason,           
        last_failed_login_at               
    FROM [CoreAnalytics].dbo.core_user               
    WHERE username = @CoreUsername;               
               
    RETURN;               
END;               
               
               
-- =============================================================           
-- CORE USER PASSWORD CHANGE           
-- Password verification and hashing are performed in Python.           
-- Payload: { "UserID": "...", "PasswordHash": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserPasswordChange''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CorePasswordHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''PASSWORD_HASH_REQUIRED'' AS code,           
               ''PasswordHash wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_active = 0           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_INACTIVE'' AS code,           
               ''User tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_locked = 1           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''ACCOUNT_LOCKED'' AS code,           
               ''Account terkunci. Hubungi administrator untuk unlock.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        UPDATE [CoreAnalytics].dbo.core_user           
        SET           
            password_hash = @CorePasswordHash,           
            failed_login_count = 0,           
            last_failed_login_at = NULL,           
            updated_at = SYSDATETIME()           
        WHERE user_id = @CoreUserID           
          AND is_active = 1           
          AND is_locked = 0;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            ''PASSWORD_CHANGED'' AS code,           
            ''Password berhasil diubah.'' AS message,           
            CONVERT(varchar(36), user_id) AS user_id,           
            username,           
            updated_at           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID;           
           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        SELECT CAST(0 AS bit) AS success,           
               ''PASSWORD_CHANGE_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET LOOKUP           
-- Server-to-server only. Browser never receives this response directly.           
-- Payload: { "Identifier": "username-or-email" }           
-- =============================================================           
IF @Mode = ''CorePasswordResetLookup''           
BEGIN           
    IF @CoreResetIdentifier IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''IDENTIFIER_REQUIRED'' AS code,           
               ''Username atau email wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    SELECT TOP 1           
        CAST(1 AS bit) AS success,           
        ''RESET_USER_FOUND'' AS code,           
        CONVERT(varchar(36), u.user_id) AS user_id,           
        u.username,           
        u.display_name,           
        u.email,           
        u.is_active,           
        u.is_locked           
    FROM [CoreAnalytics].dbo.core_user u           
    WHERE u.username = @CoreResetIdentifier           
       OR u.email_normalized = LOWER(@CoreResetIdentifier);           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET ISSUE           
-- Stores only HMAC/SHA-256 OTP digest; plaintext OTP never reaches SQL.           
-- =============================================================           
IF @Mode = ''CorePasswordResetIssue''           
BEGIN           
    IF @CoreUserID IS NULL OR @CoreResetTokenHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_REQUEST_INVALID'' AS code,           
               ''Reset request tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreResetTTLMinutes < 5 OR @CoreResetTTLMinutes > 30           
        SET @CoreResetTTLMinutes = 10;           
    IF @CoreResetMaxRequests < 1 OR @CoreResetMaxRequests > 10           
        SET @CoreResetMaxRequests = 3;           
    IF @CoreResetWindowMinutes < 1 OR @CoreResetWindowMinutes > 60           
        SET @CoreResetWindowMinutes = 15;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_active = 1           
          AND is_locked = 0           
          AND NULLIF(LTRIM(RTRIM(email)), '''') IS NOT NULL           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_NOT_ELIGIBLE'' AS code,           
               ''Reset request tidak dapat diproses.'' AS message;           
        RETURN;           
    END;           
           
    IF           
    (           
        SELECT COUNT(*)           
        FROM [CoreAnalytics].dbo.core_password_reset_token           
        WHERE user_id = @CoreUserID           
          AND created_at >= DATEADD(MINUTE, -@CoreResetWindowMinutes, SYSDATETIME())           
    ) >= @CoreResetMaxRequests           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_RATE_LIMITED'' AS code,           
               ''Terlalu banyak permintaan reset password.'' AS message;           
    RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE user_id = @CoreUserID           
          AND used_at IS NULL           
          AND revoked_at IS NULL;           
           
        DECLARE @NewResetTokenID uniqueidentifier = NEWID();           
           
        INSERT INTO [CoreAnalytics].dbo.core_password_reset_token           
        (           
            reset_token_id,           
            user_id,           
            token_hash,           
            expires_at,           
            used_at,           
            revoked_at,           
            created_at,           
            verification_attempts,           
            verified_at,           
            reset_session_hash,           
            request_ip           
        )           
        VALUES           
        (           
            @NewResetTokenID,           
            @CoreUserID,           
            @CoreResetTokenHash,           
     DATEADD(MINUTE, @CoreResetTTLMinutes, SYSDATETIME()),           
            NULL,           
            NULL,           
            SYSDATETIME(),           
            0,           
            NULL,           
            NULL,           
            @CoreIPAddress           
        );           
           
        COMMIT TRANSACTION;           
           
        SELECT CAST(1 AS bit) AS success,           
               ''RESET_CHALLENGE_CREATED'' AS code,           
               CONVERT(varchar(36), @NewResetTokenID) AS reset_token_id;           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_CHALLENGE_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
 END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET VERIFY OTP           
-- Successful verification exchanges OTP for a separate reset-session hash.           
-- =============================================================           
IF @Mode = ''CorePasswordResetVerify''           
BEGIN           
    IF @CoreUserID IS NULL           
       OR @CoreResetTokenHash IS NULL           
       OR @CoreResetSessionHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_CODE_INVALID'' AS code,           
               ''Kode verifikasi tidak valid.'' AS message;           
        RETURN;           
    END;           
          
    IF @CoreResetMaxAttempts < 1 OR @CoreResetMaxAttempts > 10           
        SET @CoreResetMaxAttempts = 5;           
           
    DECLARE @VerifyResetTokenID uniqueidentifier = NULL,           
            @StoredResetTokenHash varchar(128) = NULL,           
            @ResetExpiresAt datetime2(0) = NULL,           
            @ResetAttempts int = 0;           
           
    SELECT TOP 1           
        @VerifyResetTokenID = reset_token_id,           
        @StoredResetTokenHash = token_hash,           
        @ResetExpiresAt = expires_at,           
        @ResetAttempts = ISNULL(verification_attempts, 0)           
    FROM [CoreAnalytics].dbo.core_password_reset_token           
    WHERE user_id = @CoreUserID           
      AND used_at IS NULL           
      AND revoked_at IS NULL           
    ORDER BY created_at DESC;           
           
    IF @VerifyResetTokenID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
            ''RESET_CODE_INVALID'' AS code,           
               ''Kode verifikasi tidak valid atau sudah kedaluwarsa.'' AS message;           
        RETURN;           
    END;           
           
    IF @ResetExpiresAt <= SYSDATETIME()           
    BEGIN           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE reset_token_id = @VerifyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_CODE_EXPIRED'' AS code,           
               ''Kode verifikasi sudah kedaluwarsa.'' AS message;           
        RETURN;           
    END;           
           
    IF @ResetAttempts >= @CoreResetMaxAttempts           
    BEGIN           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = COALESCE(revoked_at, SYSDATETIME())           
        WHERE reset_token_id = @VerifyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_ATTEMPTS_EXCEEDED'' AS code,           
               ''Batas percobaan kode verifikasi telah tercapai.'' AS message;           
        RETURN;           
    END;           
           
    IF @StoredResetTokenHash <> @CoreResetTokenHash           
    BEGIN           
        SET @ResetAttempts = @ResetAttempts + 1;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET verification_attempts = @ResetAttempts,           
            revoked_at = CASE           
                WHEN @ResetAttempts >= @CoreResetMaxAttempts THEN SYSDATETIME()           
                ELSE revoked_at           
            END           
        WHERE reset_token_id = @VerifyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               CASE WHEN @ResetAttempts >= @CoreResetMaxAttempts           
                    THEN ''RESET_ATTEMPTS_EXCEEDED''           
         ELSE ''RESET_CODE_INVALID'' END AS code,           
               CASE WHEN @ResetAttempts >= @CoreResetMaxAttempts           
                    THEN ''Batas percobaan kode verifikasi telah tercapai.''           
                    ELSE ''Kode verifikasi tidak valid.'' END AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_password_reset_token           
SET verified_at = SYSDATETIME(),           
        reset_session_hash = @CoreResetSessionHash           
    WHERE reset_token_id = @VerifyResetTokenID;           
           
    SELECT CAST(1 AS bit) AS success,           
           ''RESET_CODE_VERIFIED'' AS code,           
           CONVERT(varchar(36), @VerifyResetTokenID) AS reset_token_id;           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET APPLY           
-- Atomically validates reset session, changes password, and consumes token.           
-- Locked accounts stay locked; password recovery never bypasses admin unlock.           
-- =============================================================           
IF @Mode = ''CorePasswordResetApply''           
BEGIN           
    IF @CoreResetSessionHash IS NULL OR @CorePasswordHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_INVALID'' AS code,           
               ''Reset token tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    DECLARE @ApplyResetTokenID uniqueidentifier = NULL,           
            @ApplyUserID uniqueidentifier = NULL,           
            @ApplyExpiresAt datetime2(0) = NULL;           
           
    SELECT TOP 1           
        @ApplyResetTokenID = r.reset_token_id,           
        @ApplyUserID = r.user_id,           
        @ApplyExpiresAt = r.expires_at           
    FROM [CoreAnalytics].dbo.core_password_reset_token r           
    WHERE r.reset_session_hash = @CoreResetSessionHash            AND r.verified_at IS NOT NULL           
      AND r.used_at IS NULL           
      AND r.revoked_at IS NULL           
    ORDER BY r.created_at DESC;           
           
    IF @ApplyResetTokenID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_INVALID'' AS code,           
               ''Reset token tidak valid atau sudah digunakan.'' AS message;           
        RETURN;           
    END;           
           
    IF @ApplyExpiresAt <= SYSDATETIME()           
    BEGIN           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE reset_token_id = @ApplyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_EXPIRED'' AS code,           
               ''Reset token sudah kedaluwarsa.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @ApplyUserID           
      AND is_active = 0           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_INACTIVE'' AS code,           
               ''User tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @ApplyUserID           
          AND is_locked = 1           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''ACCOUNT_LOCKED'' AS code,           
               ''Account terkunci. Hubungi administrator untuk unlock.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        UPDATE [CoreAnalytics].dbo.core_user           
        SET password_hash = @CorePasswordHash,           
            failed_login_count = 0,           
            last_failed_login_at = NULL,           
            updated_at = SYSDATETIME()           
        WHERE user_id = @ApplyUserID           
          AND is_active = 1           
          AND is_locked = 0;           
           
        IF @@ROWCOUNT = 0           
        BEGIN           
            ROLLBACK TRANSACTION;           
            SELECT CAST(0 AS bit) AS success,           
                   ''RESET_USER_NOT_AVAILABLE'' AS code,           
                   ''Password tidak dapat direset.'' AS message;           
            RETURN;           
        END;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET used_at = SYSDATETIME()           
        WHERE reset_token_id = @ApplyResetTokenID           
          AND used_at IS NULL           
          AND revoked_at IS NULL;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE user_id = @ApplyUserID           
          AND reset_token_id <> @ApplyResetTokenID           
          AND used_at IS NULL           
          AND revoked_at IS NULL;           
           
        COMMIT TRANSACTION;           
           
        SELECT CAST(1 AS bit) AS success,           
               ''PASSWORD_RESET_SUCCESS'' AS code,           
      ''Password berhasil direset.'' AS message,           
               CONVERT(varchar(36), @ApplyUserID) AS user_id;           
    RETURN;    
    END TRY           
    BEGIN CATCH           
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;           
        SELECT CAST(0 AS bit) AS success,           
               ''PASSWORD_RESET_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET REVOKE           
-- Used when email delivery fails after a challenge was created.           
-- =============================================================           
IF @Mode = ''CorePasswordResetRevoke''           
BEGIN           
    IF @CoreResetTokenID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_ID_REQUIRED'' AS code,           
               ''ResetTokenID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_password_reset_token           
    SET revoked_at = COALESCE(revoked_at, SYSDATETIME())           
    WHERE reset_token_id = @CoreResetTokenID           
      AND used_at IS NULL;           
           
    SELECT CAST(1 AS bit) AS success,           
           ''RESET_TOKEN_REVOKED'' AS code;           
    RETURN;           
END;           
           
           
-- =============================================================               
-- CORE USER GET               
-- =============================================================               
IF @Mode = ''CoreUserGet''              
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USER_ID_REQUIRED'' AS code,               
               ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    SELECT               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,               
        username,               
        display_name,              
        email,               
        is_active,           
        is_locked,           
        failed_login_count,           
        locked_at,           
        lock_reason,           
        last_failed_login_at,               
        created_at,               
        updated_at               
  FROM [CoreAnalytics].dbo.core_user               
    WHERE user_id = @CoreUserID;               
               
    RETURN;               
END;               
               
               
               
-- =============================================================           
-- CORE USER UPDATE           
-- Management Center profile edit. Username/UserID are immutable here.           
--           
-- Payload:           
-- {           
--   "UserID": "...",           
--   "DisplayName": "...",           
--   "Email": "..."           
-- }           
-- =============================================================           
IF @Mode = ''CoreUserUpdate''           
BEGIN        
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreDisplayName IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''DISPLAY_NAME_REQUIRED'' AS code,           
               ''Display name wajib diisi.'' AS message;           
        RETURN;        END;           
           
    IF LEN(@CoreDisplayName) > 200           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''DISPLAY_NAME_TOO_LONG'' AS code,           
               ''Display name maksimal 200 karakter.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreEmail IS NULL           
   BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''EMAIL_REQUIRED'' AS code,           
               ''Email wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreEmail NOT LIKE ''%_@_%._%'' OR LEN(@CoreEmail) > 320           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''EMAIL_INVALID'' AS code,           
               ''Format email tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE email_normalized = @CoreEmailNormalized           
          AND user_id <> @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''EMAIL_EXISTS'' AS code,           
               ''Email sudah digunakan oleh user lain.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        UPDATE [CoreAnalytics].dbo.core_user           
        SET           
            display_name = @CoreDisplayName,           
            email = @CoreEmail,           
            email_normalized = @CoreEmailNormalized,           
            updated_at = SYSDATETIME()           
        WHERE user_id = @CoreUserID;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            ''USER_UPDATED'' AS code,           
            ''Profil user berhasil diperbarui.'' AS message,           
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,           
            username,           
            display_name,           
            email,           
            is_active,           
           is_locked,           
            failed_login_count,           
            locked_at,           
            lock_reason,           
            last_failed_login_at,           
            created_at,           
            updated_at           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID;           
           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        IF ERROR_NUMBER() IN (2601, 2627)           
       BEGIN           
            SELECT CAST(0 AS bit) AS success,           
                   ''EMAIL_EXISTS'' AS code,           
                   ''Email sudah digunakan oleh user lain.'' AS message;           
            RETURN;           
        END;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_UPDATE_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================               
-- CORE USER LIST               
-- Management Center user directory.               
--               
-- Payload:               
-- {               
--   "Page": 1,               
--   "PageSize": 20,               
--   "Search": "ronald",               
--   "Status": "all|active|inactive"               
-- }               
--               
-- Notes:               
-- - Summary cards are global totals, not affected by search/status.               
-- - total_items is affected by search/status.               
-- - Active voice profile is included only as metadata; embeddings are               
--   never returned here.               
-- =============================================================               
IF @Mode = ''CoreUserList''               
BEGIN               
    IF @CorePage IS NULL OR @CorePage < 1               
        SET @CorePage = 1;               
               
    IF @CorePageSize IS NULL OR @CorePageSize < 1               
        SET @CorePageSize = 20;               
               
    IF @CorePageSize > 100               
        SET @CorePageSize = 100;               
               
    IF @CoreStatus NOT IN (''all'', ''active'', ''inactive'')               
 SET @CoreStatus = ''all'';               
               
    DECLARE @CoreOffset int =               
        (@CorePage - 1) * @CorePageSize;               
               
    DECLARE @CoreTotalUsers int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_user               
    );               
               
    DECLARE @CoreActiveUsers int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE is_active = 1               
    );               
               
    DECLARE @CoreInactiveUsers int =               
        @CoreTotalUsers - @CoreActiveUsers;               
               
    DECLARE @CoreVoiceEnrolled int =               
    (               
        SELECT COUNT(DISTINCT u.user_id)               
        FROM [CoreAnalytics].dbo.core_user u               
        INNER JOIN [CoreAnalytics].dbo.core_voice_profile vp               
            ON vp.user_id = u.user_id               
           AND vp.is_active = 1               
           AND vp.centroid_embedding IS NOT NULL               
    );               
      
    DECLARE @CoreFilteredCount int =               
    (          
        SELECT COUNT(*)               
       FROM [CoreAnalytics].dbo.core_user u               
        WHERE               
            (               
                @CoreSearch IS NULL               
                OR u.username LIKE ''%'' + @CoreSearch + ''%''               
                OR u.display_name LIKE ''%'' + @CoreSearch + ''%''               
                OR u.email LIKE ''%'' + @CoreSearch + ''%''               
            )               
            AND               
            (               
                @CoreStatus = ''all''               
                OR (@CoreStatus = ''active'' AND u.is_active = 1)               
                OR (@CoreStatus = ''inactive'' AND u.is_active = 0)               
            )               
    );               
               
    DECLARE @CoreTotalPages int =               
        CASE               
            WHEN @CoreFilteredCount = 0 THEN 0               
            ELSE CEILING(               
                CONVERT(decimal(18,4), @CoreFilteredCount)               
                / CONVERT(decimal(18,4), @CorePageSize)               
            )               
        END;               
               
    -- If requested page is beyond the end, move to the last valid page.               
    IF @CoreTotalPages > 0 AND @CorePage > @CoreTotalPages               
    BEGIN               
        SET @CorePage = @CoreTotalPages;               
        SET @CoreOffset = (@CorePage - 1) * @CorePageSize;               
    END;               
               
    ;WITH FilteredUsers AS               
    (               
        SELECT               
            u.user_id,               
            u.username,               
            u.display_name,               
            u.email,               
            u.is_active,           
            u.is_locked,           
            u.failed_login_count,           
            u.locked_at,           
            u.lock_reason,           
            u.last_failed_login_at,               
            u.created_at,               
            u.updated_at               
        FROM [CoreAnalytics].dbo.core_user u               
        WHERE               
            (               
                @CoreSearch IS NULL               
                OR u.username LIKE ''%'' + @CoreSearch + ''%''               
                OR u.display_name LIKE ''%'' + @CoreSearch + ''%''               
                OR u.email LIKE ''%'' + @CoreSearch + ''%''               
            )               
            AND               
            (               
                @CoreStatus = ''all''               
                OR (@CoreStatus = ''active'' AND u.is_active = 1)               
                OR (@CoreStatus = ''inactive'' AND u.is_active = 0)               
            )               
    )               
    SELECT               
        CAST(1 AS bit) AS success,               
        ''USER_LIST'' AS code,               
               
        @CorePage AS page,               
        @CorePageSize AS page_size,               
        @CoreFilteredCount AS total_items,               
        @CoreTotalPages AS total_pages,               
               
        @CoreTotalUsers AS summary_total_users,               
        @CoreActiveUsers AS summary_active_users,               
        @CoreInactiveUsers AS summary_inactive_users,               
        @CoreVoiceEnrolled AS summary_voice_enrolled,               
               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, u.user_id)) AS user_id,               
        u.username,               
        u.display_name,               
        u.email,               
        u.is_active,           
        u.is_locked,           
        u.failed_login_count,           
        u.locked_at,           
        u.lock_reason,           
        u.last_failed_login_at,               
        u.created_at,               
        u.updated_at,               
               
        CASE               
            WHEN vp.voice_profile_id IS NOT NULL THEN CAST(1 AS bit)               
            ELSE CAST(0 AS bit)               
        END AS voice_enrolled,               
         
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id))               
            AS voice_profile_id,               
               
        vp.sample_count AS voice_sample_count,               
        vp.threshold AS voice_threshold,               
        vp.model_name AS voice_model_name,               
        vp.model_version AS voice_model_version               
               
    FROM FilteredUsers u               
               
    OUTER APPLY               
    (               
        SELECT TOP 1               
            x.voice_profile_id,               
       x.sample_count,               
          x.threshold,               
            x.model_name,               
            x.model_version               
        FROM [CoreAnalytics].dbo.core_voice_profile x               
        WHERE x.user_id = u.user_id               
          AND x.is_active = 1               
          AND x.centroid_embedding IS NOT NULL               
        ORDER BY x.created_at DESC               
    ) vp               
               
    ORDER BY               
        u.is_active DESC,               
        u.display_name ASC,               
        u.username ASC               
               
    OFFSET @CoreOffset ROWS               
    FETCH NEXT @CorePageSize ROWS ONLY;               
               
    -- BEAM/data adapters often represent an empty result as data=[].               
    -- Emit one metadata row when the filter has no records so Python can               
    -- still return correct pagination + summary.               
    IF @CoreFilteredCount = 0               
    BEGIN               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''USER_LIST'' AS code,               
               
            1 AS page,              
            @CorePageSize AS page_size,               
            0 AS total_items,           
            0 AS total_pages,               
               
            @CoreTotalUsers AS summary_total_users,               
            @CoreActiveUsers AS summary_active_users,        
            @CoreInactiveUsers AS summary_inactive_users,               
            @CoreVoiceEnrolled AS summary_voice_enrolled,               
               
            CAST(NULL AS varchar(36)) AS user_id,               
            CAST(NULL AS varchar(100)) AS username,               
            CAST(NULL AS varchar(200)) AS display_name,               
            CAST(NULL AS varchar(320)) AS email,               
            CAST(NULL AS bit) AS is_active,           
            CAST(NULL AS bit) AS is_locked,           
            CAST(NULL AS int) AS failed_login_count,           
            CAST(NULL AS datetime2) AS locked_at,           
            CAST(NULL AS varchar(100)) AS lock_reason,           
            CAST(NULL AS datetime2) AS last_failed_login_at,               
            CAST(NULL AS datetime2) AS created_at,               
            CAST(NULL AS datetime2) AS updated_at,               
            CAST(0 AS bit) AS voice_enrolled,               
            CAST(NULL AS varchar(36)) AS voice_profile_id,               
            CAST(NULL AS int) AS voice_sample_count,               
            CAST(NULL AS decimal(8,6)) AS voice_threshold,               
            CAST(NULL AS varchar(100)) AS voice_model_name,               
            CAST(NULL AS varchar(50)) AS voice_model_version;               
    END;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE USER SET ACTIVE               
--               
-- Payload:        -- {               
--   "UserID": "...",               
--   "IsActive": true|false               
-- }               
-- =============================================================               
IF @Mode = ''CoreUserSetActive''               
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''USER_ID_REQUIRED'' AS code,               
            ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreSetIsActive IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''IS_ACTIVE_REQUIRED'' AS code,               
            ''IsActive wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @CoreUserID               
    )               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''USER_NOT_FOUND'' AS code,               
            ''User tidak ditemukan.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
        UPDATE [CoreAnalytics].dbo.core_user               
        SET               
            is_active = @CoreSetIsActive,               
            updated_at = SYSDATETIME()               
        WHERE user_id = @CoreUserID;               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''USER_ACTIVATED''               
                ELSE ''USER_DEACTIVATED''               
            END AS code,               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''User berhasil diaktifkan.''               
                ELSE ''User berhasil dinonaktifkan.''               
            END AS message,               
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,        
            username,               
            display_name,               
            email,               
            is_active,           
            is_locked,           
            failed_login_count,           
            locked_at,           
            lock_reason,               
            created_at,               
            updated_at               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @CoreUserID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''USER_STATUS_UPDATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================           
-- CORE USER LOGIN FAILURE           
-- Atomic consecutive-failure counter. Third failure locks the account.           
-- Account never auto-unlocks; only CoreUserUnlock resets it.           
-- Payload: { "UserID": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserLoginFailure''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        DECLARE @LoginFailureCount int;           
        DECLARE @LoginAlreadyLocked bit;           
           
        SELECT           
            @LoginFailureCount = failed_login_count,           
            @LoginAlreadyLocked = is_locked           
        FROM [CoreAnalytics].dbo.core_user WITH (UPDLOCK, HOLDLOCK)           
        WHERE user_id = @CoreUserID;           
           
        IF @LoginFailureCount IS NULL           
        BEGIN           
            ROLLBACK TRANSACTION;           
            SELECT CAST(0 AS bit) AS success,           
                   ''USER_NOT_FOUND'' AS code,           
                   ''User tidak ditemukan.'' AS message;           
            RETURN;           
        END;           
           
        IF @LoginAlreadyLocked = 0           
        BEGIN           
            SET @LoginFailureCount = ISNULL(@LoginFailureCount, 0) + 1;           
           
            UPDATE [CoreAnalytics].dbo.core_user           
            SET           
                failed_login_count = @LoginFailureCount,           
                last_failed_login_at = SYSDATETIME(),           
                is_locked = CASE WHEN @LoginFailureCount >= 3 THEN 1 ELSE 0 END,           
                locked_at = CASE           
                    WHEN @LoginFailureCount >= 3 THEN SYSDATETIME()           
                    ELSE locked_at           
                END,           
                lock_reason = CASE           
                    WHEN @LoginFailureCount >= 3 THEN ''MAX_FAILED_PASSWORD_ATTEMPTS''           
                    ELSE lock_reason           
                END,           
                updated_at = SYSDATETIME()           
            WHERE user_id = @CoreUserID;           
        END;           
           
        COMMIT TRANSACTION;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            CASE WHEN is_locked = 1 THEN ''ACCOUNT_LOCKED'' ELSE ''LOGIN_FAILURE_RECORDED'' END AS code,           
            CONVERT(varchar(36), user_id) AS user_id,           
            username,           
            is_active,           
            is_locked,           
            failed_login_count,           
            locked_at,           
            lock_reason,           
            last_failed_login_at           
   FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID;           
           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        IF @@TRANCOUNT > 0           
            ROLLBACK TRANSACTION;           
        THROW;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE USER LOGIN SUCCESS           
-- Reset consecutive failure count. This mode never unlocks an account.           
-- Payload: { "UserID": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserLoginSuccess''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_user           
    SET           
        failed_login_count = 0,           
        last_failed_login_at = NULL,           
        updated_at = SYSDATETIME()           
    WHERE user_id = @CoreUserID           
      AND is_locked = 0;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''LOGIN_SUCCESS_RECORDED'' AS code,           
        CONVERT(varchar(36), user_id) AS user_id,           
        username,           
        is_active,           
        is_locked,           
        failed_login_count,           
        locked_at,           
        lock_reason           
    FROM [CoreAnalytics].dbo.core_user           
    WHERE user_id = @CoreUserID;           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE USER UNLOCK           
-- Management Center / administrator action only.           
-- Payload: { "UserID": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserUnlock''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_user           
    SET           
        failed_login_count = 0,           
        is_locked = 0,        
        locked_at = NULL,           
        lock_reason = NULL,           
        last_failed_login_at = NULL,           
        updated_at = SYSDATETIME()           
    WHERE user_id = @CoreUserID;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''USER_UNLOCKED'' AS code,           
        ''Account berhasil di-unlock.'' AS message,           
        CONVERT(varchar(36), user_id) AS user_id,           
        username,           
        display_name,           
        email,           
        is_active,           
        is_locked,         
        failed_login_count,           
        locked_at,           
        lock_reason,           
        created_at,           
        updated_at           
    FROM [CoreAnalytics].dbo.core_user           
    WHERE user_id = @CoreUserID;           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE LOGIN LOG ADD           
-- Global PASSWORD / VOICE login audit. Never send passwords or tokens.           
-- =============================================================           
IF @Mode = ''CoreLoginLogAdd''           
BEGIN           
    IF @CoreAuthMethod NOT IN (''PASSWORD'', ''VOICE'')           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''AUTH_METHOD_INVALID'' AS code,           
               ''AuthMethod harus PASSWORD atau VOICE.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreIsSuccess IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''IS_SUCCESS_REQUIRED'' AS code,           
               ''IsSuccess wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreIsSuccess = 1           
    BEGIN           
        SET @CoreFailureCode = NULL;           
        SET @CoreFailureDetail = NULL;           
    END;           
           
    INSERT INTO [CoreAnalytics].dbo.core_user_login_log           
    (           
        user_id,           
        session_id,           
        username,           
        auth_method,           
        is_success,           
        failure_code,           
        failure_detail,           
        ip_address,           
        user_agent,           
        created_at           
    )           
    VALUES           
    (           
        @CoreUserID,           
        @CoreSessionID,           
        @CoreUsername,           
        @CoreAuthMethod,           
        @CoreIsSuccess,           
        @CoreFailureCode,           
        @CoreFailureDetail,           
        @CoreIPAddress,           
        @CoreUserAgent,           
        SYSDATETIME()           
    );           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''LOGIN_LOG_ADDED'' AS code,           
        CONVERT(bigint, SCOPE_IDENTITY()) AS login_log_id;           
           
    RETURN;           
END;           
           
           
-- =============================================================               
-- CORE VOICE PROFILE CREATE               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileCreate''               
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USER_ID_REQUIRED'' AS code,               
            ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @CoreUserID               
          AND is_active = 1               
    )               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USER_NOT_FOUND'' AS code,               
               ''User tidak ditemukan atau tidak aktif.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreEmbeddingDimension IS NULL OR @CoreEmbeddingDimension <= 0               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMBEDDING_DIMENSION_REQUIRED'' AS code,               
               ''EmbeddingDimension wajib diisi.'' AS message;           
        RETURN;               
    END;               
               
    BEGIN TRY        
        UPDATE [CoreAnalytics].dbo.core_voice_profile               
        SET               
            is_active = 0,               
            updated_at = SYSDATETIME()               
        WHERE user_id = @CoreUserID               
          AND is_active = 1;               
               
        DECLARE @NewVoiceProfileID uniqueidentifier = NEWID();               
               
        INSERT INTO [CoreAnalytics].dbo.core_voice_profile               
        (               
            voice_profile_id,               
            user_id,     
            model_name,               
            model_version,               
            embedding_dimension,               
            centroid_embedding,               
            threshold,               
            sample_count,               
            is_active,               
            created_at               
        )               
        VALUES               
        (               
            @NewVoiceProfileID,               
            @CoreUserID,               
            ISNULL(@CoreModelName, ''SpeechBrain-SpeakerRecognition''),               
            @CoreModelVersion,               
            @CoreEmbeddingDimension,               
            NULL,               
            @CoreThreshold,               
            0,               
            1,               
            SYSDATETIME()               
        );               
               
        SELECT              
            CAST(1 AS bit) AS success,               
            ''VOICE_PROFILE_CREATED'' AS code,               
            ''Voice profile created.'' AS message,               
            CONVERT(varchar(36), @NewVoiceProfileID) AS voice_profile_id,               
            CONVERT(varchar(36), @CoreUserID) AS user_id,               
            model_name,               
            model_version,               
            embedding_dimension,               
            threshold,               
            sample_count,               
            is_active,               
            created_at               
        FROM [CoreAnalytics].dbo.core_voice_profile               
        WHERE voice_profile_id = @NewVoiceProfileID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_CREATE_ERROR'' AS code,               
     ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================               
-- CORE VOICE SAMPLE ADD               
-- =============================================================               
IF @Mode = ''CoreVoiceSampleAdd''               
BEGIN               
    IF @CoreVoiceProfileID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_ID_REQUIRED'' AS code,               
               ''VoiceProfileID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreSampleNo IS NULL OR @CoreSampleNo <= 0               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''SAMPLE_NO_REQUIRED'' AS code,               
               ''SampleNo wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF ISNULL(@CoreEmbeddingBase64, '''') = ''''               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMBEDDING_REQUIRED'' AS code,               
               ''EmbeddingBase64 wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
        DECLARE @EmbeddingBinary varbinary(max);               
               
        SET @EmbeddingBinary =              
            CAST(N'''' AS xml).value               
            (               
                ''xs:base64Binary(sql:variable("@CoreEmbeddingBase64"))'',               
                ''varbinary(max)''               
            );               
               
        DECLARE @NewVoiceSampleID uniqueidentifier = NEWID();               
               
        INSERT INTO [CoreAnalytics].dbo.core_voice_sample               
        (               
            voice_sample_id,               
            voice_profile_id,               
            sample_no,               
            storage_path,               
            duration_ms,               
            quality_score,               
            embedding,               
            is_valid,              
            created_at               
        )               
        VALUES               
        (               
            @NewVoiceSampleID,               
            @CoreVoiceProfileID,               
            @CoreSampleNo,               
            @CoreStoragePath,               
            @CoreDurationMs,               
            @CoreQualityScore,               
            @EmbeddingBinary,               
            ISNULL(@CoreIsValid, 1),               
            SYSDATETIME()               
        );               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''VOICE_SAMPLE_ADDED'' AS code,               
            ''Voice sample saved.'' AS message,               
            CONVERT(varchar(36), @NewVoiceSampleID) AS voice_sample_id,               
            CONVERT(varchar(36), @CoreVoiceProfileID) AS voice_profile_id,               
            sample_no,               
            storage_path,               
            duration_ms,               
            quality_score,               
            is_valid,               
            created_at               
        FROM [CoreAnalytics].dbo.core_voice_sample               
        WHERE voice_sample_id = @NewVoiceSampleID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_SAMPLE_ADD_ERROR'' AS code,               
               ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================      
-- CORE VOICE PROFILE FINALIZE               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileFinalize''               
BEGIN               
    IF @CoreVoiceProfileID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_ID_REQUIRED'' AS code,               
               ''VoiceProfileID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF ISNULL(@CoreCentroidEmbeddingBase64, '''') = ''''               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''CENTROID_REQUIRED'' AS code,               
               ''CentroidEmbeddingBase64 wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
        DECLARE @CentroidEmbeddingBinary varbinary(max);               
               
        SET @CentroidEmbeddingBinary =               
            CAST(N'''' AS xml).value               
            (               
                ''xs:base64Binary(sql:variable("@CoreCentroidEmbeddingBase64"))'',               
                ''varbinary(max)''               
            );               
               
        UPDATE [CoreAnalytics].dbo.core_voice_profile               
        SET               
            centroid_embedding = @CentroidEmbeddingBinary,               
     sample_count = ISNULL               
            (               
                @CoreSampleCount,               
                (               
                    SELECT COUNT(*)               
                    FROM [CoreAnalytics].dbo.core_voice_sample s               
                    WHERE s.voice_profile_id = @CoreVoiceProfileID               
                      AND s.is_valid = 1               
                )               
            ),               
            threshold = COALESCE(@CoreThreshold, threshold),               
            updated_at = SYSDATETIME()               
        WHERE voice_profile_id = @CoreVoiceProfileID               
          AND is_active = 1;               
               
        IF @@ROWCOUNT = 0               
        BEGIN               
          SELECT CAST(0 AS bit) AS success,               
                   ''VOICE_PROFILE_NOT_FOUND'' AS code,               
  ''Voice profile aktif tidak ditemukan.'' AS message;               
            RETURN;               
       END;               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''VOICE_PROFILE_FINALIZED'' AS code,               
            ''Voice profile finalized.'' AS message,               
            CONVERT(varchar(36), @CoreVoiceProfileID) AS voice_profile_id,               
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,               
            model_name,               
            model_version,               
            embedding_dimension,               
            threshold,               
            sample_count,               
            is_active,               
            updated_at               
        FROM [CoreAnalytics].dbo.core_voice_profile               
        WHERE voice_profile_id = @CoreVoiceProfileID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_FINALIZE_ERROR'' AS code,               
               ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================               
-- CORE VOICE PROFILE ACTIVE               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileActive''               
BEGIN               
    SELECT               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id)) AS voice_profile_id,               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.user_id)) AS user_id,               
        u.username,               
        u.display_name,               
        vp.model_name,               
        vp.model_version,               
        vp.embedding_dimension,               
        CAST(N'''' AS xml).value        
        (               
            ''xs:base64Binary(sql:column("vp.centroid_embedding"))'',                     ''varchar(max)''               
        ) AS centroid_embedding_base64,               
        vp.threshold,               
        vp.sample_count               
    FROM [CoreAnalytics].dbo.core_voice_profile vp               
    INNER JOIN [CoreAnalytics].dbo.core_user u               
        ON u.user_id = vp.user_id               
    WHERE vp.is_active = 1               
      AND u.is_active = 1               
      AND vp.centroid_embedding IS NOT NULL;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE VOICE PROFILE GET               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileGet''               
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
    SELECT CAST(0 AS bit) AS success,               
               ''USER_ID_REQUIRED'' AS code,               
               ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    SELECT TOP 1               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id)) AS voice_profile_id,               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.user_id)) AS user_id,               
        u.username,               
        u.display_name,               
        vp.model_name,               
        vp.model_version,               
        vp.embedding_dimension,               
        CAST(N'''' AS xml).value               
        (               
            ''xs:base64Binary(sql:column("vp.centroid_embedding"))'',               
            ''varchar(max)''               
        ) AS centroid_embedding_base64,               
        vp.threshold,               
        vp.sample_count,               
        vp.is_active,               
        vp.created_at,        
        vp.updated_at               
    FROM [CoreAnalytics].dbo.core_voice_profile vp               
    INNER JOIN [CoreAnalytics].dbo.core_user u               
        ON u.user_id = vp.user_id               
    WHERE vp.user_id = @CoreUserID               
      AND vp.is_active = 1               
    ORDER BY vp.created_at DESC;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE VOICE SAMPLE LIST               
-- =============================================================               
IF @Mode = ''CoreVoiceSampleList''               
BEGIN               
    IF @CoreVoiceProfileID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_ID_REQUIRED'' AS code,               
               ''VoiceProfileID wajib diisi.'' AS message;               
 RETURN;               
    END;               
               
    SELECT               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, s.voice_sample_id)) AS voice_sample_id,               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, s.voice_profile_id)) AS voice_profile_id,               
        s.sample_no,               
        s.storage_path,               
        s.duration_ms,               
        s.quality_score,               
        CAST(N'''' AS xml).value               
        (               
            ''xs:base64Binary(sql:column("s.embedding"))'',               
            ''varchar(max)''               
        ) AS embedding_base64,               
        s.is_valid,               
        s.created_at               
    FROM [CoreAnalytics].dbo.core_voice_sample s               
    WHERE s.voice_profile_id = @CoreVoiceProfileID               
    ORDER BY s.sample_no;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE VOICE AUTH LOG ADD               
-- =============================================================               
IF @Mode = ''CoreVoiceAuthLogAdd''      
BEGIN               
    IF @CoreDecision IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''DECISION_REQUIRED'' AS code,               
               ''Decision wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    BEGIN TRY               
        DECLARE @NewVoiceAuthLogID uniqueidentifier = NEWID();               
               
        INSERT INTO [CoreAnalytics].dbo.core_voice_auth_log               
        (               
            voice_auth_log_id,               
            detected_user_id,               
            best_score,               
            second_best_score,               
     score_margin,               
            threshold_used,               
            decision,               
            model_name,               
            created_at               
        )               
        VALUES               
        (               
            @NewVoiceAuthLogID,               
            @CoreDetectedUserID,               
            @CoreBestScore,               
            @CoreSecondBestScore,               
            @CoreScoreMargin,               
      @CoreThresholdUsed,               
            @CoreDecision,               
            @CoreModelName,               
            SYSDATETIME()               
        );           
           
        -- Mirror every biometric attempt into the global login audit.           
        -- Voice failures do NOT increment password lock counters because an           
        -- unknown/ambiguous voice cannot safely be attributed to one account.           
        DECLARE @VoiceLoginUsername varchar(100) = NULL;           
           
        SELECT @VoiceLoginUsername = username           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreDetectedUserID;           
           
        INSERT INTO [CoreAnalytics].dbo.core_user_login_log           
        (           
            user_id,           
            session_id,           
            username,           
            auth_method,           
            is_success,           
failure_code,           
            failure_detail,           
            ip_address,           
            user_agent,           
            created_at           
        )           
        VALUES           
        (           
            @CoreDetectedUserID,           
            NULL,           
            @VoiceLoginUsername,           
            ''VOICE'',           
            CASE WHEN @CoreDecision = ''VERIFIED'' THEN 1 ELSE 0 END,           
            CASE WHEN @CoreDecision = ''VERIFIED'' THEN NULL ELSE @CoreDecision END,           
            CASE WHEN @CoreDecision = ''VERIFIED'' THEN NULL ELSE ''Voice authentication was not verified.'' END,           
            @CoreIPAddress,           
            @CoreUserAgent,           
            SYSDATETIME()           
        );               
               
        SELECT               
            CAST(1 AS bit) AS success,               
''VOICE_AUTH_LOG_ADDED'' AS code,               
            ''Voice auth log saved.'' AS message,               
            CONVERT(varchar(36), @NewVoiceAuthLogID) AS voice_auth_log_id;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_AUTH_LOG_ERROR'' AS code,               
             ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================               
-- EXISTING DASHBOARD MODES BELOW - UNCHANGED               
-- =============================================================               
               
if @Mode = ''TrenPendapatan''                            
begin                            
    SELECT HealthcareID,                            
        MonthNo,                            
        SUM(TargetAmount) AS Target                       
    into #TempTarget                       
    FROM DB_Finance_Target_Monthly                       
    WHERE YearNo = 2026                       
        and criteria = ''REVENUE''                            
        and left(healthcareID,1) <> ''O''                            
        and (HealthcareID = @healthcareId or @healthcareId = '''')                          
    GROUP BY HealthcareID, MonthNo                            
                       
    SELECT a.HealthcareID,                            
        a.MonthNo,                            
        DATENAME(month, MAX(TransactionDate)) AS month_name,                            
        SUM(CASE WHEN YearNo = 2026 THEN ActualAmount ELSE 0 END) AS revenue_2026,                            
        SUM(CASE WHEN YearNo = 2025 THEN ActualAmount ELSE 0 END) AS revenue_2025,                       
        isnull(b.Target,0) as Target                       
    into #Rekap                       
    FROM DB_Finance_Actual a                       
    left join #TempTarget b                       
        on b.HealthcareID = a.HealthcareID                       
        and b.monthNo = a.MonthNo                       
    WHERE a.YearNo IN (2025, 2026)                            
        and a.criteria = ''REVENUE''                            
        and left(a.healthcareID,1) <> ''O''                            
        and (a.HealthcareID = @healthcareId or @healthcareId = '''')                    
    GROUP BY a.MonthNo, Target, a.HealthcareID                            
    ORDER BY a.MonthNo;                            
                       
    select MonthNo, month_name, sum(revenue_2026) as revenue_2026,                        
        sum(revenue_2025) as revenue_2025, sum(Target) as Target                       
    from #Rekap                       
    group by MonthNo, month_name                       
end                            
                   
if @Mode = ''PerbandinganLayanan''                      
begin                            
    SELECT                             
        Criteria AS category,                            
        SUM(CASE WHEN Chanel = ''Clinic'' THEN ActualAmount ELSE 0 END) AS clinic,                            
        SUM(CASE WHEN Chanel = ''Hospital'' THEN ActualAmount ELSE 0 END) AS rs                            
    FROM DB_Finance_Actual                            
    WHERE YearNo = 2026                            
    and (HealthcareID = @healthcareId or @healthcareId = '''')                          
    GROUP BY Criteria;                            
end                            
                   
if @Mode = ''performalayanan''                            
begin                            
    SELECT                             
        ChartOfAccountName AS category,                            
        SUM(CASE WHEN HealthcareID = ''001'' THEN ActualAmount ELSE 0 END) AS menteng,                            
        SUM(CASE WHEN HealthcareID = ''002'' THEN ActualAmount ELSE 0 END) AS kedoya                            
    FROM DB_Finance_Actual                            
    WHERE healthcareID in(''001'',''002'') AND YearNo = 2026                            
    and (HealthcareID = @healthcareId or @healthcareId = '''')                          
    GROUP BY ChartOfAccountName;                            
end                            
                   
if @Mode = ''PertumbuhanPasien''                            
begin              
    SELECT              
        CAST(YearNo AS VARCHAR) AS year,                             
        SUM(ActualQuantity) AS totalPasien                            
    FROM DB_Finance_Actual                            
    WHERE YearNo BETWEEN 2022 AND 2026                            
        and (HealthcareID = @healthcareId or @healthcareId = '''')                       
       and HealthcareID not in(''997'',''107'',''015'')          
    GROUP BY YearNo                            
    ORDER BY YearNo ASC;                            
end                           
                          
if @Mode = ''healthcare''                            
begin                            
    SELECT                             
        healthcareID, healthcareName                           
    FROM JEC_CORP.dbo.healthcare                    
    where left(healthcareID,1) <> ''O''                     
    order by HealthcareName                   
end         
                          
if @Mode = ''exumrev''                          
begin                          
    SET @SQL = ''                          
    SELECT healthcareID,                          
        HealthcareName AS [UNIT BISNIS],                          
        SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Current Year],                          
        SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@LastYear AS VARCHAR) + ''],                          
        SUM(CASE WHEN YearNo = '' + CAST(@PrevYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@PrevYear AS VARCHAR) + ''],                          
        CASE                           
            WHEN SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) = 0 THEN 0                          
            ELSE (SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) * 100.0) /                           
                SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END)                           
        END AS ['' + CAST(@CurrentYear AS VARCHAR) + '' vs '' + CAST(@LastYear AS VARCHAR) + '']                          
    FROM DB_Finance_Exsum                          
    WHERE Category = ''''REV''''                          
        and criteria = ''''Revenue''''                          
        and left(HealthcareID,1) <> ''''O''''                          
 and (healthcareID = '''''' + @HealthcareID + '''''' or isnull('''''' + @HealthcareID + '''''','''''''') = '''''''')                          
        and HealthcareName is not null                          
    GROUP BY HealthcareName, healthcareID                          
    ORDER BY healthcareID ASC;'';                 
                          
    EXEC sp_executesql @SQL;                   
end                          
                          
IF @Mode = ''exummaterial''             
BEGIN             
    SET @SQL = ''             
    SELECT             
        HealthcareID,             
        HealthcareName AS [UNIT BISNIS],             
             
        SUM(             
            CASE             
                WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + ''             
         THEN ISNULL(ActualAmount, 0)             
                ELSE 0             
            END             
        ) AS [Current Year],             
             
        SUM(             
            CASE             
                WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + ''             
                THEN ISNULL(ActualAmount, 0)             
                ELSE 0             
            END             
        ) AS [Full Year '' + CAST(@LastYear AS VARCHAR) + ''],             
             
        SUM(             
            CASE             
                WHEN YearNo = '' + CAST(@PrevYear AS VARCHAR) + ''             
                THEN ISNULL(ActualAmount, 0)             
                ELSE 0             
            END             
        ) AS [Full Year '' + CAST(@PrevYear AS VARCHAR) + ''],             
             
        CASE        
            WHEN SUM(             
                CASE             
                    WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + ''             
                    THEN ISNULL(ActualAmount, 0)             
                    ELSE 0             
                END             
            ) = 0             
            THEN 0             
             
            ELSE          
                (             
                    SUM(             
                        CASE             
                            WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + ''             
                            THEN ISNULL(ActualAmount, 0)             
                            ELSE 0             
                        END             
                    ) * 100.0             
                )             
                /             
                SUM(             
                    CASE             
                        WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + ''             
                        THEN ISNULL(ActualAmount, 0)             
      ELSE 0       
                    END             
                )             
        END AS ['' + CAST(@CurrentYear AS VARCHAR) + '' vs '' + CAST(@LastYear AS VARCHAR) + '']             
             
    FROM DB_Finance_Actual             
             
    WHERE Criteria = ''''COGS''''             
        AND SubCriteria = ''''Material''''             
        AND LEFT(HealthcareID, 1) <> ''''O''''             
        AND (             
            HealthcareID = '''''' + ISNULL(@HealthcareID, '''') + ''''''             
            OR ISNULL('''''' + ISNULL(@HealthcareID, '''') + '''''', '''''''') = ''''''''             
        )             
        AND HealthcareName IS NOT NULL             
             
    GROUP BY             
        HealthcareName,             
        HealthcareID             
             
    ORDER BY             
        HealthcareID ASC;             
    '';             
             
    EXEC sp_executesql @SQL;             
END                    
                          
if @Mode = ''exumdoctor''                          
begin                          
    SET @SQL = ''                          
    SELECT healthcareID,                          
        HealthcareName AS [UNIT BISNIS],                          
        SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Current Year],                          
        SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@LastYear AS VARCHAR) + ''],                          
        SUM(CASE WHEN YearNo = '' + CAST(@PrevYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@PrevYear AS VARCHAR) + ''],                          
        CASE                           
            WHEN SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) = 0 THEN 0                          
            ELSE (SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) * 100.0) /                 
                SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END)                           
        END AS ['' + CAST(@CurrentYear AS VARCHAR) + '' vs '' + CAST(@LastYear AS VARCHAR) + '']                          
    FROM DB_Finance_Exsum                          
    WHERE Category = ''''REV''''                          
        and criteria = ''''Doctor Fee''''                          
       and left(HealthcareID,1) <> ''''O''''                          
        and (healthcareID = '''''' + @HealthcareID + '''''' or isnull('''''' + @HealthcareID + '''''','''''''') = '''''''')                          
        and HealthcareName is not null                          
    GROUP BY HealthcareName, healthcareID                          
    ORDER BY healthcareID ASC;'';                          
                          
 EXEC sp_executesql @SQL;                      
end                         
                         
if @Mode = ''revsentra''                         
BEGIN                         
    select case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end as Center, sum(ActualAmount) as Amount                         
    into #currentYear                         
    from DB_Finance_Actual                         
    where yearno = year(getdate())                         
    and criteria = ''Revenue''                         
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'''') = '''')                         
    group by case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end                         
                         
    select case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end as Center, sum(ActualAmount) as Amount                         
    into #lastyear                   
    from DB_Finance_Actual                         
    where yearno = year(getdate()) - 1                         
    and criteria = ''Revenue''                         
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'''') = '''')                         
    group by case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end                         
                         
    select                          
        ISNULL(c.Center, l.Center) as Center,                         
        ISNULL(c.Amount, 0) as CurrentYear_Amount,                         
        ISNULL(l.Amount, 0) as LastYear_Amount,                         
        ISNULL(c.Amount, 0) - ISNULL(l.Amount, 0) as Variance_Amount,                         
        CASE                          
            WHEN ISNULL(l.Amount, 0) = 0 THEN NULL                         
            ELSE CAST(                         
                ((CAST(ISNULL(c.Amount, 0) AS float) - CAST(l.Amount AS float)) / CAST(l.Amount AS float)) * 100                          
                AS DECIMAL(10,2))            
        END as Growth_Percentage                         
    from #currentYear c                         
    FULL OUTER JOIN #lastyear l on c.Center = l.Center                         
    order by Center;                         
                         
    drop table #currentYear;                         
    drop table #lastyear;                         
end                       
                      
if @Mode = ''pnl''                      
BEGIN                      
 WITH MasterCOA AS (                     
  SELECT DISTINCT                      
   accountgroupCode, [Level], [Urut], [AccountGroup], [COACode], [COAName]                    
  FROM MacroFinance_PnL                     
  WHERE YearNo = 2026                     
 ),                     
 FilteredPnL AS (                     
  SELECT *                     
  FROM MacroFinance_PnL                     
  WHERE YearNo = 2026                      
   AND (HealthcareID = @HealthcareID OR ISNULL(@HealthcareID, '''') = '''')                     
 )                     
 SELECT                      
  m.accountgroupCode,                      
  m.[Level],                      
  m.[Urut],                      
  m.[AccountGroup],                      
  m.[COACode],                      
  m.[COAName],                      
  ISNULL(SUM(p.[YTD_Last_Year]), 0) AS [YTD_Last_Year],                      
  ISNULL(SUM(p.[YTD_This_Year]), 0) AS [YTD_This_Year],                       
  ISNULL(SUM(p.[januari] + p.[februari] + p.[maret]), 0) AS Q1,                       
  ISNULL(SUM(p.[april] + p.[mei] + p.[juni]), 0) AS Q2,                       
  ISNULL(SUM(p.[juli] + p.[agustus] + p.[September]), 0) AS Q3,                       
  ISNULL(SUM(p.[oktober] + p.[november] + p.[desember]), 0) AS Q4                      
 FROM MasterCOA m                     
 LEFT JOIN FilteredPnL p                      
  ON m.accountgroupCode = p.accountgroupCode                      
  AND m.COACode = p.COACode                     
 where m.AccountGroup <> ''''                     
 GROUP BY                      
  m.accountgroupCode,                      
  m.[Level],                      
  m.[Urut],                      
  m.[AccountGroup],                      
  m.[COACode],                      
  m.[COAName]                      
 ORDER BY                      
  m.accountgroupCode,                      
  m.level,                      
  m.COACode,                      
  m.urut;                     
end                    
                    
if @mode = ''disclaimerPNL''             
BEGIN                    
 SELECT distinct p.HealthcareID, b.HealthcareName, p.TahunPeriodeClosing,              
  p.BulanPeriodeClosing,                     
  p.TanggalPostingTerakhir,       format(p.TanggalTarikData,''dd MMM yyyy HH:MM'') as TanggalTarikData                    
 FROM MacroFinance_PnL p                    
 left join DB_healthcare b                    
  on b.HealthcareID = p.HealthcareID                    
 WHERE YearNo = 2026                      
 order by b.HealthcareName                    
end                   
                   
if @Mode = ''DailyTrackingRevenue''                   
begin                   
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select TransactionDate, RegistrationNo, ItemID, ResponUnitID,                   
        Qty, Amount,                  
        case when ChartOfAccountCode = ''4.01.02.01.01'' then Qty else 0 end as AdmissionQty,                   
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Qty else 0 end as SurgeryQty,                   
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueOT ,                  
        case when ChartOfAccountCode not in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueNonOT,                   
        Amount as TotalRevenue                  
    into #DB_Finance_DailyTransaction                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir;                  
                          
    WITH DaysOfMonth AS (                   
        SELECT 1 AS DayNo                   
        UNION ALL                   
        SELECT DayNo + 1 FROM DaysOfMonth WHERE DayNo < 31                   
    ),                   
    BaseDaily AS (                   
        SELECT                    
            DAY(TransactionDate) AS DayNum,                   
            SUM(ISNULL(AdmissionQty, 0)) AS adm,                   
            SUM(ISNULL(SurgeryQty, 0)) AS sur,                   
            SUM(ISNULL(TotalRevenue, 0)) / 1000000.0 AS rev                   
        FROM #DB_Finance_DailyTransaction                   
        GROUP BY DAY(TransactionDate)                   
    )                   
    SELECT                    
        d.DayNo AS [day],                   
        ISNULL(b.adm, 0) AS [adm],                   
        ISNULL(b.sur, 0) AS [sur],                   
        ISNULL(b.rev, 0) AS [rev]                   
    FROM DaysOfMonth d                   
    LEFT JOIN BaseDaily b ON d.DayNo = b.DayNum                   
    OPTION (MAXRECURSION 32);                  
                  
    drop table #DB_Finance_DailyTransaction                  
end                   
                  
if @Mode = ''MonthlyTrackingRevenue''                    
begin                    
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select TransactionDate, RegistrationNo, ItemID, ResponUnitID,                   
        Qty, Amount,                  
        case when ChartOfAccountCode = ''4.01.02.01.01'' then Qty else 0 end as AdmissionQty,            
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Qty else 0 end as SurgeryQty,                   
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueOT ,                  
        case when ChartOfAccountCode not in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueNonOT,                   
        Amount as TotalRevenue                  
    into #DB_Finance_MonthlyTransaction                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID                  
        and year(TransactionDate) = year(@PeriodeAwal) ;                  
                  
                    
    WITH MonthsOfYear AS (                    
        SELECT 1 AS MonthNo                    
        UNION ALL                    
        SELECT MonthNo + 1 FROM MonthsOfYear WHERE MonthNo < 12                    
    ),                    
    BaseMonthly AS (                    
        SELECT                     
            MONTH(TransactionDate) AS MonthNum,                    
            SUM(ISNULL(AdmissionQty, 0)) AS adm,                    
            SUM(ISNULL(SurgeryQty, 0)) AS sur,                    
            SUM(ISNULL(TotalRevenue, 0)) / 1000000.0 AS rev                    
        FROM #DB_Finance_MonthlyTransaction                    
 GROUP BY MONTH(TransactionDate)                    
    )                    
    SELECT                     
        m.MonthNo AS [monthNo],                    
        ISNULL(b.adm, 0) AS [adm],                    
        ISNULL(b.sur, 0) AS [sur],                     ISNULL(b.rev, 0) AS [rev]                    
    FROM MonthsOfYear m                    
    LEFT JOIN BaseMonthly b ON m.MonthNo = b.MonthNum                    
    ORDER BY m.MonthNo                    
    OPTION (MAXRECURSION 15);                   
end                  
                  
if @mode = ''demographic''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select distinct RegistrationNo, Sex, AgeInYear, IsNewPatient                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir;                  
                  
end                  
                  
if @mode = ''revenueSentra''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select                   
        case when sentra in(''REFRAKTIF'',''PHACO'',''FLACS'',''KATARAK LAIN'',''REFRAKTIF LAINNYA'') then ''REFRAKTIF''                  
             when sentra in(''XTRA LASIK'',''LASIK'',''RLEX SMILE'') then ''LASIK''              
             when sentra in(''GLAUCOMA'') then ''GLAUCOMA''                  
             when sentra in(''OKULOPLASTY'') then ''OCULO''                  
             when sentra in(''STRABISMUS'') then ''CESC''                  
             when sentra in(''VITREORETINA'',''VITREORETINA LAINNYA'') then ''RETINA''                  
        else ''OTHER'' end as Sentra,                   
        sum(Amount) as Amount                  
    from BI_DailyTracking                  
    where chartofaccountcode in (''4.01.01.01.01'',''4.01.01.01.02'')                  
        and HealthcareID = @HealthcareID                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
    group by case when sentra in(''REFRAKTIF'',''PHACO'',''FLACS'',''KATARAK LAIN'',''REFRAKTIF LAINNYA'') then ''REFRAKTIF''                  
             when sentra in(''XTRA LASIK'',''LASIK'',''RLEX SMILE'') then ''LASIK''                  
             when sentra in(''GLAUCOMA'') then ''GLAUCOMA''                  
             when sentra in(''OKULOPLASTY'') then ''OCULO''                  
             when sentra in(''STRABISMUS'') then ''CESC''                  
             when sentra in(''VITREORETINA'',''VITREORETINA LAINNYA'') then ''RETINA''                  
        else ''OTHER'' end                  
                  
end                  
                  
if @mode = ''PerChannelVisits''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end as Kriteria,                  
        Count(Distinct RegistrationNO) as Qty                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID         
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
    group by case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end                  
end                  
                  
if @mode = ''PerChannelSurgery''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end as Kriteria,                  
        sum(Amount) as Amount                  
    from BI_DailyTracking         
    where chartofaccountcode in (''4.01.01.01.01'',''4.01.01.01.02'')                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
        and HealthcareID = @HealthcareID                  
    group by case when GuarantorID = ''BPJS'' then ''BPJS''                  
   when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end                  
end                  
                  
if @mode = ''PerChannelRevenue''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
 set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end as Kriteria,                  
        sum(Amount) as Amount       from BI_DailyTracking                  
    where transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
        and HealthcareID = @HealthcareID                  
    group by case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end                  
end               
               
IF @Mode = ''CoreGroupCreate''              
BEGIN               
    IF @CoreGroupCode IS NULL           
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_CODE_REQUIRED'' AS code,               
            ''GroupCode wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreGroupName IS NULL               
    BEGIN               
SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NAME_REQUIRED'' AS code,               
            ''GroupName wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_code = @CoreGroupCode               
    )               
    BEGIN               
   SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_CODE_EXISTS'' AS code,               
            ''Group code sudah digunakan.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
               
        DECLARE @NewGroupID uniqueidentifier = NEWID();               
         
        INSERT INTO [CoreAnalytics].dbo.core_group               
        (               
            group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at     
        )               
        VALUES               
        (               
            @NewGroupID,               
            @CoreGroupCode,               
            @CoreGroupName,               
            @CoreGroupDescription,               
            1,               
            SYSDATETIME()               
        );               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''GROUP_CREATED'' AS code,               
            ''Group berhasil dibuat.'' AS message,               
               
            CONVERT(varchar(36), group_id) AS group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at,               
            updated_at               
               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @NewGroupID;               
               
        RETURN;               
               
    END TRY               
    BEGIN CATCH               
               
        SELECT               
            CAST(0 AS bit) AS success,               
   ''GROUP_CREATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
               
        RETURN;               
               
    END CATCH;               
END;               
               
IF @Mode = ''CoreGroupList''               
BEGIN               
    IF @CorePage IS NULL OR @CorePage < 1               
        SET @CorePage = 1;               
               
    IF @CorePageSize IS NULL OR @CorePageSize < 1               
        SET @CorePageSize = 20;               
               
    IF @CorePageSize > 100               
        SET @CorePageSize = 100;               
               
    IF @CoreStatus NOT IN (''all'', ''active'', ''inactive'')               
        SET @CoreStatus = ''all'';               
               
               
    DECLARE @CoreGroupOffset int =               
        (@CorePage - 1) * @CorePageSize;               
               
               
    -- =========================================================               
    -- SUMMARY               
    -- =========================================================               
               
    DECLARE @CoreTotalGroups int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_group               
    );               
               
    DECLARE @CoreActiveGroups int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE is_active = 1               
    );               
               
    DECLARE @CoreInactiveGroups int =               
        @CoreTotalGroups - @CoreActiveGroups;               
               
               
    DECLARE @CoreAssignedUsers int =               
    (               
        SELECT COUNT(DISTINCT ug.user_id)               
        FROM [CoreAnalytics].dbo.core_user_group ug               
               
        INNER JOIN [CoreAnalytics].dbo.core_group g               
            ON g.group_id = ug.group_id               
           AND g.is_active = 1               
               
        INNER JOIN [CoreAnalytics].dbo.core_user u               
            ON u.user_id = ug.user_id               
       AND u.is_active = 1               
    );               
               
               
    -- =========================================================               
    -- FILTERED COUNT               
    -- =========================================================               
               
    DECLARE @CoreGroupFilteredCount int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_group g           
        WHERE               
        (               
            @CoreSearch IS NULL               
            OR g.group_code LIKE ''%'' + @CoreSearch + ''%''               
            OR g.group_name LIKE ''%'' + @CoreSearch + ''%''               
            OR g.description LIKE ''%'' + @CoreSearch + ''%''               
        )               
        AND               
        (               
            @CoreStatus = ''all''               
            OR (@CoreStatus = ''active'' AND g.is_active = 1)               
            OR (@CoreStatus = ''inactive'' AND g.is_active = 0)               
        )               
    );               
               
               
    DECLARE @CoreGroupTotalPages int =               
        CASE               
            WHEN @CoreGroupFilteredCount = 0 THEN 0               
            ELSE CEILING               
            (               
                CONVERT(decimal(18,4), @CoreGroupFilteredCount)               
                /               
                CONVERT(decimal(18,4), @CorePageSize)               
            )               
        END;               
               
               
    IF @CoreGroupTotalPages > 0               
       AND @CorePage > @CoreGroupTotalPages               
    BEGIN               
        SET @CorePage = @CoreGroupTotalPages;               
               
        SET @CoreGroupOffset =               
            (@CorePage - 1) * @CorePageSize;               
    END;               
               
               
    -- =========================================================               
    -- DATA               
    -- =========================================================               
               
    ;WITH FilteredGroups AS               
    (               
        SELECT               
            g.group_id,               
            g.group_code,               
            g.group_name,               
            g.description,               
            g.is_active,               
            g.created_at,               
            g.updated_at               
        FROM [CoreAnalytics].dbo.core_group g               
        WHERE               
        (               
            @CoreSearch IS NULL               
            OR g.group_code LIKE ''%'' + @CoreSearch + ''%''               
            OR g.group_name LIKE ''%'' + @CoreSearch + ''%''               
            OR g.description LIKE ''%'' + @CoreSearch + ''%''               
        )               
        AND               
        (               
            @CoreStatus = ''all''               
            OR (@CoreStatus = ''active'' AND g.is_active = 1)               
            OR (@CoreStatus = ''inactive'' AND g.is_active = 0)               
        )               
    )               
               
   SELECT               
        CAST(1 AS bit) AS success,               
        ''GROUP_LIST'' AS code,               
               
        @CorePage AS page,           
        @CorePageSize AS page_size,               
        @CoreGroupFilteredCount AS total_items,               
        @CoreGroupTotalPages AS total_pages,               
               
        @CoreTotalGroups AS summary_total_groups,               
        @CoreActiveGroups AS summary_active_groups,               
        @CoreInactiveGroups AS summary_inactive_groups,               
        @CoreAssignedUsers AS summary_assigned_users,               
               
        CONVERT(varchar(36), g.group_id) AS group_id,               
        g.group_code,               
        g.group_name,               
        g.description,               
        g.is_active,               
        g.created_at,               
        g.updated_at,               
               
        ISNULL(member.total_users, 0) AS user_count               
               
    FROM FilteredGroups g               
               
    OUTER APPLY               
    (               
        SELECT               
            COUNT(*) AS total_users               
        FROM [CoreAnalytics].dbo.core_user_group ug               
        WHERE ug.group_id = g.group_id               
    ) member               
   
    ORDER BY               
        g.is_active DESC,               
        g.group_name ASC,               
        g.group_code ASC               
               
    OFFSET @CoreGroupOffset ROWS               
    FETCH NEXT @CorePageSize ROWS ONLY;               
               
               
    -- =========================================================               
    -- EMPTY RESULT METADATA               
    -- =========================================================               
               
    IF @CoreGroupFilteredCount = 0               
    BEGIN               
    SELECT               
            CAST(1 AS bit) AS success,               
            ''GROUP_LIST'' AS code,               
               
            1 AS page,               
            @CorePageSize AS page_size,               
            0 AS total_items,               
            0 AS total_pages,               
               
            @CoreTotalGroups AS summary_total_groups,               
            @CoreActiveGroups AS summary_active_groups,               
            @CoreInactiveGroups AS summary_inactive_groups,               
            @CoreAssignedUsers AS summary_assigned_users,               
               
            CAST(NULL AS varchar(36)) AS group_id,               
            CAST(NULL AS varchar(50)) AS group_code,               
            CAST(NULL AS varchar(150)) AS group_name,               
            CAST(NULL AS varchar(500)) AS description,               
            CAST(NULL AS bit) AS is_active,               
            CAST(NULL AS datetime2) AS created_at,               
            CAST(NULL AS datetime2) AS updated_at,               
            CAST(0 AS int) AS user_count;               
    END;               
               
    RETURN;               
END;               
               
IF @Mode = ''CoreGroupGet''               
BEGIN               
    IF @CoreGroupID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_ID_REQUIRED'' AS code,          
            ''GroupID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID               
    )               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NOT_FOUND'' AS code,               
            ''Group tidak ditemukan.'' AS message;               
        RETURN;               
    END;               
               
               
    SELECT               
        CAST(1 AS bit) AS success,               
        ''GROUP_DETAIL'' AS code,               
               
        CONVERT(varchar(36), g.group_id) AS group_id,               
        g.group_code,               
        g.group_name,               
        g.description,               
        g.is_active,               
        g.created_at,               
        g.updated_at,               
               
        (               
            SELECT COUNT(*)               
            FROM [CoreAnalytics].dbo.core_user_group ug               
            WHERE ug.group_id = g.group_id               
        ) AS user_count               
               
    FROM [CoreAnalytics].dbo.core_group g               
    WHERE g.group_id = @CoreGroupID;               
               
    RETURN;               
END;               
               
IF @Mode = ''CoreGroupUpdate''               
BEGIN               
    IF @CoreGroupID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_ID_REQUIRED'' AS code,               
            ''GroupID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreGroupName IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NAME_REQUIRED'' AS code,            
            ''GroupName wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID               
    )               
    BEGIN               
        SELECT               
  CAST(0 AS bit) AS success,               
            ''GROUP_NOT_FOUND'' AS code,               
            ''Group tidak ditemukan.'' AS message;              
        RETURN;               
    END;               
               
    BEGIN TRY               
               
        UPDATE [CoreAnalytics].dbo.core_group               
        SET               
            group_name = @CoreGroupName,               
            description = @CoreGroupDescription,               
            updated_at = SYSDATETIME()               
        WHERE group_id = @CoreGroupID;               
               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''GROUP_UPDATED'' AS code,               
            ''Group berhasil diperbarui.'' AS message,               
               
            CONVERT(varchar(36), group_id) AS group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at,               
            updated_at               
               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID;               
               
        RETURN;               
               
    END TRY               
    BEGIN CATCH               
               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_UPDATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
               
        RETURN;               
              
    END CATCH;               
END;               
               
IF @Mode = ''CoreGroupSetActive''               
BEGIN               
    IF @CoreGroupID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_ID_REQUIRED'' AS code,               
            ''GroupID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreSetIsActive IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''IS_ACTIVE_REQUIRED'' AS code,               
            ''IsActive wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
  (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID               
    )               
    BEGIN           
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NOT_FOUND'' AS code,               
            ''Group tidak ditemukan.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
               
        UPDATE [CoreAnalytics].dbo.core_group               
        SET               
            is_active = @CoreSetIsActive,               
            updated_at = SYSDATETIME()               
        WHERE group_id = @CoreGroupID;               
               
               
        SELECT               
            CAST(1 AS bit) AS success,               
               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''GROUP_ACTIVATED''               
                ELSE ''GROUP_DEACTIVATED''           
            END AS code,               
               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''Group berhasil diaktifkan.''               
                ELSE ''Group berhasil dinonaktifkan.''               
            END AS message,               
               
            CONVERT(varchar(36), group_id) AS group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at,               
            updated_at               
               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID;               
               
        RETURN;               
               
    END TRY               
    BEGIN CATCH               
               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_STATUS_UPDATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
               
        RETURN;               
               
    END CATCH;               
END;              
              
IF @Mode = ''CoreMenuList''              
BEGIN              
              
    SELECT              
        CAST(1 AS bit) AS success,              
        ''MENU_LIST'' AS code,              
              
        CONVERT(varchar(36), m.menu_id) AS menu_id,              
        m.menu_code,              
        m.menu_name,              
              
        CONVERT(varchar(36), m.parent_menu_id) AS parent_menu_id,              
              
        p.menu_code AS parent_menu_code,              
        p.menu_name AS parent_menu_name,              
              
        m.route_key,              
        m.icon_key,              
        m.sort_order,              
        m.is_active              
              
    FROM [CoreAnalytics].dbo.core_menu m              
              
    LEFT JOIN [CoreAnalytics].dbo.core_menu p              
        ON p.menu_id = m.parent_menu_id              
              
    WHERE m.is_active = 1              
              
    ORDER BY              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN m.sort_order              
            ELSE ISNULL(p.sort_order, 0)              
        END,              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN 0              
            ELSE 1              
        END,              
        m.sort_order,              
        m.menu_name;              
              
    RETURN;              
END;              
              
IF @Mode = ''CoreGroupMenuGet''              
BEGIN              
              
    IF @CoreGroupID IS NULL              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_ID_REQUIRED'' AS code,              
            ''GroupID wajib diisi.'' AS message;              
        RETURN;              
    END;              
              
              
    IF NOT EXISTS              
    (              
        SELECT 1              
        FROM [CoreAnalytics].dbo.core_group              
        WHERE group_id = @CoreGroupID              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_NOT_FOUND'' AS code,              
            ''Group tidak ditemukan.'' AS message;              
        RETURN;              
    END;              
              
              
    SELECT              
        CAST(1 AS bit) AS success,              
        ''GROUP_MENU_LIST'' AS code,              
              
        CONVERT(varchar(36), @CoreGroupID) AS group_id,              
              
        g.group_code,             
        g.group_name,              
         
        CONVERT(varchar(36), m.menu_id) AS menu_id,              
        m.menu_code,              
        m.menu_name,              
              
        CONVERT(varchar(36), m.parent_menu_id)              
            AS parent_menu_id,              
              
        p.menu_code AS parent_menu_code,              
        p.menu_name AS parent_menu_name,              
              
        m.route_key,              
        m.icon_key,              
        m.sort_order,              
              
        CAST(              
            CASE              
                WHEN gm.menu_id IS NOT NULL              
                     AND gm.can_view = 1              
                    THEN 1              
                ELSE 0              
            END              
            AS bit              
        ) AS can_view              
              
    FROM [CoreAnalytics].dbo.core_group g              
          
    CROSS JOIN [CoreAnalytics].dbo.core_menu m              
              
    LEFT JOIN [CoreAnalytics].dbo.core_menu p              
        ON p.menu_id = m.parent_menu_id              
              
    LEFT JOIN [CoreAnalytics].dbo.core_group_menu gm              
        ON gm.group_id = g.group_id              
        AND gm.menu_id = m.menu_id              
        AND gm.can_view = 1              
              
    WHERE              
        g.group_id = @CoreGroupID              
        AND m.is_active = 1         
              
    ORDER BY              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN m.sort_order              
            ELSE ISNULL(p.sort_order, 0)              
        END,              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN 0              
            ELSE 1              
        END,              
        m.sort_order,              
        m.menu_name;              
              
    RETURN;              
END;              
              
IF @Mode = ''CoreGroupMenuSave''              
BEGIN              
              
    IF @CoreGroupID IS NULL              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_ID_REQUIRED'' AS code,              
            ''GroupID wajib diisi.'' AS message;              
        RETURN;              
    END;              
              
              
    IF NOT EXISTS              
    (              
        SELECT 1              
        FROM [CoreAnalytics].dbo.core_group              
        WHERE group_id = @CoreGroupID              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_NOT_FOUND'' AS code,              
            ''Group tidak ditemukan.'' AS message;              
        RETURN;              
    END;              
      
              
    -- MenuIDs must exist as a JSON array.              
    IF JSON_QUERY(@Payload, ''$.MenuIDs'') IS NULL              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''MENU_IDS_REQUIRED'' AS code,              
            ''MenuIDs wajib dikirim dalam bentuk array.'' AS message;              
        RETURN;              
    END;              
              
              
    -- =========================================================              
    -- PARSE MENU IDs              
    -- =========================================================              
              
    DECLARE @CoreSelectedMenu TABLE              
    (              
        menu_id uniqueidentifier NOT NULL PRIMARY KEY              
    );              
              
              
    -- Reject invalid GUID values before inserting.              
    IF EXISTS              
    (              
        SELECT 1              
        FROM OPENJSON(@Payload, ''$.MenuIDs'') j              
      WHERE TRY_CONVERT(uniqueidentifier, j.[value]) IS NULL              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''INVALID_MENU_ID'' AS code,              
            ''Salah satu MenuID tidak valid.'' AS message;              
        RETURN;              
    END;              
              
              
    INSERT INTO @CoreSelectedMenu              
    (              
        menu_id              
    )              
    SELECT DISTINCT              
        TRY_CONVERT(uniqueidentifier, j.[value])              
    FROM OPENJSON(@Payload, ''$.MenuIDs'') j;               
              
    -- =========================================================              
    -- VALIDATE MENU EXISTS + ACTIVE              
    -- =========================================================              
              
    IF EXISTS              
    (              
        SELECT 1              
        FROM @CoreSelectedMenu s              
              
        LEFT JOIN [CoreAnalytics].dbo.core_menu m              
            ON m.menu_id = s.menu_id              
            AND m.is_active = 1              
              
        WHERE m.menu_id IS NULL              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''MENU_NOT_FOUND'' AS code,              
            ''Salah satu menu tidak ditemukan atau tidak aktif.''              
                AS message;              
        RETURN;              
    END;              
              
              
    BEGIN TRY              
              
        BEGIN TRANSACTION;              
              
              
        -- =====================================================              
        -- REMOVE CURRENT ACCESS              
        -- =====================================================              
              
        DELETE              
        FROM [CoreAnalytics].dbo.core_group_menu              
        WHERE group_id = @CoreGroupID;              
              
              
        -- =====================================================              
        -- INSERT NEW ACCESS              
        -- =====================================================              
              
        INSERT INTO [CoreAnalytics].dbo.core_group_menu              
        (              
            group_id,              
            menu_id,              
            can_view,              
            created_at                 )              
        SELECT              
            @CoreGroupID,              
            s.menu_id,              
            1,              
            SYSDATETIME()              
        FROM @CoreSelectedMenu s;              
              
              
        COMMIT TRANSACTION;              
              
              
        SELECT              
            CAST(1 AS bit) AS success,              
            ''GROUP_MENU_SAVED'' AS code,              
            ''Group menu access berhasil disimpan.''              
                AS message,              
              
            CONVERT(varchar(36), @CoreGroupID)              
                AS group_id,              
              
            (              
                SELECT COUNT(*)              
                FROM @CoreSelectedMenu              
            ) AS menu_count;              
              
              
        RETURN;              
              
    END TRY              
              
    BEGIN CATCH              
              
        IF @@TRANCOUNT > 0              
            ROLLBACK TRANSACTION;              
              
              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_MENU_SAVE_ERROR'' AS code,              
            ERROR_MESSAGE() AS message;              
              
        RETURN;              
              
    END CATCH;      
              
END;           
  
           
-- =============================================================       
-- CORE USER -> GROUP -> EFFECTIVE MENU ACCESS           
-- Added 2026-10-27           
--           
-- Modes:           
--   CoreUserGroupGet           
--   CoreUserGroupSave           
--   CoreUserAccessGet           
--           
-- Existing Group Management modes above are intentionally unchanged.           
-- =============================================================           
           
           
-- =============================================================           
-- CORE USER GROUP GET           
-- Returns all groups and marks the groups assigned to one user.           
--           
-- Payload:           
-- {           
--   "UserID": "..."           
-- }           
-- =============================================================           
IF @Mode = ''CoreUserGroupGet''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_ID_REQUIRED'' AS code,           
            ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_NOT_FOUND'' AS code,           
            ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''USER_GROUP_LIST'' AS code,           
        CONVERT(varchar(36), @CoreUserID) AS user_id,           
        CONVERT(varchar(36), g.group_id) AS group_id,           
        g.group_code,           
        g.group_name,           
        g.description,           
        g.is_active,           
    CAST           
        (           
            CASE           
                WHEN ug.user_id IS NULL THEN 0           
                ELSE 1           
            END           
            AS bit           
        ) AS is_assigned           
    FROM [CoreAnalytics].dbo.core_group g           
    LEFT JOIN [CoreAnalytics].dbo.core_user_group ug           
        ON ug.group_id = g.group_id           
       AND ug.user_id = @CoreUserID           
    ORDER BY           
        g.is_active DESC,           
        g.group_name ASC,           
        g.group_code ASC;           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE USER GROUP SAVE           
-- Replaces all current group assignments for one user.           
--           
-- Payload:           
-- {           
--   "UserID": "...",           
--   "GroupIDs": ["...", "..."]           
-- }           
--           
-- Empty GroupIDs [] removes all group assignments.           
-- Only active groups may be newly assigned.           
-- =============================================================           
IF @Mode = ''CoreUserGroupSave''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_ID_REQUIRED'' AS code,           
            ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID         
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_NOT_FOUND'' AS code,           
            ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    IF JSON_QUERY(@Payload, ''$.GroupIDs'') IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''GROUP_IDS_REQUIRED'' AS code,           
            ''GroupIDs wajib dikirim dalam bentuk array.'' AS message;           
        RETURN;           
    END;           
           
    DECLARE @CoreSelectedGroup TABLE           
    (           
        group_id uniqueidentifier NOT NULL PRIMARY KEY           
    );           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM OPENJSON(@Payload, ''$.GroupIDs'') j           
        WHERE TRY_CONVERT(uniqueidentifier, j.[value]) IS NULL           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''INVALID_GROUP_ID'' AS code,           
            ''Salah satu GroupID tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    INSERT INTO @CoreSelectedGroup           
    (           
        group_id           
    )           
    SELECT DISTINCT           
        TRY_CONVERT(uniqueidentifier, j.[value])           
    FROM OPENJSON(@Payload, ''$.GroupIDs'') j;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM @CoreSelectedGroup s           
        LEFT JOIN [CoreAnalytics].dbo.core_group g           
            ON g.group_id = s.group_id           
           AND g.is_active = 1           
        WHERE g.group_id IS NULL           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''GROUP_NOT_FOUND'' AS code,           
            ''Salah satu group tidak ditemukan atau tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        DELETE           
        FROM [CoreAnalytics].dbo.core_user_group           
        WHERE user_id = @CoreUserID;           
           
        /*           
            Current spDashboard only depends on user_id + group_id when reading           
            core_user_group. The insert below also remains compatible when the           
    table has an optional created_at audit column.           
           
            Dynamic SQL is used only for the created_at variant so SQL Server           
            does not compile a reference to a column that may not exist.           
        */           
        IF COL_LENGTH(''CoreAnalytics.dbo.core_user_group'', ''created_at'') IS NOT NULL           
        BEGIN           
            EXEC sys.sp_executesql           
                N''           
                    INSERT INTO [CoreAnalytics].dbo.core_user_group           
                    (           
                        user_id,           
                        group_id,           
                        created_at           
                    )           
                SELECT DISTINCT           
                        @PUserID,           
                        TRY_CONVERT(uniqueidentifier, j.[value]),           
                        SYSDATETIME()           
                    FROM OPENJSON(@PPayload, ''''$.GroupIDs'''') j;           
                '',           
                N''@PUserID uniqueidentifier, @PPayload nvarchar(max)'',           
             @PUserID = @CoreUserID,           
                @PPayload = @Payload;           
        END           
        ELSE           
        BEGIN           
            INSERT INTO [CoreAnalytics].dbo.core_user_group           
            (           
                user_id,           
                group_id           
            )           
            SELECT           
                @CoreUserID,           
                s.group_id           
            FROM @CoreSelectedGroup s;           
        END;           
           
        COMMIT TRANSACTION;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            ''USER_GROUP_SAVED'' AS code,           
            ''User group access berhasil disimpan.'' AS message,           
            CONVERT(varchar(36), @CoreUserID) AS user_id,           
            (           
                SELECT COUNT(*)           
                FROM @CoreSelectedGroup           
            ) AS group_count;           
           
        RETURN;           
    END TRY           
 BEGIN CATCH           
        IF @@TRANCOUNT > 0           
            ROLLBACK TRANSACTION;           
           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_GROUP_SAVE_ERROR'' AS code,           
            ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE USER EFFECTIVE ACCESS GET           
-- Used after PASSWORD or VOICE authentication.           
--           
-- Effective groups:           
--   All ACTIVE groups assigned to the user.           
--           
-- Effective menus:           
--   UNION / DISTINCT of menu access from all ACTIVE groups,           
--   where core_group_menu.can_view = 1 and menu is ACTIVE.           
--           
-- One row is returned. groups_json and menus_json are JSON arrays so           
-- BEAM can transport the complete access profile without multiple           
-- result-set ambiguity.           
--           
-- Payload:           
-- {           
--   "UserID": "..."           
-- }           
-- =============================================================           
IF @Mode = ''CoreUserAccessGet''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_ID_REQUIRED'' AS code,           
            ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_active = 1           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_NOT_FOUND'' AS code,           
            ''User tidak ditemukan atau tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''USER_ACCESS'' AS code,           
        CONVERT(varchar(36), @CoreUserID) AS user_id,           
           
        ISNULL           
        (           
            (           
                SELECT           
                    CONVERT(varchar(36), g.group_id) AS group_id,           
                    g.group_code,           
                    g.group_name           
                FROM [CoreAnalytics].dbo.core_user_group ug           
                INNER JOIN [CoreAnalytics].dbo.core_group g           
                    ON g.group_id = ug.group_id           
                   AND g.is_active = 1           
                WHERE ug.user_id = @CoreUserID           
                ORDER BY           
                    g.group_name,           
                    g.group_code           
                FOR JSON PATH           
      ),           
            ''[]''           
        ) AS groups_json,           
           
        ISNULL           
        (           
            (           
                SELECT           
                    x.menu_id,           
    x.menu_code,           
                    x.menu_name,           
                    x.parent_menu_id,           
                    x.parent_menu_code,           
                    x.parent_menu_name,           
    x.route_key,           
                    x.icon_key,           
                    x.sort_order           
                FROM           
           (           
                    SELECT DISTINCT           
                        CONVERT(varchar(36), m.menu_id) AS menu_id,           
                        m.menu_code,           
                        m.menu_name,           
                        CONVERT(varchar(36), m.parent_menu_id) AS parent_menu_id,           
                        p.menu_code AS parent_menu_code,           
           p.menu_name AS parent_menu_name,           
                        m.route_key,           
                        m.icon_key,           
                        m.sort_order           
                    FROM [CoreAnalytics].dbo.core_user_group ug           
                    INNER JOIN [CoreAnalytics].dbo.core_group g           
                        ON g.group_id = ug.group_id           
                       AND g.is_active = 1           
                    INNER JOIN [CoreAnalytics].dbo.core_group_menu gm           
                        ON gm.group_id = g.group_id           
                       AND gm.can_view = 1           
                    INNER JOIN [CoreAnalytics].dbo.core_menu m           
                        ON m.menu_id = gm.menu_id           
                       AND m.is_active = 1           
                    LEFT JOIN [CoreAnalytics].dbo.core_menu p           
                        ON p.menu_id = m.parent_menu_id           
                    WHERE ug.user_id = @CoreUserID           
                ) x           
                ORDER BY           
                    x.sort_order,           
                    x.menu_name,           
                    x.menu_code           
                FOR JSON PATH           
            ),           
            ''[]''           
        ) AS menus_json;           
           
    RETURN;           
END;         
         
-- =============================================================         
-- CORE USER SESSION (ADDITIVE, STAGE 3)         
-- SessionTokenHash: lowercase SHA-256 hex of cryptographically random token.         
-- Only trusted backend callers may invoke these modes.         
-- =============================================================         
IF @Mode IN (''CoreUserSessionCreate'', ''CoreUserSessionValidate'', ''CoreUserSessionRevoke'')         
BEGIN         
    DECLARE @SessionHash varchar(64) = LOWER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.SessionTokenHash''))), ''''));         
    DECLARE @SessionTTL int = TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.TTLMinutes''));         
    DECLARE @SessionReason varchar(100) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.RevokedReason''))), '''');         
    DECLARE @SessionNow datetime2(7) = SYSDATETIME();         
         
    IF @SessionHash IS NULL OR LEN(@SessionHash) <> 64         
       OR @SessionHash COLLATE Latin1_General_BIN2 LIKE ''%[^0-9a-f]%''         
    BEGIN         
        SELECT CAST(0 AS bit) AS success, ''SESSION_HASH_INVALID'' AS code;         
        RETURN;         
    END;         
         
    IF @Mode = ''CoreUserSessionCreate''         
    BEGIN         
        IF @CoreUserID IS NULL OR @CoreAuthMethod NOT IN (''PASSWORD'',''VOICE'')         
        BEGIN         
            SELECT CAST(0 AS bit) AS success, ''SESSION_INPUT_INVALID'' AS code;         
            RETURN;         
        END;         
        IF NOT EXISTS (         
            SELECT 1 FROM [CoreAnalytics].dbo.core_user         
            WHERE user_id = @CoreUserID AND is_active = 1 AND is_locked = 0         
        )         
        BEGIN         
            SELECT CAST(0 AS bit) AS success, ''SESSION_USER_UNAVAILABLE'' AS code;         
            RETURN;         
        END;         
        IF @SessionTTL IS NULL OR @SessionTTL < 1 OR @SessionTTL > 480         
            SET @SessionTTL = 480;         
        BEGIN TRY         
            DECLARE @NewSessionID uniqueidentifier = NEWID();         
            INSERT INTO [CoreAnalytics].dbo.core_user_session         
                (session_id,user_id,session_token_hash,auth_method,created_ip,user_agent,         
                 created_at,last_activity_at,expires_at)         
            VALUES         
                (@NewSessionID,@CoreUserID,@SessionHash,@CoreAuthMethod,@CoreIPAddress,@CoreUserAgent,         
                 @SessionNow,@SessionNow,DATEADD(MINUTE,@SessionTTL,@SessionNow));         
            SELECT CAST(1 AS bit) AS success, ''SESSION_CREATED'' AS code,         
                   CONVERT(varchar(36),@NewSessionID) AS session_id,         
                DATEADD(MINUTE,@SessionTTL,@SessionNow) AS expires_at;         
            RETURN;         
        END TRY         
        BEGIN CATCH         
            SELECT CAST(0 AS bit) AS success, ''SESSION_CREATE_ERROR'' AS code;         
            RETURN;         
        END CATCH;         
    END;         
         
    IF @Mode = ''CoreUserSessionValidate''         
    BEGIN         
        -- Fail closed for expired/revoked sessions or inactive/locked users.         
        IF NOT EXISTS (         
            SELECT 1 FROM [CoreAnalytics].dbo.core_user_session s         
            INNER JOIN [CoreAnalytics].dbo.core_user u ON u.user_id=s.user_id         
            WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL         
              AND s.expires_at > @SessionNow AND u.is_active=1 AND u.is_locked=0         
        )         
        BEGIN         
            SELECT CAST(0 AS bit) AS success, ''SESSION_INVALID'' AS code;         
            RETURN;         
        END;         
        UPDATE s SET last_activity_at=@SessionNow         
        FROM [CoreAnalytics].dbo.core_user_session s         
        WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL         
          AND s.expires_at > @SessionNow;         
        SELECT TOP 1 CAST(1 AS bit) AS success, ''SESSION_VALID'' AS code,         
               CONVERT(varchar(36),s.session_id) AS session_id,         
               CONVERT(varchar(36),u.user_id) AS user_id,         
               u.username,u.display_name,u.email,s.auth_method,s.expires_at         
        FROM [CoreAnalytics].dbo.core_user_session s         
        INNER JOIN [CoreAnalytics].dbo.core_user u ON u.user_id=s.user_id         
        WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL         
          AND s.expires_at > @SessionNow AND u.is_active=1 AND u.is_locked=0;         
        RETURN;         
    END;         
         
    IF @Mode = ''CoreUserSessionRevoke''         
    BEGIN         
        UPDATE [CoreAnalytics].dbo.core_user_session         
        SET revoked_at=@SessionNow,         
            revoked_reason=LEFT(COALESCE(@SessionReason,''LOGOUT''),100)         
        WHERE session_token_hash=@SessionHash AND revoked_at IS NULL;         
        SELECT CAST(1 AS bit) AS success, ''SESSION_REVOKED'' AS code;         
        RETURN;         
    END;         
END;        
        
/* Stage 5B additive block. Paste inside dbo.spDashboard after existing CoreUserSession modes.        
   Requires [CoreAnalytics].studio.connection from migration 001.        
   All access decisions MUST be enforced by Flask; BEAM is a trusted service credential.        
*/        
/* Phase 2.2A: update connection metadata; preserve secret when omitted. */   
IF @Mode = ''CoreStudioConnectionUpdate''   
BEGIN   
    DECLARE @EditUser uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.UserID''));   
    DECLARE @EditID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ConnectionID''));   
    DECLARE @EditName nvarchar(150) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ConnectionName''))), '''');   
    DECLARE @EditHost nvarchar(255) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ServerHost''))), '''');   
    DECLARE @EditDB nvarchar(128) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.DatabaseName''))), '''');   
    DECLARE @EditLogin nvarchar(255) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.LoginUsername''))), '''');   
    DECLARE @EditType varchar(30) = UPPER(JSON_VALUE(@Payload, ''$.ConnectionType''));   
    DECLARE @EditPort int = TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ServerPort''));   
    DECLARE @EditTimeout int = TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ConnectionTimeoutSeconds''));   
    DECLARE @EditTLS bit = CASE JSON_VALUE(@Payload, ''$.EncryptTransport'') WHEN ''true'' THEN 1 WHEN ''false'' THEN 0 WHEN ''1'' THEN 1 WHEN ''0'' THEN 0 END;   
    DECLARE @EditTrust bit = CASE JSON_VALUE(@Payload, ''$.TrustServerCertificate'') WHEN ''true'' THEN 1 WHEN ''false'' THEN 0 WHEN ''1'' THEN 1 WHEN ''0'' THEN 0 END;   
    DECLARE @EditSecret64 nvarchar(max) = JSON_VALUE(@Payload, ''$.EncryptedPasswordBase64'');   
    DECLARE @EditSecret varbinary(max) = NULL;   
    DECLARE @EditVersion smallint = TRY_CONVERT(smallint, JSON_VALUE(@Payload, ''$.EncryptionKeyVersion''));   
    IF @EditUser IS NULL OR NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@EditUser AND is_active=1 AND is_locked=0)   
    BEGIN SELECT CAST(0 AS bit) success, ''USER_UNAVAILABLE'' code; RETURN; END;   
    IF @EditID IS NULL OR NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@EditID)   
    BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_CONNECTION_NOT_FOUND'' code; RETURN; END;   
    IF @EditName IS NULL OR @EditHost IS NULL OR @EditDB IS NULL OR @EditLogin IS NULL   
       OR @EditPort NOT BETWEEN 1 AND 65535 OR @EditTimeout NOT BETWEEN 1 AND 60   
       OR @EditTLS IS NULL OR @EditTrust IS NULL OR @EditType NOT IN (''SQLSERVER'',''POSTGRESQL'')   
    BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_INPUT_INVALID'' code; RETURN; END;   
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@EditID AND connection_type=@EditType)   
    BEGIN SELECT CAST(0 AS bit) success, ''CONNECTOR_TYPE_IMMUTABLE'' code; RETURN; END;   
    IF @EditSecret64 IS NOT NULL AND @EditVersion IS NULL   
    BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_SECRET_INVALID'' code; RETURN; END;   
    BEGIN TRY   
        IF @EditSecret64 IS NOT NULL   
        BEGIN   
            SET @EditSecret = CAST(N'''' AS xml).value(''xs:base64Binary(sql:variable("@EditSecret64"))'', ''varbinary(max)'');   
            IF DATALENGTH(@EditSecret)=0   
            BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_SECRET_INVALID'' code; RETURN; END;   
        END;   
        UPDATE [CoreAnalytics].studio.connection   
        SET connection_name=@EditName, server_host=@EditHost, server_port=@EditPort,   
            database_name=@EditDB, login_username=@EditLogin,   
            encrypt_transport=@EditTLS, trust_server_certificate=@EditTrust,   
            connection_timeout_seconds=@EditTimeout,   
            encrypted_password=COALESCE(@EditSecret,encrypted_password),   
            encryption_key_version=CASE WHEN @EditSecret IS NULL THEN encryption_key_version ELSE @EditVersion END,   
            updated_by=CONVERT(nvarchar(100),@EditUser), updated_at=SYSUTCDATETIME()   
        WHERE connection_id=@EditID;   
        SELECT CAST(1 AS bit) success, ''STUDIO_CONNECTION_UPDATED'' code;   
    END TRY   
    BEGIN CATCH   
        SELECT CAST(0 AS bit) success, ''STUDIO_CONNECTION_UPDATE_FAILED'' code;   
    END CATCH;   
    RETURN;   
END;   
   
IF @Mode IN (''CoreStudioConnectionList'',''CoreStudioConnectionCreate'',''CoreStudioConnectionSetActive'')        
BEGIN        
    DECLARE @StudioUserID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload,''$.UserID''));        
    IF @StudioUserID IS NULL        
    BEGIN        
        SELECT CAST(0 AS bit) AS success, ''USER_ID_REQUIRED'' AS code;        
        RETURN;        
    END;        
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@StudioUserID AND is_active=1 AND is_locked=0)        
    BEGIN        
        SELECT CAST(0 AS bit) AS success, ''USER_UNAVAILABLE'' AS code;        
        RETURN;        
    END;        
        
    IF @Mode=''CoreStudioConnectionList''        
    BEGIN        
        SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_name, connection_type,        
           server_host,server_port,database_name,auth_type,login_username,        
               encrypt_transport,trust_server_certificate,connection_timeout_seconds,        
               is_active,created_by,created_at,updated_by,updated_at        
        FROM [CoreAnalytics].studio.connection ORDER BY connection_name;        
        RETURN;        
    END;        
        
    IF @Mode=''CoreStudioConnectionCreate''        
    BEGIN        
        DECLARE @StudioName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ConnectionName''))),''''),        
                @StudioHost nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ServerHost''))),''''),        
        @StudioDB nvarchar(128)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.DatabaseName''))),''''),        
                @StudioLogin nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.LoginUsername''))),''''),        
                @StudioType varchar(30)=UPPER(COALESCE(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ConnectionType''))),''''),''SQLSERVER'')),    
                @StudioAuth varchar(30)=UPPER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.AuthType''))),'''')),    
                @StudioPort int=COALESCE(TRY_CONVERT(int,JSON_VALUE(@Payload,''$.ServerPort'')),    
                    CASE WHEN UPPER(JSON_VALUE(@Payload,''$.ConnectionType''))=''POSTGRESQL'' THEN 5432 ELSE 1433 END),        
                @StudioTimeout int=ISNULL(TRY_CONVERT(int,JSON_VALUE(@Payload,''$.ConnectionTimeoutSeconds'')),10),        
                @StudioVersion smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,''$.EncryptionKeyVersion'')),        
                @StudioEncrypted64 nvarchar(max)=JSON_VALUE(@Payload,''$.EncryptedPasswordBase64''),        
                @StudioEncrypted varbinary(max),        
                @StudioTLS bit=CASE WHEN JSON_VALUE(@Payload,''$.EncryptTransport'') IN (''true'',''1'') THEN 1 ELSE 0 END,        
                @StudioTrust bit=CASE WHEN JSON_VALUE(@Payload,''$.TrustServerCertificate'') IN (''true'',''1'') THEN 1 ELSE 0 END;        
        IF @StudioAuth IS NULL    
            SET @StudioAuth=CASE WHEN @StudioType=''POSTGRESQL'' THEN ''PASSWORD'' ELSE ''SQL_LOGIN'' END;    
        IF @StudioType NOT IN (''SQLSERVER'',''POSTGRESQL'')    
           OR NOT ((@StudioType=''SQLSERVER'' AND @StudioAuth=''SQL_LOGIN'')    
                   OR (@StudioType=''POSTGRESQL'' AND @StudioAuth=''PASSWORD''))    
        BEGIN    
            SELECT CAST(0 AS bit) AS success,''STUDIO_CONNECTOR_UNSUPPORTED'' AS code;    
            RETURN;    
        END;    
        IF @StudioName IS NULL OR @StudioHost IS NULL OR @StudioDB IS NULL OR @StudioLogin IS NULL        
           OR @StudioPort NOT BETWEEN 1 AND 65535 OR @StudioTimeout NOT BETWEEN 1 AND 60        
           OR @StudioVersion IS NULL OR @StudioEncrypted64 IS NULL        
        BEGIN        
            SELECT CAST(0 AS bit) AS success,''STUDIO_INPUT_INVALID'' AS code;        
            RETURN;        
        END;        
        BEGIN TRY        
            SET @StudioEncrypted=CAST(N'''' AS xml).value(''xs:base64Binary(sql:variable("@StudioEncrypted64"))'',''varbinary(max)'');        
            IF DATALENGTH(@StudioEncrypted)=0        
            BEGIN        
                SELECT CAST(0 AS bit) AS success,''STUDIO_SECRET_INVALID'' AS code;        
                RETURN;        
            END;        
            BEGIN TRANSACTION;
            DECLARE @StudioNewID uniqueidentifier=NEWID();        
            INSERT INTO [CoreAnalytics].studio.connection        
                (connection_id,connection_name,connection_type,server_host,server_port,database_name,        
                 auth_type,login_username,encrypted_password,encryption_key_version,encrypt_transport,        
                 trust_server_certificate,connection_timeout_seconds,is_active,created_by)        
            VALUES (@StudioNewID,@StudioName,@StudioType,@StudioHost,@StudioPort,@StudioDB,    
                    @StudioAuth,@StudioLogin,@StudioEncrypted,@StudioVersion,@StudioTLS,        
                    @StudioTrust,@StudioTimeout,1,CONVERT(nvarchar(100),@StudioUserID));
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO [CoreAnalytics].studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''CONNECTION'',@StudioNewID,@StudioUserID);
    INSERT INTO [CoreAnalytics].studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@StudioUserID,''CONNECTION'',@StudioNewID,''REGISTER'',@StudioUserID);
            COMMIT TRANSACTION;        
            SELECT CAST(1 AS bit) AS success,''STUDIO_CONNECTION_CREATED'' AS code,        
                   CONVERT(varchar(36),@StudioNewID) AS connection_id;        
            RETURN;        
        END TRY        
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;        
            SELECT CAST(0 AS bit) AS success,        
                   CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN ''STUDIO_CONNECTION_DUPLICATE'' ELSE ''STUDIO_CONNECTION_CREATE_FAILED'' END AS code;        
            RETURN;        
        END CATCH;        
    END;        
        
    IF @Mode=''CoreStudioConnectionSetActive''        
    BEGIN        
DECLARE @StudioConnectionID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')),        
                @StudioActive bit=CASE JSON_VALUE(@Payload,''$.IsActive'') WHEN ''true'' THEN 1 WHEN ''false'' THEN 0 WHEN ''1'' THEN 1 WHEN ''0'' THEN 0 ELSE NULL END;        
        IF @StudioConnectionID IS NULL OR @StudioActive IS NULL        
        BEGIN        
          SELECT CAST(0 AS bit) AS success,''STUDIO_INPUT_INVALID'' AS code;        
            RETURN;        
        END;        
        UPDATE [CoreAnalytics].studio.connection SET is_active=@StudioActive,        
            updated_by=CONVERT(nvarchar(100),@StudioUserID),updated_at=SYSUTCDATETIME()        
        WHERE connection_id=@StudioConnectionID;        
        IF @@ROWCOUNT=0        
        BEGIN        
            SELECT CAST(0 AS bit) AS success,''STUDIO_CONNECTION_NOT_FOUND'' AS code;        
            RETURN;        
        END;        
        SELECT CAST(1 AS bit) AS success,''STUDIO_CONNECTION_STATUS_UPDATED'' AS code;        
        RETURN;        
    END;        
END;       
       
/* Add this block inside dbo.spDashboard. Flask enforces Data Studio access. */       
IF @Mode IN (''CoreStudioConnectionGetSecret'',''CoreStudioDatasetList'',''CoreStudioDatasetCreate'')       
BEGIN       
 DECLARE @DSUser uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID''));       
 IF @DSUser IS NULL OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@DSUser AND is_active=1 AND is_locked=0)       
 BEGIN SELECT CAST(0 AS bit) AS success,''USER_UNAVAILABLE'' AS code; RETURN; END;       
 IF @Mode=''CoreStudioConnectionGetSecret''       
 BEGIN       
  SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_type, auth_type,    
    server_host,server_port,database_name,login_username,       
    CAST('''' AS xml).value(''xs:base64Binary(sql:column("encrypted_password"))'',''varchar(max)'') AS encrypted_password_base64,       
    encryption_key_version,encrypt_transport,trust_server_certificate,connection_timeout_seconds       
  FROM [CoreAnalytics].studio.connection       
  WHERE connection_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')) AND is_active=1;       
  RETURN;       
 END;       
 IF @Mode=''CoreStudioDatasetList''       
 BEGIN       
  IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.dataset)       
  BEGIN SELECT CAST(1 AS bit) AS success,''DATASET_LIST_EMPTY'' AS code; RETURN; END;       
  SELECT CONVERT(varchar(36),d.dataset_id) AS dataset_id,d.dataset_name,d.description,       
   CONVERT(varchar(36),d.connection_id) AS connection_id,c.connection_name,d.source_schema,d.source_name,       
   d.source_type,d.access_mode,d.storage_status,d.created_at       
  FROM [CoreAnalytics].studio.dataset d JOIN [CoreAnalytics].studio.connection c ON c.connection_id=d.connection_id       
  ORDER BY d.created_at DESC;       
  RETURN;       
 END;       
 IF @Mode=''CoreStudioDatasetCreate''       
 BEGIN       
  DECLARE @DSName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.DatasetName''))),''''),       
    @DSDescription nvarchar(1000)=JSON_VALUE(@Payload,''$.Description''),       
    @DSConnection uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')),       
    @DSSchema sysname=JSON_VALUE(@Payload,''$.SourceSchema''), @DSTable sysname=JSON_VALUE(@Payload,''$.SourceName''),       
    @DSType varchar(20)=JSON_VALUE(@Payload,''$.SourceType'');       
  IF @DSName IS NULL OR NULLIF(@DSSchema,'''') IS NULL OR NULLIF(@DSTable,'''') IS NULL OR @DSType NOT IN (''BASE TABLE'',''VIEW'')       
    OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@DSConnection AND is_active=1)       
  BEGIN SELECT CAST(0 AS bit) AS success,''DATASET_INPUT_INVALID'' AS code; RETURN; END;       
  BEGIN TRY       
   BEGIN TRANSACTION;
   DECLARE @DSID uniqueidentifier=NEWID();       
   INSERT INTO [CoreAnalytics].studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)       
   VALUES(@DSID,@DSName,@DSDescription,@DSConnection,@DSSchema,@DSTable,@DSType,''DIRECT'',''LIVE'',CONVERT(nvarchar(100),@DSUser));
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO [CoreAnalytics].studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''DATASET'',@DSID,@DSUser);
    INSERT INTO [CoreAnalytics].studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@DSUser,''DATASET'',@DSID,''REGISTER'',@DSUser);
   COMMIT TRANSACTION;       
   SELECT CAST(1 AS bit) AS success,''DATASET_CREATED'' AS code,CONVERT(varchar(36),@DSID) AS dataset_id; RETURN;       
  END TRY       
  BEGIN CATCH
   IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;       
   SELECT CAST(0 AS bit) AS success, CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN ''DATASET_DUPLICATE'' ELSE ''DATASET_CREATE_FAILED'' END AS code; RETURN;       
  END CATCH;       
 END;       
END;'; SET @new=N'-- DATABASE: run in the CURRENT database which owns dbo.spDashboard (may not be CoreAnalytics).  
-- Backup existing definition first. SQL 027 security bridge must be installed in [CoreAnalytics].  
-- Generated from user-provided spDashboard 2026-11-12; entire existing body preserved.  
-- DO NOT run on production until verified in DEV.  
-- Run in the database that currently owns dbo.spDashboard.   
    
ALTER PROCEDURE [dbo].[spDashboard]               
(               
    @Mode varchar(100) = '''',               
    @HealthcareID varchar(3) = '''',               
    @Periode varchar(7) = '''',               
    @Payload nvarchar(max) = ''''               
)               
AS               
               
SET NOCOUNT ON;  
  
-- PHASE 2D Ownership & Sharing: signed BEAM -> CoreAnalytics RPC.  
-- All previous spDashboard dispatchers and modes remain unchanged.  
IF @Mode = ''CoreStudioObjectAccess''  
BEGIN  
    EXEC [CoreAnalytics].studio.spObjectAccessRpc @Payload = @Payload;  
    RETURN;  
END;  
   
IF @Mode = ''CoreStudioScheduler'' BEGIN EXEC [CoreAnalytics].studio.spSchedulerControl @Payload=@Payload; RETURN; END;   
   
IF @Mode = ''CoreStudioStoredDatasetCreate'' BEGIN EXEC [CoreAnalytics].studio.spStoredDatasetCreate @Payload=@Payload; RETURN; END;   
IF @Mode = ''CoreStudioIngest''   
BEGIN EXEC [CoreAnalytics].studio.spDatasetIngestControl @Payload = @Payload; RETURN; END;      
      
/* Chart Library metadata. Requires CoreAnalytics migration 013. */     
IF @Mode = ''CoreStudioCharts''     
BEGIN     
    EXEC [CoreAnalytics].studio.spChartControl @Payload = @Payload;     
    RETURN;     
END;     
     
/* Pipeline metadata/job routing. Requires CoreAnalytics migrations 006 and 007. */      
IF @Mode = ''CoreStudioPipelines''      
BEGIN      
    EXEC [CoreAnalytics].studio.spPipelineControl @Payload=@Payload;      
    RETURN;      
END;      
               
               
DECLARE @CurrentYear INT = YEAR(GETDATE());               
DECLARE @LastYear INT = @CurrentYear - 1;               
DECLARE @PrevYear INT = @CurrentYear - 2;               
DECLARE @SQL NVARCHAR(MAX);               
DECLARE @PeriodeAwal date, @PeriodeAkhir date;               
               
-- =============================================================               
-- CORE PAYLOAD PARSER               
-- Existing dashboard modes tetap memakai HealthcareID / Periode.               
-- Semua mode Core* memakai Payload JSON.               
-- =============================================================               
               
IF LEFT(ISNULL(@Mode,''''), 4) = ''Core''               
   AND ISNULL(@Payload,'''') <> ''''               
   AND ISJSON(@Payload) <> 1               
BEGIN               
    SELECT               
        CAST(0 AS bit) AS success,               
        ''INVALID_PAYLOAD'' AS code,               
        ''Payload JSON tidak valid.'' AS message;               
    RETURN;               
END;               
               
DECLARE               
    @CoreUsername varchar(100) = NULL,               
    @CoreDisplayName varchar(200) = NULL,               
    @CoreEmail varchar(320) = NULL,               
    @CoreEmailNormalized varchar(320) = NULL,               
    @CorePasswordHash varchar(500) = NULL,               
    @CoreUserID uniqueidentifier = NULL,               
               
    @CoreVoiceProfileID uniqueidentifier = NULL,               
    @CoreModelName varchar(100) = NULL,               
    @CoreModelVersion varchar(50) = NULL,               
    @CoreEmbeddingDimension int = NULL,               
    @CoreCentroidEmbeddingBase64 varchar(max) = NULL,               
    @CoreThreshold decimal(8,6) = NULL,               
    @CoreSampleCount int = NULL,               
               
    @CoreSampleNo int = NULL,               
    @CoreStoragePath varchar(500) = NULL,               
    @CoreDurationMs int = NULL,               
    @CoreQualityScore decimal(8,6) = NULL,               
    @CoreEmbeddingBase64 varchar(max) = NULL,               
    @CoreIsValid bit = 1,               
          
    @CoreDetectedUserID uniqueidentifier = NULL,               
    @CoreBestScore decimal(8,6) = NULL,               
    @CoreSecondBestScore decimal(8,6) = NULL,               
    @CoreScoreMargin decimal(8,6) = NULL,               
    @CoreThresholdUsed decimal(8,6) = NULL,               
    @CoreDecision varchar(30) = NULL,               
               
    -- User management list/status               
    @CorePage int = 1,               
    @CorePageSize int = 20,               
    @CoreSearch varchar(320) = NULL,               
    @CoreStatus varchar(20) = ''all'',               
    @CoreSetIsActive bit = NULL,               
           
    -- Authentication security / audit           
   @CoreSessionID uniqueidentifier = NULL,           
    @CoreAuthMethod varchar(20) = NULL,           
    @CoreIsSuccess bit = NULL,           
    @CoreFailureCode varchar(100) = NULL,           
    @CoreFailureDetail nvarchar(1000) = NULL,           
    @CoreIPAddress varchar(45) = NULL,           
    @CoreUserAgent nvarchar(1000) = NULL,           
           
    -- Password reset / OTP           
    @CoreResetIdentifier varchar(320) = NULL,           
    @CoreResetTokenID uniqueidentifier = NULL,           
    @CoreResetTokenHash varchar(128) = NULL,           
    @CoreResetSessionHash varchar(128) = NULL,           
    @CoreResetTTLMinutes int = 10,           
    @CoreResetMaxRequests int = 3,           
    @CoreResetWindowMinutes int = 15,           
    @CoreResetMaxAttempts int = 5,           
                   
    @CoreGroupID uniqueidentifier = NULL,               
    @CoreGroupCode varchar(50) = NULL,               
    @CoreGroupName varchar(150) = NULL,               
    @CoreGroupDescription varchar(500) = NULL;              
               
IF ISJSON(@Payload) = 1               
BEGIN               
    SET @CoreUsername =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Username''))), '''');               
               
    SET @CoreDisplayName =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.DisplayName''))), '''');               
               
               
    SET @CoreEmail =                NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Email''))), '''');               
           
    SET @CoreEmailNormalized =               
        LOWER(@CoreEmail);               
    SET @CorePasswordHash =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.PasswordHash''))), '''');               
               
    SET @CoreUserID =               
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.UserID''));               
               
    SET @CoreVoiceProfileID =               
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.VoiceProfileID''));               
               
    SET @CoreModelName =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ModelName''))), '''');               
               
    SET @CoreModelVersion =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ModelVersion''))), '''');               
               
    SET @CoreEmbeddingDimension =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.EmbeddingDimension''));               
               
    SET @CoreCentroidEmbeddingBase64 =               
        JSON_VALUE(@Payload, ''$.CentroidEmbeddingBase64'');               
               
    SET @CoreThreshold =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.Threshold''));               
               
    SET @CoreSampleCount =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.SampleCount''));               
               
    SET @CoreSampleNo =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.SampleNo''));               
               
    SET @CoreStoragePath =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.StoragePath''))), '''');               
               
    SET @CoreDurationMs =               
        TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.DurationMs''));        
               
    SET @CoreQualityScore =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.QualityScore''));               
               
    SET @CoreEmbeddingBase64 =               
        JSON_VALUE(@Payload, ''$.EmbeddingBase64'');               
               
    SET @CoreIsValid =               
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, ''$.IsValid''), ''true''))               
            WHEN ''true'' THEN 1               
            WHEN ''false'' THEN 0               
            ELSE ISNULL(               
                TRY_CONVERT(bit, JSON_VALUE(@Payload, ''$.IsValid'')),               
                1               
            )               
        END;               
               
    SET @CoreDetectedUserID =               
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.DetectedUserID''));               
               
    SET @CoreBestScore =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.BestScore''));               
               
    SET @CoreSecondBestScore =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.SecondBestScore''));               
               
    SET @CoreScoreMargin =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.ScoreMargin''));               
               
    SET @CoreThresholdUsed =               
        TRY_CONVERT(decimal(8,6), JSON_VALUE(@Payload, ''$.ThresholdUsed''));               
               
    SET @CoreDecision =               
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Decision''))), '''');               
               
    SET @CorePage =               
      ISNULL(               
            TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.Page'')),          
            1               
        );               
               
    SET @CorePageSize =               
        ISNULL(               
            TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.PageSize'')),               
            20               
        );               
               
    SET @CoreSearch =               
        NULLIF(               
            LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Search''))),               
            ''''               
        );               
               
    SET @CoreStatus =               
        LOWER(               
            ISNULL(               
                NULLIF(               
                    LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Status''))),               
                    ''''               
                ),               
                ''all''               
            )               
        );               
               
    SET @CoreSetIsActive =               
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, ''$.IsActive''), ''''))               
            WHEN ''true'' THEN 1               
            WHEN ''false'' THEN 0               
            WHEN ''1'' THEN 1               
            WHEN ''0'' THEN 0               
            ELSE TRY_CONVERT(bit, JSON_VALUE(@Payload, ''$.IsActive''))               
        END;              
    SET @CoreSessionID =           
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.SessionID''));           
           
    SET @CoreAuthMethod =           
        UPPER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.AuthMethod''))), ''''));           
           
    SET @CoreIsSuccess =           
        CASE LOWER(ISNULL(JSON_VALUE(@Payload, ''$.IsSuccess''), ''''))           
            WHEN ''true'' THEN 1           
            WHEN ''false'' THEN 0           
            WHEN ''1'' THEN 1           
            WHEN ''0'' THEN 0           
            ELSE TRY_CONVERT(bit, JSON_VALUE(@Payload, ''$.IsSuccess''))           
        END;           
           
    SET @CoreFailureCode =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.FailureCode''))), '''');           
           
    SET @CoreFailureDetail =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.FailureDetail''))), '''');           
           
    SET @CoreIPAddress =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.IPAddress''))), '''');           
           
    SET @CoreUserAgent =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.UserAgent''))), '''');           
           
    SET @CoreResetIdentifier =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.Identifier''))), '''');           
           
    SET @CoreResetTokenID =           
        TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ResetTokenID''));           
           
    SET @CoreResetTokenHash =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ResetTokenHash''))), '''');           
           
    SET @CoreResetSessionHash =           
        NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ResetSessionHash''))), '''');           
           
    SET @CoreResetTTLMinutes =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetTTLMinutes'')), 10);           
          
    SET @CoreResetMaxRequests =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetMaxRequests'')), 3);           
           
    SET @CoreResetWindowMinutes =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetWindowMinutes'')), 15);           
           
    SET @CoreResetMaxAttempts =           
        ISNULL(TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ResetMaxAttempts'')), 5);           
               
    SET @CoreGroupID =               
        TRY_CONVERT(               
            uniqueidentifier,               
            JSON_VALUE(@Payload, ''$.GroupID'')               
        );               
               
    SET @CoreGroupCode =               
        NULLIF(               
 UPPER(               
                LTRIM(               
                    RTRIM(               
                        JSON_VALUE(@Payload, ''$.GroupCode'')               
                    )               
                )               
            ),               
            ''''               
        );               
               
    SET @CoreGroupName =               
        NULLIF(               
            LTRIM(               
                RTRIM(               
                    JSON_VALUE(@Payload, ''$.GroupName'')               
                )               
            ),               
            ''''               
        );               
               
    SET @CoreGroupDescription =               
        NULLIF(               
            LTRIM(               
                RTRIM(               
                    JSON_VALUE(@Payload, ''$.Description'')               
                )               
            ),               
            ''''               
        );                       
END;               
               
               
-- =============================================================               
-- CORE USER REGISTER               
--               
-- Payload:               
-- {               
--   "Username": "...",               
--   "DisplayName": "...",               
--   "Email": "...",               
--   "PasswordHash": "..."               
-- }               
--               
-- PasswordHash harus sudah dibuat oleh Python menggunakan Argon2.               
-- Plaintext password tidak boleh dikirim ke SQL Server.               
-- =============================================================               
IF @Mode = ''CoreUserRegister''               
BEGIN               
    IF @CoreUsername IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USERNAME_REQUIRED'' AS code,               
               ''Username wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    IF @CoreDisplayName IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''DISPLAY_NAME_REQUIRED'' AS code,               
               ''Display name wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    IF @CoreEmail IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMAIL_REQUIRED'' AS code,               
               ''Email wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    -- Basic email validation. Validasi utama tetap dilakukan di Python.               
    IF @CoreEmail NOT LIKE ''%_@_%._%'' OR LEN(@CoreEmail) > 320               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMAIL_INVALID'' AS code,               
               ''Format email tidak valid.'' AS message;               
        RETURN;               
    END;               
           
    IF @CorePasswordHash IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''PASSWORD_HASH_REQUIRED'' AS code,               
               ''PasswordHash wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    IF EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE username = @CoreUsername               
    )               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USERNAME_EXISTS'' AS code,               
               ''Username sudah digunakan.'' AS message;               
        RETURN;               
    END;               
           
    IF EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE email_normalized = @CoreEmailNormalized               
    )               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMAIL_EXISTS'' AS code,               
               ''Email sudah digunakan.'' AS message;               
        RETURN;               
    END;               
           
    BEGIN TRY               
        DECLARE @NewUserID uniqueidentifier = NEWID();               
           
        INSERT INTO [CoreAnalytics].dbo.core_user               
        (               
            user_id,               
            username,               
         display_name,               
            email,               
            email_normalized,               
            password_hash,               
            is_active,               
            created_at               
        )               
        VALUES               
        (               
            @NewUserID,                      @CoreUsername,               
            @CoreDisplayName,               
            @CoreEmail,               
            @CoreEmailNormalized,               
            @CorePasswordHash,               
            1,               
            SYSDATETIME()               
        );               
           
        SELECT               
            CAST(1 AS bit) AS success,               
            ''USER_REGISTERED'' AS code,               
            ''User registered successfully.'' AS message,               
            CONVERT(varchar(36), @NewUserID) AS user_id,               
            username,               
            display_name,               
            email,               
     is_active,               
            created_at               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @NewUserID;               
           
        RETURN;               
    END TRY               
    BEGIN CATCH               
        -- Unique index remains the final protection against race conditions.               
        IF ERROR_NUMBER() IN (2601, 2627)               
        BEGIN               
            SELECT CAST(0 AS bit) AS success,               
                   ''USER_DUPLICATE'' AS code,               
                   ''Username atau email sudah digunakan.'' AS message;               
            RETURN;    
        END;               
           
        SELECT CAST(0 AS bit) AS success,               
               ''USER_REGISTER_ERROR'' AS code,               
               ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
           
           
-- =============================================================               
-- CORE USER AUTH GET               
-- =============================================================               
IF @Mode = ''CoreUserAuthGet''               
BEGIN               
    IF @CoreUsername IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USERNAME_REQUIRED'' AS code,               
               ''Username wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    SELECT TOP 1               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,               
        username,               
        display_name,               
        email,         
        password_hash,               
        is_active,           
        is_locked,           
        failed_login_count,           
        locked_at,           
        lock_reason,           
        last_failed_login_at               
    FROM [CoreAnalytics].dbo.core_user               
    WHERE username = @CoreUsername;               
               
    RETURN;               
END;               
               
               
-- =============================================================           
-- CORE USER PASSWORD CHANGE           
-- Password verification and hashing are performed in Python.           
-- Payload: { "UserID": "...", "PasswordHash": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserPasswordChange''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CorePasswordHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''PASSWORD_HASH_REQUIRED'' AS code,           
               ''PasswordHash wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_active = 0           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_INACTIVE'' AS code,           
               ''User tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_locked = 1           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''ACCOUNT_LOCKED'' AS code,           
               ''Account terkunci. Hubungi administrator untuk unlock.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        UPDATE [CoreAnalytics].dbo.core_user           
        SET           
            password_hash = @CorePasswordHash,           
            failed_login_count = 0,           
            last_failed_login_at = NULL,           
            updated_at = SYSDATETIME()           
        WHERE user_id = @CoreUserID           
          AND is_active = 1           
          AND is_locked = 0;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            ''PASSWORD_CHANGED'' AS code,           
            ''Password berhasil diubah.'' AS message,           
            CONVERT(varchar(36), user_id) AS user_id,           
            username,           
            updated_at           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID;           
           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        SELECT CAST(0 AS bit) AS success,           
               ''PASSWORD_CHANGE_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET LOOKUP           
-- Server-to-server only. Browser never receives this response directly.           
-- Payload: { "Identifier": "username-or-email" }           
-- =============================================================           
IF @Mode = ''CorePasswordResetLookup''           
BEGIN           
    IF @CoreResetIdentifier IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''IDENTIFIER_REQUIRED'' AS code,           
               ''Username atau email wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    SELECT TOP 1           
        CAST(1 AS bit) AS success,           
        ''RESET_USER_FOUND'' AS code,           
        CONVERT(varchar(36), u.user_id) AS user_id,           
        u.username,           
        u.display_name,           
        u.email,           
        u.is_active,           
        u.is_locked           
    FROM [CoreAnalytics].dbo.core_user u           
    WHERE u.username = @CoreResetIdentifier           
       OR u.email_normalized = LOWER(@CoreResetIdentifier);           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET ISSUE           
-- Stores only HMAC/SHA-256 OTP digest; plaintext OTP never reaches SQL.           
-- =============================================================           
IF @Mode = ''CorePasswordResetIssue''           
BEGIN           
    IF @CoreUserID IS NULL OR @CoreResetTokenHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_REQUEST_INVALID'' AS code,           
               ''Reset request tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreResetTTLMinutes < 5 OR @CoreResetTTLMinutes > 30           
        SET @CoreResetTTLMinutes = 10;           
    IF @CoreResetMaxRequests < 1 OR @CoreResetMaxRequests > 10           
        SET @CoreResetMaxRequests = 3;           
    IF @CoreResetWindowMinutes < 1 OR @CoreResetWindowMinutes > 60           
        SET @CoreResetWindowMinutes = 15;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_active = 1           
          AND is_locked = 0           
          AND NULLIF(LTRIM(RTRIM(email)), '''') IS NOT NULL           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_NOT_ELIGIBLE'' AS code,           
               ''Reset request tidak dapat diproses.'' AS message;           
        RETURN;           
    END;           
           
    IF           
    (           
        SELECT COUNT(*)           
        FROM [CoreAnalytics].dbo.core_password_reset_token           
        WHERE user_id = @CoreUserID           
          AND created_at >= DATEADD(MINUTE, -@CoreResetWindowMinutes, SYSDATETIME())           
    ) >= @CoreResetMaxRequests           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_RATE_LIMITED'' AS code,           
               ''Terlalu banyak permintaan reset password.'' AS message;           
    RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE user_id = @CoreUserID           
          AND used_at IS NULL           
          AND revoked_at IS NULL;           
           
        DECLARE @NewResetTokenID uniqueidentifier = NEWID();           
           
        INSERT INTO [CoreAnalytics].dbo.core_password_reset_token           
        (           
            reset_token_id,           
            user_id,           
            token_hash,           
            expires_at,           
            used_at,           
            revoked_at,           
            created_at,           
            verification_attempts,           
            verified_at,           
            reset_session_hash,           
            request_ip           
        )           
        VALUES           
        (           
            @NewResetTokenID,           
            @CoreUserID,           
            @CoreResetTokenHash,           
     DATEADD(MINUTE, @CoreResetTTLMinutes, SYSDATETIME()),           
            NULL,           
            NULL,           
            SYSDATETIME(),           
            0,           
            NULL,           
            NULL,           
            @CoreIPAddress           
        );           
           
        COMMIT TRANSACTION;           
           
        SELECT CAST(1 AS bit) AS success,           
               ''RESET_CHALLENGE_CREATED'' AS code,           
               CONVERT(varchar(36), @NewResetTokenID) AS reset_token_id;           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_CHALLENGE_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
 END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET VERIFY OTP           
-- Successful verification exchanges OTP for a separate reset-session hash.           
-- =============================================================           
IF @Mode = ''CorePasswordResetVerify''           
BEGIN           
    IF @CoreUserID IS NULL           
       OR @CoreResetTokenHash IS NULL           
       OR @CoreResetSessionHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_CODE_INVALID'' AS code,           
               ''Kode verifikasi tidak valid.'' AS message;           
        RETURN;           
    END;           
          
    IF @CoreResetMaxAttempts < 1 OR @CoreResetMaxAttempts > 10           
        SET @CoreResetMaxAttempts = 5;           
           
    DECLARE @VerifyResetTokenID uniqueidentifier = NULL,           
            @StoredResetTokenHash varchar(128) = NULL,           
            @ResetExpiresAt datetime2(0) = NULL,           
            @ResetAttempts int = 0;           
           
    SELECT TOP 1           
        @VerifyResetTokenID = reset_token_id,           
        @StoredResetTokenHash = token_hash,           
        @ResetExpiresAt = expires_at,           
        @ResetAttempts = ISNULL(verification_attempts, 0)           
    FROM [CoreAnalytics].dbo.core_password_reset_token           
    WHERE user_id = @CoreUserID           
      AND used_at IS NULL           
      AND revoked_at IS NULL           
    ORDER BY created_at DESC;           
           
    IF @VerifyResetTokenID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
            ''RESET_CODE_INVALID'' AS code,           
               ''Kode verifikasi tidak valid atau sudah kedaluwarsa.'' AS message;           
        RETURN;           
    END;           
           
    IF @ResetExpiresAt <= SYSDATETIME()           
    BEGIN           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE reset_token_id = @VerifyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_CODE_EXPIRED'' AS code,           
               ''Kode verifikasi sudah kedaluwarsa.'' AS message;           
        RETURN;           
    END;           
           
    IF @ResetAttempts >= @CoreResetMaxAttempts           
    BEGIN           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = COALESCE(revoked_at, SYSDATETIME())           
        WHERE reset_token_id = @VerifyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_ATTEMPTS_EXCEEDED'' AS code,           
               ''Batas percobaan kode verifikasi telah tercapai.'' AS message;           
        RETURN;           
    END;           
           
    IF @StoredResetTokenHash <> @CoreResetTokenHash           
    BEGIN           
        SET @ResetAttempts = @ResetAttempts + 1;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET verification_attempts = @ResetAttempts,           
            revoked_at = CASE           
                WHEN @ResetAttempts >= @CoreResetMaxAttempts THEN SYSDATETIME()           
                ELSE revoked_at           
            END           
        WHERE reset_token_id = @VerifyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               CASE WHEN @ResetAttempts >= @CoreResetMaxAttempts           
                    THEN ''RESET_ATTEMPTS_EXCEEDED''           
         ELSE ''RESET_CODE_INVALID'' END AS code,           
               CASE WHEN @ResetAttempts >= @CoreResetMaxAttempts           
                    THEN ''Batas percobaan kode verifikasi telah tercapai.''           
                    ELSE ''Kode verifikasi tidak valid.'' END AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_password_reset_token           
SET verified_at = SYSDATETIME(),           
        reset_session_hash = @CoreResetSessionHash           
    WHERE reset_token_id = @VerifyResetTokenID;           
           
    SELECT CAST(1 AS bit) AS success,           
           ''RESET_CODE_VERIFIED'' AS code,           
           CONVERT(varchar(36), @VerifyResetTokenID) AS reset_token_id;           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET APPLY           
-- Atomically validates reset session, changes password, and consumes token.           
-- Locked accounts stay locked; password recovery never bypasses admin unlock.           
-- =============================================================           
IF @Mode = ''CorePasswordResetApply''           
BEGIN           
    IF @CoreResetSessionHash IS NULL OR @CorePasswordHash IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_INVALID'' AS code,           
               ''Reset token tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    DECLARE @ApplyResetTokenID uniqueidentifier = NULL,           
            @ApplyUserID uniqueidentifier = NULL,           
            @ApplyExpiresAt datetime2(0) = NULL;           
           
    SELECT TOP 1           
        @ApplyResetTokenID = r.reset_token_id,           
        @ApplyUserID = r.user_id,           
        @ApplyExpiresAt = r.expires_at           
    FROM [CoreAnalytics].dbo.core_password_reset_token r           
    WHERE r.reset_session_hash = @CoreResetSessionHash            AND r.verified_at IS NOT NULL           
      AND r.used_at IS NULL           
      AND r.revoked_at IS NULL           
    ORDER BY r.created_at DESC;           
           
    IF @ApplyResetTokenID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_INVALID'' AS code,           
               ''Reset token tidak valid atau sudah digunakan.'' AS message;           
        RETURN;           
    END;           
           
    IF @ApplyExpiresAt <= SYSDATETIME()           
    BEGIN           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE reset_token_id = @ApplyResetTokenID;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_EXPIRED'' AS code,           
               ''Reset token sudah kedaluwarsa.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @ApplyUserID           
      AND is_active = 0           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_INACTIVE'' AS code,           
               ''User tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @ApplyUserID           
          AND is_locked = 1           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''ACCOUNT_LOCKED'' AS code,           
               ''Account terkunci. Hubungi administrator untuk unlock.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        UPDATE [CoreAnalytics].dbo.core_user           
        SET password_hash = @CorePasswordHash,           
            failed_login_count = 0,           
            last_failed_login_at = NULL,           
            updated_at = SYSDATETIME()           
        WHERE user_id = @ApplyUserID           
          AND is_active = 1           
          AND is_locked = 0;           
           
        IF @@ROWCOUNT = 0           
        BEGIN           
            ROLLBACK TRANSACTION;           
            SELECT CAST(0 AS bit) AS success,           
                   ''RESET_USER_NOT_AVAILABLE'' AS code,           
                   ''Password tidak dapat direset.'' AS message;           
            RETURN;           
        END;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET used_at = SYSDATETIME()           
        WHERE reset_token_id = @ApplyResetTokenID           
          AND used_at IS NULL           
          AND revoked_at IS NULL;           
           
        UPDATE [CoreAnalytics].dbo.core_password_reset_token           
        SET revoked_at = SYSDATETIME()           
        WHERE user_id = @ApplyUserID           
          AND reset_token_id <> @ApplyResetTokenID           
          AND used_at IS NULL           
          AND revoked_at IS NULL;           
           
        COMMIT TRANSACTION;           
           
        SELECT CAST(1 AS bit) AS success,           
               ''PASSWORD_RESET_SUCCESS'' AS code,           
      ''Password berhasil direset.'' AS message,           
               CONVERT(varchar(36), @ApplyUserID) AS user_id;           
    RETURN;    
    END TRY           
    BEGIN CATCH           
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;           
        SELECT CAST(0 AS bit) AS success,           
               ''PASSWORD_RESET_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE PASSWORD RESET REVOKE           
-- Used when email delivery fails after a challenge was created.           
-- =============================================================           
IF @Mode = ''CorePasswordResetRevoke''           
BEGIN           
    IF @CoreResetTokenID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''RESET_TOKEN_ID_REQUIRED'' AS code,           
               ''ResetTokenID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_password_reset_token           
    SET revoked_at = COALESCE(revoked_at, SYSDATETIME())           
    WHERE reset_token_id = @CoreResetTokenID           
      AND used_at IS NULL;           
           
    SELECT CAST(1 AS bit) AS success,           
           ''RESET_TOKEN_REVOKED'' AS code;           
    RETURN;           
END;           
           
           
-- =============================================================               
-- CORE USER GET               
-- =============================================================               
IF @Mode = ''CoreUserGet''              
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USER_ID_REQUIRED'' AS code,               
               ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    SELECT               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,               
        username,               
        display_name,              
        email,               
        is_active,           
        is_locked,           
        failed_login_count,           
        locked_at,           
        lock_reason,           
        last_failed_login_at,               
        created_at,               
        updated_at               
  FROM [CoreAnalytics].dbo.core_user               
    WHERE user_id = @CoreUserID;               
               
    RETURN;               
END;               
               
               
               
-- =============================================================           
-- CORE USER UPDATE           
-- Management Center profile edit. Username/UserID are immutable here.           
--           
-- Payload:           
-- {           
--   "UserID": "...",           
--   "DisplayName": "...",           
--   "Email": "..."           
-- }           
-- =============================================================           
IF @Mode = ''CoreUserUpdate''           
BEGIN        
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreDisplayName IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''DISPLAY_NAME_REQUIRED'' AS code,           
               ''Display name wajib diisi.'' AS message;           
        RETURN;        END;           
           
    IF LEN(@CoreDisplayName) > 200           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''DISPLAY_NAME_TOO_LONG'' AS code,           
               ''Display name maksimal 200 karakter.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreEmail IS NULL           
   BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''EMAIL_REQUIRED'' AS code,           
               ''Email wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreEmail NOT LIKE ''%_@_%._%'' OR LEN(@CoreEmail) > 320           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''EMAIL_INVALID'' AS code,           
               ''Format email tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE email_normalized = @CoreEmailNormalized           
          AND user_id <> @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''EMAIL_EXISTS'' AS code,           
               ''Email sudah digunakan oleh user lain.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        UPDATE [CoreAnalytics].dbo.core_user           
        SET           
            display_name = @CoreDisplayName,           
            email = @CoreEmail,           
            email_normalized = @CoreEmailNormalized,           
            updated_at = SYSDATETIME()           
        WHERE user_id = @CoreUserID;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            ''USER_UPDATED'' AS code,           
            ''Profil user berhasil diperbarui.'' AS message,           
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,           
            username,           
            display_name,           
            email,           
            is_active,           
           is_locked,           
            failed_login_count,           
            locked_at,           
            lock_reason,           
            last_failed_login_at,           
            created_at,           
            updated_at           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID;           
           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        IF ERROR_NUMBER() IN (2601, 2627)           
       BEGIN           
            SELECT CAST(0 AS bit) AS success,           
                   ''EMAIL_EXISTS'' AS code,           
                   ''Email sudah digunakan oleh user lain.'' AS message;           
            RETURN;           
        END;           
           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_UPDATE_ERROR'' AS code,           
               ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================               
-- CORE USER LIST               
-- Management Center user directory.               
--               
-- Payload:               
-- {               
--   "Page": 1,               
--   "PageSize": 20,               
--   "Search": "ronald",               
--   "Status": "all|active|inactive"               
-- }               
--               
-- Notes:               
-- - Summary cards are global totals, not affected by search/status.               
-- - total_items is affected by search/status.               
-- - Active voice profile is included only as metadata; embeddings are               
--   never returned here.               
-- =============================================================               
IF @Mode = ''CoreUserList''               
BEGIN               
    IF @CorePage IS NULL OR @CorePage < 1               
        SET @CorePage = 1;               
               
    IF @CorePageSize IS NULL OR @CorePageSize < 1               
        SET @CorePageSize = 20;               
               
    IF @CorePageSize > 100               
        SET @CorePageSize = 100;               
               
    IF @CoreStatus NOT IN (''all'', ''active'', ''inactive'')               
 SET @CoreStatus = ''all'';               
               
    DECLARE @CoreOffset int =               
        (@CorePage - 1) * @CorePageSize;               
               
    DECLARE @CoreTotalUsers int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_user               
    );               
               
    DECLARE @CoreActiveUsers int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE is_active = 1               
    );               
               
    DECLARE @CoreInactiveUsers int =               
        @CoreTotalUsers - @CoreActiveUsers;               
               
    DECLARE @CoreVoiceEnrolled int =               
    (               
        SELECT COUNT(DISTINCT u.user_id)               
        FROM [CoreAnalytics].dbo.core_user u               
        INNER JOIN [CoreAnalytics].dbo.core_voice_profile vp               
            ON vp.user_id = u.user_id               
           AND vp.is_active = 1               
           AND vp.centroid_embedding IS NOT NULL               
    );               
      
    DECLARE @CoreFilteredCount int =               
    (          
        SELECT COUNT(*)               
       FROM [CoreAnalytics].dbo.core_user u               
        WHERE               
            (               
                @CoreSearch IS NULL               
                OR u.username LIKE ''%'' + @CoreSearch + ''%''               
                OR u.display_name LIKE ''%'' + @CoreSearch + ''%''               
                OR u.email LIKE ''%'' + @CoreSearch + ''%''               
            )               
            AND               
            (               
                @CoreStatus = ''all''               
                OR (@CoreStatus = ''active'' AND u.is_active = 1)               
                OR (@CoreStatus = ''inactive'' AND u.is_active = 0)               
            )               
    );               
               
    DECLARE @CoreTotalPages int =               
        CASE               
            WHEN @CoreFilteredCount = 0 THEN 0               
            ELSE CEILING(               
                CONVERT(decimal(18,4), @CoreFilteredCount)               
                / CONVERT(decimal(18,4), @CorePageSize)               
            )               
        END;               
               
    -- If requested page is beyond the end, move to the last valid page.               
    IF @CoreTotalPages > 0 AND @CorePage > @CoreTotalPages               
    BEGIN               
        SET @CorePage = @CoreTotalPages;               
        SET @CoreOffset = (@CorePage - 1) * @CorePageSize;               
    END;               
               
    ;WITH FilteredUsers AS               
    (               
        SELECT               
            u.user_id,               
            u.username,               
            u.display_name,               
            u.email,               
            u.is_active,           
            u.is_locked,           
            u.failed_login_count,           
            u.locked_at,           
            u.lock_reason,           
            u.last_failed_login_at,               
            u.created_at,               
            u.updated_at               
        FROM [CoreAnalytics].dbo.core_user u               
        WHERE               
            (               
                @CoreSearch IS NULL               
                OR u.username LIKE ''%'' + @CoreSearch + ''%''               
                OR u.display_name LIKE ''%'' + @CoreSearch + ''%''               
                OR u.email LIKE ''%'' + @CoreSearch + ''%''               
            )               
            AND               
            (               
                @CoreStatus = ''all''               
                OR (@CoreStatus = ''active'' AND u.is_active = 1)               
                OR (@CoreStatus = ''inactive'' AND u.is_active = 0)               
            )               
    )               
    SELECT               
        CAST(1 AS bit) AS success,               
        ''USER_LIST'' AS code,               
               
        @CorePage AS page,               
        @CorePageSize AS page_size,               
        @CoreFilteredCount AS total_items,               
        @CoreTotalPages AS total_pages,               
               
        @CoreTotalUsers AS summary_total_users,               
        @CoreActiveUsers AS summary_active_users,               
        @CoreInactiveUsers AS summary_inactive_users,               
        @CoreVoiceEnrolled AS summary_voice_enrolled,               
               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, u.user_id)) AS user_id,               
        u.username,               
        u.display_name,               
        u.email,               
        u.is_active,           
        u.is_locked,           
        u.failed_login_count,           
        u.locked_at,           
        u.lock_reason,           
        u.last_failed_login_at,               
        u.created_at,               
        u.updated_at,               
               
        CASE               
            WHEN vp.voice_profile_id IS NOT NULL THEN CAST(1 AS bit)               
            ELSE CAST(0 AS bit)               
        END AS voice_enrolled,               
         
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id))               
            AS voice_profile_id,               
               
        vp.sample_count AS voice_sample_count,               
        vp.threshold AS voice_threshold,               
        vp.model_name AS voice_model_name,               
        vp.model_version AS voice_model_version               
               
    FROM FilteredUsers u               
               
    OUTER APPLY               
    (               
        SELECT TOP 1               
            x.voice_profile_id,               
       x.sample_count,               
          x.threshold,               
            x.model_name,               
            x.model_version               
        FROM [CoreAnalytics].dbo.core_voice_profile x               
        WHERE x.user_id = u.user_id               
          AND x.is_active = 1               
          AND x.centroid_embedding IS NOT NULL               
        ORDER BY x.created_at DESC               
    ) vp               
               
    ORDER BY               
        u.is_active DESC,               
        u.display_name ASC,               
        u.username ASC               
               
    OFFSET @CoreOffset ROWS               
    FETCH NEXT @CorePageSize ROWS ONLY;               
               
    -- BEAM/data adapters often represent an empty result as data=[].               
    -- Emit one metadata row when the filter has no records so Python can               
    -- still return correct pagination + summary.               
    IF @CoreFilteredCount = 0               
    BEGIN               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''USER_LIST'' AS code,               
               
            1 AS page,              
            @CorePageSize AS page_size,               
            0 AS total_items,           
            0 AS total_pages,               
               
            @CoreTotalUsers AS summary_total_users,               
            @CoreActiveUsers AS summary_active_users,        
            @CoreInactiveUsers AS summary_inactive_users,               
            @CoreVoiceEnrolled AS summary_voice_enrolled,               
               
            CAST(NULL AS varchar(36)) AS user_id,               
            CAST(NULL AS varchar(100)) AS username,               
            CAST(NULL AS varchar(200)) AS display_name,               
            CAST(NULL AS varchar(320)) AS email,               
            CAST(NULL AS bit) AS is_active,           
            CAST(NULL AS bit) AS is_locked,           
            CAST(NULL AS int) AS failed_login_count,           
            CAST(NULL AS datetime2) AS locked_at,           
            CAST(NULL AS varchar(100)) AS lock_reason,           
            CAST(NULL AS datetime2) AS last_failed_login_at,               
            CAST(NULL AS datetime2) AS created_at,               
            CAST(NULL AS datetime2) AS updated_at,               
            CAST(0 AS bit) AS voice_enrolled,               
            CAST(NULL AS varchar(36)) AS voice_profile_id,               
            CAST(NULL AS int) AS voice_sample_count,               
            CAST(NULL AS decimal(8,6)) AS voice_threshold,               
            CAST(NULL AS varchar(100)) AS voice_model_name,               
            CAST(NULL AS varchar(50)) AS voice_model_version;               
    END;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE USER SET ACTIVE               
--               
-- Payload:        -- {               
--   "UserID": "...",               
--   "IsActive": true|false               
-- }               
-- =============================================================               
IF @Mode = ''CoreUserSetActive''               
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''USER_ID_REQUIRED'' AS code,               
            ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreSetIsActive IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''IS_ACTIVE_REQUIRED'' AS code,               
            ''IsActive wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @CoreUserID               
    )               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''USER_NOT_FOUND'' AS code,               
            ''User tidak ditemukan.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
        UPDATE [CoreAnalytics].dbo.core_user               
        SET               
            is_active = @CoreSetIsActive,               
            updated_at = SYSDATETIME()               
        WHERE user_id = @CoreUserID;               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''USER_ACTIVATED''               
                ELSE ''USER_DEACTIVATED''               
            END AS code,               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''User berhasil diaktifkan.''               
                ELSE ''User berhasil dinonaktifkan.''               
            END AS message,               
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,        
            username,               
            display_name,               
            email,               
            is_active,           
            is_locked,           
            failed_login_count,           
            locked_at,           
            lock_reason,               
            created_at,               
            updated_at               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @CoreUserID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''USER_STATUS_UPDATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================           
-- CORE USER LOGIN FAILURE           
-- Atomic consecutive-failure counter. Third failure locks the account.           
-- Account never auto-unlocks; only CoreUserUnlock resets it.           
-- Payload: { "UserID": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserLoginFailure''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        DECLARE @LoginFailureCount int;           
        DECLARE @LoginAlreadyLocked bit;           
           
        SELECT           
            @LoginFailureCount = failed_login_count,           
            @LoginAlreadyLocked = is_locked           
        FROM [CoreAnalytics].dbo.core_user WITH (UPDLOCK, HOLDLOCK)           
        WHERE user_id = @CoreUserID;           
           
        IF @LoginFailureCount IS NULL           
        BEGIN           
            ROLLBACK TRANSACTION;           
            SELECT CAST(0 AS bit) AS success,           
                   ''USER_NOT_FOUND'' AS code,           
                   ''User tidak ditemukan.'' AS message;           
            RETURN;           
        END;           
           
        IF @LoginAlreadyLocked = 0           
        BEGIN           
            SET @LoginFailureCount = ISNULL(@LoginFailureCount, 0) + 1;           
           
            UPDATE [CoreAnalytics].dbo.core_user           
            SET           
                failed_login_count = @LoginFailureCount,           
                last_failed_login_at = SYSDATETIME(),           
                is_locked = CASE WHEN @LoginFailureCount >= 3 THEN 1 ELSE 0 END,           
                locked_at = CASE           
                    WHEN @LoginFailureCount >= 3 THEN SYSDATETIME()           
                    ELSE locked_at           
                END,           
                lock_reason = CASE           
                    WHEN @LoginFailureCount >= 3 THEN ''MAX_FAILED_PASSWORD_ATTEMPTS''           
                    ELSE lock_reason           
                END,           
                updated_at = SYSDATETIME()           
            WHERE user_id = @CoreUserID;           
        END;           
           
        COMMIT TRANSACTION;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            CASE WHEN is_locked = 1 THEN ''ACCOUNT_LOCKED'' ELSE ''LOGIN_FAILURE_RECORDED'' END AS code,           
            CONVERT(varchar(36), user_id) AS user_id,           
            username,           
            is_active,           
            is_locked,           
            failed_login_count,           
            locked_at,           
            lock_reason,           
            last_failed_login_at           
   FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID;           
           
        RETURN;           
    END TRY           
    BEGIN CATCH           
        IF @@TRANCOUNT > 0           
            ROLLBACK TRANSACTION;           
        THROW;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE USER LOGIN SUCCESS           
-- Reset consecutive failure count. This mode never unlocks an account.           
-- Payload: { "UserID": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserLoginSuccess''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_user           
    SET           
        failed_login_count = 0,           
        last_failed_login_at = NULL,           
        updated_at = SYSDATETIME()           
    WHERE user_id = @CoreUserID           
      AND is_locked = 0;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''LOGIN_SUCCESS_RECORDED'' AS code,           
        CONVERT(varchar(36), user_id) AS user_id,           
        username,           
        is_active,           
        is_locked,           
        failed_login_count,           
        locked_at,           
        lock_reason           
    FROM [CoreAnalytics].dbo.core_user           
    WHERE user_id = @CoreUserID;           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE USER UNLOCK           
-- Management Center / administrator action only.           
-- Payload: { "UserID": "..." }           
-- =============================================================           
IF @Mode = ''CoreUserUnlock''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_ID_REQUIRED'' AS code,           
               ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''USER_NOT_FOUND'' AS code,           
               ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    UPDATE [CoreAnalytics].dbo.core_user           
    SET           
        failed_login_count = 0,           
        is_locked = 0,        
        locked_at = NULL,           
        lock_reason = NULL,           
        last_failed_login_at = NULL,           
        updated_at = SYSDATETIME()           
    WHERE user_id = @CoreUserID;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''USER_UNLOCKED'' AS code,           
        ''Account berhasil di-unlock.'' AS message,           
        CONVERT(varchar(36), user_id) AS user_id,           
        username,           
        display_name,           
        email,           
        is_active,           
        is_locked,         
        failed_login_count,           
        locked_at,           
        lock_reason,           
        created_at,           
        updated_at           
    FROM [CoreAnalytics].dbo.core_user           
    WHERE user_id = @CoreUserID;           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE LOGIN LOG ADD           
-- Global PASSWORD / VOICE login audit. Never send passwords or tokens.           
-- =============================================================           
IF @Mode = ''CoreLoginLogAdd''           
BEGIN           
    IF @CoreAuthMethod NOT IN (''PASSWORD'', ''VOICE'')           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''AUTH_METHOD_INVALID'' AS code,           
               ''AuthMethod harus PASSWORD atau VOICE.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreIsSuccess IS NULL           
    BEGIN           
        SELECT CAST(0 AS bit) AS success,           
               ''IS_SUCCESS_REQUIRED'' AS code,           
               ''IsSuccess wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF @CoreIsSuccess = 1           
    BEGIN           
        SET @CoreFailureCode = NULL;           
        SET @CoreFailureDetail = NULL;           
    END;           
           
    INSERT INTO [CoreAnalytics].dbo.core_user_login_log           
    (           
        user_id,           
        session_id,           
        username,           
        auth_method,           
        is_success,           
        failure_code,           
        failure_detail,           
        ip_address,           
        user_agent,           
        created_at           
    )           
    VALUES           
    (           
        @CoreUserID,           
        @CoreSessionID,           
        @CoreUsername,           
        @CoreAuthMethod,           
        @CoreIsSuccess,           
        @CoreFailureCode,           
        @CoreFailureDetail,           
        @CoreIPAddress,           
        @CoreUserAgent,           
        SYSDATETIME()           
    );           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''LOGIN_LOG_ADDED'' AS code,           
        CONVERT(bigint, SCOPE_IDENTITY()) AS login_log_id;           
           
    RETURN;           
END;           
           
           
-- =============================================================               
-- CORE VOICE PROFILE CREATE               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileCreate''               
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USER_ID_REQUIRED'' AS code,               
            ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_user               
        WHERE user_id = @CoreUserID               
          AND is_active = 1               
    )               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''USER_NOT_FOUND'' AS code,               
               ''User tidak ditemukan atau tidak aktif.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreEmbeddingDimension IS NULL OR @CoreEmbeddingDimension <= 0               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMBEDDING_DIMENSION_REQUIRED'' AS code,               
               ''EmbeddingDimension wajib diisi.'' AS message;           
        RETURN;               
    END;               
               
    BEGIN TRY        
        UPDATE [CoreAnalytics].dbo.core_voice_profile               
        SET               
            is_active = 0,               
            updated_at = SYSDATETIME()               
        WHERE user_id = @CoreUserID               
          AND is_active = 1;               
               
        DECLARE @NewVoiceProfileID uniqueidentifier = NEWID();               
               
        INSERT INTO [CoreAnalytics].dbo.core_voice_profile               
        (               
            voice_profile_id,               
            user_id,     
            model_name,               
            model_version,               
            embedding_dimension,               
            centroid_embedding,               
            threshold,               
            sample_count,               
            is_active,               
            created_at               
        )               
        VALUES               
        (               
            @NewVoiceProfileID,               
            @CoreUserID,               
            ISNULL(@CoreModelName, ''SpeechBrain-SpeakerRecognition''),               
            @CoreModelVersion,               
            @CoreEmbeddingDimension,               
            NULL,               
            @CoreThreshold,               
            0,               
            1,               
            SYSDATETIME()               
        );               
               
        SELECT              
            CAST(1 AS bit) AS success,               
            ''VOICE_PROFILE_CREATED'' AS code,               
            ''Voice profile created.'' AS message,               
            CONVERT(varchar(36), @NewVoiceProfileID) AS voice_profile_id,               
            CONVERT(varchar(36), @CoreUserID) AS user_id,               
            model_name,               
            model_version,               
            embedding_dimension,               
            threshold,               
            sample_count,               
            is_active,               
            created_at               
        FROM [CoreAnalytics].dbo.core_voice_profile               
        WHERE voice_profile_id = @NewVoiceProfileID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_CREATE_ERROR'' AS code,               
     ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================               
-- CORE VOICE SAMPLE ADD               
-- =============================================================               
IF @Mode = ''CoreVoiceSampleAdd''               
BEGIN               
    IF @CoreVoiceProfileID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_ID_REQUIRED'' AS code,               
               ''VoiceProfileID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreSampleNo IS NULL OR @CoreSampleNo <= 0               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''SAMPLE_NO_REQUIRED'' AS code,               
               ''SampleNo wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF ISNULL(@CoreEmbeddingBase64, '''') = ''''               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''EMBEDDING_REQUIRED'' AS code,               
               ''EmbeddingBase64 wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
        DECLARE @EmbeddingBinary varbinary(max);               
               
        SET @EmbeddingBinary =              
            CAST(N'''' AS xml).value               
            (               
                ''xs:base64Binary(sql:variable("@CoreEmbeddingBase64"))'',               
                ''varbinary(max)''               
            );               
               
        DECLARE @NewVoiceSampleID uniqueidentifier = NEWID();               
               
        INSERT INTO [CoreAnalytics].dbo.core_voice_sample               
        (               
            voice_sample_id,               
            voice_profile_id,               
            sample_no,               
            storage_path,               
            duration_ms,               
            quality_score,               
            embedding,               
            is_valid,              
            created_at               
        )               
        VALUES               
        (               
            @NewVoiceSampleID,               
            @CoreVoiceProfileID,               
            @CoreSampleNo,               
            @CoreStoragePath,               
            @CoreDurationMs,               
            @CoreQualityScore,               
            @EmbeddingBinary,               
            ISNULL(@CoreIsValid, 1),               
            SYSDATETIME()               
        );               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''VOICE_SAMPLE_ADDED'' AS code,               
            ''Voice sample saved.'' AS message,               
            CONVERT(varchar(36), @NewVoiceSampleID) AS voice_sample_id,               
            CONVERT(varchar(36), @CoreVoiceProfileID) AS voice_profile_id,               
            sample_no,               
            storage_path,               
            duration_ms,               
            quality_score,               
            is_valid,               
            created_at               
        FROM [CoreAnalytics].dbo.core_voice_sample               
        WHERE voice_sample_id = @NewVoiceSampleID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_SAMPLE_ADD_ERROR'' AS code,               
               ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================      
-- CORE VOICE PROFILE FINALIZE               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileFinalize''               
BEGIN               
    IF @CoreVoiceProfileID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_ID_REQUIRED'' AS code,               
               ''VoiceProfileID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF ISNULL(@CoreCentroidEmbeddingBase64, '''') = ''''               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''CENTROID_REQUIRED'' AS code,               
               ''CentroidEmbeddingBase64 wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
        DECLARE @CentroidEmbeddingBinary varbinary(max);               
               
        SET @CentroidEmbeddingBinary =               
            CAST(N'''' AS xml).value               
            (               
                ''xs:base64Binary(sql:variable("@CoreCentroidEmbeddingBase64"))'',               
                ''varbinary(max)''               
            );               
               
        UPDATE [CoreAnalytics].dbo.core_voice_profile               
        SET               
            centroid_embedding = @CentroidEmbeddingBinary,               
     sample_count = ISNULL               
            (               
                @CoreSampleCount,               
                (               
                    SELECT COUNT(*)               
                    FROM [CoreAnalytics].dbo.core_voice_sample s               
                    WHERE s.voice_profile_id = @CoreVoiceProfileID               
                      AND s.is_valid = 1               
                )               
            ),               
            threshold = COALESCE(@CoreThreshold, threshold),               
            updated_at = SYSDATETIME()               
        WHERE voice_profile_id = @CoreVoiceProfileID               
          AND is_active = 1;               
               
        IF @@ROWCOUNT = 0               
        BEGIN               
          SELECT CAST(0 AS bit) AS success,               
                   ''VOICE_PROFILE_NOT_FOUND'' AS code,               
  ''Voice profile aktif tidak ditemukan.'' AS message;               
            RETURN;               
       END;               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''VOICE_PROFILE_FINALIZED'' AS code,               
            ''Voice profile finalized.'' AS message,               
            CONVERT(varchar(36), @CoreVoiceProfileID) AS voice_profile_id,               
            CONVERT(varchar(36), CONVERT(uniqueidentifier, user_id)) AS user_id,               
            model_name,               
            model_version,               
            embedding_dimension,               
            threshold,               
            sample_count,               
            is_active,               
            updated_at               
        FROM [CoreAnalytics].dbo.core_voice_profile               
        WHERE voice_profile_id = @CoreVoiceProfileID;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_FINALIZE_ERROR'' AS code,               
               ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================               
-- CORE VOICE PROFILE ACTIVE               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileActive''               
BEGIN               
    SELECT               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id)) AS voice_profile_id,               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.user_id)) AS user_id,               
        u.username,               
        u.display_name,               
        vp.model_name,               
        vp.model_version,               
        vp.embedding_dimension,               
        CAST(N'''' AS xml).value        
        (               
            ''xs:base64Binary(sql:column("vp.centroid_embedding"))'',                     ''varchar(max)''               
        ) AS centroid_embedding_base64,               
        vp.threshold,               
        vp.sample_count               
    FROM [CoreAnalytics].dbo.core_voice_profile vp               
    INNER JOIN [CoreAnalytics].dbo.core_user u               
        ON u.user_id = vp.user_id               
    WHERE vp.is_active = 1               
      AND u.is_active = 1               
      AND vp.centroid_embedding IS NOT NULL;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE VOICE PROFILE GET               
-- =============================================================               
IF @Mode = ''CoreVoiceProfileGet''               
BEGIN               
    IF @CoreUserID IS NULL               
    BEGIN               
    SELECT CAST(0 AS bit) AS success,               
               ''USER_ID_REQUIRED'' AS code,               
               ''UserID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    SELECT TOP 1               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.voice_profile_id)) AS voice_profile_id,               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, vp.user_id)) AS user_id,               
        u.username,               
        u.display_name,               
        vp.model_name,               
        vp.model_version,               
        vp.embedding_dimension,               
        CAST(N'''' AS xml).value               
        (               
            ''xs:base64Binary(sql:column("vp.centroid_embedding"))'',               
            ''varchar(max)''               
        ) AS centroid_embedding_base64,               
        vp.threshold,               
        vp.sample_count,               
        vp.is_active,               
        vp.created_at,        
        vp.updated_at               
    FROM [CoreAnalytics].dbo.core_voice_profile vp               
    INNER JOIN [CoreAnalytics].dbo.core_user u               
        ON u.user_id = vp.user_id               
    WHERE vp.user_id = @CoreUserID               
      AND vp.is_active = 1               
    ORDER BY vp.created_at DESC;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE VOICE SAMPLE LIST               
-- =============================================================               
IF @Mode = ''CoreVoiceSampleList''               
BEGIN               
    IF @CoreVoiceProfileID IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_PROFILE_ID_REQUIRED'' AS code,               
               ''VoiceProfileID wajib diisi.'' AS message;               
 RETURN;               
    END;               
               
    SELECT               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, s.voice_sample_id)) AS voice_sample_id,               
        CONVERT(varchar(36), CONVERT(uniqueidentifier, s.voice_profile_id)) AS voice_profile_id,               
        s.sample_no,               
        s.storage_path,               
        s.duration_ms,               
        s.quality_score,               
        CAST(N'''' AS xml).value               
        (               
            ''xs:base64Binary(sql:column("s.embedding"))'',               
            ''varchar(max)''               
        ) AS embedding_base64,               
        s.is_valid,               
        s.created_at               
    FROM [CoreAnalytics].dbo.core_voice_sample s               
    WHERE s.voice_profile_id = @CoreVoiceProfileID               
    ORDER BY s.sample_no;               
               
    RETURN;               
END;               
               
               
-- =============================================================               
-- CORE VOICE AUTH LOG ADD               
-- =============================================================               
IF @Mode = ''CoreVoiceAuthLogAdd''      
BEGIN               
    IF @CoreDecision IS NULL               
    BEGIN               
        SELECT CAST(0 AS bit) AS success,               
               ''DECISION_REQUIRED'' AS code,               
               ''Decision wajib diisi.'' AS message;               
        RETURN;               
    END;               
           
    BEGIN TRY               
        DECLARE @NewVoiceAuthLogID uniqueidentifier = NEWID();               
               
        INSERT INTO [CoreAnalytics].dbo.core_voice_auth_log               
        (               
            voice_auth_log_id,               
            detected_user_id,               
            best_score,               
            second_best_score,               
     score_margin,               
            threshold_used,               
            decision,               
            model_name,               
            created_at               
        )               
        VALUES               
        (               
            @NewVoiceAuthLogID,               
            @CoreDetectedUserID,               
            @CoreBestScore,               
            @CoreSecondBestScore,               
            @CoreScoreMargin,               
      @CoreThresholdUsed,               
            @CoreDecision,               
            @CoreModelName,               
            SYSDATETIME()               
        );           
           
        -- Mirror every biometric attempt into the global login audit.           
        -- Voice failures do NOT increment password lock counters because an           
        -- unknown/ambiguous voice cannot safely be attributed to one account.           
        DECLARE @VoiceLoginUsername varchar(100) = NULL;           
           
        SELECT @VoiceLoginUsername = username           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreDetectedUserID;           
           
        INSERT INTO [CoreAnalytics].dbo.core_user_login_log           
        (           
            user_id,           
            session_id,           
            username,           
            auth_method,           
            is_success,           
failure_code,           
            failure_detail,           
            ip_address,           
            user_agent,           
            created_at           
        )           
        VALUES           
        (           
            @CoreDetectedUserID,           
            NULL,           
            @VoiceLoginUsername,           
            ''VOICE'',           
            CASE WHEN @CoreDecision = ''VERIFIED'' THEN 1 ELSE 0 END,           
            CASE WHEN @CoreDecision = ''VERIFIED'' THEN NULL ELSE @CoreDecision END,           
            CASE WHEN @CoreDecision = ''VERIFIED'' THEN NULL ELSE ''Voice authentication was not verified.'' END,           
            @CoreIPAddress,           
            @CoreUserAgent,           
            SYSDATETIME()           
        );               
               
        SELECT               
            CAST(1 AS bit) AS success,               
''VOICE_AUTH_LOG_ADDED'' AS code,               
            ''Voice auth log saved.'' AS message,               
            CONVERT(varchar(36), @NewVoiceAuthLogID) AS voice_auth_log_id;               
               
        RETURN;               
    END TRY               
    BEGIN CATCH               
        SELECT CAST(0 AS bit) AS success,               
               ''VOICE_AUTH_LOG_ERROR'' AS code,               
             ERROR_MESSAGE() AS message;               
        RETURN;               
    END CATCH;               
END;               
               
               
-- =============================================================               
-- EXISTING DASHBOARD MODES BELOW - UNCHANGED               
-- =============================================================               
               
if @Mode = ''TrenPendapatan''                            
begin                            
    SELECT HealthcareID,                            
        MonthNo,                            
        SUM(TargetAmount) AS Target                       
    into #TempTarget                       
    FROM DB_Finance_Target_Monthly                       
    WHERE YearNo = 2026                       
        and criteria = ''REVENUE''                            
        and left(healthcareID,1) <> ''O''                            
        and (HealthcareID = @healthcareId or @healthcareId = '''')                          
    GROUP BY HealthcareID, MonthNo                            
                       
    SELECT a.HealthcareID,                            
        a.MonthNo,                            
        DATENAME(month, MAX(TransactionDate)) AS month_name,                            
        SUM(CASE WHEN YearNo = 2026 THEN ActualAmount ELSE 0 END) AS revenue_2026,                            
        SUM(CASE WHEN YearNo = 2025 THEN ActualAmount ELSE 0 END) AS revenue_2025,                       
        isnull(b.Target,0) as Target                       
    into #Rekap                       
    FROM DB_Finance_Actual a                       
    left join #TempTarget b                       
        on b.HealthcareID = a.HealthcareID                       
        and b.monthNo = a.MonthNo                       
    WHERE a.YearNo IN (2025, 2026)                            
        and a.criteria = ''REVENUE''                            
        and left(a.healthcareID,1) <> ''O''                            
        and (a.HealthcareID = @healthcareId or @healthcareId = '''')                    
    GROUP BY a.MonthNo, Target, a.HealthcareID                            
    ORDER BY a.MonthNo;                            
                       
    select MonthNo, month_name, sum(revenue_2026) as revenue_2026,                        
        sum(revenue_2025) as revenue_2025, sum(Target) as Target                       
    from #Rekap                       
    group by MonthNo, month_name                       
end                            
                   
if @Mode = ''PerbandinganLayanan''                      
begin                            
    SELECT                             
        Criteria AS category,                            
        SUM(CASE WHEN Chanel = ''Clinic'' THEN ActualAmount ELSE 0 END) AS clinic,                            
        SUM(CASE WHEN Chanel = ''Hospital'' THEN ActualAmount ELSE 0 END) AS rs                            
    FROM DB_Finance_Actual                            
    WHERE YearNo = 2026                            
    and (HealthcareID = @healthcareId or @healthcareId = '''')                          
    GROUP BY Criteria;                            
end                            
                   
if @Mode = ''performalayanan''                            
begin                            
    SELECT                             
        ChartOfAccountName AS category,                            
        SUM(CASE WHEN HealthcareID = ''001'' THEN ActualAmount ELSE 0 END) AS menteng,                            
        SUM(CASE WHEN HealthcareID = ''002'' THEN ActualAmount ELSE 0 END) AS kedoya                            
    FROM DB_Finance_Actual                            
    WHERE healthcareID in(''001'',''002'') AND YearNo = 2026                            
    and (HealthcareID = @healthcareId or @healthcareId = '''')                          
    GROUP BY ChartOfAccountName;                            
end                            
                   
if @Mode = ''PertumbuhanPasien''                            
begin              
    SELECT              
        CAST(YearNo AS VARCHAR) AS year,                             
        SUM(ActualQuantity) AS totalPasien                            
    FROM DB_Finance_Actual                            
    WHERE YearNo BETWEEN 2022 AND 2026                            
        and (HealthcareID = @healthcareId or @healthcareId = '''')                       
       and HealthcareID not in(''997'',''107'',''015'')          
    GROUP BY YearNo                            
    ORDER BY YearNo ASC;                            
end                           
                          
if @Mode = ''healthcare''                            
begin                            
    SELECT                             
        healthcareID, healthcareName                           
    FROM JEC_CORP.dbo.healthcare                    
    where left(healthcareID,1) <> ''O''                     
    order by HealthcareName                   
end         
                          
if @Mode = ''exumrev''                          
begin                          
    SET @SQL = ''                          
    SELECT healthcareID,                          
        HealthcareName AS [UNIT BISNIS],                          
        SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Current Year],                          
        SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@LastYear AS VARCHAR) + ''],                          
        SUM(CASE WHEN YearNo = '' + CAST(@PrevYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@PrevYear AS VARCHAR) + ''],                          
        CASE                           
            WHEN SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) = 0 THEN 0                          
            ELSE (SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) * 100.0) /                           
                SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END)                           
        END AS ['' + CAST(@CurrentYear AS VARCHAR) + '' vs '' + CAST(@LastYear AS VARCHAR) + '']                          
    FROM DB_Finance_Exsum                          
    WHERE Category = ''''REV''''                          
        and criteria = ''''Revenue''''                          
        and left(HealthcareID,1) <> ''''O''''                          
 and (healthcareID = '''''' + @HealthcareID + '''''' or isnull('''''' + @HealthcareID + '''''','''''''') = '''''''')                          
        and HealthcareName is not null                          
    GROUP BY HealthcareName, healthcareID                          
    ORDER BY healthcareID ASC;'';                 
                          
    EXEC sp_executesql @SQL;                   
end                          
                          
IF @Mode = ''exummaterial''             
BEGIN             
    SET @SQL = ''             
    SELECT             
        HealthcareID,             
        HealthcareName AS [UNIT BISNIS],             
             
        SUM(             
            CASE             
                WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + ''             
         THEN ISNULL(ActualAmount, 0)             
                ELSE 0             
            END             
        ) AS [Current Year],             
             
        SUM(             
            CASE             
                WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + ''             
                THEN ISNULL(ActualAmount, 0)             
                ELSE 0             
            END             
        ) AS [Full Year '' + CAST(@LastYear AS VARCHAR) + ''],             
             
        SUM(             
            CASE             
                WHEN YearNo = '' + CAST(@PrevYear AS VARCHAR) + ''             
                THEN ISNULL(ActualAmount, 0)             
                ELSE 0             
            END             
        ) AS [Full Year '' + CAST(@PrevYear AS VARCHAR) + ''],             
             
        CASE        
            WHEN SUM(             
                CASE             
                    WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + ''             
                    THEN ISNULL(ActualAmount, 0)             
                    ELSE 0             
                END             
            ) = 0             
            THEN 0             
             
            ELSE          
                (             
                    SUM(             
                        CASE             
                            WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + ''             
                            THEN ISNULL(ActualAmount, 0)             
                            ELSE 0             
                        END             
                    ) * 100.0             
                )             
                /             
                SUM(             
                    CASE             
                        WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + ''             
                        THEN ISNULL(ActualAmount, 0)             
      ELSE 0       
                    END             
                )             
        END AS ['' + CAST(@CurrentYear AS VARCHAR) + '' vs '' + CAST(@LastYear AS VARCHAR) + '']             
             
    FROM DB_Finance_Actual             
             
    WHERE Criteria = ''''COGS''''             
        AND SubCriteria = ''''Material''''             
        AND LEFT(HealthcareID, 1) <> ''''O''''             
        AND (             
            HealthcareID = '''''' + ISNULL(@HealthcareID, '''') + ''''''             
            OR ISNULL('''''' + ISNULL(@HealthcareID, '''') + '''''', '''''''') = ''''''''             
        )             
        AND HealthcareName IS NOT NULL             
             
    GROUP BY             
        HealthcareName,             
        HealthcareID             
             
    ORDER BY             
        HealthcareID ASC;             
    '';             
             
    EXEC sp_executesql @SQL;             
END                    
                          
if @Mode = ''exumdoctor''                          
begin                          
    SET @SQL = ''                          
    SELECT healthcareID,                          
        HealthcareName AS [UNIT BISNIS],                          
        SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Current Year],                          
        SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@LastYear AS VARCHAR) + ''],                          
        SUM(CASE WHEN YearNo = '' + CAST(@PrevYear AS VARCHAR) + '' THEN Actual ELSE 0 END) AS [Full Year '' + CAST(@PrevYear AS VARCHAR) + ''],                          
        CASE                           
            WHEN SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END) = 0 THEN 0                          
            ELSE (SUM(CASE WHEN YearNo = '' + CAST(@CurrentYear AS VARCHAR) + '' THEN Actual ELSE 0 END) * 100.0) /                 
                SUM(CASE WHEN YearNo = '' + CAST(@LastYear AS VARCHAR) + '' THEN Actual ELSE 0 END)                           
        END AS ['' + CAST(@CurrentYear AS VARCHAR) + '' vs '' + CAST(@LastYear AS VARCHAR) + '']                          
    FROM DB_Finance_Exsum                          
    WHERE Category = ''''REV''''                          
        and criteria = ''''Doctor Fee''''                          
       and left(HealthcareID,1) <> ''''O''''                          
        and (healthcareID = '''''' + @HealthcareID + '''''' or isnull('''''' + @HealthcareID + '''''','''''''') = '''''''')                          
        and HealthcareName is not null                          
    GROUP BY HealthcareName, healthcareID                          
    ORDER BY healthcareID ASC;'';                          
                          
 EXEC sp_executesql @SQL;                      
end                         
                         
if @Mode = ''revsentra''                         
BEGIN                         
    select case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end as Center, sum(ActualAmount) as Amount                         
    into #currentYear                         
    from DB_Finance_Actual                         
    where yearno = year(getdate())                         
    and criteria = ''Revenue''                         
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'''') = '''')                         
    group by case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end                         
                         
    select case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end as Center, sum(ActualAmount) as Amount                         
    into #lastyear                   
    from DB_Finance_Actual                         
    where yearno = year(getdate()) - 1                         
    and criteria = ''Revenue''                         
    and (HealthcareID = @HealthcareID or isnull(@HealthcareID,'''') = '''')                         
    group by case when isnull(center,'''') = '''' then ''OTHERS''                          
        when center = ''OTHER'' then ''OTHERS''                          
        else center end                         
                         
    select                          
        ISNULL(c.Center, l.Center) as Center,                         
        ISNULL(c.Amount, 0) as CurrentYear_Amount,                         
        ISNULL(l.Amount, 0) as LastYear_Amount,                         
        ISNULL(c.Amount, 0) - ISNULL(l.Amount, 0) as Variance_Amount,                         
        CASE                          
            WHEN ISNULL(l.Amount, 0) = 0 THEN NULL                         
            ELSE CAST(                         
                ((CAST(ISNULL(c.Amount, 0) AS float) - CAST(l.Amount AS float)) / CAST(l.Amount AS float)) * 100                          
                AS DECIMAL(10,2))            
        END as Growth_Percentage                         
    from #currentYear c                         
    FULL OUTER JOIN #lastyear l on c.Center = l.Center                         
    order by Center;                         
                         
    drop table #currentYear;                         
    drop table #lastyear;                         
end                       
                      
if @Mode = ''pnl''                      
BEGIN                      
 WITH MasterCOA AS (                     
  SELECT DISTINCT                      
   accountgroupCode, [Level], [Urut], [AccountGroup], [COACode], [COAName]                    
  FROM MacroFinance_PnL                     
  WHERE YearNo = 2026                     
 ),                     
 FilteredPnL AS (                     
  SELECT *                     
  FROM MacroFinance_PnL                     
  WHERE YearNo = 2026                      
   AND (HealthcareID = @HealthcareID OR ISNULL(@HealthcareID, '''') = '''')                     
 )                     
 SELECT                      
  m.accountgroupCode,                      
  m.[Level],                      
  m.[Urut],                      
  m.[AccountGroup],                      
  m.[COACode],                      
  m.[COAName],                      
  ISNULL(SUM(p.[YTD_Last_Year]), 0) AS [YTD_Last_Year],                      
  ISNULL(SUM(p.[YTD_This_Year]), 0) AS [YTD_This_Year],                       
  ISNULL(SUM(p.[januari] + p.[februari] + p.[maret]), 0) AS Q1,                       
  ISNULL(SUM(p.[april] + p.[mei] + p.[juni]), 0) AS Q2,                       
  ISNULL(SUM(p.[juli] + p.[agustus] + p.[September]), 0) AS Q3,                       
  ISNULL(SUM(p.[oktober] + p.[november] + p.[desember]), 0) AS Q4                      
 FROM MasterCOA m                     
 LEFT JOIN FilteredPnL p                      
  ON m.accountgroupCode = p.accountgroupCode                      
  AND m.COACode = p.COACode                     
 where m.AccountGroup <> ''''                     
 GROUP BY                      
  m.accountgroupCode,                      
  m.[Level],                      
  m.[Urut],                      
  m.[AccountGroup],                      
  m.[COACode],                      
  m.[COAName]                      
 ORDER BY                      
  m.accountgroupCode,                      
  m.level,                      
  m.COACode,                      
  m.urut;                     
end                    
                    
if @mode = ''disclaimerPNL''             
BEGIN                    
 SELECT distinct p.HealthcareID, b.HealthcareName, p.TahunPeriodeClosing,              
  p.BulanPeriodeClosing,                     
  p.TanggalPostingTerakhir,       format(p.TanggalTarikData,''dd MMM yyyy HH:MM'') as TanggalTarikData                    
 FROM MacroFinance_PnL p                    
 left join DB_healthcare b                    
  on b.HealthcareID = p.HealthcareID                    
 WHERE YearNo = 2026                      
 order by b.HealthcareName                    
end                   
                   
if @Mode = ''DailyTrackingRevenue''                   
begin                   
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select TransactionDate, RegistrationNo, ItemID, ResponUnitID,                   
        Qty, Amount,                  
        case when ChartOfAccountCode = ''4.01.02.01.01'' then Qty else 0 end as AdmissionQty,                   
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Qty else 0 end as SurgeryQty,                   
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueOT ,                  
        case when ChartOfAccountCode not in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueNonOT,                   
        Amount as TotalRevenue                  
    into #DB_Finance_DailyTransaction                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir;                  
                          
    WITH DaysOfMonth AS (                   
        SELECT 1 AS DayNo                   
        UNION ALL                   
        SELECT DayNo + 1 FROM DaysOfMonth WHERE DayNo < 31                   
    ),                   
    BaseDaily AS (                   
        SELECT                    
            DAY(TransactionDate) AS DayNum,                   
            SUM(ISNULL(AdmissionQty, 0)) AS adm,                   
            SUM(ISNULL(SurgeryQty, 0)) AS sur,                   
            SUM(ISNULL(TotalRevenue, 0)) / 1000000.0 AS rev                   
        FROM #DB_Finance_DailyTransaction                   
        GROUP BY DAY(TransactionDate)                   
    )                   
    SELECT                    
        d.DayNo AS [day],                   
        ISNULL(b.adm, 0) AS [adm],                   
        ISNULL(b.sur, 0) AS [sur],                   
        ISNULL(b.rev, 0) AS [rev]                   
    FROM DaysOfMonth d                   
    LEFT JOIN BaseDaily b ON d.DayNo = b.DayNum                   
    OPTION (MAXRECURSION 32);                  
                  
    drop table #DB_Finance_DailyTransaction                  
end                   
                  
if @Mode = ''MonthlyTrackingRevenue''                    
begin                    
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select TransactionDate, RegistrationNo, ItemID, ResponUnitID,                   
        Qty, Amount,                  
        case when ChartOfAccountCode = ''4.01.02.01.01'' then Qty else 0 end as AdmissionQty,            
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Qty else 0 end as SurgeryQty,                   
        case when ChartOfAccountCode in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueOT ,                  
        case when ChartOfAccountCode not in(''4.01.01.01.01'',''4.01.01.01.02'') then Amount else 0 end as TotalRevenueNonOT,                   
        Amount as TotalRevenue                  
    into #DB_Finance_MonthlyTransaction                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID                  
        and year(TransactionDate) = year(@PeriodeAwal) ;                  
                  
                    
    WITH MonthsOfYear AS (                    
        SELECT 1 AS MonthNo                    
        UNION ALL                    
        SELECT MonthNo + 1 FROM MonthsOfYear WHERE MonthNo < 12                    
    ),                    
    BaseMonthly AS (                    
        SELECT                     
            MONTH(TransactionDate) AS MonthNum,                    
            SUM(ISNULL(AdmissionQty, 0)) AS adm,                    
            SUM(ISNULL(SurgeryQty, 0)) AS sur,                    
            SUM(ISNULL(TotalRevenue, 0)) / 1000000.0 AS rev                    
        FROM #DB_Finance_MonthlyTransaction                    
 GROUP BY MONTH(TransactionDate)                    
    )                    
    SELECT                     
        m.MonthNo AS [monthNo],                    
        ISNULL(b.adm, 0) AS [adm],                    
        ISNULL(b.sur, 0) AS [sur],                     ISNULL(b.rev, 0) AS [rev]                    
    FROM MonthsOfYear m                    
    LEFT JOIN BaseMonthly b ON m.MonthNo = b.MonthNum                    
    ORDER BY m.MonthNo                    
    OPTION (MAXRECURSION 15);                   
end                  
                  
if @mode = ''demographic''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select distinct RegistrationNo, Sex, AgeInYear, IsNewPatient                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir;                  
                  
end                  
                  
if @mode = ''revenueSentra''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select                   
        case when sentra in(''REFRAKTIF'',''PHACO'',''FLACS'',''KATARAK LAIN'',''REFRAKTIF LAINNYA'') then ''REFRAKTIF''                  
             when sentra in(''XTRA LASIK'',''LASIK'',''RLEX SMILE'') then ''LASIK''              
             when sentra in(''GLAUCOMA'') then ''GLAUCOMA''                  
             when sentra in(''OKULOPLASTY'') then ''OCULO''                  
             when sentra in(''STRABISMUS'') then ''CESC''                  
             when sentra in(''VITREORETINA'',''VITREORETINA LAINNYA'') then ''RETINA''                  
        else ''OTHER'' end as Sentra,                   
        sum(Amount) as Amount                  
    from BI_DailyTracking                  
    where chartofaccountcode in (''4.01.01.01.01'',''4.01.01.01.02'')                  
        and HealthcareID = @HealthcareID                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
    group by case when sentra in(''REFRAKTIF'',''PHACO'',''FLACS'',''KATARAK LAIN'',''REFRAKTIF LAINNYA'') then ''REFRAKTIF''                  
             when sentra in(''XTRA LASIK'',''LASIK'',''RLEX SMILE'') then ''LASIK''                  
             when sentra in(''GLAUCOMA'') then ''GLAUCOMA''                  
             when sentra in(''OKULOPLASTY'') then ''OCULO''                  
             when sentra in(''STRABISMUS'') then ''CESC''                  
             when sentra in(''VITREORETINA'',''VITREORETINA LAINNYA'') then ''RETINA''                  
        else ''OTHER'' end                  
                  
end                  
                  
if @mode = ''PerChannelVisits''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end as Kriteria,                  
        Count(Distinct RegistrationNO) as Qty                  
    from BI_DailyTracking                  
    where HealthcareID = @HealthcareID         
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
    group by case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end                  
end                  
                  
if @mode = ''PerChannelSurgery''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
    set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end as Kriteria,                  
        sum(Amount) as Amount                  
    from BI_DailyTracking         
    where chartofaccountcode in (''4.01.01.01.01'',''4.01.01.01.02'')                  
        and transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
        and HealthcareID = @HealthcareID                  
    group by case when GuarantorID = ''BPJS'' then ''BPJS''                  
   when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end                  
end                  
                  
if @mode = ''PerChannelRevenue''                  
BEGIN                  
    set @PeriodeAwal = @Periode + ''-01''                   
 set @PeriodeAKhir = dateadd(month,1,@PeriodeAwal)                   
                  
    select case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end as Kriteria,                  
        sum(Amount) as Amount       from BI_DailyTracking                  
    where transactionDate >= @PeriodeAwal and transactionDate < @PeriodeAkhir                  
        and HealthcareID = @HealthcareID                  
    group by case when GuarantorID = ''BPJS'' then ''BPJS''                  
                when GuarantorID in(''SELF'') then ''Paying P''                  
                Else ''B to B''                  
        end                  
end               
               
IF @Mode = ''CoreGroupCreate''              
BEGIN               
    IF @CoreGroupCode IS NULL           
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_CODE_REQUIRED'' AS code,               
            ''GroupCode wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreGroupName IS NULL               
    BEGIN               
SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NAME_REQUIRED'' AS code,               
            ''GroupName wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_code = @CoreGroupCode               
    )               
    BEGIN               
   SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_CODE_EXISTS'' AS code,               
            ''Group code sudah digunakan.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
               
        DECLARE @NewGroupID uniqueidentifier = NEWID();               
         
        INSERT INTO [CoreAnalytics].dbo.core_group               
        (               
            group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at     
        )               
        VALUES               
        (               
            @NewGroupID,               
            @CoreGroupCode,               
            @CoreGroupName,               
            @CoreGroupDescription,               
            1,               
            SYSDATETIME()               
        );               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''GROUP_CREATED'' AS code,               
            ''Group berhasil dibuat.'' AS message,               
               
            CONVERT(varchar(36), group_id) AS group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at,               
            updated_at               
               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @NewGroupID;               
               
        RETURN;               
               
    END TRY               
    BEGIN CATCH               
               
        SELECT               
            CAST(0 AS bit) AS success,               
   ''GROUP_CREATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
               
        RETURN;               
               
    END CATCH;               
END;               
               
IF @Mode = ''CoreGroupList''               
BEGIN               
    IF @CorePage IS NULL OR @CorePage < 1               
        SET @CorePage = 1;               
               
    IF @CorePageSize IS NULL OR @CorePageSize < 1               
        SET @CorePageSize = 20;               
               
    IF @CorePageSize > 100               
        SET @CorePageSize = 100;               
               
    IF @CoreStatus NOT IN (''all'', ''active'', ''inactive'')               
        SET @CoreStatus = ''all'';               
               
               
    DECLARE @CoreGroupOffset int =               
        (@CorePage - 1) * @CorePageSize;               
               
               
    -- =========================================================               
    -- SUMMARY               
    -- =========================================================               
               
    DECLARE @CoreTotalGroups int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_group               
    );               
               
    DECLARE @CoreActiveGroups int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE is_active = 1               
    );               
               
    DECLARE @CoreInactiveGroups int =               
        @CoreTotalGroups - @CoreActiveGroups;               
               
               
    DECLARE @CoreAssignedUsers int =               
    (               
        SELECT COUNT(DISTINCT ug.user_id)               
        FROM [CoreAnalytics].dbo.core_user_group ug               
               
        INNER JOIN [CoreAnalytics].dbo.core_group g               
            ON g.group_id = ug.group_id               
           AND g.is_active = 1               
               
        INNER JOIN [CoreAnalytics].dbo.core_user u               
            ON u.user_id = ug.user_id               
       AND u.is_active = 1               
    );               
               
               
    -- =========================================================               
    -- FILTERED COUNT               
    -- =========================================================               
               
    DECLARE @CoreGroupFilteredCount int =               
    (               
        SELECT COUNT(*)               
        FROM [CoreAnalytics].dbo.core_group g           
        WHERE               
        (               
            @CoreSearch IS NULL               
            OR g.group_code LIKE ''%'' + @CoreSearch + ''%''               
            OR g.group_name LIKE ''%'' + @CoreSearch + ''%''               
            OR g.description LIKE ''%'' + @CoreSearch + ''%''               
        )               
        AND               
        (               
            @CoreStatus = ''all''               
            OR (@CoreStatus = ''active'' AND g.is_active = 1)               
            OR (@CoreStatus = ''inactive'' AND g.is_active = 0)               
        )               
    );               
               
               
    DECLARE @CoreGroupTotalPages int =               
        CASE               
            WHEN @CoreGroupFilteredCount = 0 THEN 0               
            ELSE CEILING               
            (               
                CONVERT(decimal(18,4), @CoreGroupFilteredCount)               
                /               
                CONVERT(decimal(18,4), @CorePageSize)               
            )               
        END;               
               
               
    IF @CoreGroupTotalPages > 0               
       AND @CorePage > @CoreGroupTotalPages               
    BEGIN               
        SET @CorePage = @CoreGroupTotalPages;               
               
        SET @CoreGroupOffset =               
            (@CorePage - 1) * @CorePageSize;               
    END;               
               
               
    -- =========================================================               
    -- DATA               
    -- =========================================================               
               
    ;WITH FilteredGroups AS               
    (               
        SELECT               
            g.group_id,               
            g.group_code,               
            g.group_name,               
            g.description,               
            g.is_active,               
            g.created_at,               
            g.updated_at               
        FROM [CoreAnalytics].dbo.core_group g               
        WHERE               
        (               
            @CoreSearch IS NULL               
            OR g.group_code LIKE ''%'' + @CoreSearch + ''%''               
            OR g.group_name LIKE ''%'' + @CoreSearch + ''%''               
            OR g.description LIKE ''%'' + @CoreSearch + ''%''               
        )               
        AND               
        (               
            @CoreStatus = ''all''               
            OR (@CoreStatus = ''active'' AND g.is_active = 1)               
            OR (@CoreStatus = ''inactive'' AND g.is_active = 0)               
        )               
    )               
               
   SELECT               
        CAST(1 AS bit) AS success,               
        ''GROUP_LIST'' AS code,               
               
        @CorePage AS page,           
        @CorePageSize AS page_size,               
        @CoreGroupFilteredCount AS total_items,               
        @CoreGroupTotalPages AS total_pages,               
               
        @CoreTotalGroups AS summary_total_groups,               
        @CoreActiveGroups AS summary_active_groups,               
        @CoreInactiveGroups AS summary_inactive_groups,               
        @CoreAssignedUsers AS summary_assigned_users,               
               
        CONVERT(varchar(36), g.group_id) AS group_id,               
        g.group_code,               
        g.group_name,               
        g.description,               
        g.is_active,               
        g.created_at,               
        g.updated_at,               
               
        ISNULL(member.total_users, 0) AS user_count               
               
    FROM FilteredGroups g               
               
    OUTER APPLY               
    (               
        SELECT               
            COUNT(*) AS total_users               
        FROM [CoreAnalytics].dbo.core_user_group ug               
        WHERE ug.group_id = g.group_id               
    ) member               
   
    ORDER BY               
        g.is_active DESC,               
        g.group_name ASC,               
        g.group_code ASC               
               
    OFFSET @CoreGroupOffset ROWS               
    FETCH NEXT @CorePageSize ROWS ONLY;               
               
               
    -- =========================================================               
    -- EMPTY RESULT METADATA               
    -- =========================================================               
               
    IF @CoreGroupFilteredCount = 0               
    BEGIN               
    SELECT               
            CAST(1 AS bit) AS success,               
            ''GROUP_LIST'' AS code,               
               
            1 AS page,               
            @CorePageSize AS page_size,               
            0 AS total_items,               
            0 AS total_pages,               
               
            @CoreTotalGroups AS summary_total_groups,               
            @CoreActiveGroups AS summary_active_groups,               
            @CoreInactiveGroups AS summary_inactive_groups,               
            @CoreAssignedUsers AS summary_assigned_users,               
               
            CAST(NULL AS varchar(36)) AS group_id,               
            CAST(NULL AS varchar(50)) AS group_code,               
            CAST(NULL AS varchar(150)) AS group_name,               
            CAST(NULL AS varchar(500)) AS description,               
            CAST(NULL AS bit) AS is_active,               
            CAST(NULL AS datetime2) AS created_at,               
            CAST(NULL AS datetime2) AS updated_at,               
            CAST(0 AS int) AS user_count;               
    END;               
               
    RETURN;               
END;               
               
IF @Mode = ''CoreGroupGet''               
BEGIN               
    IF @CoreGroupID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_ID_REQUIRED'' AS code,          
            ''GroupID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID               
    )               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NOT_FOUND'' AS code,               
            ''Group tidak ditemukan.'' AS message;               
        RETURN;               
    END;               
               
               
    SELECT               
        CAST(1 AS bit) AS success,               
        ''GROUP_DETAIL'' AS code,               
               
        CONVERT(varchar(36), g.group_id) AS group_id,               
        g.group_code,               
        g.group_name,               
        g.description,               
        g.is_active,               
        g.created_at,               
        g.updated_at,               
               
        (               
            SELECT COUNT(*)               
            FROM [CoreAnalytics].dbo.core_user_group ug               
            WHERE ug.group_id = g.group_id               
        ) AS user_count               
               
    FROM [CoreAnalytics].dbo.core_group g               
    WHERE g.group_id = @CoreGroupID;               
               
    RETURN;               
END;               
               
IF @Mode = ''CoreGroupUpdate''               
BEGIN               
    IF @CoreGroupID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_ID_REQUIRED'' AS code,               
            ''GroupID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreGroupName IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NAME_REQUIRED'' AS code,            
            ''GroupName wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
    (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID               
    )               
    BEGIN               
        SELECT               
  CAST(0 AS bit) AS success,               
            ''GROUP_NOT_FOUND'' AS code,               
            ''Group tidak ditemukan.'' AS message;              
        RETURN;               
    END;               
               
    BEGIN TRY               
               
        UPDATE [CoreAnalytics].dbo.core_group               
        SET               
            group_name = @CoreGroupName,               
            description = @CoreGroupDescription,               
            updated_at = SYSDATETIME()               
        WHERE group_id = @CoreGroupID;               
               
               
        SELECT               
            CAST(1 AS bit) AS success,               
            ''GROUP_UPDATED'' AS code,               
            ''Group berhasil diperbarui.'' AS message,               
               
            CONVERT(varchar(36), group_id) AS group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at,               
            updated_at               
               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID;               
               
        RETURN;               
               
    END TRY               
    BEGIN CATCH               
               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_UPDATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
               
        RETURN;               
              
    END CATCH;               
END;               
               
IF @Mode = ''CoreGroupSetActive''               
BEGIN               
    IF @CoreGroupID IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_ID_REQUIRED'' AS code,               
            ''GroupID wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF @CoreSetIsActive IS NULL               
    BEGIN               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''IS_ACTIVE_REQUIRED'' AS code,               
            ''IsActive wajib diisi.'' AS message;               
        RETURN;               
    END;               
               
    IF NOT EXISTS               
  (               
        SELECT 1               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID               
    )               
    BEGIN           
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_NOT_FOUND'' AS code,               
            ''Group tidak ditemukan.'' AS message;               
        RETURN;               
    END;               
               
    BEGIN TRY               
               
        UPDATE [CoreAnalytics].dbo.core_group               
        SET               
            is_active = @CoreSetIsActive,               
            updated_at = SYSDATETIME()               
        WHERE group_id = @CoreGroupID;               
               
               
        SELECT               
            CAST(1 AS bit) AS success,               
               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''GROUP_ACTIVATED''               
                ELSE ''GROUP_DEACTIVATED''           
            END AS code,               
               
            CASE               
                WHEN @CoreSetIsActive = 1               
                    THEN ''Group berhasil diaktifkan.''               
                ELSE ''Group berhasil dinonaktifkan.''               
            END AS message,               
               
            CONVERT(varchar(36), group_id) AS group_id,               
            group_code,               
            group_name,               
            description,               
            is_active,               
            created_at,               
            updated_at               
               
        FROM [CoreAnalytics].dbo.core_group               
        WHERE group_id = @CoreGroupID;               
               
        RETURN;               
               
    END TRY               
    BEGIN CATCH               
               
        SELECT               
            CAST(0 AS bit) AS success,               
            ''GROUP_STATUS_UPDATE_ERROR'' AS code,               
            ERROR_MESSAGE() AS message;               
               
        RETURN;               
               
    END CATCH;               
END;              
              
IF @Mode = ''CoreMenuList''              
BEGIN              
              
    SELECT              
        CAST(1 AS bit) AS success,              
        ''MENU_LIST'' AS code,              
              
        CONVERT(varchar(36), m.menu_id) AS menu_id,              
        m.menu_code,              
        m.menu_name,              
              
        CONVERT(varchar(36), m.parent_menu_id) AS parent_menu_id,              
              
        p.menu_code AS parent_menu_code,              
        p.menu_name AS parent_menu_name,              
              
        m.route_key,              
        m.icon_key,              
        m.sort_order,              
        m.is_active              
              
    FROM [CoreAnalytics].dbo.core_menu m              
              
    LEFT JOIN [CoreAnalytics].dbo.core_menu p              
        ON p.menu_id = m.parent_menu_id              
              
    WHERE m.is_active = 1              
              
    ORDER BY              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN m.sort_order              
            ELSE ISNULL(p.sort_order, 0)              
        END,              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN 0              
            ELSE 1              
        END,              
        m.sort_order,              
        m.menu_name;              
              
    RETURN;              
END;              
              
IF @Mode = ''CoreGroupMenuGet''              
BEGIN              
              
    IF @CoreGroupID IS NULL              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_ID_REQUIRED'' AS code,              
            ''GroupID wajib diisi.'' AS message;              
        RETURN;              
    END;              
              
              
    IF NOT EXISTS              
    (              
        SELECT 1              
        FROM [CoreAnalytics].dbo.core_group              
        WHERE group_id = @CoreGroupID              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_NOT_FOUND'' AS code,              
            ''Group tidak ditemukan.'' AS message;              
        RETURN;              
    END;              
              
              
    SELECT              
        CAST(1 AS bit) AS success,              
        ''GROUP_MENU_LIST'' AS code,              
              
        CONVERT(varchar(36), @CoreGroupID) AS group_id,              
              
        g.group_code,             
        g.group_name,              
         
        CONVERT(varchar(36), m.menu_id) AS menu_id,              
        m.menu_code,              
        m.menu_name,              
              
        CONVERT(varchar(36), m.parent_menu_id)              
            AS parent_menu_id,              
              
        p.menu_code AS parent_menu_code,              
        p.menu_name AS parent_menu_name,              
              
        m.route_key,              
        m.icon_key,              
        m.sort_order,              
              
        CAST(              
            CASE              
                WHEN gm.menu_id IS NOT NULL              
                     AND gm.can_view = 1              
                    THEN 1              
                ELSE 0              
            END              
            AS bit              
        ) AS can_view              
              
    FROM [CoreAnalytics].dbo.core_group g              
          
    CROSS JOIN [CoreAnalytics].dbo.core_menu m              
              
    LEFT JOIN [CoreAnalytics].dbo.core_menu p              
        ON p.menu_id = m.parent_menu_id              
              
    LEFT JOIN [CoreAnalytics].dbo.core_group_menu gm              
        ON gm.group_id = g.group_id              
        AND gm.menu_id = m.menu_id              
        AND gm.can_view = 1              
              
    WHERE              
        g.group_id = @CoreGroupID              
        AND m.is_active = 1         
              
    ORDER BY              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN m.sort_order              
            ELSE ISNULL(p.sort_order, 0)              
        END,              
        CASE              
            WHEN m.parent_menu_id IS NULL              
                THEN 0              
            ELSE 1              
        END,              
        m.sort_order,              
        m.menu_name;              
              
    RETURN;              
END;              
              
IF @Mode = ''CoreGroupMenuSave''              
BEGIN              
              
    IF @CoreGroupID IS NULL              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_ID_REQUIRED'' AS code,              
            ''GroupID wajib diisi.'' AS message;              
        RETURN;              
    END;              
              
              
    IF NOT EXISTS              
    (              
        SELECT 1              
        FROM [CoreAnalytics].dbo.core_group              
        WHERE group_id = @CoreGroupID              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_NOT_FOUND'' AS code,              
            ''Group tidak ditemukan.'' AS message;              
        RETURN;              
    END;              
      
              
    -- MenuIDs must exist as a JSON array.              
    IF JSON_QUERY(@Payload, ''$.MenuIDs'') IS NULL              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''MENU_IDS_REQUIRED'' AS code,              
            ''MenuIDs wajib dikirim dalam bentuk array.'' AS message;              
        RETURN;              
    END;              
              
              
    -- =========================================================              
    -- PARSE MENU IDs              
    -- =========================================================              
              
    DECLARE @CoreSelectedMenu TABLE              
    (              
        menu_id uniqueidentifier NOT NULL PRIMARY KEY              
    );              
              
              
    -- Reject invalid GUID values before inserting.              
    IF EXISTS              
    (              
        SELECT 1              
        FROM OPENJSON(@Payload, ''$.MenuIDs'') j              
      WHERE TRY_CONVERT(uniqueidentifier, j.[value]) IS NULL              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''INVALID_MENU_ID'' AS code,              
            ''Salah satu MenuID tidak valid.'' AS message;              
        RETURN;              
    END;              
              
              
    INSERT INTO @CoreSelectedMenu              
    (              
        menu_id              
    )              
    SELECT DISTINCT              
        TRY_CONVERT(uniqueidentifier, j.[value])              
    FROM OPENJSON(@Payload, ''$.MenuIDs'') j;               
              
    -- =========================================================              
    -- VALIDATE MENU EXISTS + ACTIVE              
    -- =========================================================              
              
    IF EXISTS              
    (              
        SELECT 1              
        FROM @CoreSelectedMenu s              
              
        LEFT JOIN [CoreAnalytics].dbo.core_menu m              
            ON m.menu_id = s.menu_id              
            AND m.is_active = 1              
              
        WHERE m.menu_id IS NULL              
    )              
    BEGIN              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''MENU_NOT_FOUND'' AS code,              
            ''Salah satu menu tidak ditemukan atau tidak aktif.''              
                AS message;              
        RETURN;              
    END;              
              
              
    BEGIN TRY              
              
        BEGIN TRANSACTION;              
              
              
        -- =====================================================              
        -- REMOVE CURRENT ACCESS              
        -- =====================================================              
              
        DELETE              
        FROM [CoreAnalytics].dbo.core_group_menu              
        WHERE group_id = @CoreGroupID;              
              
              
        -- =====================================================              
        -- INSERT NEW ACCESS              
        -- =====================================================              
              
        INSERT INTO [CoreAnalytics].dbo.core_group_menu              
        (              
            group_id,              
            menu_id,              
            can_view,              
            created_at                 )              
        SELECT              
            @CoreGroupID,              
            s.menu_id,              
            1,              
            SYSDATETIME()              
        FROM @CoreSelectedMenu s;              
              
              
        COMMIT TRANSACTION;              
              
              
        SELECT              
            CAST(1 AS bit) AS success,              
            ''GROUP_MENU_SAVED'' AS code,              
            ''Group menu access berhasil disimpan.''              
                AS message,              
              
            CONVERT(varchar(36), @CoreGroupID)              
                AS group_id,              
              
            (              
                SELECT COUNT(*)              
                FROM @CoreSelectedMenu              
            ) AS menu_count;              
              
              
        RETURN;              
              
    END TRY              
              
    BEGIN CATCH              
              
        IF @@TRANCOUNT > 0              
            ROLLBACK TRANSACTION;              
              
              
        SELECT              
            CAST(0 AS bit) AS success,              
            ''GROUP_MENU_SAVE_ERROR'' AS code,              
            ERROR_MESSAGE() AS message;              
              
        RETURN;              
              
    END CATCH;      
              
END;           
  
           
-- =============================================================       
-- CORE USER -> GROUP -> EFFECTIVE MENU ACCESS           
-- Added 2026-10-27           
--           
-- Modes:           
--   CoreUserGroupGet           
--   CoreUserGroupSave           
--   CoreUserAccessGet           
--           
-- Existing Group Management modes above are intentionally unchanged.           
-- =============================================================           
           
           
-- =============================================================           
-- CORE USER GROUP GET           
-- Returns all groups and marks the groups assigned to one user.           
--           
-- Payload:           
-- {           
--   "UserID": "..."           
-- }           
-- =============================================================           
IF @Mode = ''CoreUserGroupGet''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_ID_REQUIRED'' AS code,           
            ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_NOT_FOUND'' AS code,           
            ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''USER_GROUP_LIST'' AS code,           
        CONVERT(varchar(36), @CoreUserID) AS user_id,           
        CONVERT(varchar(36), g.group_id) AS group_id,           
        g.group_code,           
        g.group_name,           
        g.description,           
        g.is_active,           
    CAST           
        (           
            CASE           
                WHEN ug.user_id IS NULL THEN 0           
                ELSE 1           
            END           
            AS bit           
        ) AS is_assigned           
    FROM [CoreAnalytics].dbo.core_group g           
    LEFT JOIN [CoreAnalytics].dbo.core_user_group ug           
        ON ug.group_id = g.group_id           
       AND ug.user_id = @CoreUserID           
    ORDER BY           
        g.is_active DESC,           
        g.group_name ASC,           
        g.group_code ASC;           
           
    RETURN;           
END;           
           
           
-- =============================================================           
-- CORE USER GROUP SAVE           
-- Replaces all current group assignments for one user.           
--           
-- Payload:           
-- {           
--   "UserID": "...",           
--   "GroupIDs": ["...", "..."]           
-- }           
--           
-- Empty GroupIDs [] removes all group assignments.           
-- Only active groups may be newly assigned.           
-- =============================================================           
IF @Mode = ''CoreUserGroupSave''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_ID_REQUIRED'' AS code,           
            ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID         
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_NOT_FOUND'' AS code,           
            ''User tidak ditemukan.'' AS message;           
        RETURN;           
    END;           
           
    IF JSON_QUERY(@Payload, ''$.GroupIDs'') IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''GROUP_IDS_REQUIRED'' AS code,           
            ''GroupIDs wajib dikirim dalam bentuk array.'' AS message;           
        RETURN;           
    END;           
           
    DECLARE @CoreSelectedGroup TABLE           
    (           
        group_id uniqueidentifier NOT NULL PRIMARY KEY           
    );           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM OPENJSON(@Payload, ''$.GroupIDs'') j           
        WHERE TRY_CONVERT(uniqueidentifier, j.[value]) IS NULL           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''INVALID_GROUP_ID'' AS code,           
            ''Salah satu GroupID tidak valid.'' AS message;           
        RETURN;           
    END;           
           
    INSERT INTO @CoreSelectedGroup           
    (           
        group_id           
    )           
    SELECT DISTINCT           
        TRY_CONVERT(uniqueidentifier, j.[value])           
    FROM OPENJSON(@Payload, ''$.GroupIDs'') j;           
           
    IF EXISTS           
    (           
        SELECT 1           
        FROM @CoreSelectedGroup s           
        LEFT JOIN [CoreAnalytics].dbo.core_group g           
            ON g.group_id = s.group_id           
           AND g.is_active = 1           
        WHERE g.group_id IS NULL           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''GROUP_NOT_FOUND'' AS code,           
            ''Salah satu group tidak ditemukan atau tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    BEGIN TRY           
        BEGIN TRANSACTION;           
           
        DELETE           
        FROM [CoreAnalytics].dbo.core_user_group           
        WHERE user_id = @CoreUserID;           
           
        /*           
            Current spDashboard only depends on user_id + group_id when reading           
            core_user_group. The insert below also remains compatible when the           
    table has an optional created_at audit column.           
           
            Dynamic SQL is used only for the created_at variant so SQL Server           
            does not compile a reference to a column that may not exist.           
        */           
        IF COL_LENGTH(''CoreAnalytics.dbo.core_user_group'', ''created_at'') IS NOT NULL           
        BEGIN           
            EXEC sys.sp_executesql           
                N''           
                    INSERT INTO [CoreAnalytics].dbo.core_user_group           
                    (           
                        user_id,           
                        group_id,           
                        created_at           
                    )           
                SELECT DISTINCT           
                        @PUserID,           
                        TRY_CONVERT(uniqueidentifier, j.[value]),           
                        SYSDATETIME()           
                    FROM OPENJSON(@PPayload, ''''$.GroupIDs'''') j;           
                '',           
                N''@PUserID uniqueidentifier, @PPayload nvarchar(max)'',           
             @PUserID = @CoreUserID,           
                @PPayload = @Payload;           
        END           
        ELSE           
        BEGIN           
            INSERT INTO [CoreAnalytics].dbo.core_user_group           
            (           
                user_id,           
                group_id           
            )           
            SELECT           
                @CoreUserID,           
                s.group_id           
            FROM @CoreSelectedGroup s;           
        END;           
           
        COMMIT TRANSACTION;           
           
        SELECT           
            CAST(1 AS bit) AS success,           
            ''USER_GROUP_SAVED'' AS code,           
            ''User group access berhasil disimpan.'' AS message,           
            CONVERT(varchar(36), @CoreUserID) AS user_id,           
            (           
                SELECT COUNT(*)           
                FROM @CoreSelectedGroup           
            ) AS group_count;           
           
        RETURN;           
    END TRY           
 BEGIN CATCH           
        IF @@TRANCOUNT > 0           
            ROLLBACK TRANSACTION;           
           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_GROUP_SAVE_ERROR'' AS code,           
            ERROR_MESSAGE() AS message;           
        RETURN;           
    END CATCH;           
END;           
           
           
-- =============================================================           
-- CORE USER EFFECTIVE ACCESS GET           
-- Used after PASSWORD or VOICE authentication.           
--           
-- Effective groups:           
--   All ACTIVE groups assigned to the user.           
--           
-- Effective menus:           
--   UNION / DISTINCT of menu access from all ACTIVE groups,           
--   where core_group_menu.can_view = 1 and menu is ACTIVE.           
--           
-- One row is returned. groups_json and menus_json are JSON arrays so           
-- BEAM can transport the complete access profile without multiple           
-- result-set ambiguity.           
--           
-- Payload:           
-- {           
--   "UserID": "..."           
-- }           
-- =============================================================           
IF @Mode = ''CoreUserAccessGet''           
BEGIN           
    IF @CoreUserID IS NULL           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_ID_REQUIRED'' AS code,           
            ''UserID wajib diisi.'' AS message;           
        RETURN;           
    END;           
           
    IF NOT EXISTS           
    (           
        SELECT 1           
        FROM [CoreAnalytics].dbo.core_user           
        WHERE user_id = @CoreUserID           
          AND is_active = 1           
    )           
    BEGIN           
        SELECT           
            CAST(0 AS bit) AS success,           
            ''USER_NOT_FOUND'' AS code,           
            ''User tidak ditemukan atau tidak aktif.'' AS message;           
        RETURN;           
    END;           
           
    SELECT           
        CAST(1 AS bit) AS success,           
        ''USER_ACCESS'' AS code,           
        CONVERT(varchar(36), @CoreUserID) AS user_id,           
           
        ISNULL           
        (           
            (           
                SELECT           
                    CONVERT(varchar(36), g.group_id) AS group_id,           
                    g.group_code,           
                    g.group_name           
                FROM [CoreAnalytics].dbo.core_user_group ug           
                INNER JOIN [CoreAnalytics].dbo.core_group g           
                    ON g.group_id = ug.group_id           
                   AND g.is_active = 1           
                WHERE ug.user_id = @CoreUserID           
                ORDER BY           
                    g.group_name,           
                    g.group_code           
                FOR JSON PATH           
      ),           
            ''[]''           
        ) AS groups_json,           
           
        ISNULL           
        (           
            (           
                SELECT           
                    x.menu_id,           
    x.menu_code,           
                    x.menu_name,           
                    x.parent_menu_id,           
                    x.parent_menu_code,           
                    x.parent_menu_name,           
    x.route_key,           
                    x.icon_key,           
                    x.sort_order           
                FROM           
           (           
                    SELECT DISTINCT           
                        CONVERT(varchar(36), m.menu_id) AS menu_id,           
                        m.menu_code,           
                        m.menu_name,           
                        CONVERT(varchar(36), m.parent_menu_id) AS parent_menu_id,           
                        p.menu_code AS parent_menu_code,           
           p.menu_name AS parent_menu_name,           
                        m.route_key,           
                        m.icon_key,           
                        m.sort_order           
                    FROM [CoreAnalytics].dbo.core_user_group ug           
                    INNER JOIN [CoreAnalytics].dbo.core_group g           
                        ON g.group_id = ug.group_id           
                       AND g.is_active = 1           
                    INNER JOIN [CoreAnalytics].dbo.core_group_menu gm           
                        ON gm.group_id = g.group_id           
                       AND gm.can_view = 1           
                    INNER JOIN [CoreAnalytics].dbo.core_menu m           
                        ON m.menu_id = gm.menu_id           
                       AND m.is_active = 1           
                    LEFT JOIN [CoreAnalytics].dbo.core_menu p           
                        ON p.menu_id = m.parent_menu_id           
                    WHERE ug.user_id = @CoreUserID           
                ) x           
                ORDER BY           
                    x.sort_order,           
                    x.menu_name,           
                    x.menu_code           
                FOR JSON PATH           
            ),           
            ''[]''           
        ) AS menus_json;           
           
    RETURN;           
END;         
         
-- =============================================================         
-- CORE USER SESSION (ADDITIVE, STAGE 3)         
-- SessionTokenHash: lowercase SHA-256 hex of cryptographically random token.         
-- Only trusted backend callers may invoke these modes.         
-- =============================================================         
IF @Mode IN (''CoreUserSessionCreate'', ''CoreUserSessionValidate'', ''CoreUserSessionRevoke'')         
BEGIN         
    DECLARE @SessionHash varchar(64) = LOWER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.SessionTokenHash''))), ''''));         
    DECLARE @SessionTTL int = TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.TTLMinutes''));         
    DECLARE @SessionReason varchar(100) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.RevokedReason''))), '''');         
    DECLARE @SessionNow datetime2(7) = SYSDATETIME();         
         
    IF @SessionHash IS NULL OR LEN(@SessionHash) <> 64         
       OR @SessionHash COLLATE Latin1_General_BIN2 LIKE ''%[^0-9a-f]%''         
    BEGIN         
        SELECT CAST(0 AS bit) AS success, ''SESSION_HASH_INVALID'' AS code;         
        RETURN;         
    END;         
         
    IF @Mode = ''CoreUserSessionCreate''         
    BEGIN         
        IF @CoreUserID IS NULL OR @CoreAuthMethod NOT IN (''PASSWORD'',''VOICE'')         
        BEGIN         
            SELECT CAST(0 AS bit) AS success, ''SESSION_INPUT_INVALID'' AS code;         
            RETURN;         
        END;         
        IF NOT EXISTS (         
            SELECT 1 FROM [CoreAnalytics].dbo.core_user         
            WHERE user_id = @CoreUserID AND is_active = 1 AND is_locked = 0         
        )         
        BEGIN         
            SELECT CAST(0 AS bit) AS success, ''SESSION_USER_UNAVAILABLE'' AS code;         
            RETURN;         
        END;         
        IF @SessionTTL IS NULL OR @SessionTTL < 1 OR @SessionTTL > 480         
            SET @SessionTTL = 480;         
        BEGIN TRY         
            DECLARE @NewSessionID uniqueidentifier = NEWID();         
            INSERT INTO [CoreAnalytics].dbo.core_user_session         
                (session_id,user_id,session_token_hash,auth_method,created_ip,user_agent,         
                 created_at,last_activity_at,expires_at)         
            VALUES         
                (@NewSessionID,@CoreUserID,@SessionHash,@CoreAuthMethod,@CoreIPAddress,@CoreUserAgent,         
                 @SessionNow,@SessionNow,DATEADD(MINUTE,@SessionTTL,@SessionNow));         
            SELECT CAST(1 AS bit) AS success, ''SESSION_CREATED'' AS code,         
                   CONVERT(varchar(36),@NewSessionID) AS session_id,         
                DATEADD(MINUTE,@SessionTTL,@SessionNow) AS expires_at;         
            RETURN;         
        END TRY         
        BEGIN CATCH         
            SELECT CAST(0 AS bit) AS success, ''SESSION_CREATE_ERROR'' AS code;         
            RETURN;         
        END CATCH;         
    END;         
         
    IF @Mode = ''CoreUserSessionValidate''         
    BEGIN         
        -- Fail closed for expired/revoked sessions or inactive/locked users.         
        IF NOT EXISTS (         
            SELECT 1 FROM [CoreAnalytics].dbo.core_user_session s         
            INNER JOIN [CoreAnalytics].dbo.core_user u ON u.user_id=s.user_id         
            WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL         
              AND s.expires_at > @SessionNow AND u.is_active=1 AND u.is_locked=0         
        )         
        BEGIN         
            SELECT CAST(0 AS bit) AS success, ''SESSION_INVALID'' AS code;         
            RETURN;         
        END;         
        UPDATE s SET last_activity_at=@SessionNow         
        FROM [CoreAnalytics].dbo.core_user_session s         
        WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL         
          AND s.expires_at > @SessionNow;         
        SELECT TOP 1 CAST(1 AS bit) AS success, ''SESSION_VALID'' AS code,         
               CONVERT(varchar(36),s.session_id) AS session_id,         
               CONVERT(varchar(36),u.user_id) AS user_id,         
               u.username,u.display_name,u.email,s.auth_method,s.expires_at         
        FROM [CoreAnalytics].dbo.core_user_session s         
        INNER JOIN [CoreAnalytics].dbo.core_user u ON u.user_id=s.user_id         
        WHERE s.session_token_hash=@SessionHash AND s.revoked_at IS NULL         
          AND s.expires_at > @SessionNow AND u.is_active=1 AND u.is_locked=0;         
        RETURN;         
    END;         
         
    IF @Mode = ''CoreUserSessionRevoke''         
    BEGIN         
        UPDATE [CoreAnalytics].dbo.core_user_session         
        SET revoked_at=@SessionNow,         
            revoked_reason=LEFT(COALESCE(@SessionReason,''LOGOUT''),100)         
        WHERE session_token_hash=@SessionHash AND revoked_at IS NULL;         
        SELECT CAST(1 AS bit) AS success, ''SESSION_REVOKED'' AS code;         
        RETURN;         
    END;         
END;        
        
/* Stage 5B additive block. Paste inside dbo.spDashboard after existing CoreUserSession modes.        
   Requires [CoreAnalytics].studio.connection from migration 001.        
   All access decisions MUST be enforced by Flask; BEAM is a trusted service credential.        
*/        
/* Phase 2.2A: update connection metadata; preserve secret when omitted. */   
IF @Mode = ''CoreStudioConnectionUpdate''   
BEGIN   
    DECLARE @EditUser uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.UserID''));   
    DECLARE @EditID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload, ''$.ConnectionID''));   
    DECLARE @EditName nvarchar(150) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ConnectionName''))), '''');   
    DECLARE @EditHost nvarchar(255) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.ServerHost''))), '''');   
    DECLARE @EditDB nvarchar(128) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.DatabaseName''))), '''');   
    DECLARE @EditLogin nvarchar(255) = NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload, ''$.LoginUsername''))), '''');   
    DECLARE @EditType varchar(30) = UPPER(JSON_VALUE(@Payload, ''$.ConnectionType''));   
    DECLARE @EditPort int = TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ServerPort''));   
    DECLARE @EditTimeout int = TRY_CONVERT(int, JSON_VALUE(@Payload, ''$.ConnectionTimeoutSeconds''));   
    DECLARE @EditTLS bit = CASE JSON_VALUE(@Payload, ''$.EncryptTransport'') WHEN ''true'' THEN 1 WHEN ''false'' THEN 0 WHEN ''1'' THEN 1 WHEN ''0'' THEN 0 END;   
    DECLARE @EditTrust bit = CASE JSON_VALUE(@Payload, ''$.TrustServerCertificate'') WHEN ''true'' THEN 1 WHEN ''false'' THEN 0 WHEN ''1'' THEN 1 WHEN ''0'' THEN 0 END;   
    DECLARE @EditSecret64 nvarchar(max) = JSON_VALUE(@Payload, ''$.EncryptedPasswordBase64'');   
    DECLARE @EditSecret varbinary(max) = NULL;   
    DECLARE @EditVersion smallint = TRY_CONVERT(smallint, JSON_VALUE(@Payload, ''$.EncryptionKeyVersion''));   
    IF @EditUser IS NULL OR NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@EditUser AND is_active=1 AND is_locked=0)   
    BEGIN SELECT CAST(0 AS bit) success, ''USER_UNAVAILABLE'' code; RETURN; END;   
    IF @EditID IS NULL OR NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@EditID AND [CoreAnalytics].studio.fnStudioAccessLevel(@EditUser,''CONNECTION'',connection_id)>=20)   
    BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_CONNECTION_NOT_FOUND'' code; RETURN; END;   
    IF @EditName IS NULL OR @EditHost IS NULL OR @EditDB IS NULL OR @EditLogin IS NULL   
       OR @EditPort NOT BETWEEN 1 AND 65535 OR @EditTimeout NOT BETWEEN 1 AND 60   
       OR @EditTLS IS NULL OR @EditTrust IS NULL OR @EditType NOT IN (''SQLSERVER'',''POSTGRESQL'')   
    BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_INPUT_INVALID'' code; RETURN; END;   
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@EditID AND connection_type=@EditType)   
    BEGIN SELECT CAST(0 AS bit) success, ''CONNECTOR_TYPE_IMMUTABLE'' code; RETURN; END;   
    IF @EditSecret64 IS NOT NULL AND @EditVersion IS NULL   
    BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_SECRET_INVALID'' code; RETURN; END;   
    BEGIN TRY   
        IF @EditSecret64 IS NOT NULL   
        BEGIN   
            SET @EditSecret = CAST(N'''' AS xml).value(''xs:base64Binary(sql:variable("@EditSecret64"))'', ''varbinary(max)'');   
            IF DATALENGTH(@EditSecret)=0   
            BEGIN SELECT CAST(0 AS bit) success, ''STUDIO_SECRET_INVALID'' code; RETURN; END;   
        END;   
        UPDATE [CoreAnalytics].studio.connection   
        SET connection_name=@EditName, server_host=@EditHost, server_port=@EditPort,   
            database_name=@EditDB, login_username=@EditLogin,   
            encrypt_transport=@EditTLS, trust_server_certificate=@EditTrust,   
            connection_timeout_seconds=@EditTimeout,   
            encrypted_password=COALESCE(@EditSecret,encrypted_password),   
            encryption_key_version=CASE WHEN @EditSecret IS NULL THEN encryption_key_version ELSE @EditVersion END,   
            updated_by=CONVERT(nvarchar(100),@EditUser), updated_at=SYSUTCDATETIME()   
        WHERE connection_id=@EditID AND [CoreAnalytics].studio.fnStudioAccessLevel(@EditUser,''CONNECTION'',connection_id)>=20; IF @@ROWCOUNT=0 BEGIN SELECT CAST(0 AS bit) success,''STUDIO_CONNECTION_NOT_FOUND'' code; RETURN; END;   
        SELECT CAST(1 AS bit) success, ''STUDIO_CONNECTION_UPDATED'' code;   
    END TRY   
    BEGIN CATCH   
        SELECT CAST(0 AS bit) success, ''STUDIO_CONNECTION_UPDATE_FAILED'' code;   
    END CATCH;   
    RETURN;   
END;   
   
IF @Mode IN (''CoreStudioConnectionList'',''CoreStudioConnectionCreate'',''CoreStudioConnectionSetActive'')        
BEGIN        
    DECLARE @StudioUserID uniqueidentifier = TRY_CONVERT(uniqueidentifier, JSON_VALUE(@Payload,''$.UserID''));        
    IF @StudioUserID IS NULL        
    BEGIN        
        SELECT CAST(0 AS bit) AS success, ''USER_ID_REQUIRED'' AS code;        
        RETURN;        
    END;        
    IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@StudioUserID AND is_active=1 AND is_locked=0)        
    BEGIN        
        SELECT CAST(0 AS bit) AS success, ''USER_UNAVAILABLE'' AS code;        
        RETURN;        
    END;        
        
    IF @Mode=''CoreStudioConnectionList''        
    BEGIN        
        SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_name, connection_type,        
           server_host,server_port,database_name,auth_type,login_username,        
               encrypt_transport,trust_server_certificate,connection_timeout_seconds,        
               is_active,created_by,created_at,updated_by,updated_at        
        FROM [CoreAnalytics].studio.connection WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@StudioUserID,''CONNECTION'',connection_id)>=10 ORDER BY connection_name;        
        RETURN;        
    END;        
        
    IF @Mode=''CoreStudioConnectionCreate''        
    BEGIN        
        DECLARE @StudioName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ConnectionName''))),''''),        
                @StudioHost nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ServerHost''))),''''),        
        @StudioDB nvarchar(128)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.DatabaseName''))),''''),        
                @StudioLogin nvarchar(255)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.LoginUsername''))),''''),        
                @StudioType varchar(30)=UPPER(COALESCE(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.ConnectionType''))),''''),''SQLSERVER'')),    
                @StudioAuth varchar(30)=UPPER(NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.AuthType''))),'''')),    
                @StudioPort int=COALESCE(TRY_CONVERT(int,JSON_VALUE(@Payload,''$.ServerPort'')),    
                    CASE WHEN UPPER(JSON_VALUE(@Payload,''$.ConnectionType''))=''POSTGRESQL'' THEN 5432 ELSE 1433 END),        
                @StudioTimeout int=ISNULL(TRY_CONVERT(int,JSON_VALUE(@Payload,''$.ConnectionTimeoutSeconds'')),10),        
                @StudioVersion smallint=TRY_CONVERT(smallint,JSON_VALUE(@Payload,''$.EncryptionKeyVersion'')),        
                @StudioEncrypted64 nvarchar(max)=JSON_VALUE(@Payload,''$.EncryptedPasswordBase64''),        
                @StudioEncrypted varbinary(max),        
                @StudioTLS bit=CASE WHEN JSON_VALUE(@Payload,''$.EncryptTransport'') IN (''true'',''1'') THEN 1 ELSE 0 END,        
                @StudioTrust bit=CASE WHEN JSON_VALUE(@Payload,''$.TrustServerCertificate'') IN (''true'',''1'') THEN 1 ELSE 0 END;        
        IF @StudioAuth IS NULL    
            SET @StudioAuth=CASE WHEN @StudioType=''POSTGRESQL'' THEN ''PASSWORD'' ELSE ''SQL_LOGIN'' END;    
        IF @StudioType NOT IN (''SQLSERVER'',''POSTGRESQL'')    
           OR NOT ((@StudioType=''SQLSERVER'' AND @StudioAuth=''SQL_LOGIN'')    
                   OR (@StudioType=''POSTGRESQL'' AND @StudioAuth=''PASSWORD''))    
        BEGIN    
            SELECT CAST(0 AS bit) AS success,''STUDIO_CONNECTOR_UNSUPPORTED'' AS code;    
            RETURN;    
        END;    
        IF @StudioName IS NULL OR @StudioHost IS NULL OR @StudioDB IS NULL OR @StudioLogin IS NULL        
           OR @StudioPort NOT BETWEEN 1 AND 65535 OR @StudioTimeout NOT BETWEEN 1 AND 60        
           OR @StudioVersion IS NULL OR @StudioEncrypted64 IS NULL        
        BEGIN        
            SELECT CAST(0 AS bit) AS success,''STUDIO_INPUT_INVALID'' AS code;        
            RETURN;        
        END;        
        BEGIN TRY        
            SET @StudioEncrypted=CAST(N'''' AS xml).value(''xs:base64Binary(sql:variable("@StudioEncrypted64"))'',''varbinary(max)'');        
            IF DATALENGTH(@StudioEncrypted)=0        
            BEGIN        
                SELECT CAST(0 AS bit) AS success,''STUDIO_SECRET_INVALID'' AS code;        
                RETURN;        
            END;        
            BEGIN TRANSACTION;
            DECLARE @StudioNewID uniqueidentifier=NEWID();        
            INSERT INTO [CoreAnalytics].studio.connection        
                (connection_id,connection_name,connection_type,server_host,server_port,database_name,        
                 auth_type,login_username,encrypted_password,encryption_key_version,encrypt_transport,        
                 trust_server_certificate,connection_timeout_seconds,is_active,created_by)        
            VALUES (@StudioNewID,@StudioName,@StudioType,@StudioHost,@StudioPort,@StudioDB,    
                    @StudioAuth,@StudioLogin,@StudioEncrypted,@StudioVersion,@StudioTLS,        
                    @StudioTrust,@StudioTimeout,1,CONVERT(nvarchar(100),@StudioUserID));
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO [CoreAnalytics].studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''CONNECTION'',@StudioNewID,@StudioUserID);
    INSERT INTO [CoreAnalytics].studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@StudioUserID,''CONNECTION'',@StudioNewID,''REGISTER'',@StudioUserID);
            COMMIT TRANSACTION;        
            SELECT CAST(1 AS bit) AS success,''STUDIO_CONNECTION_CREATED'' AS code,        
                   CONVERT(varchar(36),@StudioNewID) AS connection_id;        
            RETURN;        
        END TRY        
        BEGIN CATCH
            IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;        
            SELECT CAST(0 AS bit) AS success,        
                   CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN ''STUDIO_CONNECTION_DUPLICATE'' ELSE ''STUDIO_CONNECTION_CREATE_FAILED'' END AS code;        
            RETURN;        
        END CATCH;        
    END;        
        
    IF @Mode=''CoreStudioConnectionSetActive''        
    BEGIN        
DECLARE @StudioConnectionID uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')),        
                @StudioActive bit=CASE JSON_VALUE(@Payload,''$.IsActive'') WHEN ''true'' THEN 1 WHEN ''false'' THEN 0 WHEN ''1'' THEN 1 WHEN ''0'' THEN 0 ELSE NULL END;        
        IF @StudioConnectionID IS NULL OR @StudioActive IS NULL        
        BEGIN        
          SELECT CAST(0 AS bit) AS success,''STUDIO_INPUT_INVALID'' AS code;        
            RETURN;        
        END;        
        UPDATE [CoreAnalytics].studio.connection SET is_active=@StudioActive,        
            updated_by=CONVERT(nvarchar(100),@StudioUserID),updated_at=SYSUTCDATETIME()        
        WHERE connection_id=@StudioConnectionID AND [CoreAnalytics].studio.fnStudioAccessLevel(@StudioUserID,''CONNECTION'',connection_id)>=20;        
        IF @@ROWCOUNT=0        
        BEGIN        
            SELECT CAST(0 AS bit) AS success,''STUDIO_CONNECTION_NOT_FOUND'' AS code;        
            RETURN;        
        END;        
        SELECT CAST(1 AS bit) AS success,''STUDIO_CONNECTION_STATUS_UPDATED'' AS code;        
        RETURN;        
    END;        
END;       
       
/* Add this block inside dbo.spDashboard. Flask enforces Data Studio access. */       
IF @Mode IN (''CoreStudioConnectionGetSecret'',''CoreStudioDatasetList'',''CoreStudioDatasetCreate'')       
BEGIN       
 DECLARE @DSUser uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.UserID''));       
 IF @DSUser IS NULL OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].dbo.core_user WHERE user_id=@DSUser AND is_active=1 AND is_locked=0)       
 BEGIN SELECT CAST(0 AS bit) AS success,''USER_UNAVAILABLE'' AS code; RETURN; END;       
 IF @Mode=''CoreStudioConnectionGetSecret''       
 BEGIN       
  SELECT CONVERT(varchar(36),connection_id) AS connection_id, connection_type, auth_type,    
    server_host,server_port,database_name,login_username,       
    CAST('''' AS xml).value(''xs:base64Binary(sql:column("encrypted_password"))'',''varchar(max)'') AS encrypted_password_base64,       
    encryption_key_version,encrypt_transport,trust_server_certificate,connection_timeout_seconds       
  FROM [CoreAnalytics].studio.connection AS secret       
  WHERE connection_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')) AND is_active=1 AND ((JSON_VALUE(@Payload,''$.DatasetID'') IS NULL AND [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,''CONNECTION'',secret.connection_id)>=10) OR EXISTS(SELECT 1 FROM [CoreAnalytics].studio.dataset ref WHERE ref.dataset_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.DatasetID'')) AND ref.connection_id=secret.connection_id AND [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,''DATASET'',ref.dataset_id)>=10));       
  RETURN;       
 END;       
 IF @Mode=''CoreStudioDatasetList''       
 BEGIN       
  IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.dataset WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,''DATASET'',dataset_id)>=10)       
  BEGIN SELECT CAST(1 AS bit) AS success,''DATASET_LIST_EMPTY'' AS code; RETURN; END;       
  SELECT CONVERT(varchar(36),d.dataset_id) AS dataset_id,d.dataset_name,d.description,       
   CONVERT(varchar(36),d.connection_id) AS connection_id,c.connection_name,d.source_schema,d.source_name,       
   d.source_type,d.access_mode,d.storage_status,d.created_at       
  FROM [CoreAnalytics].studio.dataset d JOIN [CoreAnalytics].studio.connection c ON c.connection_id=d.connection_id       
  WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,''DATASET'',d.dataset_id)>=10 ORDER BY d.created_at DESC;       
  RETURN;       
 END;       
 IF @Mode=''CoreStudioDatasetCreate''       
 BEGIN IF [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,''CONNECTION'',TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')))<20 BEGIN SELECT CAST(0 AS bit) success,''DATASET_SOURCE_INVALID'' code; RETURN; END;       
  DECLARE @DSName nvarchar(150)=NULLIF(LTRIM(RTRIM(JSON_VALUE(@Payload,''$.DatasetName''))),''''),       
    @DSDescription nvarchar(1000)=JSON_VALUE(@Payload,''$.Description''),       
    @DSConnection uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')),       
    @DSSchema sysname=JSON_VALUE(@Payload,''$.SourceSchema''), @DSTable sysname=JSON_VALUE(@Payload,''$.SourceName''),       
    @DSType varchar(20)=JSON_VALUE(@Payload,''$.SourceType'');       
  IF @DSName IS NULL OR NULLIF(@DSSchema,'''') IS NULL OR NULLIF(@DSTable,'''') IS NULL OR @DSType NOT IN (''BASE TABLE'',''VIEW'')       
    OR NOT EXISTS(SELECT 1 FROM [CoreAnalytics].studio.connection WHERE connection_id=@DSConnection AND is_active=1)       
  BEGIN SELECT CAST(0 AS bit) AS success,''DATASET_INPUT_INVALID'' AS code; RETURN; END;       
  BEGIN TRY       
   BEGIN TRANSACTION; IF [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,''CONNECTION'',TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,''$.ConnectionID'')))<20 THROW 52910,''DATASET_SOURCE_INVALID'',1;
   DECLARE @DSID uniqueidentifier=NEWID();       
   INSERT INTO [CoreAnalytics].studio.dataset(dataset_id,dataset_name,description,connection_id,source_schema,source_name,source_type,access_mode,storage_status,created_by)       
   VALUES(@DSID,@DSName,@DSDescription,@DSConnection,@DSSchema,@DSTable,@DSType,''DIRECT'',''LIVE'',CONVERT(nvarchar(100),@DSUser));
    /* PHASE2D3_ATOMIC_OWNERSHIP */
    INSERT INTO [CoreAnalytics].studio.object_ownership(object_type,object_id,owner_user_id)
    VALUES (''DATASET'',@DSID,@DSUser);
    INSERT INTO [CoreAnalytics].studio.object_access_audit(actor_user_id,object_type,object_id,action_type,new_owner_user_id)
    VALUES (@DSUser,''DATASET'',@DSID,''REGISTER'',@DSUser);
   COMMIT TRANSACTION;       
   SELECT CAST(1 AS bit) AS success,''DATASET_CREATED'' AS code,CONVERT(varchar(36),@DSID) AS dataset_id; RETURN;       
  END TRY       
  BEGIN CATCH
   IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;       
   SELECT CAST(0 AS bit) AS success, CASE WHEN ERROR_NUMBER() IN (2601,2627) THEN ''DATASET_DUPLICATE'' ELSE ''DATASET_CREATE_FAILED'' END AS code; RETURN;       
  END CATCH;       
 END;       
END;
';
SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@old OUTPUT;
IF @old IS NULL BEGIN SET @message=N'DEFINITION_NOT_VISIBLE: '+@db+N'.'+@object; THROW 52903,@message,1; END;
IF EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK) WHERE database_name=@db AND object_name=@object)
BEGIN
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name=@db AND object_name=@object;
 IF DATALENGTH(@installed)<>DATALENGTH(@old) OR @installed COLLATE Latin1_General_100_BIN2<>@old COLLATE Latin1_General_100_BIN2
 BEGIN SET @message=N'CHANGED_AFTER_INSTALL: '+@db+N'.'+@object; THROW 52904,@message,1; END;
END
ELSE
BEGIN
 IF CHARINDEX(@parameter,@old)=0 BEGIN SET @message=N'UNREVIEWED_SIGNATURE: '+@object; THROW 52905,@message,1; END;
 SET @body=LTRIM(RTRIM(REPLACE(SUBSTRING(@old,CHARINDEX(@parameter,@old),LEN(@old)),CHAR(13),'')));
 SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
 WHILE UNICODE(LEFT(@body,1)) IN (9,10,32) SET @body=LTRIM(STUFF(@body,1,1,N''));
 WHILE UNICODE(RIGHT(@body,1)) IN (9,10,32) SET @body=RTRIM(LEFT(@body,LEN(@body)-1));
 WHILE UNICODE(LEFT(@expected,1)) IN (9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
 WHILE UNICODE(RIGHT(@expected,1)) IN (9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
 IF DATALENGTH(@body)<>DATALENGTH(@expected) OR @body COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
 BEGIN
  SELECT (SELECT @db AS [database_name],@object AS [object_name],N'BASELINE_MISMATCH_NO_INSTALL' AS [status],
   DATALENGTH(@body) AS [actual_bytes],DATALENGTH(@expected) AS [expected_bytes],@body AS [actual_body]
   FOR XML PATH('phase2d8_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
  SET @message=N'UNREVIEWED_DEFINITION: '+@db+N'.'+@object; THROW 52906,@message,1;
 END;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
 EXEC sys.sp_executesql @probe,N'@statement nvarchar(max)',@new;
 SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
 SET @installed=NULL;
 EXEC sys.sp_executesql @probe,N'@object nvarchar(256),@definition nvarchar(max) OUTPUT',@object,@installed OUTPUT;
 IF @installed IS NULL THROW 52907,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 INSERT studio.phase2d8_dataplane_backup(database_name,object_name,previous_definition,installed_definition)
 VALUES(@db,@object,@old,@installed);
END;
EXEC sys.sp_executesql N'IF studio.fnStudioAccessLevel(NULL,''DATASET'',NEWID())<>0 THROW 52908,''NULL_ACTOR_MUST_DENY'',1;';
 IF NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WHERE database_name='BI' AND object_name='dbo.spDashboard') THROW 52908,'GATEWAY_NOT_INSTALLED',1;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT (SELECT N'SHARED_EDIT_029_INSTALLED_DEV_TRIALS_REQUIRED' AS [status],
 CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [verified_at_utc],
 N'Shared recipients read/edit/run/schedule; primary owner alone deletes/manages sharing' AS [policy],
 N'BEAM service credentials remain private; Flask session supplies UserID. No direct Flask SQL connection added.' AS [actor_boundary],
 (SELECT database_name,object_name,installed_at_utc FROM studio.phase2d8_dataplane_backup ORDER BY database_name,object_name FOR XML PATH('object'),TYPE) AS [installed_objects]
 FOR XML PATH('phase2d8_dataplane_install'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
