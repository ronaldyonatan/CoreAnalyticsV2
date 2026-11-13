"""Offline security regression contracts for the guarded SQL deployment artifact.
Does not substitute for SQL Server compilation or actor integration trials.
"""
import re,unittest
from pathlib import Path
R=Path(__file__).resolve().parents[2]
D=R/'data-studio-backend/phase2d8'
class SQLCandidateTests(unittest.TestCase):
 def test_sharing_and_delete_remain_owner_only(self):
  s=(D/'spObjectAccessControlV2.sql').read_text()
  self.assertIn("ELSE IF @Action<>'GET' AND @Owner<>@ActorUserID\n",s)
  self.assertNotIn("ELSE IF @Action<>'GET' AND @Owner<>@ActorUserID AND @IsAdmin",s)
  for name in ('spPipelineControl','spDatasetIngestControl','spChartControl'):
   text=(D/(name+'.sql')).read_text()
   self.assertIn('THEN 30',text)
 def test_every_explicit_share_has_edit_level_and_admin_does_not(self):
  s=(D/'fnStudioAccessLevel.sql').read_text()
  self.assertIn("a.access_role IN ('VIEWER','EDITOR')",s)
  self.assertIn('RETURN 20',s);self.assertIn('RETURN 10',s)
  self.assertLess(s.index('RETURN 20'),s.index('RETURN 10'))
  self.assertIn('owner_user_id',s);self.assertIn('RETURN 30',s)
  self.assertIn('is_active=1 AND is_locked=0',s)
 def test_legacy_catalog_predicates_are_replaced_before_sql_limits(self):
  s=(D/'spPipelineControl.sql').read_text()
  self.assertNotIn('p.created_by=@owner',s)
  self.assertNotIn('r.requested_by=@owner',s)
  self.assertIn("WHERE studio.fnStudioAccessLevel(@owner,'PIPELINE',r.pipeline_id)>=10 ORDER BY",s)
  s=(D/'spDashboard.sql').read_text()
  self.assertIn("WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@StudioUserID,'CONNECTION',connection_id)>=10 ORDER BY",s)
  self.assertIn("WHERE [CoreAnalytics].studio.fnStudioAccessLevel(@DSUser,'DATASET',d.dataset_id)>=10 ORDER BY",s)
 def test_all_atomic_registration_and_legacy_dashboard_modes_are_preserved(self):
  for name in ('spDashboard','spPipelineControl','spSchedulerControl','spChartControl','spStoredDatasetCreate'):
   db='BI' if name=='spDashboard' else 'COREANALYTICS'
   before=(R/'artifacts/phase2d8-dev-inventory'/(('BI__spDashboard_reviewed_029.sql' if name=='spDashboard' else db+'__'+name+'.sql'))).read_text()
   after=(D/(name+'.sql')).read_text()
   self.assertEqual(before.count('PHASE2D3_ATOMIC_OWNERSHIP'),after.count('PHASE2D3_ATOMIC_OWNERSHIP'))
  before=(R/'artifacts/phase2d8-dev-inventory/BI__spDashboard_reviewed_029.sql').read_text()
  after=(D/'spDashboard.sql').read_text()
  boundary='/* Phase 2.2A: update connection metadata; preserve secret when omitted. */'
  before=before[:before.index(boundary)];after=after[:after.index(boundary)]
  before=re.sub(r'\bCREATE\s+(?:OR\s+ALTER\s+)?PROCEDURE','ALTER PROCEDURE',before,count=1,flags=re.I)
  self.assertEqual(before,after)
 def test_dataset_scoped_secret_checks_exact_parent_and_no_broad_connection_fallback(self):
  s=(D/'spDashboard.sql').read_text()
  self.assertIn('ref.connection_id=secret.connection_id',s)
  self.assertIn("JSON_VALUE(@Payload,'$.DatasetID') IS NULL AND",s)
  self.assertIn("studio.fnStudioAccessLevel(@DSUser,'DATASET',ref.dataset_id)>=10",s)
 def test_worker_publication_and_schedule_dispatch_recheck_current_rights(self):
  self.assertIn('PIPELINE_ACCESS_REVOKED',(D/'spPipelineControl.sql').read_text())
  self.assertIn("studio.fnStudioAccessLevel(requested_by,'DATASET',dataset_id)>=20",(D/'spDatasetIngestWorker.sql').read_text())
  self.assertIn('studio.fnStudioGraphSourcesAllowed(@owner,v.graph_json)=1',(D/'spSchedulerDispatch.sql').read_text())
 def test_every_proc_baseline_is_present_in_guarded_install_under_both_line_endings(self):
  s=(R/'data-studio-backend/migrations/029_SHARED_EDIT_DATAPLANE_DEV.sql').read_text()
  literals=re.findall(r"SET @expected=N'((?:[^']|'')*)'; SET @new=",s)
  self.assertEqual(len(literals),10)
  for text in literals:
   expected=text.replace("''", "'")
   self.assertEqual(expected.replace('\n','\r\n').replace('\r','').strip(' \t\n'),expected)
  self.assertIn('ROLLBACK;',s)
  self.assertIn('Latin1_General_100_BIN2',s)
  self.assertIn('DATALENGTH(@body)<>DATALENGTH(@expected)',s)
 def test_gateway_expected_matches_reviewed_mismatch_export_exactly(self):
  s=(R/'artifacts/CoreAnalyticsV2-Phase2D8-SHARED-ACCESS-INSTALL-AND-VERIFY.sql').read_text()
  m=re.search(r"SET @db=N'BI'; SET @object=N'dbo.spDashboard'; SET @parameter=N'@Mode'; SET @expected=N'((?:[^']|'')*)'; SET @new=",s)
  expected=m.group(1).replace("''", "'").replace('\r','').strip(' \t\n')
  reviewed=(R/'artifacts/phase2d8-dev-inventory/BI__spDashboard_reviewed_029.sql').read_text()
  actual=reviewed[reviewed.index('@Mode'):].replace('\r','').strip(' \t\n')
  self.assertEqual(expected,actual)
  self.assertEqual(len(expected.encode('utf-16le')),371414)
  original=(R/'artifacts/phase2d8-dev-inventory/BI__spDashboard.sql').read_text()
  original=original[original.index('@Mode'):].replace('\r','').strip(' \t\n')
  self.assertEqual(len(original.encode('utf-16le'))-len(actual.encode('utf-16le')),2)
  self.assertEqual([line for line in original.splitlines() if line.strip()], [line for line in actual.splitlines() if line.strip()])
 def test_schedule_inherited_permission_is_not_blocked_before_check_or_get(self):
  old="IF @Owner IS NULL OR studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID)=0"
  new="IF @Owner IS NULL OR (CASE WHEN @ObjectType='SCHEDULE' THEN studio.fnStudioScheduleAccess(@ActorUserID,@ObjectID) ELSE studio.fnStudioAccessLevel(@ActorUserID,@ObjectType,@ObjectID) END)=0"
  for name in ('spObjectAccessControlV2','spObjectAccessRpc'):
   before=(D/(name+'.sql')).read_text()
   after=(D/'030'/(name+'.sql')).read_text()
   self.assertNotIn(old,after)
   self.assertIn(new,after)
   self.assertEqual(after,before.replace(old,new))
  self.assertIn("ELSE IF @Action<>'GET' AND @Owner<>@ActorUserID\n",(D/'030/spObjectAccessControlV2.sql').read_text())
 def test_030_uses_exact_confirmed_029_bodies_for_both_newline_formats(self):
  s=(R/'artifacts/CoreAnalyticsV2-Phase2D8-SCHEDULE-CHECK-FIX.sql').read_text()
  norm=lambda value:value.replace('\r','').strip(' \t\n')
  for name,param in [('spObjectAccessControlV2','@ActorUserID'),('spObjectAccessRpc','@Payload')]:
   source=(D/(name+'.sql')).read_text();expected=norm(source[source.index(param):])
   for variant in (s,s.replace('\n','\r\n')):
    m=re.search(r"SET @object=N'studio\."+name+r"'; SET @parameter=N'"+param+r"'; SET @expected=N'((?:[^']|'')*)';",variant)
    self.assertIsNotNone(m)
    self.assertEqual(norm(m.group(1).replace("''", "'")),expected)
 def test_030_forces_alter_for_create_and_alter_persisted_headers(self):
  install=(R/'artifacts/CoreAnalyticsV2-Phase2D8-SCHEDULE-CHECK-FIX.sql').read_text()
  rollback=(R/'data-studio-backend/migrations/030B_ROLLBACK_SCHEDULE_CHECK.sql').read_text()
  self.assertEqual(install.count("SET @new=N'ALTER PROCEDURE '+@object+N' '+SUBSTRING(@new,CHARINDEX(@parameter,@new),LEN(@new));"),2)
  self.assertIn("SET @restore=N'ALTER PROCEDURE '+@object+N' '",rollback)
  self.assertNotIn('EXEC sys.sp_executesql @before;',rollback)
  for name,param in [('spObjectAccessControlV2','@ActorUserID'),('spObjectAccessRpc','@Payload')]:
   body=(D/'030'/(name+'.sql')).read_text();body=body[body.index(param):]
   for header in ('CREATE PROCEDURE','CREATE OR ALTER PROCEDURE','ALTER PROCEDURE'):
    stored=header+' studio.'+name+' '+body
    statement='ALTER PROCEDURE studio.'+name+' '+stored[stored.index(param):]
    self.assertTrue(statement.startswith('ALTER PROCEDURE '))
    self.assertEqual(statement[statement.index(param):],body)
