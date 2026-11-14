#!/usr/bin/env python3
"""Build a disabled-by-default DEV installer from a reviewed gateway hash."""
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--dashboard-sha256', required=True)
args = parser.parse_args()
if not re.fullmatch(r'[0-9a-fA-F]{64}', args.dashboard_sha256):
    parser.error('expected a 64-character SHA-256 hex digest')
rpc = (ROOT / 'data-studio-backend/worker-beam/spWorkerBeamRpc.sql').read_text(encoding='utf-8')
rpc = rpc[rpc.index('CREATE PROCEDURE'):]
escaped_rpc = rpc.replace("'", "''")
template = r"""/* DEV CANDIDATE: install manually in CoreAnalytics after review.
   Creates no signing key and does not enable workers or execute jobs.
   Protects current BI definition with SHA-256 and exact anchor guards.
   SQL Server integration tests and separate key provisioning are required. */
USE [CoreAnalytics];
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 53300,'RUN_WITHOUT_OPEN_TRANSACTION',1;
BEGIN TRY
 BEGIN TRAN;
 IF DB_ID(N'BI') IS NULL OR OBJECT_ID(N'studio.fnObjectAccessHmac256',N'FN') IS NULL
    OR OBJECT_ID(N'studio.spDatasetIngestWorker',N'P') IS NULL OR OBJECT_ID(N'studio.spSchedulerDispatch',N'P') IS NULL
    THROW 53301,'WORKER_BEAM_PREREQUISITES_REQUIRED',1;
 IF OBJECT_ID(N'studio.worker_beam_key') IS NOT NULL OR OBJECT_ID(N'studio.worker_beam_nonce') IS NOT NULL
    OR OBJECT_ID(N'studio.spWorkerBeamRpc') IS NOT NULL OR OBJECT_ID(N'studio.worker_beam_gateway_backup') IS NOT NULL
    THROW 53302,'EXISTING_WORKER_BEAM_OBJECTS_REVIEW_REQUIRED',1;
 DECLARE @before nvarchar(max),@after nvarchar(max),@installed nvarchar(max),@statement nvarchar(max),
  @stored nvarchar(max),@decl int,@marker int,@a int,@b int,
  @needle nvarchar(128)=N'IF @Mode = ''CoreStudioObjectAccess''',
  @insert nvarchar(max)=N'IF @Mode = ''CoreStudioWorkerRpc'' BEGIN EXEC [CoreAnalytics].studio.spWorkerBeamRpc @Payload=@Payload; RETURN; END;'+CHAR(10);
 SELECT @before=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 IF @before IS NULL OR CONVERT(varchar(64),HASHBYTES('SHA2_256',CONVERT(varbinary(max),@before)),2) <> '__HASH__'
  THROW 53303,'UNREVIEWED_GATEWAY_DEFINITION',1;
 SET @decl=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);
 SET @marker=CHARINDEX(@needle,@before);
 IF @decl=0 OR @marker<=@decl OR CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before,@decl+1)>0
  OR CHARINDEX(@needle,@before,@marker+1)>0 OR CHARINDEX(N'CoreStudioWorkerRpc',@before)>0
  THROW 53304,'GATEWAY_PATCH_ANCHOR_INVALID',1;
 /* Do not silently invalidate an earlier migration's definition guard. */
 IF OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NOT NULL
 BEGIN
  SELECT @stored=installed_definition FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
  IF @stored IS NOT NULL AND (DATALENGTH(@stored)<>DATALENGTH(@before) OR @stored COLLATE Latin1_General_100_BIN2<>@before COLLATE Latin1_General_100_BIN2)
   THROW 53305,'PREVIOUS_GATEWAY_BACKUP_MISMATCH',1;
  IF EXISTS(SELECT 1 FROM (VALUES(N'studio.spDatasetIngestWorker'),(N'studio.spSchedulerDispatch')) x(object_name)
   LEFT JOIN studio.phase2d8_dataplane_backup b ON b.database_name=N'CoreAnalytics' AND b.object_name=x.object_name
   WHERE b.installed_definition IS NULL OR OBJECT_DEFINITION(OBJECT_ID(x.object_name)) IS NULL
      OR DATALENGTH(b.installed_definition)<>DATALENGTH(OBJECT_DEFINITION(OBJECT_ID(x.object_name)))
      OR b.installed_definition COLLATE Latin1_General_100_BIN2<>OBJECT_DEFINITION(OBJECT_ID(x.object_name)) COLLATE Latin1_General_100_BIN2)
   THROW 53308,'WORKER_PROCEDURE_DEFINITION_MISMATCH',1;
 END;
 ELSE THROW 53308,'WORKER_PROCEDURE_REVIEW_REQUIRED',1;
 IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NOT NULL
  THROW 53306,'DATASET_QUERY_GATEWAY_REVIEW_REQUIRED',1;
 CREATE TABLE studio.worker_beam_key(key_id tinyint NOT NULL PRIMARY KEY CHECK(key_id=1),
  key_bytes varbinary(32) NOT NULL CHECK(DATALENGTH(key_bytes)=32),enabled bit NOT NULL DEFAULT(0));
 CREATE TABLE studio.worker_beam_nonce(nonce_id uniqueidentifier NOT NULL PRIMARY KEY,
  consumed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 CREATE INDEX IX_worker_beam_nonce_consumed ON studio.worker_beam_nonce(consumed_at_utc);
 CREATE TABLE studio.worker_beam_gateway_backup(object_name nvarchar(256) NOT NULL PRIMARY KEY,
  previous_definition nvarchar(max) NOT NULL,installed_definition nvarchar(max) NOT NULL,
  installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 EXEC sys.sp_executesql N'__RPC__';
 SET @after=STUFF(@before,@marker,0,@insert);
 SET @after=STUFF(@after,@decl,6,N'ALTER');
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@after;
 SELECT @installed=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 SET @a=CHARINDEX(N'@Mode',@after); SET @b=CHARINDEX(N'@Mode',@installed);
 IF @installed IS NULL OR @a=0 OR @b=0
  OR DATALENGTH(SUBSTRING(@after,@a,LEN(@after)))<>DATALENGTH(SUBSTRING(@installed,@b,LEN(@installed)))
  OR SUBSTRING(@after,@a,LEN(@after)) COLLATE Latin1_General_100_BIN2<>SUBSTRING(@installed,@b,LEN(@installed)) COLLATE Latin1_General_100_BIN2
  THROW 53307,'GATEWAY_POST_INSTALL_VERIFICATION_FAILED',1;
 INSERT studio.worker_beam_gateway_backup(object_name,previous_definition,installed_definition)
 VALUES(N'BI.dbo.spDashboard',@before,@installed);
 IF @stored IS NOT NULL
  UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@installed WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 COMMIT;
 SELECT (SELECT N'WORKER_BEAM_GATEWAY_INSTALLED_DISABLED_DEV_TESTS_REQUIRED' AS [status],
  SYSUTCDATETIME() AS [verified_at_utc],N'No signing key provisioned; no jobs started.' AS [scope]
  FOR XML PATH('worker_beam_install'),TYPE) AS [OPEN_AND_SAVE_XML];
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
"""
output = template.replace('__HASH__', args.dashboard_sha256.upper()).replace('__RPC__', escaped_rpc)
dest = ROOT / 'artifacts/CoreAnalyticsV2-WORKER-BEAM-INSTALL-DEV.sql'
dest.write_text(output, encoding='utf-8')
print(dest)
