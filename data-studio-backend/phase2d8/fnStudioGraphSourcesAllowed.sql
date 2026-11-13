CREATE OR ALTER FUNCTION studio.fnStudioGraphSourcesAllowed(@actor uniqueidentifier,@document nvarchar(max))
RETURNS bit AS BEGIN
 IF ISJSON(@document)<>1 RETURN 0;
 IF EXISTS(SELECT 1 FROM OPENJSON(@document,'$.graph.sources') WITH(kind varchar(20),dataset_id uniqueidentifier) s
   WHERE s.kind='dataset' AND (studio.fnStudioAccessLevel(@actor,'DATASET',s.dataset_id)<10
    OR NOT EXISTS(SELECT 1 FROM studio.dataset d WHERE d.dataset_id=s.dataset_id AND d.access_mode='DIRECT'))) RETURN 0;
 RETURN 1;
END;