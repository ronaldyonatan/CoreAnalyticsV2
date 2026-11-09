/* UUID transport fix for the existing pipeline procedure.
   Run this entire file in SSMS after 006/007. Only ALTERs studio.spPipelineControl.
   BEAM can decode SQL uniqueidentifier as binary text; return UUIDs as varchar(36).
   No table/data/credential changes, no change to BI.dbo.spDashboard.
   Existing pipeline versions and Parquet paths are preserved. */
USE [CoreAnalytics];
GO
ALTER PROCEDURE studio.spPipelineControl @Payload nvarchar(max)
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 DECLARE @action varchar(30)=JSON_VALUE(@Payload,'$.Action'),
 @owner uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.UserID')),
 @id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.PipelineID')),
 @run uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.RunID')),
 @output uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.OutputVersionID')),
 @worker uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.WorkerID')),
 @request uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Payload,'$.RequestID')),
 @version int=TRY_CONVERT(int,JSON_VALUE(@Payload,'$.Version')),
 @expected int=TRY_CONVERT(int,JSON_VALUE(@Payload,'$.ExpectedVersion')),
 @name nvarchar(150)=JSON_VALUE(@Payload,'$.PipelineName'),
 @document nvarchar(max)=JSON_VALUE(@Payload,'$.GraphJSON'),
 @outputs nvarchar(max)=JSON_VALUE(@Payload,'$.OutputsJSON'),
 @status varchar(12)=JSON_VALUE(@Payload,'$.Status'),
 @error varchar(100)=JSON_VALUE(@Payload,'$.ErrorCode'),
 @now datetime2(3)=SYSUTCDATETIME(), @current int, @existing uniqueidentifier,
 @recovery bit=0, @cancel bit=0;
 /* JSON_VALUE truncates long strings at 4000 characters; OPENJSON preserves them. */
 SELECT @document=GraphJSON,@outputs=OutputsJSON FROM OPENJSON(@Payload)
 WITH(GraphJSON nvarchar(max) '$.GraphJSON',OutputsJSON nvarchar(max) '$.OutputsJSON');
 IF @action NOT IN ('Claim','Heartbeat','Complete') AND NOT EXISTS
 (SELECT 1 FROM dbo.core_user WHERE user_id=@owner AND is_active=1 AND is_locked=0)
 BEGIN SELECT CAST(0 AS bit) success,'PIPELINE_NOT_FOUND' code; RETURN; END;
 BEGIN TRY
 IF @action='Status'
 BEGIN SELECT CAST(1 AS bit) success,CAST(1 AS bit) metadata_ready,1 AS uuid_transport_version,
 CAST(CASE WHEN EXISTS(SELECT 1 FROM studio.pipeline_run WHERE status='RUNNING' AND lease_expires_at>@now) THEN 1 ELSE 0 END AS bit) active_job; RETURN; END;
 IF @action='List'
 BEGIN
 SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),p.pipeline_id)) AS pipeline_id,p.pipeline_name,MAX(v.version) version,p.updated_at
 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id
 WHERE p.created_by=@owner GROUP BY p.pipeline_id,p.pipeline_name,p.updated_at ORDER BY p.updated_at DESC FOR JSON PATH) items_json; RETURN;
 END;
 IF @action='Get'
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id WHERE p.pipeline_id=@id AND p.created_by=@owner AND (@version IS NULL OR v.version=@version))
 BEGIN SELECT CAST(0 AS bit) success,'PIPELINE_NOT_FOUND' code; RETURN; END;
 SELECT TOP(1) CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),p.pipeline_id)) AS pipeline_id,p.pipeline_name,v.version,v.graph_json
 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id
 WHERE p.pipeline_id=@id AND p.created_by=@owner AND (@version IS NULL OR v.version=@version) ORDER BY v.version DESC; RETURN;
 END;
 IF @action='Save'
 BEGIN
 IF @expected IS NULL OR @expected<0 OR LEN(LTRIM(RTRIM(@name)))=0 OR ISJSON(@document)<>1
 BEGIN SELECT CAST(0 AS bit) success,'PIPELINE_INPUT_INVALID' code; RETURN; END;
 BEGIN TRAN;
 IF @id IS NULL
 BEGIN
 IF @expected<>0 THROW 50001,'PIPELINE_VERSION_CONFLICT',1;
 SET @id=NEWID();
 INSERT studio.pipeline(pipeline_id,pipeline_name,created_by) VALUES(@id,@name,@owner);
 SET @current=0;
 END
 ELSE
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline WITH(UPDLOCK,HOLDLOCK) WHERE pipeline_id=@id AND created_by=@owner) THROW 50001,'PIPELINE_NOT_FOUND',1;
 SELECT @current=ISNULL(MAX(version),0) FROM studio.pipeline_version WHERE pipeline_id=@id;
 IF @current<>@expected THROW 50001,'PIPELINE_VERSION_CONFLICT',1;
 END;
 SET @version=@current+1;
 INSERT studio.pipeline_version(pipeline_id,version,graph_json,created_by) VALUES(@id,@version,@document,@owner);
 UPDATE studio.pipeline SET pipeline_name=@name,updated_at=@now WHERE pipeline_id=@id;
 COMMIT;
 SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@id)) AS pipeline_id,@name pipeline_name,@version version; RETURN;
 END;
 IF @action='Submit'
 BEGIN
 BEGIN TRAN;
 SELECT @existing=run_id FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE requested_by=@owner AND request_id=@request;
 IF @existing IS NOT NULL
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@existing AND pipeline_id=@id AND version=@version) THROW 50001,'PIPELINE_REQUEST_REUSED',1;
 COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),run_id)) AS run_id,status,version FROM studio.pipeline_run WHERE run_id=@existing; RETURN;
 END;
 IF @request IS NULL OR NOT EXISTS(SELECT 1 FROM studio.pipeline p JOIN studio.pipeline_version v ON v.pipeline_id=p.pipeline_id WHERE p.pipeline_id=@id AND p.created_by=@owner AND v.version=@version) THROW 50001,'PIPELINE_NOT_FOUND',1;
 SET @run=NEWID();
 INSERT studio.pipeline_run(run_id,pipeline_id,version,requested_by,request_id) VALUES(@run,@id,@version,@owner,@request);
 COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@run)) AS run_id,'QUEUED' status,@version version; RETURN;
 END;
 IF @action='Outputs'
 BEGIN
 SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_name,o.row_count,o.created_at,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version
 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id
 WHERE r.status='SUCCEEDED' AND r.requested_by=@owner AND p.created_by=@owner
 ORDER BY o.created_at DESC,o.output_version_id FOR JSON PATH) items_json; RETURN;
 END;
 IF @action='Output'
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id
 WHERE o.output_version_id=@output AND r.status='SUCCEEDED' AND r.requested_by=@owner AND p.created_by=@owner) THROW 50001,'PIPELINE_OUTPUT_NOT_FOUND',1;
 SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_node_id,o.output_name,o.row_count,o.schema_json,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,r.version
 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id WHERE o.output_version_id=@output; RETURN;
 END;
 IF @action='Jobs'
 BEGIN
 SELECT CAST(1 AS bit) success,(SELECT TOP(100) LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,r.cancel_requested,
 (SELECT COUNT(*) FROM studio.pipeline_output_version o WHERE o.run_id=r.run_id) output_count
 FROM studio.pipeline_run r JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id
 WHERE r.requested_by=@owner ORDER BY r.created_at DESC FOR JSON PATH) items_json; RETURN;
 END;
 IF @action='Job'
 BEGIN
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@run AND requested_by=@owner) THROW 50001,'PIPELINE_NOT_FOUND',1;
 SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,p.pipeline_name,r.version,r.status,r.created_at,r.started_at,r.finished_at,r.error_code,r.cancel_requested,
 (SELECT LOWER(CONVERT(varchar(36),o.output_version_id)) AS output_version_id,o.output_node_id,o.output_name,o.row_count,o.schema_json FROM studio.pipeline_output_version o WHERE o.run_id=r.run_id FOR JSON PATH) outputs_json
 FROM studio.pipeline_run r JOIN studio.pipeline p ON p.pipeline_id=r.pipeline_id WHERE r.run_id=@run AND r.requested_by=@owner; RETURN;
 END;
 IF @action='Cancel'
 BEGIN
 UPDATE studio.pipeline_run SET cancel_requested=1,
 status=CASE WHEN status='QUEUED' THEN 'CANCELLED' ELSE status END,
 finished_at=CASE WHEN status='QUEUED' THEN @now ELSE finished_at END
 WHERE run_id=@run AND requested_by=@owner AND status IN ('QUEUED','RUNNING');
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WHERE run_id=@run AND requested_by=@owner) THROW 50001,'PIPELINE_NOT_FOUND',1;
 SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),run_id)) AS run_id,status,cancel_requested FROM studio.pipeline_run WHERE run_id=@run AND requested_by=@owner; RETURN;
 END;
 IF @action='Claim'
 BEGIN
 IF @worker IS NULL THROW 50001,'PIPELINE_INPUT_INVALID',1;
 BEGIN TRAN;
 SELECT TOP(1) @run=run_id,@recovery=CASE WHEN status='RUNNING' THEN 1 ELSE 0 END
 FROM studio.pipeline_run WITH(UPDLOCK,READPAST,ROWLOCK)
 WHERE status='QUEUED' OR (status='RUNNING' AND lease_expires_at<=@now) ORDER BY created_at;
 IF @run IS NULL BEGIN COMMIT; SELECT CAST(1 AS bit) success,CAST(0 AS bit) has_job; RETURN; END;
 UPDATE studio.pipeline_run SET status='RUNNING',started_at=ISNULL(started_at,@now),heartbeat_at=@now,lease_owner=@worker,lease_expires_at=DATEADD(second,90,@now) WHERE run_id=@run;
 COMMIT;
 SELECT CAST(1 AS bit) success,CAST(1 AS bit) has_job,@recovery is_recovery,LOWER(CONVERT(varchar(36),r.run_id)) AS run_id,LOWER(CONVERT(varchar(36),r.requested_by)) AS requested_by,LOWER(CONVERT(varchar(36),r.pipeline_id)) AS pipeline_id,r.version,r.cancel_requested,v.graph_json
 FROM studio.pipeline_run r JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run; RETURN;
 END;
 IF @action='Heartbeat'
 BEGIN
 UPDATE studio.pipeline_run SET heartbeat_at=@now,lease_expires_at=DATEADD(second,90,@now)
 WHERE run_id=@run AND status='RUNNING' AND lease_owner=@worker AND lease_expires_at>@now;
 IF @@ROWCOUNT=0 THROW 50001,'PIPELINE_LEASE_LOST',1;
 SELECT CAST(1 AS bit) success,cancel_requested FROM studio.pipeline_run WHERE run_id=@run; RETURN;
 END;
 IF @action='Complete'
 BEGIN
 IF @status NOT IN ('SUCCEEDED','FAILED','CANCELLED') OR @status IS NULL THROW 50001,'PIPELINE_STATUS_INVALID',1;
 BEGIN TRAN;
 IF NOT EXISTS(SELECT 1 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@run AND status='RUNNING' AND lease_owner=@worker AND lease_expires_at>@now) THROW 50001,'PIPELINE_LEASE_LOST',1;
 SELECT @cancel=cancel_requested FROM studio.pipeline_run WHERE run_id=@run;
 IF @cancel=1 SET @status='CANCELLED';
 IF @status='SUCCEEDED'
 BEGIN
 IF ISJSON(@outputs)<>1 OR LEFT(LTRIM(@outputs),1)<>'[' THROW 50001,'PIPELINE_OUTPUT_INVALID',1;
 DECLARE @out TABLE(id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max));
 INSERT @out SELECT id,name,path,row_count,schema_json FROM OPENJSON(@outputs) WITH(id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max) '$.schema' AS JSON);
 SELECT @document=v.graph_json FROM studio.pipeline_run r JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run;
 IF (SELECT COUNT(*) FROM @out)=0 OR (SELECT COUNT(*) FROM @out)<>(SELECT COUNT(*) FROM OPENJSON(@document,'$.graph.outputs')) OR
 EXISTS(SELECT id FROM @out GROUP BY id HAVING COUNT(*)>1) OR
 EXISTS(SELECT 1 FROM @out o WHERE o.id IS NULL OR o.name IS NULL OR o.path IS NULL OR o.row_count IS NULL OR o.row_count<0 OR ISJSON(o.schema_json)<>1 OR o.schema_json IS NULL OR o.path LIKE '%[^a-zA-Z0-9/-]%' COLLATE Latin1_General_BIN2 OR LEFT(o.path,37)<>LOWER(CONVERT(varchar(36),@run))+'/' OR NOT EXISTS(SELECT 1 FROM OPENJSON(@document,'$.graph.outputs') WITH(id nvarchar(80),name nvarchar(150)) x WHERE x.id=o.id AND x.name=o.name)) THROW 50001,'PIPELINE_OUTPUT_INVALID',1;
 INSERT studio.pipeline_output_version(run_id,output_node_id,output_name,storage_relative_path,row_count,schema_json) SELECT @run,id,name,path,row_count,schema_json FROM @out;
 END;
 UPDATE studio.pipeline_run SET status=@status,finished_at=@now,error_code=CASE WHEN @status='FAILED' THEN @error ELSE NULL END,lease_owner=NULL,lease_expires_at=NULL WHERE run_id=@run;
 COMMIT; SELECT CAST(1 AS bit) success,LOWER(CONVERT(varchar(36),@run)) AS run_id,@status status; RETURN;
 END;
 SELECT CAST(0 AS bit) success,'PIPELINE_ACTION_INVALID' code;
 END TRY
 BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 SELECT CAST(0 AS bit) success,CASE WHEN ERROR_NUMBER()=50001 THEN ERROR_MESSAGE() ELSE 'PIPELINE_METADATA_UNAVAILABLE' END code;
 END CATCH;
END;
GO
