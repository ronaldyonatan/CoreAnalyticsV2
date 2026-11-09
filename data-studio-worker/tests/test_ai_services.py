import copy
import json
import os
import unittest
from unittest.mock import patch
from app import ai_services as ai


def step(task='sentiment',**values):
    return {'type':'ai_llm','task':task,'model':'mistral:latest','source':'Review','instructions':'','execution':'BATCH','mode':'overall' if task=='sentiment' else 'single' if task=='classify' else 'text','output':'Result','labels':[],'topics':[],'prompt':'Summarize {{Review}}' if task=='generate' else '', 'temperature':0,'fields':[],**values}


def response(value):return {'done':True,'done_reason':'stop','message':{'content':json.dumps(value)}}


class AIServicesTests(unittest.TestCase):
    def infer(self,config,value,rows=None):
        with patch.object(ai,'model_names',return_value=['mistral:latest']),patch.object(ai,'request_json',return_value=response(value)) as request:
            result=ai.infer_rows(['Review','Hidden'],rows or [['Excellent product','private']],config)
            return result,request.call_args

    def test_classification_validates_enums_and_independent_boolean_labels(self):
        labels=[{'name':'Praise','description':'Happy customer'},{'name':'Complaint','description':'Unhappy customer'}]
        result,_=self.infer(step('classify',labels=labels),{'Result':'Praise'});self.assertEqual(result[1],[['Praise']])
        result,_=self.infer(step('classify',labels=labels,mode='multi'),{'Praise':True,'Complaint':False});self.assertEqual(result[1],[[True,False]])
        for bad in ({'Result':'unknown'},{'Result':'Praise','extra':'value'}):
            with self.assertRaisesRegex(ai.AIError,'SCHEMA_MISMATCH'):self.infer(step('classify',labels=labels),bad)
        with self.assertRaisesRegex(ai.AIError,'SCHEMA_MISMATCH'):self.infer(step('classify',labels=labels,mode='multi'),{'Praise':'true','Complaint':False})

    def test_targeted_sentiment_and_null_do_not_fabricate_values(self):
        topics=[{'name':'Fit','description':'Size and fit'},{'name':'Service','description':'Customer support'}]
        result,_=self.infer(step(mode='targeted',topics=topics),{'Fit':'Positive','Service':'Not Applicable'});self.assertEqual(result[1],[['Positive','Not Applicable']]);self.assertEqual(result[2]['execution'],'NON_BATCH')
        with patch.object(ai,'model_names',return_value=['mistral:latest']),patch.object(ai,'request_json') as request:
            fields,values,usage=ai.infer_rows(['Review'],[[None]],step());self.assertEqual(values,[[None]]);self.assertEqual(usage['requests'],0);request.assert_not_called()

    def test_generation_sends_only_referenced_values_and_validates_typed_fields(self):
        fields=[{'name':'Count','kind':'Integer','description':'Number'},{'name':'Satisfied','kind':'Boolean','description':'Satisfied?'},{'name':'Score','kind':'Floating Decimal','description':'Score'}]
        result,call=self.infer(step('generate',mode='structured',fields=fields),{'Count':2,'Satisfied':True,'Score':1.5})
        payload=json.loads(call.args[1]['messages'][1]['content']);self.assertEqual(payload['values'],{'Review':'Excellent product'});self.assertNotIn('private',call.args[1]['messages'][1]['content']);self.assertEqual(result[1],[[2,True,1.5]])
        for bad in ({'Count':True,'Satisfied':True,'Score':1},{'Count':2**63,'Satisfied':True,'Score':1},{'Count':2,'Satisfied':True,'Score':float('inf')}):
            with self.assertRaisesRegex(ai.AIError,'SCHEMA_MISMATCH'):self.infer(step('generate',mode='structured',fields=fields),bad)
        with self.assertRaisesRegex(ai.AIError,'SCHEMA_MISMATCH'):self.infer(step('generate'),{'Result':'x'*257})

    def test_invalid_config_unknown_columns_and_row_budget_fail_before_chat(self):
        for config in (step(source='Missing'),step('generate',prompt='{{Missing}}'),step(temperature=float('nan')),step('classify',labels=[]),{**step(),'url':'http://evil'}):
            with patch.object(ai,'request_json') as request:
                with self.assertRaises(ai.AIError):ai.infer_rows(['Review'],[['x']],config)
                request.assert_not_called()
        with patch.object(ai,'request_json') as request:
            with self.assertRaisesRegex(ai.AIError,'ROW_LIMIT'):ai.infer_rows(['Review'],[['x']]*6,step())
            request.assert_not_called()
        budget=ai.AIBudget();budget.calls=10
        with self.assertRaisesRegex(ai.AIError,'PREVIEW_LIMIT'):budget.timeout()
        budget=ai.AIBudget();budget.deadline=0
        with self.assertRaisesRegex(ai.AIError,'PREVIEW_LIMIT'):budget.timeout()

    def test_provider_errors_are_explicit_and_cloud_endpoints_are_rejected(self):
        for url in ('https://external.example','http://localhost:11434','http://user:password@127.0.0.1:11434','http://127.0.0.1:11434/path','file:///tmp/model','http://127.0.0.1:11434?x=1'):
            with patch.dict(os.environ,{'STUDIO_AI_OLLAMA_URL':url}):
                with self.assertRaisesRegex(ai.AIError,'PROVIDER_INVALID'):ai.endpoint()
        with patch.object(ai,'model_names',side_effect=ai.AIError('PROVIDER_UNAVAILABLE')):
            self.assertFalse(ai.runtime_status()['ready'])
        with self.assertRaisesRegex(ai.AIError,'PROVIDER_INVALID'):ai.NoRedirect().redirect_request(None,None,302,'redirect',{},'http://evil')
        local={'name':'local:latest','size':100,'details':{'format':'gguf'}}
        cloud={**local,'name':'cloud:cloud','remote_host':'cloud.example'}
        with patch.object(ai,'request_json',return_value={'models':[local,cloud,{**local,'name':'empty','size':0}]}):self.assertEqual(ai.model_names(),['local:latest'])

    def test_truncated_invalid_or_unavailable_model_is_not_reported_as_success(self):
        for reply,code in (({'done':True,'done_reason':'length','message':{'content':'{}'}},'OUTPUT_TRUNCATED'),({'done':True,'message':{'content':'not json'}},'INVALID_RESPONSE')):
            with patch.object(ai,'model_names',return_value=['mistral:latest']),patch.object(ai,'request_json',return_value=reply):
                with self.assertRaisesRegex(ai.AIError,code):ai.infer_rows(['Review'],[['x']],step())
        with patch.object(ai,'model_names',return_value=[]),patch.object(ai,'request_json') as request:
            with self.assertRaisesRegex(ai.AIError,'MODEL_NOT_AVAILABLE'):ai.infer_rows(['Review'],[['x']],step())
            request.assert_not_called()

    @unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_AI')=='1','Set STUDIO_TEST_REAL_AI=1 for local Ollama')
    def test_real_local_sentiment_classification_and_generation(self):
        config=step();_,rows,_=ai.infer_rows(['Review'],[['Excellent product. I love it.'],['Terrible product. It arrived broken.']],config);self.assertEqual(rows,[['Positive'],['Negative']])
        config=step('classify',labels=[{'name':'Praise','description':'Happy customer'},{'name':'Complaint','description':'Unhappy customer'}]);_,rows,_=ai.infer_rows(['Review'],[['Excellent product. I love it.']],config);self.assertEqual(rows,[['Praise']])
        config=step('generate');_,rows,_=ai.infer_rows(['Review'],[['Excellent product. I love it.']],config);self.assertTrue(rows[0][0]);self.assertLessEqual(len(rows[0][0]),256)

        config=step('classify',mode='multi',labels=[{'name':'Praise','description':'Any praise of product or service'},{'name':'Complaint','description':'Any complaint about product or service'}]);_,rows,_=ai.infer_rows(['Review'],[['The product was excellent, but delivery was terrible.']],config);self.assertEqual(rows,[[True,True]])
        config=step(mode='targeted',topics=[{'name':'Product','description':'Product quality'},{'name':'Delivery','description':'Delivery service'}]);_,rows,_=ai.infer_rows(['Review'],[['The product was excellent, but delivery was terrible.']],config);self.assertEqual(rows,[['Positive','Negative']])
        config=step('generate',mode='structured',prompt='Extract purchased quantity and whether the customer is happy: {{Review}}',fields=[{'name':'Quantity','kind':'Integer','description':'Number of items bought'},{'name':'Happy','kind':'Boolean','description':'Whether the customer is happy'}]);_,rows,_=ai.infer_rows(['Review'],[['I bought 3 items. I love them.']],config);self.assertEqual(rows,[[3,True]])
