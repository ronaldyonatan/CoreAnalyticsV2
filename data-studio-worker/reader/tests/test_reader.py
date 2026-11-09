import datetime
import decimal
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pyarrow as pa
import pyarrow.parquet as pq
from parquet_reader import read_page,output_index,OutputError
from server import create_app


class ReaderTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name);self.run=str(uuid.uuid4());self.node='output/opaque-id'
        self.directory=self.root/self.run/'output-0';self.directory.mkdir(parents=True)
        self.schema={'type':'struct','fields':[{'name':'ID','type':'integer','nullable':False,'metadata':{}},{'name':'Text','type':'string','nullable':True,'metadata':{}},{'name':'Amount','type':'decimal(12,2)','nullable':True,'metadata':{}},{'name':'Day','type':'date','nullable':True,'metadata':{}},{'name':'Literal.Dot','type':'string','nullable':True,'metadata':{}}]}
        self.addCleanup(output_index.cache_clear)
    def seed(self,count=5003):
        table=pa.table({'ID':pa.array(range(count),type=pa.int32()),'Text':['x'*900]*count,'Amount':pa.array([decimal.Decimal('123.45')]*count,type=pa.decimal128(12,2)),'Day':pa.array([datetime.date(2026,11,8)]*count,type=pa.date32()),'Literal.Dot':['dot']*count})
        pq.write_table(table.slice(0,min(1234,count)),self.directory/'part-00000.parquet',row_group_size=37)
        if count>1234:pq.write_table(table.slice(1234),self.directory/'part-00001.parquet',row_group_size=37)
        (self.directory/'_SUCCESS').touch()
        self.manifest={'version':1,'run_id':self.run,'outputs':[{'id':self.node,'name':'Result','path':'output-0','row_count':count,'schema':self.schema}]}
        self.write_manifest()
    def write_manifest(self):
        (self.root/self.run/'manifest.json').write_text(json.dumps(self.manifest))
    def page(self,page=1):return read_page(self.root,{'run_id':self.run,'node_id':self.node,'page':page})
    def test_pages_cross_row_groups_and_files_without_repeating_or_omitting_rows(self):
        self.seed();result=self.page(25)
        self.assertEqual([r[0] for r in result['rows']],[str(i) for i in range(1200,1250)])
        self.assertEqual(result['total_rows'],5003);self.assertTrue(result['has_more']);self.assertTrue(result['stable_order'])
        self.assertEqual(self.page(101)['rows'][-1][0],'5002');self.assertFalse(self.page(101)['has_more']);self.assertEqual(self.page(200)['rows'],[])
    def test_display_preserves_decimal_date_and_literal_column_names_and_flags_truncation(self):
        self.seed();result=self.page()
        self.assertEqual(result['rows'][0],['0','x'*256,'123.45','2026-11-08','dot']);self.assertTrue(result['truncated_cells'])
        self.assertEqual(len(pq.read_table(self.directory/'part-00000.parquet')['Text'][0].as_py()),900)
        self.assertEqual(result['schema'],self.schema)
    def test_repeated_pages_are_stable_and_index_does_not_cache_rows(self):
        self.seed();first=self.page(2);self.assertEqual(first,self.page(2));self.assertGreater(output_index.cache_info().hits,0)
        self.assertEqual(self.page()['rows'][0][0],'0')
    def test_empty_output_has_schema_and_no_next_page(self):
        self.seed(0);result=self.page();self.assertEqual(result['rows'],[]);self.assertEqual(len(result['columns']),5);self.assertFalse(result['has_more'])
    def test_unknown_output_and_uncommitted_run_not_opened(self):
        self.seed()
        with self.assertRaisesRegex(OutputError,'NOT_FOUND'):read_page(self.root,{'run_id':self.run,'node_id':'unknown','page':1})
        (self.directory/'_SUCCESS').unlink()
        with self.assertRaisesRegex(OutputError,'ARTIFACT_INVALID'):self.page()
    def test_traversal_extra_fields_and_invalid_pages_rejected_before_file_reads(self):
        for change in [{'run_id':'../private'},{'path':'../../etc/passwd'},{'page':0},{'page':True},{'page':2**31},{'page':'2'}]:
            request={'run_id':self.run,'node_id':self.node,'page':1,**change}
            with self.subTest(change=change),patch('parquet_reader.output_index') as index:
                with self.assertRaises(OutputError):read_page(self.root,request)
                index.assert_not_called()
    def test_manifest_count_or_directory_alias_mismatch_rejected(self):
        self.seed();self.manifest['outputs'][0]['row_count']=2;self.write_manifest()
        with self.assertRaisesRegex(OutputError,'ARTIFACT_INVALID'):self.page()
        self.manifest['outputs'][0]['row_count']=5003;self.manifest['outputs'][0]['path']='../private';self.write_manifest()
        with self.assertRaisesRegex(OutputError,'ARTIFACT_INVALID'):self.page()
    def test_symlink_artifacts_rejected(self):
        self.seed();part=self.directory/'part-00000.parquet';moved=self.root/'outside.parquet';part.rename(moved);part.symlink_to(moved)
        with self.assertRaisesRegex(OutputError,'ARTIFACT_INVALID'):self.page()
    def test_http_auth_precedes_storage_and_errors_never_expose_paths(self):
        app=create_app(self.root,'a'*64);client=app.test_client()
        with patch('server.read_page') as read:
            self.assertEqual(client.post('/internal/output-page',json={}).status_code,403);read.assert_not_called()
        with patch('server.read_page',side_effect=RuntimeError('/private/path sensitive-record')):
            response=client.post('/internal/output-page',json={},headers={'X-Studio-Reader-Token':'a'*64})
            self.assertEqual(response.status_code,503);self.assertNotIn('sensitive',response.text);self.assertEqual(response.headers['Cache-Control'],'no-store')
    def test_wide_output_keeps_full_schema_but_projects_only_thirty_columns(self):
        table=pa.table({'C'+str(i):pa.array([i,None],type=pa.int32()) for i in range(61)})
        pq.write_table(table,self.directory/'part-00000.parquet');(self.directory/'_SUCCESS').touch()
        schema={'type':'struct','fields':[{'name':name,'type':'integer','nullable':True,'metadata':{}} for name in table.column_names]}
        self.manifest={'version':1,'run_id':self.run,'outputs':[{'id':self.node,'name':'Wide','path':'output-0','row_count':2,'schema':schema}]};self.write_manifest()
        result=self.page();self.assertEqual(len(result['columns']),61);self.assertEqual(len(result['rows'][0]),30);self.assertEqual(result['omitted_columns'],31);self.assertEqual(result['rows'][1],[None]*30)
    def test_http_rejects_oversized_body_and_non_ascii_token(self):
        client=create_app(self.root,'a'*64).test_client()
        self.assertEqual(client.post('/internal/output-page',json={},headers={'X-Studio-Reader-Token':'é'*32}).status_code,403)
        response=client.post('/internal/output-page',data=b'x'*4097,content_type='application/json',headers={'X-Studio-Reader-Token':'a'*64})
        self.assertEqual(response.status_code,413)

    def test_http_serves_real_parquet_page(self):
        self.seed();client=create_app(self.root,'a'*64).test_client()
        result=client.post('/internal/output-page',json={'run_id':self.run,'node_id':self.node,'page':2},headers={'X-Studio-Reader-Token':'a'*64})
        self.assertEqual(result.status_code,200);self.assertEqual(result.json['data']['rows'][0][0],'50')


if __name__=='__main__':unittest.main()
