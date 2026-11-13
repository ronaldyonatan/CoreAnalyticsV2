CREATE OR ALTER FUNCTION studio.fnStudioAccessLevel(@actor uniqueidentifier,@kind varchar(32),@id uniqueidentifier)
RETURNS int
AS
BEGIN
 /* SHARED_EDIT_029: all explicit USER/GROUP shares permit edit/run, never delete/share.
    HOLDLOCK retains authorization locks until the calling transaction ends. */
 IF @actor IS NULL OR @id IS NULL RETURN 0;
 IF @kind NOT IN ('CONNECTION','DATASET','PIPELINE','SCHEDULE','CHART') RETURN 0;
 IF @kind='CONNECTION' AND NOT EXISTS(SELECT 1 FROM studio.connection WHERE connection_id=@id) RETURN 0;
 IF @kind='DATASET' AND NOT EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@id) RETURN 0;
 IF @kind='PIPELINE' AND NOT EXISTS(SELECT 1 FROM studio.pipeline WHERE pipeline_id=@id) RETURN 0;
 IF @kind='SCHEDULE' AND NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WHERE schedule_id=@id) RETURN 0;
 IF @kind='CHART' AND NOT EXISTS(SELECT 1 FROM studio.chart WHERE chart_id=@id) RETURN 0;
 IF NOT EXISTS(SELECT 1 FROM dbo.core_user WITH(HOLDLOCK) WHERE user_id=@actor AND is_active=1 AND is_locked=0) RETURN 0;
 DECLARE @owner uniqueidentifier;
 SELECT @owner=owner_user_id FROM studio.object_ownership WITH(HOLDLOCK) WHERE object_type=@kind AND object_id=@id;
 IF @owner IS NULL RETURN 0;
 IF @owner=@actor RETURN 30;
 IF EXISTS(SELECT 1 FROM studio.object_access a WITH(HOLDLOCK) WHERE a.object_type=@kind AND a.object_id=@id
   AND a.access_role IN ('VIEWER','EDITOR') AND
   ((a.principal_type='USER' AND a.principal_id=@actor) OR
    (a.principal_type='GROUP' AND EXISTS(SELECT 1 FROM dbo.core_user_group ug WITH(HOLDLOCK)
     JOIN dbo.core_group g WITH(HOLDLOCK) ON g.group_id=ug.group_id AND g.is_active=1
     WHERE ug.user_id=@actor AND ug.group_id=a.principal_id)))) RETURN 20;
 IF EXISTS(SELECT 1 FROM studio.object_access_admin_group ag WITH(HOLDLOCK)
    JOIN dbo.core_user_group ug WITH(HOLDLOCK) ON ug.group_id=ag.group_id AND ug.user_id=@actor
    JOIN dbo.core_group g WITH(HOLDLOCK) ON g.group_id=ag.group_id AND g.is_active=1) RETURN 10;
 RETURN 0;
END;