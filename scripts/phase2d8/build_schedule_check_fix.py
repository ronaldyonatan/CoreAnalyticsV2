"""Build narrowly guarded correction of the confirmed-installed 029 schedule checks."""
from pathlib import Path
R=Path(__file__).resolve().parents[2]
def lit(s):return "N'"+s.replace("'","''")+"'"
def body(s,p):return s[s.index(p):].replace('\r','').strip(' \t\n')
old="IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0"
new="IF @Owner IS NULL OR (CASE WHEN @ObjectType='SCHEDULE' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0"
parts=["""/* 030 SCHEDULE_CHECK_REV2: correct inherited SCHEDULE permission pre-checks in installed 029.
   Owner-only sharing/delete is unchanged. No grant rows or keys are modified.
   Run the whole file manually in DEV after 029. One XML result.
   Strict code-baseline guards and transaction; no normalization of SQL content.
*/
USE [CoreAnalytics]; SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53000,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID('studio.fnStudioScheduleAccess','FN') IS NULL OR OBJECT_ID('studio.fnStudioAccessLevel','FN') IS NULL
  THROW 53000,'SHARED_ACCESS_029_REQUIRED',1;
 IF OBJECT_ID('studio.phase2d8_schedule_check_backup','U') IS NULL
  CREATE TABLE studio.phase2d8_schedule_check_backup(
   object_name nvarchar(256) NOT NULL PRIMARY KEY,previous_definition nvarchar(max) NOT NULL,
   installed_definition nvarchar(max) NOT NULL,installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 DECLARE @object nvarchar(256),@parameter nvarchar(40),@before nvarchar(max),@expected nvarchar(max),
  @actual nvarchar(max),@recorded nvarchar(max),@new nvarchar(max),@message nvarchar(2048);
"""]
for name,param in [('spObjectAccessControlV2','@ActorUserID'),('spObjectAccessRpc','@Payload')]:
    source=(R/'data-studio-backend/phase2d8'/(name+'.sql')).read_text()
    assert source.count(old)==1
    target=source.replace(old,new)
    out=R/'data-studio-backend/phase2d8/030';out.mkdir(exist_ok=True)
    (out/(name+'.sql')).write_text(target)
    parts.append(f"SET @object=N'studio.{name}'; SET @parameter=N'{param}'; SET @expected={lit(body(source,param))};\n")
    parts.append("""SET @before=OBJECT_DEFINITION(OBJECT_ID(@object));
 IF @before IS NULL THROW 53001,'PROCEDURE_DEFINITION_NOT_VISIBLE',1;
 IF EXISTS(SELECT 1 FROM studio.phase2d8_schedule_check_backup WITH(UPDLOCK,HOLDLOCK) WHERE object_name=@object)
 BEGIN
  SELECT @recorded=installed_definition FROM studio.phase2d8_schedule_check_backup WHERE object_name=@object;
  IF DATALENGTH(@before)<>DATALENGTH(@recorded) OR @before COLLATE Latin1_General_100_BIN2<>@recorded COLLATE Latin1_General_100_BIN2
   THROW 53002,'PROCEDURE_CHANGED_AFTER_030_INSTALL',1;
 END
 ELSE
 BEGIN
  IF CHARINDEX(@parameter,@before)=0 THROW 53003,'UNREVIEWED_SIGNATURE',1;
  SET @actual=LTRIM(RTRIM(REPLACE(SUBSTRING(@before,CHARINDEX(@parameter,@before),LEN(@before)),CHAR(13),'')));
  SET @expected=LTRIM(RTRIM(REPLACE(@expected,CHAR(13),'')));
  WHILE UNICODE(LEFT(@actual,1)) IN(9,10,32) SET @actual=LTRIM(STUFF(@actual,1,1,N''));
  WHILE UNICODE(RIGHT(@actual,1)) IN(9,10,32) SET @actual=RTRIM(LEFT(@actual,LEN(@actual)-1));
  WHILE UNICODE(LEFT(@expected,1)) IN(9,10,32) SET @expected=LTRIM(STUFF(@expected,1,1,N''));
  WHILE UNICODE(RIGHT(@expected,1)) IN(9,10,32) SET @expected=RTRIM(LEFT(@expected,LEN(@expected)-1));
  IF DATALENGTH(@actual)<>DATALENGTH(@expected) OR @actual COLLATE Latin1_General_100_BIN2<>@expected COLLATE Latin1_General_100_BIN2
  BEGIN
   SELECT (SELECT @object AS [object_name],@actual AS [actual_body] FOR XML PATH('phase2d8_030_mismatch'),TYPE) AS [OPEN_AND_SAVE_DIAGNOSTIC_XML];
   SET @message=N'UNREVIEWED_029_DEFINITION: '+@object; THROW 53004,@message,1;
  END;
""")
    parts.append(f"  SET @new=REPLACE(@before,{lit(old)},{lit(new)});\n")
    parts.append("""  /* Persisted module headers may say CREATE even after an ALTER deployment.
     Use a fixed ALTER header; preserve parameters and body from the checked definition. */
  SET @new=N'ALTER PROCEDURE '+@object+N' '+SUBSTRING(@new,CHARINDEX(@parameter,@new),LEN(@new));
  EXEC sys.sp_executesql @new;
  INSERT studio.phase2d8_schedule_check_backup(object_name,previous_definition,installed_definition)
   VALUES(@object,@before,OBJECT_DEFINITION(OBJECT_ID(@object)));
 END;
""")
parts.append(""" COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT (SELECT N'SCHEDULE_INHERITED_CHECK_030_INSTALLED_DEV_TRIALS_REQUIRED' AS [status],
 CONVERT(varchar(33),SYSUTCDATETIME(),126) AS [verified_at_utc],
 N'Schedule CHECK/GET now use the same target inheritance as list/edit. Owner-only sharing/delete unchanged.' AS [scope]
 FOR XML PATH('phase2d8_schedule_check_fix'),TYPE) AS [OPEN_AND_SAVE_THIS_XML];
""")
s=''.join(parts)
(R/'data-studio-backend/migrations/030_SCHEDULE_INHERITED_CHECK_DEV.sql').write_text(s)
(R/'artifacts/CoreAnalyticsV2-Phase2D8-SCHEDULE-CHECK-FIX.sql').write_text(s)
(R/'data-studio-backend/migrations/030B_ROLLBACK_SCHEDULE_CHECK.sql').write_text("""/* Manual DEV rollback of 030 only. Roll back 030 before rolling back 029. */
USE [CoreAnalytics]; SET NOCOUNT ON; SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53000,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 DECLARE @object nvarchar(256),@before nvarchar(max),@installed nvarchar(max),@current nvarchar(max),@parameter nvarchar(40),@restore nvarchar(max);
 DECLARE restore_schedule_checks CURSOR LOCAL FAST_FORWARD FOR
  SELECT object_name,previous_definition,installed_definition FROM studio.phase2d8_schedule_check_backup WITH(UPDLOCK,HOLDLOCK);
 OPEN restore_schedule_checks; FETCH NEXT FROM restore_schedule_checks INTO @object,@before,@installed;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @current=OBJECT_DEFINITION(OBJECT_ID(@object));
  IF @current IS NULL OR DATALENGTH(@current)<>DATALENGTH(@installed) OR @current COLLATE Latin1_General_100_BIN2<>@installed COLLATE Latin1_General_100_BIN2
   THROW 53005,'ROLLBACK_REFUSES_CHANGED_DEFINITION',1;
  SET @parameter=CASE WHEN @object='studio.spObjectAccessControlV2' THEN '@ActorUserID' ELSE '@Payload' END;
  IF CHARINDEX(@parameter,@before)=0 THROW 53003,'UNREVIEWED_SIGNATURE',1;
  SET @restore=N'ALTER PROCEDURE '+@object+N' '+SUBSTRING(@before,CHARINDEX(@parameter,@before),LEN(@before));
  EXEC sys.sp_executesql @restore;
  FETCH NEXT FROM restore_schedule_checks INTO @object,@before,@installed;
 END;
 CLOSE restore_schedule_checks; DEALLOCATE restore_schedule_checks;
 DELETE studio.phase2d8_schedule_check_backup;
 COMMIT;
END TRY
BEGIN CATCH
 IF @@TRANCOUNT>0 ROLLBACK;
 THROW;
END CATCH;
SELECT N'030_ROLLED_BACK_029_PRESERVED' AS result;
""")
print('Generated guarded 030 install + rollback, 2 narrowly corrected procedures.')
