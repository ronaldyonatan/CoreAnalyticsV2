#!/usr/bin/env python3
"""Generate guarded DEV query-dataset install/rollback after worker BEAM."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / 'artifacts'
HASH = '32FD006231EFF08FCC19DF564B3C9A112C3E54F3F308A66EEB641596A4D37123'


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit('Unexpected source template; refusing to generate')
    return text.replace(old, new, 1)


install = (ART / 'CoreAnalyticsV2-DATASET-SQL-QUERY-INSTALL-DEV.sql').read_text()
install = replace_once(install, 'D6E5A2CD61E081132FCAA1183EF9FBAB3F7AA00D5565DE08E39EDA5184ED022E', HASH)
install = replace_once(install, " SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);",
 " SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before);\n"
 " IF @declaration=0 SET @declaration=CHARINDEX(N'ALTER PROCEDURE [dbo].[spDashboard]',@before);")
install = replace_once(install, "    OR CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@before,@declaration+1)>0\n", '')
install = replace_once(install, " SET @after=STUFF(@after,@declaration,6,N'ALTER');", 
 " IF SUBSTRING(@after,@declaration,6)=N'CREATE' SET @after=STUFF(@after,@declaration,6,N'ALTER');")
install = replace_once(install, " SET @after=STUFF(@before,@marker,0,@insert);", """ IF OBJECT_ID(N'studio.worker_beam_gateway_backup',N'U') IS NULL
    OR OBJECT_ID(N'studio.phase2d8_dataplane_backup',N'U') IS NULL
    THROW 53227,'WORKER_BACKUP_REQUIRED',1;
 IF NOT EXISTS(SELECT 1 FROM studio.worker_beam_gateway_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE object_name=N'BI.dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
    AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
   OR NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
   WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@before)
    AND installed_definition COLLATE Latin1_General_100_BIN2=@before COLLATE Latin1_General_100_BIN2)
    THROW 53228,'GATEWAY_BACKUP_MISMATCH',1;
 SET @after=STUFF(@before,@marker,0,@insert);""")
install = replace_once(install, " VALUES(N'BI.dbo.spDashboard',@before,@installed);\n COMMIT;", """ VALUES(N'BI.dbo.spDashboard',@before,@installed);
 UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@installed
  WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 /* Worker rollback remains guarded until this query migration is rolled back. */
 COMMIT;""")
install = install.replace('SQL QUERY DATASET DEV CANDIDATE', 'SQL QUERY DATASET AFTER WORKER BEAM — DEV CANDIDATE', 1)
(ART / 'CoreAnalyticsV2-DATASET-QUERY-AFTER-WORKER-BEAM-INSTALL-DEV.sql').write_text(install)

rollback = (ART / 'CoreAnalyticsV2-DATASET-SQL-QUERY-ROLLBACK-DEV.sql').read_text()
rollback = replace_once(rollback, " SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old);", 
 " SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old);\n"
 " IF @declaration=0 SET @declaration=CHARINDEX(N'ALTER PROCEDURE [dbo].[spDashboard]',@old);")
rollback = replace_once(rollback, " IF @declaration=0 OR CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old,@declaration+1)>0", " IF @declaration=0")
rollback = replace_once(rollback, " SET @restore=STUFF(@old,@declaration,6,N'ALTER');", 
 " SET @restore=@old;\n IF SUBSTRING(@restore,@declaration,6)=N'CREATE' SET @restore=STUFF(@restore,@declaration,6,N'ALTER');")
rollback = replace_once(rollback, " SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old);", """ IF NOT EXISTS(SELECT 1 FROM studio.worker_beam_gateway_backup WITH(UPDLOCK,HOLDLOCK)
    WHERE object_name=N'BI.dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@old)
     AND installed_definition COLLATE Latin1_General_100_BIN2=@old COLLATE Latin1_General_100_BIN2)
    OR NOT EXISTS(SELECT 1 FROM studio.phase2d8_dataplane_backup WITH(UPDLOCK,HOLDLOCK)
    WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard' AND DATALENGTH(installed_definition)=DATALENGTH(@actual)
     AND installed_definition COLLATE Latin1_General_100_BIN2=@actual COLLATE Latin1_General_100_BIN2)
   THROW 53246,'GATEWAY_BACKUP_MISMATCH',1;
 SET @declaration=CHARINDEX(N'CREATE PROCEDURE [dbo].[spDashboard]',@old);""")
rollback = replace_once(rollback, " DROP PROCEDURE studio.spDatasetQueryRpc;", """ UPDATE studio.worker_beam_gateway_backup SET installed_definition=@actual WHERE object_name=N'BI.dbo.spDashboard';
 UPDATE studio.phase2d8_dataplane_backup SET installed_definition=@actual WHERE database_name=N'BI' AND object_name=N'dbo.spDashboard';
 DROP PROCEDURE studio.spDatasetQueryRpc;""")
rollback = rollback.replace('DEV rollback for CoreAnalyticsV2-DATASET-SQL-QUERY-INSTALL-DEV.sql.', 'DEV rollback for the query dataset migration after worker BEAM.', 1)
(ART / 'CoreAnalyticsV2-DATASET-QUERY-AFTER-WORKER-BEAM-ROLLBACK-DEV.sql').write_text(rollback)
print('Generated guarded query dataset install and rollback candidates.')
