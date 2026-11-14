#!/usr/bin/env python3
"""Build guarded DEV-only targeted claim migration, without changing dashboard."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
folder = ROOT / 'data-studio-backend/worker-beam'


def body(name):
    text = (folder / name).read_text(encoding='utf-8')
    return text[text.index('CREATE PROCEDURE'):]


old = body('spWorkerBeamRpc.sql')
new = body('spWorkerBeamRpc-targeted.sql').replace('CREATE PROCEDURE', 'ALTER PROCEDURE', 1)
sql = r"""/* DEV CANDIDATE. Adds one signed targeted claim operation; no jobs run.
   Does not alter spDashboard, signing keys, grants, or the FIFO worker path.
   Refuses unknown gateway changes and rolls back on any mismatch. */
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53400,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF OBJECT_ID(N'studio.spWorkerBeamRpc',N'P') IS NULL OR OBJECT_ID(N'studio.spDatasetIngestWorker',N'P') IS NULL
    OR OBJECT_ID(N'studio.fnStudioAccessLevel',N'FN') IS NULL THROW 53401,'WORKER_PREREQUISITES_REQUIRED',1;
 IF OBJECT_ID(N'studio.worker_beam_targeted_backup') IS NOT NULL THROW 53402,'TARGETED_CLAIM_ALREADY_INSTALLED_OR_UNREVIEWED',1;
 DECLARE @expected nvarchar(max)=N'__OLD__',@new nvarchar(max)=N'__NEW__',@actual nvarchar(max),@installed nvarchar(max),
  @expectedBody nvarchar(max),@actualBody nvarchar(max),@newBody nvarchar(max),@a int,@b int;
 SET @actual=OBJECT_DEFINITION(OBJECT_ID(N'studio.spWorkerBeamRpc'));
 SET @a=CHARINDEX(N'@Payload',@expected); SET @b=CHARINDEX(N'@Payload',@actual);
 IF @actual IS NULL OR @a=0 OR @b=0 THROW 53403,'GATEWAY_DEFINITION_NOT_VISIBLE',1;
 SET @expectedBody=REPLACE(SUBSTRING(@expected,@a,LEN(@expected)),CHAR(13),N'');
 SET @actualBody=REPLACE(SUBSTRING(@actual,@b,LEN(@actual)),CHAR(13),N'');
 IF DATALENGTH(@expectedBody)<>DATALENGTH(@actualBody) OR @expectedBody COLLATE Latin1_General_100_BIN2<>@actualBody COLLATE Latin1_General_100_BIN2
  THROW 53404,'UNREVIEWED_WORKER_GATEWAY_DEFINITION',1;
 CREATE TABLE studio.worker_beam_targeted_backup(object_name nvarchar(128) NOT NULL PRIMARY KEY,
  previous_definition nvarchar(max) NOT NULL,installed_definition nvarchar(max) NOT NULL,
  installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 EXEC sys.sp_executesql @new;
 SET @installed=OBJECT_DEFINITION(OBJECT_ID(N'studio.spWorkerBeamRpc'));
 SET @a=CHARINDEX(N'@Payload',@new); SET @b=CHARINDEX(N'@Payload',@installed);
 IF @installed IS NULL OR @a=0 OR @b=0 THROW 53405,'INSTALLED_DEFINITION_NOT_VISIBLE',1;
 SET @newBody=REPLACE(SUBSTRING(@new,@a,LEN(@new)),CHAR(13),N'');
 SET @actualBody=REPLACE(SUBSTRING(@installed,@b,LEN(@installed)),CHAR(13),N'');
 IF DATALENGTH(@newBody)<>DATALENGTH(@actualBody) OR @newBody COLLATE Latin1_General_100_BIN2<>@actualBody COLLATE Latin1_General_100_BIN2
  THROW 53406,'INSTALLED_DEFINITION_MISMATCH',1;
 INSERT studio.worker_beam_targeted_backup(object_name,previous_definition,installed_definition)
 VALUES(N'studio.spWorkerBeamRpc',@actual,@installed);
 COMMIT;
 SELECT (SELECT N'TARGETED_WORKER_CLAIM_INSTALLED_DEV_TRIALS_REQUIRED' status,SYSUTCDATETIME() verified_at_utc,
  N'No jobs run; existing FIFO claim and scheduler unchanged.' scope
  FOR XML PATH('worker_beam_targeted_install'),TYPE) AS OPEN_AND_SAVE_XML;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
"""
out = sql.replace('__OLD__', old.replace("'", "''")).replace('__NEW__', new.replace("'", "''"))
(ROOT / 'artifacts/CoreAnalyticsV2-WORKER-BEAM-TARGETED-CLAIM-DEV.sql').write_text(out, encoding='utf-8')
print('Generated targeted claim DEV candidate.')
