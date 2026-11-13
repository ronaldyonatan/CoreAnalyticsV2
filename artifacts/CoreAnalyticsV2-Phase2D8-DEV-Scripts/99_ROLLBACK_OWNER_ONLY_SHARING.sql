/* DEV manual rollback. Restores the exact pre-install definition.
   WARNING: restores the previous admin sharing policy; disable sharing first. */
SET XACT_ABORT ON;
BEGIN TRY
 BEGIN TRAN;
 DECLARE @name nvarchar(256)='studio.spObjectAccessControlV2', @sql nvarchar(max), @installed nvarchar(max);
 SELECT @sql=previous_definition,@installed=installed_definition
 FROM studio.phase2d8_definition_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=@name;
 IF @sql IS NULL OR @installed IS NULL OR OBJECT_DEFINITION(OBJECT_ID(@name)) IS NULL
    OR @installed<>OBJECT_DEFINITION(OBJECT_ID(@name))
    THROW 52804, 'ROLLBACK_DEFINITION_MISSING_OR_CHANGED', 1;
 IF LEFT(LTRIM(@sql),15)='CREATE OR ALTER' SET @sql=STUFF(LTRIM(@sql),1,15,'ALTER');
 ELSE IF LEFT(LTRIM(@sql),6)='CREATE' SET @sql=STUFF(LTRIM(@sql),1,6,'ALTER');
 EXEC sys.sp_executesql @sql;
 DELETE studio.phase2d8_definition_backup WHERE object_name=@name;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
