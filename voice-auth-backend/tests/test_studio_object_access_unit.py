"""Run: cd voice-auth-backend && python3 -m unittest discover -s tests -p 'test_studio_object_access_unit.py'"""
import os
import sys
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from app.services import studio_object_access as s


class ObjectAccessTests(unittest.TestCase):
    KEY = 'AB' * 32
    ACTOR = '11111111-1111-4111-8111-111111111111'
    OBJECT = '22222222-2222-4222-8222-222222222222'

    def test_disabled(self):
        with patch.dict(os.environ, {'STUDIO_OBJECT_ACCESS_BEAM_ENABLED':'false'}):
            with self.assertRaises(s.AccessError) as ctx:
                s.execute(self.ACTOR,'GET','DATASET',self.OBJECT)
            self.assertEqual(str(ctx.exception),'BEAM_OWNERSHIP_DISABLED')

    def test_hmac_exact(self):
        import hashlib, hmac
        p={'ActorUserID':self.ACTOR,'ObjectID':self.OBJECT}
        e=s._envelope(p,key_hex=self.KEY,issued_at='2026-11-12T12:34:56',nonce='33333333-3333-4333-8333-333333333333')
        message=(e['IssuedAtUtc']+'|'+e['Nonce']+'|'+e['Request']).encode('utf-16le')
        self.assertEqual(e['Signature'],hmac.new(bytes.fromhex(self.KEY),message,hashlib.sha256).hexdigest().upper())
        self.assertEqual(len(e['Signature']),64)

    def test_wrong_uuid(self):
        with patch.dict(os.environ, {'STUDIO_OBJECT_ACCESS_BEAM_ENABLED':'true'}):
            with self.assertRaises(s.AccessError):
                s.execute(self.ACTOR,'GET','DATASET','not-a-uuid')

    def test_transfer_blocked(self):
        with patch.dict(os.environ, {'STUDIO_OBJECT_ACCESS_BEAM_ENABLED':'true'}):
            with self.assertRaises(s.AccessError) as ctx:
                s.execute(self.ACTOR,'TRANSFER','DATASET',self.OBJECT,
                          new_owner_user_id=self.ACTOR)
            self.assertEqual(ctx.exception.status,403)

    def test_get_beam_transport(self):
        fake_resp=MagicMock()
        fake_resp.json.return_value={'data':[{'success':True,'code':'ACCESS_INFO','owner_user_id':self.ACTOR,'is_admin':False,'shares_json':'[]'}]}
        fake=MagicMock()
        fake.session.post.return_value=fake_resp
        with patch.dict(os.environ,{'STUDIO_OBJECT_ACCESS_BEAM_ENABLED':'true','STUDIO_OBJECT_ACCESS_BEAM_HMAC_KEY_HEX':self.KEY}),\
             patch.object(s,'CoreApiClient',return_value=fake):
            result=s.execute(self.ACTOR,'GET','DATASET',self.OBJECT)
            self.assertEqual(result['owner_user_id'],self.ACTOR)
            kwargs=fake.session.post.call_args.kwargs
            self.assertEqual(kwargs['json']['Mode'],'CoreStudioObjectAccess')
            self.assertNotIn('STUDIO_OBJECT_ACCESS_SQL_CONNECTION_STRING',kwargs['json']['Payload'])


if __name__=='__main__': unittest.main()
