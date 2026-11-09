import json
import os
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from pyspark.sql import SparkSession,functions as F
from pyspark.sql.types import IntegerType,DateType,DecimalType
from app.batch_graph import execute_graph,BatchError,validate_plan
from app.batch_storage import publish_outputs,contained
from app.preview import preview
from run_batch import run


class BatchTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spark=SparkSession.builder.master('local[2]').appName('Batch regression').config('spark.ui.enabled','false').config('spark.sql.shuffle.partitions','2').getOrCreate()
        cls.spark.sparkContext.setLogLevel('ERROR')
    @classmethod
    def tearDownClass(cls):cls.spark.stop()

    def test_full_rows_long_text_typed_parquet_and_immutable_publication(self):
        frame=self.spark.range(5000).select(F.col('id').cast('int').alias('ID'),F.lit('a'*900).alias('Text'),F.lit('2026-11-08').cast('date').alias('Day'),(F.col('id')/100).cast('decimal(12,2)').alias('Amount'))
        nodes=[{'id':'format','inputs':[{'node':'source','port':'main'}],'steps':[{'type':'format','column':'Text','case':'upper','numbers':''}]}]
        outputs=[{'id':'output','name':'Full dataset','input':{'node':'format','port':'main'}}]
        result=execute_graph({'source':frame},nodes,outputs)
        with tempfile.TemporaryDirectory() as temp:
            run_id=str(uuid.uuid4());manifest=publish_outputs(temp,run_id,result)
            self.assertEqual(manifest['outputs'][0]['row_count'],5000)
            restored=self.spark.read.parquet(str(Path(temp)/run_id/'output-0'))
            self.assertEqual(restored.count(),5000);self.assertEqual(restored.first()['Text'],'A'*900)
            self.assertIsInstance(restored.schema['ID'].dataType,IntegerType);self.assertIsInstance(restored.schema['Day'].dataType,DateType);self.assertIsInstance(restored.schema['Amount'].dataType,DecimalType)
            with self.assertRaisesRegex(BatchError,'OUTPUT_ALREADY_EXISTS'):publish_outputs(temp,run_id,result)
            self.assertTrue((Path(temp)/run_id/'manifest.json').is_file())
        # The context must reset: preview still truncates generated strings by its documented policy.
        bounded=preview([['a'*200,'b'*200]],['A','B'],[{'type':'combine','columns':['A','B'],'output':'C','delimiter':'','remove_sources':True}],self.spark)
        self.assertEqual(len(bounded['rows'][0][0]),256)

    def test_full_aggregate_and_join_do_not_sample_intermediate_frames(self):
        source=self.spark.range(5000).select(F.col('id').cast('int').alias('ID'))
        nodes=[{'id':'group','inputs':[{'node':'source','port':'main'}],'steps':[{'type':'group','groups':[],'aggregates':[{'op':'count','column':'*','output':'Count','kind':'Number'}]}]}]
        outputs=[{'id':'out','name':'Count','input':{'node':'group','port':'main'}}]
        result=execute_graph({'source':source},nodes,outputs);self.assertEqual(result[0]['frame'].first()['Count'],5000)
        nodes=[{'id':'join','inputs':[{'node':'left','port':'main'},{'node':'right','port':'main'}],'steps':[{'type':'join','join':'Inner','keys':[{'left':'ID','right':'ID'}],'prefix':'right_','key_kind':'Number','nulls':False}]}]
        outputs[0]['input']['node']='join';result=execute_graph({'left':source,'right':source},nodes,outputs);self.assertEqual(result[0]['frame'].count(),5000)

    def test_private_runner_reads_complete_parquet_and_commits_manifest(self):
        with tempfile.TemporaryDirectory() as temp,patch.dict(os.environ,{'STUDIO_BATCH_STORAGE_ROOT':temp}):
            self.spark.range(2000).write.parquet(str(Path(temp)/'input'))
            request={'run_id':str(uuid.uuid4()),'sources':[{'id':'source','kind':'parquet','path':'input'}],'nodes':[],'outputs':[{'id':'out','name':'Persisted','input':{'node':'source','port':'main'}}]}
            result=run(request,self.spark);self.assertEqual(result['outputs'][0]['row_count'],2000)
            self.assertEqual(json.loads((Path(temp)/result['run_id']/'manifest.json').read_text())['run_id'],result['run_id'])

    def test_unsupported_preview_adapters_and_invalid_graph_reject_before_source_reads(self):
        for kind in ('script','data_science','ai_llm','ai_model_trusted','select_store','restore_columns'):
            with self.assertRaisesRegex(BatchError,'UNSUPPORTED_COMPONENT'):validate_plan(['source'],[{'id':'node','inputs':[{'node':'source','port':'main'}],'steps':[{'type':kind}]}],[{'id':'out','name':'Out','input':{'node':'node','port':'main'}}])
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(BatchError,'STORAGE_PATH_INVALID'):contained(Path(root),Path(root).parent/'outside')

    def test_atomic_failure_leaves_no_visible_partial_output(self):
        frame=self.spark.range(10)
        with tempfile.TemporaryDirectory() as temp:
            run_id=str(uuid.uuid4())
            outputs=[{'id':'one','name':'One','frame':frame},{'id':'two','name':'Two','frame':None}]
            with self.assertRaises(AttributeError):publish_outputs(temp,run_id,outputs)
            self.assertFalse((Path(temp)/run_id).exists());self.assertEqual(list(Path(temp).iterdir()),[])

    def test_wide_source_keeps_all_columns_in_batch(self):
        frame=self.spark.range(100).select(*[F.lit(i).alias('Column'+str(i)) for i in range(60)])
        nodes=[{'id':'copy','inputs':[{'node':'source','port':'main'}],'steps':[{'type':'duplicate','column':'Column0','output':'Copied'}]}]
        output=[{'id':'out','name':'Wide','input':{'node':'copy','port':'main'}}]
        result=execute_graph({'source':frame},nodes,output)
        self.assertEqual(len(result[0]['frame'].columns),61);self.assertEqual(result[0]['frame'].count(),100)
