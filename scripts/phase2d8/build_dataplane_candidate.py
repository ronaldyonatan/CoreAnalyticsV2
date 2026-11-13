"""Build a guarded DEV migration from the user's actual 2026-11-12 SQL export.
Run from repository root. No network/SQL execution. Exact replacements fail on drift.
"""
from pathlib import Path
import re
R=Path(__file__).resolve().parents[2]
SRC=R/'artifacts/phase2d8-dev-inventory'
OUT=R/'data-studio-backend/phase2d8'
OUT.mkdir(exist_ok=True)
changes=[]
def change(s,old,new,count=1):
    assert s.count(old)==count,(old,s.count(old),count)
    return s.replace(old,new)
def load(name):return (SRC/('COREANALYTICS__'+name+'.sql')).read_text()
def save(name,s,baseline=None,db='CoreAnalytics',parameter='@Payload'):
    if baseline is None:baseline=load(name)
    s=re.sub(r'\bCREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE', 'ALTER PROCEDURE',s,count=1,flags=re.I)
    assert 'ALTER PROCEDURE' in s
    (OUT/(name+'.sql')).write_text(s)
    changes.append((db,name,parameter,baseline,s))
fn="""CREATE OR ALTER FUNCTION studio.fnStudioAccessLevel(@actor uniqueidentifier,@kind varchar(32),@id uniqueidentifier)
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
END;"""
schedfn="""CREATE OR ALTER FUNCTION studio.fnStudioScheduleAccess(@actor uniqueidentifier,@id uniqueidentifier)
RETURNS int AS BEGIN
 DECLARE @level int=studio.fnStudioAccessLevel(@actor,'SCHEDULE',@id),@target uniqueidentifier,@kind varchar(12),@targetLevel int;
 IF @level=30 RETURN 30;
 SELECT @target=target_id,@kind=target_type FROM studio.scheduler_schedule WITH(HOLDLOCK) WHERE schedule_id=@id;
 SET @targetLevel=studio.fnStudioAccessLevel(@actor,CASE WHEN @kind='STORED' THEN 'DATASET' WHEN @kind='PIPELINE' THEN 'PIPELINE' ELSE '' END,@target);
 IF @targetLevel>=20 RETURN 20;
 RETURN @level;
END;"""
graphfn="""CREATE OR ALTER FUNCTION studio.fnStudioGraphSourcesAllowed(@actor uniqueidentifier,@document nvarchar(max))
RETURNS bit AS BEGIN
 IF ISJSON(@document)<>1 RETURN 0;
 IF EXISTS(SELECT 1 FROM OPENJSON(@document,'$.graph.sources') WITH(kind varchar(20),dataset_id uniqueidentifier) s
   WHERE s.kind='dataset' AND (studio.fnStudioAccessLevel(@actor,'DATASET',s.dataset_id)<10
    OR NOT EXISTS(SELECT 1 FROM studio.dataset d WHERE d.dataset_id=s.dataset_id AND d.access_mode='DIRECT'))) RETURN 0;
 RETURN 1;
END;"""
chartfn="""CREATE OR ALTER FUNCTION studio.fnStudioChartSourceAllowed(@actor uniqueidentifier,@config nvarchar(max))
RETURNS bit AS BEGIN
 IF ISJSON(@config)<>1 RETURN 0;
 DECLARE @kind varchar(20)=JSON_VALUE(@config,'$.dataset_kind'),@id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@config,'$.dataset_id'));
 IF @kind='DIRECT' AND EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@id AND access_mode='DIRECT')
  AND studio.fnStudioAccessLevel(@actor,'DATASET',@id)>=10 RETURN 1;
 IF @kind='PARQUET' AND EXISTS(SELECT 1 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id
  WHERE o.output_version_id=@id AND r.status='SUCCEEDED' AND studio.fnStudioAccessLevel(@actor,'PIPELINE',r.pipeline_id)>=10
  AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind='ETL_OUTPUT' AND z.target_id=o.output_version_id)) RETURN 1;
 RETURN 0;
END;"""
functions=[('fnStudioAccessLevel',fn),('fnStudioScheduleAccess',schedfn),('fnStudioGraphSourcesAllowed',graphfn),('fnStudioChartSourceAllowed',chartfn)]
# V2 baseline is the exact installed 028 target, not pre-fix snapshot.
s=(R/'artifacts/CoreAnalyticsV2-Phase2D8-OWNER-ONLY-INSTALL-AND-VERIFY.sql').read_text()
base=re.search(r"EXEC sys.sp_executesql N'((?:[^']|'')*)';",s).group(1).replace("''", "'")
s=base
a=s.index("            IF @Action='CHECK'\n")
b=s.index("            ELSE IF @Action<>'GET'",a)
s=s[:a]+"""            IF @Action='CHECK'
            BEGIN
                DECLARE @level int=CASE WHEN @ObjectType='SCHEDULE' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID)
                    ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END;
                SET @EffectiveRole=CASE @level WHEN 30 THEN 'OWNER' WHEN 20 THEN 'EDITOR' WHEN 10 THEN 'ADMIN' ELSE 'NONE' END;
                IF @level=0 THROW 52610, 'OBJECT_ACCESS_DENIED', 1;
            END
"""+s[b:]
s=change(s,"IF @Owner IS NULL THROW 52609, 'OBJECT_NOT_REGISTERED', 1;", "IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0 THROW 52609, 'OBJECT_NOT_REGISTERED', 1;")
save('spObjectAccessControlV2',s,base,parameter='@ActorUserID')
# Signed GET metadata may be inspected by recipients, but sharing mutation guards remain owner-only.
s=load('spObjectAccessRpc')
s=change(s,'IF @Owner IS NULL',"IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0")
s=change(s,"IF @Owner<>@ActorUserID AND @IsAdmin=0", "IF @Owner<>@ActorUserID AND @IsAdmin=0 AND\n          (CASE WHEN @ObjectType='SCHEDULE' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0")
save('spObjectAccessRpc',s)
# Pipeline catalog/run/output paths; retain lease, output path and tombstone logic.
s=load('spPipelineControl')
s=change(s,"BEGIN TRY  IF @action='Status'", "BEGIN TRY  DECLARE @requiredLevel int=CASE WHEN @action IN ('Save','Submit','Cancel') THEN 20 WHEN @action IN ('CheckDelete','BeginDelete','FinishDelete','AbortDelete') THEN 30 ELSE 10 END; IF @action='Status'")
s=change(s,"WHERE status='RUNNING' AND lease_expires_at>@now)","WHERE status='RUNNING' AND lease_expires_at>@now AND studio.fnStudioAccessLevel(@owner,'PIPELINE',pipeline_id)>=10)")
s=change(s,'r.requested_by=@owner AND p.created_by=@owner',"studio.fnStudioAccessLevel(@owner,'PIPELINE',p.pipeline_id)>=@requiredLevel",3)
s=change(s,'p.created_by=@owner',"studio.fnStudioAccessLevel(@owner,'PIPELINE',p.pipeline_id)>=@requiredLevel",4)
s=change(s,'WHERE pipeline_id=@id AND created_by=@owner',"WHERE pipeline_id=@id AND studio.fnStudioAccessLevel(@owner,'PIPELINE',pipeline_id)>=20")
s=change(s,"IF @action='Save'  BEGIN", "IF @action='Save'  BEGIN IF studio.fnStudioGraphSourcesAllowed(@owner,@document)=0 THROW 50001,'PIPELINE_SOURCE_ACCESS_DENIED',1;")
s=change(s,"IF @action='Submit'  BEGIN  BEGIN TRAN;", "IF @action='Submit'  BEGIN  BEGIN TRAN; IF studio.fnStudioAccessLevel(@owner,'PIPELINE',@id)<20 OR NOT EXISTS(SELECT 1 FROM studio.pipeline_version WHERE pipeline_id=@id AND version=@version AND studio.fnStudioGraphSourcesAllowed(@owner,graph_json)=1) THROW 50001,'PIPELINE_NOT_FOUND',1;")
s=change(s,"WHERE r.requested_by=@owner ORDER BY", "WHERE studio.fnStudioAccessLevel(@owner,'PIPELINE',r.pipeline_id)>=10 ORDER BY")
s=change(s,"WHERE run_id=@run AND requested_by=@owner", "WHERE run_id=@run AND studio.fnStudioAccessLevel(@owner,'PIPELINE',pipeline_id)>=@requiredLevel",4)
s=change(s,"WHERE r.run_id=@run AND r.requested_by=@owner", "WHERE r.run_id=@run AND studio.fnStudioAccessLevel(@owner,'PIPELINE',r.pipeline_id)>=10")
s=change(s,"IF @status='SUCCEEDED'  BEGIN", "IF @status='SUCCEEDED'  BEGIN IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run r WHERE r.run_id=@run AND studio.fnStudioAccessLevel(r.requested_by,'PIPELINE',r.pipeline_id)>=20) THROW 50001,'PIPELINE_ACCESS_REVOKED',1;")
s=change(s,"AS run_id,r.version  FROM studio.pipeline_output_version", "AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,r.version  FROM studio.pipeline_output_version")
s=change(s,"WHERE o.output_version_id=@output AND NOT EXISTS", "WHERE o.output_version_id=@output AND studio.fnStudioAccessLevel(@owner,'PIPELINE',r.pipeline_id)>=10 AND NOT EXISTS")
save('spPipelineControl',s)
# Stored data: use DATASET permissions, not identity of whoever ran the last refresh.
s=load('spDatasetIngestControl')
s=change(s,"created_by=CONVERT(nvarchar(100),@UserID) AND access_mode='STORED'", "studio.fnStudioAccessLevel(@UserID,'DATASET',dataset_id)>=20 AND access_mode='STORED'")
s=change(s,'r.requested_by=@UserID AND d.created_by=CONVERT(nvarchar(100),@UserID)', "studio.fnStudioAccessLevel(@UserID,'DATASET',d.dataset_id)>=CASE WHEN @Action IN ('CheckDelete','BeginDelete','FinishDelete','AbortDelete') THEN 30 ELSE 10 END",3)
s=change(s,'BEGIN TRANSACTION;    IF NOT EXISTS', "BEGIN TRANSACTION; IF studio.fnStudioAccessLevel(@UserID,'DATASET',@DatasetID)<20 THROW 51000,'INGEST_DATASET_NOT_FOUND',1;    IF NOT EXISTS")
save('spDatasetIngestControl',s)
s=load('spDatasetIngestWorker')
s=change(s,'BEGIN TRANSACTION;\n        ;WITH next_job',"BEGIN TRANSACTION;\n        UPDATE studio.dataset_ingest_run SET status='FAILED',error_code='INGEST_BIND_FAILED',finished_at=@now\n        WHERE status='QUEUED' AND studio.fnStudioAccessLevel(requested_by,'DATASET',dataset_id)<20;\n        ;WITH next_job")
s=change(s,'d.created_by=CONVERT(nvarchar(100),r.requested_by)',"studio.fnStudioAccessLevel(r.requested_by,'DATASET',d.dataset_id)>=20")
s=change(s,"AND lease_expires_at>@now)\n        BEGIN", "AND lease_expires_at>@now AND studio.fnStudioAccessLevel(requested_by,'DATASET',dataset_id)>=20)\n        BEGIN")
save('spDatasetIngestWorker',s,parameter='@Action')
# Scheduler sharing is inherited from its target; creator remains background identity.
s=load('spSchedulerControl')
s=change(s,'s.created_by=@owner',"studio.fnStudioScheduleAccess(@owner,s.schedule_id)>=10 AND studio.fnStudioAccessLevel(@owner,CASE WHEN s.target_type='STORED' THEN 'DATASET' ELSE 'PIPELINE' END,s.target_id)>=10",2)
s=change(s,'created_by=CONVERT(nvarchar(100),@owner)',"studio.fnStudioAccessLevel(@owner,'DATASET',dataset_id)>=20")
s=change(s,'p.created_by=@owner',"studio.fnStudioAccessLevel(@owner,'PIPELINE',p.pipeline_id)>=20")
s=change(s,'schedule_id=@id AND created_by=@owner',"schedule_id=@id AND studio.fnStudioScheduleAccess(@owner,schedule_id)>=20",3)
# Target ownership is not transferred to editors. Save must validate creator can still execute the new target.
s=change(s,'BEGIN TRANSACTION;    IF @id IS NULL', "BEGIN TRANSACTION; IF studio.fnStudioAccessLevel(@owner,CASE WHEN @kind='STORED' THEN 'DATASET' ELSE 'PIPELINE' END,@target)<20 THROW 52102,'SCHEDULER_NOT_FOUND',1; IF @id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WHERE schedule_id=@id AND studio.fnStudioAccessLevel(created_by,CASE WHEN @kind='STORED' THEN 'DATASET' ELSE 'PIPELINE' END,@target)>=20) THROW 52102,'SCHEDULER_NOT_FOUND',1;    IF @id IS NULL")
s=change(s,"IF @action='Toggle'  BEGIN", "IF @action='Toggle'  BEGIN IF NOT EXISTS(SELECT 1 FROM studio.scheduler_schedule WHERE schedule_id=@id AND studio.fnStudioScheduleAccess(@owner,schedule_id)>=20 AND studio.fnStudioAccessLevel(@owner,CASE WHEN target_type='STORED' THEN 'DATASET' ELSE 'PIPELINE' END,target_id)>=20) BEGIN SELECT CAST(0 AS bit) success,'SCHEDULER_NOT_FOUND' code; RETURN; END;")
save('spSchedulerControl',s)
s=load('spSchedulerDispatch')
s=change(s,'created_by=CONVERT(nvarchar(100),@owner)',"studio.fnStudioAccessLevel(@owner,'DATASET',dataset_id)>=20")
s=change(s,'p.created_by=@owner',"studio.fnStudioAccessLevel(@owner,'PIPELINE',p.pipeline_id)>=20 AND studio.fnStudioGraphSourcesAllowed(@owner,v.graph_json)=1")
s=change(s,"IF @bad=1 SET @result='SKIPPED_INVALID';", "IF studio.fnStudioScheduleAccess(@owner,@id)<20 SET @bad=1;\n  IF @bad=1 SET @result='SKIPPED_INVALID';")
save('spSchedulerDispatch',s,parameter='@Action')
# Charts: shared edits, primary-owner delete; enforce referenced datasets before metadata disclosure.
s=load('spChartControl')
s=change(s,'owner_user_id = @User',"studio.fnStudioAccessLevel(@User,'CHART',chart_id)>=CASE WHEN @Action='DELETE' THEN 30 WHEN @Action='SAVE' THEN 20 ELSE 10 END",6)
s=change(s,'ORDER BY updated_at DESC, chart_id',"AND studio.fnStudioChartSourceAllowed(@User,config_json)=1 ORDER BY updated_at DESC, chart_id")
s=change(s,"IF @Action = 'GET'     BEGIN", "IF @Action = 'GET'     BEGIN IF NOT EXISTS(SELECT 1 FROM studio.chart WHERE chart_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ChartID')) AND studio.fnStudioAccessLevel(@User,'CHART',chart_id)>=10 AND studio.fnStudioChartSourceAllowed(@User,config_json)=1) BEGIN SELECT CAST(0 AS bit) success,'CHART_NOT_FOUND' code; RETURN; END;")
s=change(s,'IF @SaveID IS NULL         BEGIN',"IF studio.fnStudioChartSourceAllowed(@User,@Config)=0 BEGIN SELECT CAST(0 AS bit) success,'CHART_DATASET_NOT_FOUND' code; RETURN; END; IF @SaveID IS NULL         BEGIN")
s=change(s,"BEGIN TRANSACTION;              UPDATE studio.chart", "BEGIN TRANSACTION; IF studio.fnStudioChartSourceAllowed(@User,@Config)=0 THROW 52910,'CHART_DATASET_NOT_FOUND',1;              UPDATE studio.chart")
s=change(s,"ELSE 10 END", "ELSE 10 END AND (@Action NOT IN ('LIST','GET') OR studio.fnStudioChartSourceAllowed(@User,config_json)=1)",6)
save('spChartControl',s)
s=load('spStoredDatasetCreate')
s=change(s,'WHERE connection_id=@ConnectionID AND is_active=1',"WHERE connection_id=@ConnectionID AND is_active=1 AND studio.fnStudioAccessLevel(@UserID,'CONNECTION',connection_id)>=20")
s=change(s,'BEGIN TRANSACTION; DECLARE @DatasetID',"BEGIN TRANSACTION; IF studio.fnStudioAccessLevel(@UserID,'CONNECTION',@ConnectionID)<20 THROW 52910,'DATASET_SOURCE_INVALID',1; DECLARE @DatasetID")
save('spStoredDatasetCreate',s)
# Gateway: only alter known studio branches, retaining every legacy dashboard mode.
# Reviewed mismatch XML: identical SQL, exactly one empty line removed in legacy CATCH.
base=(SRC/'BI__spDashboard_reviewed_029.sql').read_text();s=base
s=change(s,'WHERE connection_id=@EditID)',"WHERE connection_id=@EditID AND [CoreAnalytics].studio.fnStudioAccessLevel(@EditUser,'CONNECTION',connection_id)>=20)")
s=change(s,'WHERE connection_id=@EditID;',"WHERE connection_id=@EditID AND [CoreAnalytics].studio.fnStudioAccessLevel(@EditUser,'CONNECTION',connection_id)>=20; IF @@ROWCOUNT=0 BEGIN SELECT CAST(0 AS bit) success,'STUDIO_CONNECTION_NOT_FOUND' code; RETURN; END;")
s=change(s,'FROM [CoreAnalytics].studio.connection ORDER BY connection_name;',"FROM [CoreAnalytics].studio.connection WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@StudioUserID,'CONNECTION',connection_id)>=10 ORDER BY connection_name;")
s=change(s,'WHERE connection_id=@StudioConnectionID;',"WHERE connection_id=@StudioConnectionID AND [CoreAnalytics].studio.fnStudioAccessLevel(@StudioUserID,'CONNECTION',connection_id)>=20;")
s=change(s,"AND is_active=1;       \n  RETURN;", "AND is_active=1 AND ((JSON_VALUE(@Payload,'$.DatasetID') IS NULL AND [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'CONNECTION',secret.connection_id)>=10) OR EXISTS(SELECT 1 FROM [CoreAnalytics].studio.dataset ref WHERE ref.dataset_id=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.DatasetID')) AND ref.connection_id=secret.connection_id AND [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'DATASET',ref.dataset_id)>=10));       \n  RETURN;")
s=change(s,"FROM [CoreAnalytics].studio.connection       \n  WHERE connection_id=TRY_CONVERT","FROM [CoreAnalytics].studio.connection AS secret       \n  WHERE connection_id=TRY_CONVERT")
s=change(s,'IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.dataset)',"IF NOT EXISTS (SELECT 1 FROM [CoreAnalytics].studio.dataset WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'DATASET',dataset_id)>=10)")
s=change(s,'ORDER BY d.created_at DESC;',"WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'DATASET',d.dataset_id)>=10 ORDER BY d.created_at DESC;")
s=change(s,"IF @Mode='CoreStudioDatasetCreate'       \n BEGIN", "IF @Mode='CoreStudioDatasetCreate'       \n BEGIN IF [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'CONNECTION',TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')))<20 BEGIN SELECT CAST(0 AS bit) success,'DATASET_SOURCE_INVALID' code; RETURN; END;")
start=s.index("IF @Mode='CoreStudioDatasetCreate'")
prefix,tail=s[:start],s[start:]
tail=change(tail,'BEGIN TRANSACTION;',"BEGIN TRANSACTION; IF [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'CONNECTION',TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.ConnectionID')))<20 THROW 52910,'DATASET_SOURCE_INVALID',1;",1)
s=prefix+tail
save('spDashboard',s,base,db='BI',parameter='@Mode')
# Emitted migration is generated below.

