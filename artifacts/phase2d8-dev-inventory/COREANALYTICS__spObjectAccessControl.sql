/* Phase 2A: metadata-only stored procedure. Must be invoked only by a trusted backend
   which obtains ActorUserID from a validated session; never expose arbitrary actor IDs
   to browser or generic SQL RPC. Administrator delegation intentionally NOT enabled. */
CREATE   PROCEDURE studio.spObjectAccessControl
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
 SET NOCOUNT ON; SET XACT_ABORT ON;
 IF @ActorUserID IS NULL OR @ObjectID IS NULL OR @ObjectType NOT IN ('CONNECTION','DATASET','PIPELINE','SCHEDULE','CHART','DASHBOARD')
   THROW 52500, 'INVALID_OBJECT_ACCESS_INPUT', 1;
 IF @Action NOT IN ('GET','GRANT','REVOKE','TRANSFER') THROW 52501, 'INVALID_OBJECT_ACCESS_ACTION', 1;
 DECLARE @Owner uniqueidentifier, @OldRole varchar(8);
 BEGIN TRY
  BEGIN TRAN;
  SELECT @Owner=owner_user_id FROM studio.object_ownership WITH (UPDLOCK,HOLDLOCK)
    WHERE object_type=@ObjectType AND object_id=@ObjectID;
  IF @Owner IS NULL THROW 52502, 'OBJECT_NOT_REGISTERED', 1;
  IF @Owner<>@ActorUserID THROW 52503, 'OWNER_REQUIRED', 1;
  IF @Action='GET'
  BEGIN
    SELECT object_type,object_id,owner_user_id,created_at_utc,updated_at_utc
      FROM studio.object_ownership WHERE object_type=@ObjectType AND object_id=@ObjectID;
    SELECT principal_type,principal_id,access_role,granted_by_user_id,granted_at_utc
      FROM studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID;
  END
  ELSE IF @Action='GRANT'
  BEGIN
    IF @PrincipalType NOT IN ('USER','GROUP') OR @PrincipalID IS NULL OR @AccessRole NOT IN ('VIEWER','EDITOR')
       THROW 52504, 'INVALID_GRANT_INPUT', 1;
    IF @PrincipalType='USER' AND @PrincipalID=@Owner THROW 52505, 'OWNER_CANNOT_BE_SHARED', 1;
    SELECT @OldRole=access_role FROM studio.object_access WITH (UPDLOCK,HOLDLOCK)
      WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
    IF @OldRole IS NULL
      INSERT studio.object_access(object_type,object_id,principal_type,principal_id,access_role,granted_by_user_id)
      VALUES(@ObjectType,@ObjectID,@PrincipalType,@PrincipalID,@AccessRole,@ActorUserID);
    ELSE
      UPDATE studio.object_access SET access_role=@AccessRole,granted_by_user_id=@ActorUserID,granted_at_utc=SYSUTCDATETIME()
      WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
    INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,target_principal_type,target_principal_id,old_access_role,new_access_role)
      VALUES(@ActorUserID,@ObjectType,@ObjectID,CASE WHEN @OldRole IS NULL THEN 'GRANT' ELSE 'CHANGE_ROLE' END,@PrincipalType,@PrincipalID,@OldRole,@AccessRole);
  END
  ELSE IF @Action='REVOKE'
  BEGIN
    IF @PrincipalType NOT IN ('USER','GROUP') OR @PrincipalID IS NULL THROW 52506, 'INVALID_REVOKE_INPUT', 1;
    SELECT @OldRole=access_role FROM studio.object_access WITH (UPDLOCK,HOLDLOCK)
      WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
    IF @OldRole IS NULL THROW 52507, 'GRANT_NOT_FOUND', 1;
    DELETE studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type=@PrincipalType AND principal_id=@PrincipalID;
    INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,target_principal_type,target_principal_id,old_access_role)
      VALUES(@ActorUserID,@ObjectType,@ObjectID,'REVOKE',@PrincipalType,@PrincipalID,@OldRole);
  END
  ELSE IF @Action='TRANSFER'
  BEGIN
    IF @NewOwnerUserID IS NULL OR @NewOwnerUserID=@Owner THROW 52508, 'INVALID_NEW_OWNER', 1;
    DELETE studio.object_access WHERE object_type=@ObjectType AND object_id=@ObjectID AND principal_type='USER' AND principal_id=@NewOwnerUserID;
    UPDATE studio.object_ownership SET owner_user_id=@NewOwnerUserID,updated_at_utc=SYSUTCDATETIME()
      WHERE object_type=@ObjectType AND object_id=@ObjectID;
    INSERT studio.object_access_audit(actor_user_id,object_type,object_id,action_type,previous_owner_user_id,new_owner_user_id)
      VALUES(@ActorUserID,@ObjectType,@ObjectID,'TRANSFER',@Owner,@NewOwnerUserID);
  END
  COMMIT TRAN;
  SELECT CAST(1 AS bit) AS success, @Action AS action_type;
 END TRY
 BEGIN CATCH
  IF @@TRANCOUNT>0 ROLLBACK TRAN;
  THROW;
 END CATCH
END;
