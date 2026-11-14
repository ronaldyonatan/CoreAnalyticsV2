import copy
import json
import unittest
from unittest.mock import patch
from flask import Flask

from app.routes import studio_dashboard_designer_api as routes
from app.services import studio_dashboard_designer as service

USER = '11111111-1111-4111-8111-111111111111'
CARD = '22222222-2222-4222-8222-222222222222'
CHART = '33333333-3333-4333-8333-333333333333'
DOCUMENT = {'version':1, 'style':{'background':'#081522','cardBackground':'#102333','textColor':'#eefaff'},
 'cards':[{'id':CARD,'chart_id':CHART,'title':'Revenue','background':'#102333',
           'x':0,'y':0,'w':6,'h':4,'mappings':[],'drill_path':[]}]}
PAGE = '44444444-4444-4444-8444-444444444444'
FRAME = '55555555-5555-4555-8555-555555555555'
BLOCK = '66666666-6666-4666-8666-666666666666'
DOCUMENT_V2 = {'version':2,'pages':[{'id':PAGE,'name':'Overview'}],
 'style':{'background':'#081522','textColor':'#eefaff'},
 'cards':[{'id':CARD,'page_id':PAGE,'chart_id':CHART,'title':'Revenue','background':'#102333','x':0,'y':0,'w':6,'h':4,'mappings':[],'drill_path':[]}],
 'frames':[{'id':FRAME,'page_id':PAGE,'x':6,'y':0,'w':6,'h':4}],
 'blocks':[{'id':BLOCK,'page_id':PAGE,'x':0,'y':4,'w':12,'h':3,'kind':'text','text':'Judul','image':'','alt':'','color':'#ffffff','font_size':24,'align':'left'}]}


class DashboardTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(routes.studio_dashboard_designer_bp)
        self.client = app.test_client()

    def test_document_validation_rejects_unknown_fields_and_invalid_interactions(self):
        self.assertEqual(service.validate_document(copy.deepcopy(DOCUMENT))['version'], 1)
        broken = copy.deepcopy(DOCUMENT)
        broken['cards'][0]['mappings'] = [{'target_card_id':CARD,'target_column':'secret'}]
        with self.assertRaises(service.DashboardError): service.validate_document(broken)

    def test_v2_validates_pages_content_and_references(self):
        self.assertEqual(service.validate_document(copy.deepcopy(DOCUMENT_V2))['version'], 2)
        broken=copy.deepcopy(DOCUMENT_V2); broken['frames'][0]['page_id']=USER
        with self.assertRaises(service.DashboardError): service.validate_document(broken)
        broken=copy.deepcopy(DOCUMENT_V2); broken['blocks'][0]['id']=CARD
        with self.assertRaises(service.DashboardError): service.validate_document(broken)
        broken=copy.deepcopy(DOCUMENT_V2); broken['cards'][0]['mappings']=[{'target_card_id':FRAME,'target_column':'x'}]
        with self.assertRaises(service.DashboardError): service.validate_document(broken)
        broken=copy.deepcopy(DOCUMENT_V2); broken['blocks'][0]['kind']='image'; broken['blocks'][0]['image']='data:image/png;base64,PHN2Zz4='
        with self.assertRaises(service.DashboardError): service.validate_document(broken)

    def test_v2_save_checks_chart_and_source_access(self):
        from app.routes import studio_charts_api
        chart={'config':{'dataset_id':CARD,'dataset_kind':'DIRECT'}}
        with patch.object(service,'get_chart',return_value=chart), patch.object(studio_charts_api,'authorized_dataset') as authorize, patch.object(service,'_call',return_value={'success':True}) as call:
            service.save_dashboard(USER,'Test',copy.deepcopy(DOCUMENT_V2))
        authorize.assert_called_once_with(USER,CARD,'DIRECT')
        self.assertEqual(call.call_args.kwargs['ExpectedVersion'],0)
        broken = copy.deepcopy(DOCUMENT)
        broken['cards'][0]['query'] = 'untrusted'
        with self.assertRaises(service.DashboardError): service.validate_document(broken)

    def test_create_uses_client_id_for_retry(self):
        with patch.object(routes, '_principal', return_value=USER), patch.object(routes, '_mutating'), patch.object(routes, 'save_dashboard', return_value={'dashboard_id':CARD,'version':1}) as save:
            response=self.client.post('/api/studio/designer/dashboards', json={'name':'Test','document':DOCUMENT_V2,'dashboard_id':CARD})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(save.call_args.args[3], CARD)

    def test_save_and_reopen_preserves_pages_layout_and_content(self):
        from app.routes import studio_charts_api
        chart={'config':{'dataset_id':CARD,'dataset_kind':'DIRECT'}}
        stored={}
        def gateway(actor, action, **fields):
            self.assertEqual(actor, USER)
            if action == 'SAVE':
                stored.update(fields)
                return {'success':True,'dashboard_id':CARD,'version':1}
            if action == 'GET':
                return {'success':True,'dashboard_id':CARD,'dashboard_name':stored['Name'],'version':1,'document_json':stored['Document']}
            raise AssertionError(action)
        with patch.object(routes,'_principal',return_value=USER), patch.object(routes,'_mutating'), patch.object(service,'get_chart',return_value=chart), patch.object(studio_charts_api,'authorized_dataset'), patch.object(service,'_call',side_effect=gateway):
            created=self.client.post('/api/studio/designer/dashboards',json={'name':'Test','document':DOCUMENT_V2,'dashboard_id':CARD})
            reopened=self.client.get(f'/api/studio/designer/dashboards/{CARD}')
        self.assertEqual(created.status_code,200)
        self.assertEqual(reopened.status_code,200)
        self.assertEqual(reopened.json['data']['document'],DOCUMENT_V2)
        self.assertEqual(json.loads(stored['Document']),DOCUMENT_V2)

    def test_large_payload_is_rejected_before_json_parsing(self):
        with patch.object(routes, '_principal', return_value=USER), patch.object(routes, '_mutating'), patch.object(routes, 'save_dashboard') as save:
            response=self.client.post('/api/studio/designer/dashboards', data=b' '*8_000_001, content_type='application/json')
        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json['code'], 'DASHBOARD_DOCUMENT_TOO_LARGE')
        save.assert_not_called()

    def test_mutating_routes_require_csrf_before_storage(self):
        with patch.object(routes, '_principal', return_value=USER), patch.object(routes, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), patch.object(routes, 'save_dashboard') as save:
            response = self.client.post('/api/studio/designer/dashboards', json={'name':'x','document':DOCUMENT})
        self.assertEqual(response.status_code, 403)
        save.assert_not_called()

    def test_save_checks_chart_and_source_access(self):
        from app.routes import studio_charts_api
        chart={'config':{'dataset_id':CARD,'dataset_kind':'DIRECT'}}
        with patch.object(service, 'get_chart', return_value=chart) as get, patch.object(studio_charts_api, 'authorized_dataset') as authorize, patch.object(service, '_call', return_value={'success':True}):
            service.save_dashboard(USER, 'Test', copy.deepcopy(DOCUMENT))
        get.assert_called_once_with(USER, CHART)
        authorize.assert_called_once_with(USER, CARD, 'DIRECT')

    def test_invalid_or_inaccessible_dashboard_does_not_write(self):
        broken=copy.deepcopy(DOCUMENT)
        broken['cards'][0]['w']=99
        with patch.object(service, '_call') as call, self.assertRaises(service.DashboardError):
            service.save_dashboard(USER, 'Test', broken)
        call.assert_not_called()

    def test_inaccessible_chart_cannot_be_saved(self):
        from app.services.studio_charts import ChartError
        with patch.object(routes, '_principal', return_value=USER), patch.object(routes, '_mutating'), \
             patch.object(service, 'get_chart', side_effect=ChartError('CHART_NOT_FOUND', 404)), \
             patch.object(service, '_call') as call:
            response = self.client.post('/api/studio/designer/dashboards', json={'name':'Test','document':DOCUMENT})
        self.assertEqual(response.status_code, 404)
        call.assert_not_called()

    def test_version_conflict_is_returned_to_editor(self):
        with patch.object(routes, '_principal', return_value=USER), patch.object(routes, '_mutating'), \
             patch.object(routes, 'save_dashboard', side_effect=service.DashboardError('DASHBOARD_VERSION_CONFLICT', 409)):
            response = self.client.put(f'/api/studio/designer/dashboards/{CARD}', json={'name':'Test','document':DOCUMENT,'expected_version':1})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json['code'], 'DASHBOARD_VERSION_CONFLICT')


if __name__ == '__main__': unittest.main()
