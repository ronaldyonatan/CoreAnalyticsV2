/* CoreAnalyticsV2 3.1A - run manually against BI DEVELOPMENT after 021.
   Adds exactly one guarded mode branch to the existing BI.dbo.spDashboard.
   BACKUP THE ORIGINAL PROCEDURE. Script aborts on unknown header or anchor.
   If your BI dispatcher is substantially customized, insert the exact branch
   manually under existing CoreStudio* modes instead of forcing this script.
*/
USE [BI];
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF OBJECT_ID(N'[CoreAnalytics].studio.spSchedulerControl',N'P') IS NULL
    PRINT 'Cross-database OBJECT_ID may not resolve; scheduler procedure is checked at runtime.';
IF OBJECT_ID(N'dbo.spDashboard',N'P') IS NULL THROW 52120,'BI.dbo.spDashboard missing',1;
DECLARE @definition nvarchar(max)=(SELECT definition FROM sys.sql_modules WHERE object_id=OBJECT_ID(N'dbo.spDashboard',N'P'));
IF @definition IS NULL THROW 52121,'Cannot read BI dispatcher definition',1;
IF CHARINDEX(N'CoreStudioScheduler',@definition)>0
BEGIN PRINT N'Scheduler BEAM mode already present.'; END
ELSE
BEGIN
 IF CHARINDEX(N'CoreStudioPipelines',@definition)=0 OR CHARINDEX(N'@Payload',@definition)=0
    THROW 52122,'Unknown BI dispatcher: pipeline mode or payload missing',1;
 DECLARE @pos int=CHARINDEX(N'SET NOCOUNT ON;',UPPER(@definition));
 IF @pos=0 THROW 52123,'BI dispatcher anchor missing',1;
 DECLARE @branch nvarchar(max)=CHAR(13)+CHAR(10)+
   N'IF @Mode = ''CoreStudioScheduler'' BEGIN EXEC [CoreAnalytics].studio.spSchedulerControl @Payload=@Payload; RETURN; END;'+CHAR(13)+CHAR(10);
 DECLARE @patched nvarchar(max)=STUFF(@definition,@pos+LEN(N'SET NOCOUNT ON;'),0,@branch);
 /* SQL Server sys.sql_modules may preserve CREATE rather than ALTER. Find the first executable word,
    ignoring only whitespace/BOM and leading SQL comments; do not mutate unknown layouts. */
 DECLARE @i int=1,@end int,@total int=LEN(@patched);
 WHILE @i<=@total
 BEGIN
  WHILE @i<=@total AND UNICODE(SUBSTRING(@patched,@i,1)) IN (9,10,13,32,65279) SET @i=@i+1;
  IF SUBSTRING(@patched,@i,2)=N'/*'
  BEGIN
   SET @end=CHARINDEX(N'*/',@patched,@i+2);
   IF @end=0 THROW 52124,'Unterminated comment in procedure header',1;
   SET @i=@end+2; CONTINUE;
  END;
  IF SUBSTRING(@patched,@i,2)=N'--'
  BEGIN
   SET @end=CHARINDEX(CHAR(10),@patched,@i+2);
   IF @end=0 THROW 52124,'Incomplete line comment in procedure header',1;
   SET @i=@end+1; CONTINUE;
  END;
  BREAK;
 END;
 DECLARE @head nvarchar(250)=UPPER(SUBSTRING(@patched,@i,250));
 SET @head=REPLACE(REPLACE(REPLACE(@head,CHAR(9),' '),CHAR(10),' '),CHAR(13),' ');
 WHILE CHARINDEX(N'  ',@head)>0 SET @head=REPLACE(@head,N'  ',N' ');
 IF LEFT(@head,17)=N'CREATE PROCEDURE ' OR LEFT(@head,12)=N'CREATE PROC '
   SET @patched=STUFF(@patched,@i,6,N'ALTER');
 ELSE IF LEFT(@head,16)<>N'ALTER PROCEDURE ' AND LEFT(@head,11)<>N'ALTER PROC ' AND
         LEFT(@head,26)<>N'CREATE OR ALTER PROCEDURE ' AND LEFT(@head,21)<>N'CREATE OR ALTER PROC '
   THROW 52125,'Unknown dispatcher CREATE/ALTER declaration. Nothing changed.',1;
 EXEC sys.sp_executesql @patched;
 PRINT N'CoreStudioScheduler route successfully installed.';
END;
GO
SELECT CASE WHEN CHARINDEX(N'CoreStudioScheduler',definition)>0 THEN 1 ELSE 0 END scheduler_mode_installed
FROM sys.sql_modules WHERE object_id=OBJECT_ID(N'dbo.spDashboard');
GO
