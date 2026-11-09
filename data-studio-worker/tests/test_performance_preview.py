import os
import unittest
from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, StringType, IntegerType
from app.performance import select_store, restore, PerformanceError
from app.graph_preview import graph_preview, validate_graph


class PerformanceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spark=SparkSession.builder.master('local[2]').appName('Performance tests').config('spark.ui.enabled','false').config('spark.sql.shuffle.partitions','2').getOrCreate()
        cls.spark.sparkContext.setLogLevel('ERROR')

    @classmethod
    def tearDownClass(cls): cls.spark.stop()

    def setUp(self):
        self.stores={}
        schema=StructType([StructField('Name',StringType(),True),StructField('Amount',IntegerType(),True),StructField('Hidden',IntegerType(),True)])
        self.frame=self.spark.createDataFrame([('Andi',10,None),('Budi',30,200),('Citra',20,100)],schema).coalesce(1)
        self.step={'type':'select_store','columns':['Amount'],'key':'Key'}
        self.restore={'type':'restore_columns','store':'store','key':'Key'}

    def test_store_narrows_script_input_and_restore_survives_filter_reorder_and_duplicates(self):
        reduced=select_store(self.frame,self.step,'store',self.stores)
        self.assertEqual(reduced.columns,['Amount','Key']);self.assertEqual(self.stores['store']['columns'],['Name','Hidden'])
        filtered=reduced.filter('Amount >= 20').orderBy(F.desc('Amount'))
        changed=filtered.withColumn('Total',F.col('Amount')*2).drop('Amount')
        result=restore(changed,self.restore,self.stores)
        self.assertEqual(result.columns,['Total','Name','Hidden']);self.assertEqual([list(r) for r in result.collect()],[[60,'Budi',200],[40,'Citra',100]])
        self.assertIsInstance(result.schema['Hidden'].dataType,IntegerType)
        duplicate=filtered.unionByName(filtered.limit(1));self.assertEqual(restore(duplicate,self.restore,self.stores).count(),3)

    def test_missing_changed_null_keys_and_column_conflicts_fail_explicitly(self):
        reduced=select_store(self.frame,self.step,'store',self.stores)
        for changed,code in [(reduced.drop('Key'),'KEY_MISSING'),(reduced.withColumn('Key',F.lit('changed')),'KEY_CHANGED'),(reduced.withColumn('Key',F.lit(None).cast('string')),'KEY_CHANGED'),(reduced.withColumn('Key',F.lit(1)),'KEY_CHANGED'),(reduced.withColumn('name',F.lit('collision')),'COLUMN_CONFLICT')]:
            with self.assertRaisesRegex(PerformanceError,code):restore(changed,self.restore,self.stores)
        with self.assertRaisesRegex(PerformanceError,'KEY_COLLISION'):select_store(self.frame,{**self.step,'key':'name'},'store',{})
        with self.assertRaisesRegex(PerformanceError,'STORE_NOT_AVAILABLE'):restore(reduced,self.restore,{})

    def test_null_values_empty_result_and_nested_stores_preserve_types(self):
        reduced=select_store(self.frame,self.step,'store',self.stores)
        original=restore(reduced,self.restore,self.stores)
        self.assertIsNone(original.first()['Hidden']);self.assertEqual(restore(reduced.limit(0),self.restore,self.stores).count(),0)
        inner=select_store(reduced,{'type':'select_store','columns':['Key'],'key':'Inner'},'inner',self.stores)
        inner_restored=restore(inner,{'type':'restore_columns','store':'inner','key':'Inner'},self.stores)
        result=restore(inner_restored,self.restore,self.stores)
        self.assertEqual(sorted(tuple(r) for r in result.collect()),sorted(tuple(r) for r in original.collect()))

    def graph(self):
        sources=[{'id':'input','columns':['Name','Amount','Hidden'],'rows':[['Andi','10','a'],['Budi','30','b']]}]
        nodes=[{'id':'store','inputs':[{'node':'input','port':'main'}],'steps':[self.step]}, {'id':'restore','inputs':[{'node':'store','port':'main'}],'steps':[self.restore]}]
        outputs=[{'id':'output','name':'Restored','input':{'node':'restore','port':'main'}}]
        return sources,nodes,outputs

    def test_request_scope_and_ancestor_validation(self):
        sources,nodes,outputs=self.graph()
        result=graph_preview(sources,nodes,outputs,self.spark)
        self.assertEqual(result['columns'],['Amount','Name','Hidden']);self.assertEqual(result['rows'],[['10','Andi','a'],['30','Budi','b']])
        nodes[1]['inputs'][0]['node']='input'
        with self.assertRaisesRegex(ValueError,'PERFORMANCE_STORE_NOT_AVAILABLE'):validate_graph(sources,nodes,outputs)
        reduced=select_store(self.frame,self.step,'store',self.stores)
        other={};select_store(self.frame,self.step,'store',other)
        with self.assertRaisesRegex(PerformanceError,'KEY_CHANGED'):restore(reduced,self.restore,other)

    @unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SCRIPT')=='1','Set STUDIO_TEST_REAL_SCRIPT=1')
    def test_real_python_and_r_receive_reduced_input_and_restore_sorted_filtered_results(self):
        for language in ('python','r'):
            sources,nodes,outputs=self.graph()
            code='assert list(df.columns) == ["Amount", "Key"]\noutput = df[pd.to_numeric(df["Amount"]) >= 20].copy()\noutput = output.sort_values("Amount", ascending=False)\noutput["Total"] = pd.to_numeric(output["Amount"]) * 2\noutput = output[["Key", "Total"]]' if language=='python' else 'stopifnot(identical(names(df), c("Amount", "Key")))\noutput <- data.frame(Key=df$Key, Total=as.numeric(df$Amount)*2)\noutput <- output[output$Total >= 40, , drop=FALSE]\noutput <- output[order(-output$Total), , drop=FALSE]'
            nodes.insert(1,{'id':'script','inputs':[{'node':'store','port':'main'}],'steps':[{'type':'script','language':language,'code':code,'outputs':[{'name':'Key','kind':'Text'},{'name':'Total','kind':'Floating Decimal'}]}]})
            nodes[-1]['inputs'][0]['node']='script'
            result=graph_preview(sources,nodes,outputs,self.spark)
            self.assertEqual(result['columns'],['Total','Name','Hidden']);self.assertEqual(result['rows'],[['60.0','Budi','b']])