def literal(s):return "N'"+s.replace("'","''")+"'"
def normalized(s,param):return s[s.index(param):].replace('\r','').strip(' \t\n')
# Single transaction across CoreAnalytics and BI on the same SQL Server instance.
parts=["""/* Phase2D8 / 029 SHARED_EDIT_DEV_REV2. One file, one XML result.
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
"""]
for name,definition in functions:
    (OUT/(name+'.sql')).write_text(definition)
    parts.append(f"SET @db=N'CoreAnalytics'; SET @object=N'studio.{name}'; SET @parameter=N'@actor'; SET @expected=NULL; SET @new={literal(definition)};\n")
    parts.append("""SET @old=OBJECT_DEFINITION(OBJECT_ID(@object));
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
""")
for db,name,param,baseline,target in changes:
    obj=('dbo.' if db=='BI' else 'studio.')+name
    parts.append(f"SET @db=N'{db}'; SET @object=N'{obj}'; SET @parameter=N'{param}'; SET @expected={literal(normalized(baseline,param))}; SET @new={literal(target)};\n")
    parts.append("""SET @old=NULL; SET @probe=N'USE '+QUOTENAME(@db)+N'; SELECT @definition=OBJECT_DEFINITION(OBJECT_ID(@object));';
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
""")
parts.append("""EXEC sys.sp_executesql N'IF studio.fnStudioAccessLevel(NULL,''DATASET'',NEWID())<>0 THROW 52908,''NULL_ACTOR_MUST_DENY'',1;';
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
""")
path=R/'data-studio-backend/migrations/029_SHARED_EDIT_DATAPLANE_DEV.sql';path.write_text(''.join(parts))
(R/'artifacts/CoreAnalyticsV2-Phase2D8-SHARED-ACCESS-INSTALL-AND-VERIFY.sql').write_text(path.read_text())
rollback="""/* Manual DEV rollback of 029 only. Does not undo confirmed 028 owner-only sharing.
   Run after reviewing why rollback is necessary; backend must match SQL version. */
USE [CoreAnalytics]; SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 52900,'RUN_IN_SESSION_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 DECLARE @db nvarchar(128),@object nvarchar(256),@old nvarchar(max),@installed nvarchar(max),@current nvarchar(max),@sql nvarchar(max);
 DECLARE restore_objects CURSOR LOCAL FAST_FORWARD FOR
 SELECT database_name,object_name,previous_definition,installed_definition
 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
 WHERE previous_definition IS NOT NULL ORDER BY database_name,object_name;
 OPEN restore_objects; FETCH NEXT FROM restore_objects INTO @db,@object,@old,@installed;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @current=NULL; SET @sql=N'USE '+QUOTENAME(@db)+N'; SELECT @d=OBJECT_DEFINITION(OBJECT_ID(@o));';
  EXEC sys.sp_executesql @sql,N'@o nvarchar(256),@d nvarchar(max) OUTPUT',@object,@current OUTPUT;
  IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2
    THROW 52909,'ROLLBACK_REFUSES_CHANGED_DEFINITION',1;
  SET @old=LTRIM(@old);
  /* Header conversion only; comments may precede CREATE. */
  DECLARE @start int,@create int,@param nvarchar(40),@prefix nvarchar(max),@reverseCreate int;
  SET @param=CASE WHEN @object='studio.spObjectAccessControlV2' THEN '@ActorUserID' WHEN @object IN ('studio.spDatasetIngestWorker','studio.spSchedulerDispatch') THEN '@Action' WHEN @object='dbo.spDashboard' THEN '@Mode' ELSE '@Payload' END;
  SET @prefix=LEFT(@old,CHARINDEX(@param,@old)-1);
  SET @reverseCreate=CHARINDEX('ETAERC',REVERSE(UPPER(@prefix)));
  SET @create=CASE WHEN @reverseCreate>0 THEN DATALENGTH(@prefix)/2-@reverseCreate-4 ELSE 0 END;
  SET @start=CHARINDEX('PROCEDURE',UPPER(@old),CASE WHEN @create>0 THEN @create ELSE 1 END);
  IF @create>0 AND @create<@start AND CHARINDEX('OR ALTER',UPPER(SUBSTRING(@old,@create,@start-@create)))=0 SET @old=STUFF(@old,@create,@start-@create,N'ALTER ');
  SET @sql=N'USE '+QUOTENAME(@db)+N'; EXEC sys.sp_executesql @statement;';
  EXEC sys.sp_executesql @sql,N'@statement nvarchar(max)',@old;
  FETCH NEXT FROM restore_objects INTO @db,@object,@old,@installed;
 END;
 CLOSE restore_objects; DEALLOCATE restore_objects;
"""
for name,_ in reversed(functions):
    rollback+=f"""SET @current=OBJECT_DEFINITION(OBJECT_ID('studio.{name}'));
 SELECT @installed=installed_definition FROM studio.phase2d8_dataplane_backup WHERE database_name='CoreAnalytics' AND object_name='studio.{name}';
 IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2 THROW 52909,'ROLLBACK_REFUSES_CHANGED_FUNCTION',1;
 DROP FUNCTION studio.{name};
"""
rollback+="""DELETE studio.phase2d8_dataplane_backup;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT N'029_ROLLED_BACK_028_PRESERVED' AS result;
"""
(R/'data-studio-backend/migrations/029B_ROLLBACK_SHARED_EDIT_DATAPLANE.sql').write_text(rollback)
print('Generated',len(changes),'procedure candidates,',len(functions),'functions, guarded install and rollback.')
