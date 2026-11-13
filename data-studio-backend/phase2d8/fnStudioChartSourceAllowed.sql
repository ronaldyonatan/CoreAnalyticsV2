CREATE OR ALTER FUNCTION studio.fnStudioChartSourceAllowed(@actor uniqueidentifier,@config nvarchar(max))
RETURNS bit AS BEGIN
 IF ISJSON(@config)<>1 RETURN 0;
 DECLARE @kind varchar(20)=JSON_VALUE(@config,'$.dataset_kind'),@id uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@config,'$.dataset_id'));
 IF @kind='DIRECT' AND EXISTS(SELECT 1 FROM studio.dataset WHERE dataset_id=@id AND access_mode='DIRECT')
  AND studio.fnStudioAccessLevel(@actor,'DATASET',@id)>=10 RETURN 1;
 IF @kind='PARQUET' AND EXISTS(SELECT 1 FROM studio.pipeline_output_version o JOIN studio.pipeline_run r ON r.run_id=o.run_id
  WHERE o.output_version_id=@id AND r.status='SUCCEEDED' AND studio.fnStudioAccessLevel(@actor,'PIPELINE',r.pipeline_id)>=10
  AND NOT EXISTS(SELECT 1 FROM studio.parquet_delete_state z WHERE z.kind='ETL_OUTPUT' AND z.target_id=o.output_version_id)) RETURN 1;
 RETURN 0;
END;