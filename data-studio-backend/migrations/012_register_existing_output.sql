/* MANUAL RECOVERY. Run 011 successfully first, then review/run this entire file.
   Target: only the FAILED registration job explicitly supplied by the user.
   Uses its already committed Parquet files; no Spark execution, source SQL query,
   deletion, retry, graph change, owner change, or replacement of existing outputs.
   The manifest/_SUCCESS/part file existence was checked during preparation.
   Confirm that these immutable files still exist on the configured storage host.
   Manifest SHA256: cc4d4576b9f31c488d6322e837c59eb09ae21a95f09cbc2df0347b1acdf460ba
*/
USE [CoreAnalytics];
GO
IF @@TRANCOUNT<>0
BEGIN SELECT CAST(0 AS bit) success,'USE_SESSION_WITHOUT_ACTIVE_TRANSACTION' code; RETURN; END;
IF ISNULL(CHARINDEX(N'output_path_version',OBJECT_DEFINITION(OBJECT_ID(N'studio.spPipelineControl'))),0)=0
BEGIN SELECT CAST(0 AS bit) success,'APPLY_011_OR_CHECK_VIEW_DEFINITION' code; RETURN; END;
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @run uniqueidentifier='3f5602c0-431c-4c29-bbb6-3cd95c59658e';
DECLARE @outputs nvarchar(max)=N'[{"id": "output", "name": "billguarfiltered", "path": "3f5602c0-431c-4c29-bbb6-3cd95c59658e/output-0", "row_count": 2, "schema": {"type": "struct", "fields": [{"name": "HealthcareID", "type": "string", "nullable": true, "metadata": {"__CHAR_VARCHAR_TYPE_STRING": "varchar(3)", "isSigned": false, "scale": 0}}, {"name": "GuarantorName", "type": "string", "nullable": true, "metadata": {"__CHAR_VARCHAR_TYPE_STRING": "varchar(100)", "isSigned": false, "scale": 0}}]}}]';
DECLARE @document nvarchar(max),@state varchar(12),@error varchar(100),@cancel bit;
BEGIN TRY
 BEGIN TRAN;
 SELECT @state=status,@error=error_code,@cancel=cancel_requested
 FROM studio.pipeline_run WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@run;
 IF @state IS NULL THROW 50001,'RECOVERY_RUN_NOT_FOUND',1;
 IF @state='SUCCEEDED'
 BEGIN
  COMMIT;
  SELECT CAST(1 AS bit) success,'ALREADY_SUCCEEDED_NO_CHANGES' code;
  RETURN;
 END;
 IF @state<>'FAILED' OR ISNULL(@error,'')<>'BATCH_OUTPUT_REGISTRATION_FAILED' OR @cancel<>0
  THROW 50001,'RECOVERY_REQUIRES_FAILED_OUTPUT_REGISTRATION',1;
 IF EXISTS(SELECT 1 FROM studio.pipeline_output_version WITH(UPDLOCK,HOLDLOCK) WHERE run_id=@run)
  THROW 50001,'RECOVERY_EXISTING_OUTPUTS_REVIEW_REQUIRED',1;
 SELECT @document=v.graph_json FROM studio.pipeline_run r
 JOIN studio.pipeline_version v ON v.pipeline_id=r.pipeline_id AND v.version=r.version WHERE r.run_id=@run;
 IF @document IS NULL OR ISJSON(@document)<>1 THROW 50001,'RECOVERY_VERSION_INVALID',1;
 DECLARE @out TABLE(ordinal int,id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max));
 INSERT @out
 SELECT TRY_CONVERT(int,j.[key]),o.id,o.name,o.path,o.row_count,o.schema_json
 FROM OPENJSON(@outputs) j CROSS APPLY OPENJSON(j.value)
 WITH(id nvarchar(80),name nvarchar(150),path nvarchar(512),row_count bigint,schema_json nvarchar(max) '$.schema' AS JSON) o;
 IF (SELECT COUNT(*) FROM @out) NOT BETWEEN 1 AND 6 OR (SELECT COUNT(*) FROM @out)<>(SELECT COUNT(*) FROM OPENJSON(@document,'$.graph.outputs')) OR
 EXISTS(SELECT id FROM @out GROUP BY id HAVING COUNT(*)>1) OR
 EXISTS(SELECT 1 FROM @out o WHERE o.id IS NULL OR o.name IS NULL OR o.path IS NULL OR o.row_count IS NULL OR o.row_count<0 OR ISJSON(o.schema_json)<>1 OR o.schema_json IS NULL OR o.ordinal IS NULL OR o.ordinal NOT BETWEEN 0 AND 5
 OR o.path COLLATE Latin1_General_BIN2 <> (LOWER(CONVERT(nvarchar(36),@run))+N'/output-'+CONVERT(nvarchar(10),o.ordinal)) COLLATE Latin1_General_BIN2
 OR DATALENGTH(o.path) <> DATALENGTH(LOWER(CONVERT(nvarchar(36),@run))+N'/output-'+CONVERT(nvarchar(10),o.ordinal)) OR NOT EXISTS(SELECT 1 FROM OPENJSON(@document,'$.graph.outputs') expected CROSS APPLY OPENJSON(expected.value) WITH(id nvarchar(80),name nvarchar(150)) x WHERE TRY_CONVERT(int,expected.[key])=o.ordinal AND x.id=o.id AND x.name=o.name)) THROW 50001,'PIPELINE_OUTPUT_INVALID',1;
 INSERT studio.pipeline_output_version(run_id,output_node_id,output_name,storage_relative_path,row_count,schema_json)
 SELECT @run,id,name,path,row_count,schema_json FROM @out;
 UPDATE studio.pipeline_run SET status='SUCCEEDED',finished_at=SYSUTCDATETIME(),error_code=NULL,error_detail=NULL,
 lease_owner=NULL,lease_expires_at=NULL WHERE run_id=@run;
 COMMIT;
 SELECT CAST(1 AS bit) success,'EXISTING_PARQUET_REGISTERED' code,LOWER(CONVERT(varchar(36),@run)) AS run_id;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
GO
