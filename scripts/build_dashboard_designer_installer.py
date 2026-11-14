#!/usr/bin/env python3
"""Generate a guarded DEV candidate from the previously reviewed gateway installer."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
art=ROOT/'artifacts'
source=(art/'CoreAnalyticsV2-DATASET-QUERY-AFTER-WORKER-BEAM-INSTALL-DEV.sql').read_text()
expected_hash='B4A7FF8CFB81E2E7EF323A604C9B7843AEACB60A8EEA35B40D3B95B893684604'
header=source[:source.index('CREATE TABLE studio.dataset_query_source')]
header=header.replace('32FD006231EFF08FCC19DF564B3C9A112C3E54F3F308A66EEB641596A4D37123',expected_hash)
header=header.replace('CoreStudioDatasetQuery','CoreStudioDesignerDashboard').replace('studio.spDatasetQueryRpc','studio.spDesignerDashboardRpc')
header=header.replace("OBJECT_ID(N'studio.dataset_query_source') IS NOT NULL", "OBJECT_ID(N'studio.designer_dashboard') IS NOT NULL")
header=header.replace("OBJECT_ID(N'studio.dataset_query_gateway_backup') IS NOT NULL", "OBJECT_ID(N'studio.designer_gateway_backup') IS NOT NULL")
header=header.replace(" SET @after=STUFF(@before,@marker,0,@insert);", """ IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NULL
    OR NOT EXISTS(SELECT 1 FROM studio.dataset_query_gateway_backup WITH(UPDLOCK,HOLDLOCK)
      WHERE object_name=N'BI.dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
       AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
    THROW 53320,'QUERY_BACKUP_MISMATCH',1;
 SET @after=STUFF(@before,@marker,0,@insert);""")
# Worker backup deliberately tracks its own earlier installation, not the latest query patch.
start=header.index(" IF OBJECT_ID(N'studio.worker_beam_gateway_backup',N'U') IS NULL")
end=header.index(" IF OBJECT_ID(N'studio.dataset_query_gateway_backup',N'U') IS NULL",start)
header=header[:start]+""" IF OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NULL OR NOT EXISTS
  (SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
    AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
  THROW 53321,'PHASE2D8_BACKUP_MISMATCH',1;
"""+header[end:]
header=header.replace('SQL QUERY DATASET AFTER WORKER BEAM — DEV CANDIDATE','DASHBOARD DESIGNER — DEV CANDIDATE')
auth=source[source.index(' DECLARE @Request nvarchar(max),@IssuedAt'):source.index(" IF @Action=''STATUS''")]
auth=auth.replace('DATASET_QUERY_V1','DASHBOARD_DESIGNER_V1').replace("(''CREATE'',''GET'',''STATUS'')", "(''LIST'',''GET'',''SAVE'',''DELETE'')")
declaration=auth.index(' DECLARE @Purpose nvarchar(40)')
validation=auth.index(' IF @Purpose IS NULL',declaration)
auth=auth[:declaration]+''' DECLARE @Purpose nvarchar(40),@Action varchar(12),@Actor uniqueidentifier;
 SELECT @Purpose=purpose,@Action=action,@Actor=TRY_CONVERT(uniqueidentifier,actor)
 FROM OPENJSON(@Request) WITH (purpose nvarchar(40) ''$.Purpose'',action varchar(12) ''$.Action'',actor varchar(36) ''$.ActorUserID'');
'''+auth[validation:]
body=(ROOT/'data-studio-backend/dashboard-designer/gateway.sql').read_text().replace("'", "''")
table='''CREATE TABLE studio.designer_dashboard (
 dashboard_id uniqueidentifier NOT NULL PRIMARY KEY,owner_user_id uniqueidentifier NOT NULL,
 dashboard_name nvarchar(150) NOT NULL,document_json nvarchar(max) NOT NULL,version int NOT NULL,
 created_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),updated_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT CK_designer_dashboard_json CHECK(ISJSON(document_json)=1),CONSTRAINT CK_designer_dashboard_version CHECK(version>0));
CREATE INDEX IX_designer_dashboard_owner ON studio.designer_dashboard(owner_user_id,updated_at_utc DESC);
'''
footer='''
 CREATE TABLE studio.designer_gateway_backup(object_name nvarchar(256) NOT NULL PRIMARY KEY,
  previous_definition nvarchar(max) NOT NULL,installed_definition nvarchar(max) NOT NULL,
  installed_at_utc datetime2(3) NOT NULL DEFAULT SYSUTCDATETIME());
 SET @statement=N'USE [BI]; EXEC sys.sp_executesql @body;';
 EXEC sys.sp_executesql @statement,N'@body nvarchar(max)',@after;
 SELECT @installed=m.definition FROM BI.sys.sql_modules m JOIN BI.sys.objects o ON o.object_id=m.object_id
 JOIN BI.sys.schemas s ON s.schema_id=o.schema_id WHERE s.name=N'dbo' AND o.name=N'spDashboard' AND o.type='P';
 SET @a=CHARINDEX(N'@Mode',@after); SET @b=CHARINDEX(N'@Mode',@installed);
 IF @installed IS NULL OR @a=0 OR @b=0
  OR DATALENGTH(SUBSTRING(@after,@a,LEN(@after)))<>DATALENGTH(SUBSTRING(@installed,@b,LEN(@installed)))
  OR SUBSTRING(@after,@a,LEN(@after)) COLLATE Latin1_General_100_BIN2<>SUBSTRING(@installed,@b,LEN(@installed)) COLLATE Latin1_General_100_BIN2
  THROW 53322,'GATEWAY_POST_INSTALL_VERIFICATION_FAILED',1;
 INSERT studio.designer_gateway_backup(object_name,previous_definition,installed_definition) VALUES(N'BI.dbo.spDashboard',@before,@installed);
 UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@installed WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 /* Query rollback remains guarded until the designer gateway is rolled back. */
 COMMIT;
 SELECT (SELECT N'DASHBOARD_DESIGNER_INSTALLED_DEV_TRIALS_REQUIRED' AS [status],SYSUTCDATETIME() AS [verified_at_utc]
  FOR XML PATH('dashboard_designer_install'),TYPE) AS OPEN_AND_SAVE_XML;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK;
 THROW;
END CATCH;
'''
result=header+table+" EXEC sys.sp_executesql N'CREATE PROCEDURE studio.spDesignerDashboardRpc @Payload nvarchar(max)\nAS\nBEGIN\n SET NOCOUNT ON; SET XACT_ABORT ON;\n"+auth+body+"';\n"+footer
result=result.replace('DATASET_QUERY_', 'DASHBOARD_').replace('   SQL scripts use the Connection account privileges, including linked servers. */','   Dashboard metadata is owner-scoped; no source query is executed by this installer. */')
(art/'CoreAnalyticsV2-DASHBOARD-DESIGNER-INSTALL-DEV.sql').write_text(result)
print('Generated guarded DEV candidate.')
