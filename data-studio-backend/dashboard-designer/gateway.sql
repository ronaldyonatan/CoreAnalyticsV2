/* Appended to the reviewed signed envelope verifier. All operations are owner-scoped. */
DECLARE @Dashboard uniqueidentifier=TRY_CONVERT(uniqueidentifier,JSON_VALUE(@Request,'$.DashboardID')),
        @Name nvarchar(max),@Document nvarchar(max),@ExpectedVersion int=TRY_CONVERT(int,JSON_VALUE(@Request,'$.ExpectedVersion')),
        @CurrentVersion int;
SELECT @Name=dashboard_name,@Document=document FROM OPENJSON(@Request)
WITH (dashboard_name nvarchar(max) '$.Name',document nvarchar(max) '$.Document');
IF @Action='LIST'
BEGIN
 SELECT CAST(1 AS bit) success,COALESCE((SELECT CONVERT(varchar(36),dashboard_id) dashboard_id,dashboard_name,version,created_at_utc,updated_at_utc
   FROM studio.designer_dashboard WHERE owner_user_id=@Actor ORDER BY updated_at_utc DESC,dashboard_id FOR JSON PATH),N'[]') items_json;
 RETURN;
END;
IF @Action='GET'
BEGIN
 IF @Dashboard IS NULL OR NOT EXISTS(SELECT 1 FROM studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor)
 BEGIN SELECT CAST(0 AS bit) success,'DASHBOARD_NOT_FOUND' code; RETURN; END;
 SELECT CAST(1 AS bit) success,CONVERT(varchar(36),dashboard_id) dashboard_id,dashboard_name,version,document_json
 FROM studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
 RETURN;
END;
IF @Action='SAVE'
BEGIN
 IF @ExpectedVersion IS NULL OR @ExpectedVersion<0 OR @ExpectedVersion>=2147483647 OR @Name IS NULL OR NULLIF(LTRIM(RTRIM(@Name)),N'') IS NULL OR DATALENGTH(@Name)>300
    OR @Document IS NULL OR ISJSON(@Document)<>1 OR DATALENGTH(@Document)>12000000
 BEGIN SELECT CAST(0 AS bit) success,'DASHBOARD_INPUT_INVALID' code; RETURN; END;
 BEGIN TRY
  BEGIN TRAN;
  IF @ExpectedVersion=0
  BEGIN
   IF @Dashboard IS NULL SET @Dashboard=NEWID();
   SELECT @CurrentVersion=version FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK) WHERE dashboard_id=@Dashboard;
   IF @CurrentVersion IS NULL
   BEGIN
    SET @CurrentVersion=1;
    INSERT studio.designer_dashboard(dashboard_id,owner_user_id,dashboard_name,document_json,version)
    VALUES(@Dashboard,@Actor,LTRIM(RTRIM(@Name)),@Document,@CurrentVersion);
   END
   ELSE IF NOT EXISTS(SELECT 1 FROM studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor AND version=1
     AND DATALENGTH(dashboard_name)=DATALENGTH(LTRIM(RTRIM(@Name))) AND dashboard_name COLLATE Latin1_General_100_BIN2=LTRIM(RTRIM(@Name)) COLLATE Latin1_General_100_BIN2
     AND DATALENGTH(document_json)=DATALENGTH(@Document) AND document_json COLLATE Latin1_General_100_BIN2=@Document COLLATE Latin1_General_100_BIN2)
    THROW 53310,'DASHBOARD_VERSION_CONFLICT',1;
  END
  ELSE
  BEGIN
   IF @Dashboard IS NULL THROW 53311,'DASHBOARD_NOT_FOUND',1;
   SELECT @CurrentVersion=version FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK) WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
   IF @CurrentVersion IS NULL THROW 53311,'DASHBOARD_NOT_FOUND',1;
   IF @CurrentVersion<>@ExpectedVersion THROW 53310,'DASHBOARD_VERSION_CONFLICT',1;
   SET @CurrentVersion=@CurrentVersion+1;
   UPDATE studio.designer_dashboard SET dashboard_name=LTRIM(RTRIM(@Name)),document_json=@Document,version=@CurrentVersion,updated_at_utc=SYSUTCDATETIME()
   WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
  END;
  COMMIT;
  SELECT CAST(1 AS bit) success,CONVERT(varchar(36),@Dashboard) dashboard_id,@CurrentVersion version;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  IF ERROR_NUMBER()=53310 SELECT CAST(0 AS bit) success,'DASHBOARD_VERSION_CONFLICT' code;
  ELSE IF ERROR_NUMBER()=53311 SELECT CAST(0 AS bit) success,'DASHBOARD_NOT_FOUND' code;
  ELSE THROW;
 END CATCH;
 RETURN;
END;
IF @Action='DELETE'
BEGIN
 IF @Dashboard IS NULL OR @ExpectedVersion IS NULL OR @ExpectedVersion<1
 BEGIN SELECT CAST(0 AS bit) success,'DASHBOARD_INPUT_INVALID' code; RETURN; END;
 BEGIN TRY
  BEGIN TRAN;
  SELECT @CurrentVersion=version FROM studio.designer_dashboard WITH(UPDLOCK,HOLDLOCK) WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
  IF @CurrentVersion IS NULL THROW 53311,'DASHBOARD_NOT_FOUND',1;
  IF @CurrentVersion<>@ExpectedVersion THROW 53310,'DASHBOARD_VERSION_CONFLICT',1;
  DELETE studio.designer_dashboard WHERE dashboard_id=@Dashboard AND owner_user_id=@Actor;
  COMMIT;
  SELECT CAST(1 AS bit) success,'DASHBOARD_DELETED' code;
 END TRY
 BEGIN CATCH
  IF XACT_STATE()<>0 ROLLBACK;
  IF ERROR_NUMBER()=53310 SELECT CAST(0 AS bit) success,'DASHBOARD_VERSION_CONFLICT' code;
  ELSE IF ERROR_NUMBER()=53311 SELECT CAST(0 AS bit) success,'DASHBOARD_NOT_FOUND' code;
  ELSE THROW;
 END CATCH;
 RETURN;
END;
END;
