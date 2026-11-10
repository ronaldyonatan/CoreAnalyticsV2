"""Offline regressions for the active connection path. No real DB writes/login."""
import base64
from dataclasses import replace
import ipaddress
import os
from pathlib import Path
import socket
import sys
import subprocess
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from flask import Flask
from cryptography.fernet import Fernet
from app.connectors import sqlserver as sql
from app.routes import studio_connections_api as api
from app.services import session_security as sessions
from app.services import studio_connections as store


class PolicyTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            'STUDIO_SQL_HOST_POLICY': 'dynamic',
            'STUDIO_SQL_ALLOW_PRIVATE': 'true',
            'STUDIO_SQL_ALLOWED_NETWORKS': '172.16.20.0/24',
            'STUDIO_SQL_ALLOWED_PORTS': '1433',
            'STUDIO_ALLOWED_SQL_HOSTS': '172.16.20.174',
            'STUDIO_ALLOW_UNTRUSTED_CERT': 'false',
        })
        self.env.start()
        self.local = patch.object(sql, '_is_local_address', return_value=False)
        self.local_mock = self.local.start()
        self.target = sql.SqlServerTarget('172.16.20.174', 1433, 'demo', 'demo-user', 'demo-secret')

    def tearDown(self):
        self.local.stop()
        self.env.stop()

    def code(self, target, code, status=None):
        with self.assertRaises(sql.SqlTargetPolicyError) as error:
            sql.validate_target(target)
        self.assertEqual(error.exception.code, code)
        if status is not None:
            self.assertEqual(error.exception.http_status, status)

    def test_dynamic_without_network_list_requires_private_opt_in(self):
        os.environ.pop('STUDIO_SQL_ALLOWED_NETWORKS', None)
        os.environ['STUDIO_SQL_ALLOW_PRIVATE'] = 'false'
        self.code(self.target, 'SQL_PRIVATE_DESTINATION_DISABLED', 403)
        self.assertEqual(sql.validate_target(replace(self.target, host='8.8.8.8'))[1], '8.8.8.8')
        os.environ['STUDIO_SQL_ALLOW_PRIVATE'] = 'true'
        self.assertEqual(sql.validate_target(self.target)[1], '172.16.20.174')

    def test_dynamic_existing_new_and_unlisted_server(self):
        for host in ['172.16.20.174', '172.16.20.12', '172.16.20.99']:
            with self.subTest(host=host):
                self.assertEqual(sql.validate_target(replace(self.target, host=host))[1], host)

    def test_self_service_accepts_new_networks_and_custom_ports(self):
        os.environ['STUDIO_SQL_ALLOWED_NETWORKS'] = '0.0.0.0/0,::/0'
        os.environ['STUDIO_SQL_ALLOWED_PORTS'] = '*'
        for host in ['172.16.20.174', '172.16.20.12', '192.167.10.249',
                     '192.168.10.249', '10.23.45.67', '2606:4700:4700::1111']:
            with self.subTest(host=host):
                self.assertEqual(sql.validate_target(replace(self.target, host=host, port=15433))[1], host)
        for port in [0, 65536, True]:
            self.code(replace(self.target, port=port), 'SQL_PORT_OR_TIMEOUT_INVALID')
        self.code(replace(self.target, host='169.254.169.254'), 'SQL_HOST_BLOCKED', 403)
        records = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('192.167.10.249', 0))]
        with patch.object(sql.socket, 'getaddrinfo', return_value=records):
            self.assertEqual(sql.validate_target(replace(self.target, host='customer-sql.example', port=15433))[1], '192.167.10.249')
        self.local_mock.return_value = True
        self.code(self.target, 'SQL_HOST_BLOCKED', 403)

    def test_allowlist_default_and_explicit_remain_restricted(self):
        for mode in ['allowlist']:
            if mode is None:
                os.environ.pop('STUDIO_SQL_HOST_POLICY', None)
            else:
                os.environ['STUDIO_SQL_HOST_POLICY'] = mode
            sql.validate_target(self.target)
            self.code(replace(self.target, host='172.16.20.12'), 'HOST_NOT_ALLOWED', 403)

    def test_approved_network_and_port_are_required(self):
        self.code(replace(self.target, host='172.16.21.12'), 'SQL_NETWORK_NOT_ALLOWED', 403)
        self.code(replace(self.target, host='8.8.8.8'), 'SQL_NETWORK_NOT_ALLOWED', 403)
        self.code(replace(self.target, port=80), 'SQL_PORT_NOT_ALLOWED', 403)
        for host in ['172.16.20.0', '172.16.20.255']:
            self.code(replace(self.target, host=host), 'SQL_HOST_BLOCKED', 403)
        os.environ['STUDIO_SQL_ALLOWED_PORTS'] = '1433,1444'
        sql.validate_target(replace(self.target, port=1444))

    def test_invalid_or_missing_config_fails_closed(self):
        for value in [', ,', 'not-a-cidr', '172.16.20.12/24']:
            os.environ['STUDIO_SQL_ALLOWED_NETWORKS'] = value
            with self.assertRaises(sql.SqlTargetPolicyError) as error:
                sql.validate_target(self.target)
            self.assertEqual(error.exception.http_status, 503)
        os.environ['STUDIO_SQL_ALLOWED_NETWORKS'] = '172.16.20.0/24'
        for value in ['', 'not-a-port', '65536']:
            os.environ['STUDIO_SQL_ALLOWED_PORTS'] = value
            self.code(self.target, 'SQL_PORT_POLICY_INVALID', 503)
        os.environ['STUDIO_SQL_ALLOWED_PORTS'] = '1433'
        os.environ['STUDIO_SQL_HOST_POLICY'] = 'unrestricted'
        self.code(self.target, 'SQL_HOST_POLICY_INVALID', 503)

    def test_infrastructure_destinations_blocked_even_if_network_is_approved(self):
        os.environ['STUDIO_SQL_ALLOWED_NETWORKS'] = '0.0.0.0/0,::/0'
        for host in ['127.0.0.1', '::1', '0.0.0.0', '169.254.169.254', '100.100.100.200',
                     '168.63.129.16', '224.0.0.1', '255.255.255.255', '192.0.2.1',
                     'fd00:ec2::254', '2002:7f00:1::', '::ffff:127.0.0.1']:
            with self.subTest(host=host):
                self.code(replace(self.target, host=host), 'SQL_HOST_BLOCKED', 403)
        self.local_mock.return_value = True
        self.code(self.target, 'SQL_HOST_BLOCKED', 403)

    def test_invalid_host_syntax(self):
        for host in ['', 'http://sql.example', 'host;UID=evil', 'host,1433', 'host\\instance',
                     'host:1433', 'a..example', 'host.example.', '-bad.example', 'a%00b']:
            with self.subTest(host=host):
                self.code(replace(self.target, host=host), 'SQL_HOST_INVALID')

    def test_dns_mixed_or_unresolvable_is_rejected(self):
        records = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('172.16.20.12', 0)),
                   (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 0))]
        with patch.object(sql.socket, 'getaddrinfo', return_value=records):
            self.code(replace(self.target, host='sql.example'), 'SQL_HOST_BLOCKED', 403)
        records[1] = (socket.AF_INET, socket.SOCK_STREAM, 6, '', ('8.8.8.8', 0))
        with patch.object(sql.socket, 'getaddrinfo', return_value=records):
            self.code(replace(self.target, host='sql.example'), 'SQL_NETWORK_NOT_ALLOWED', 403)
        with patch.object(sql.socket, 'getaddrinfo', side_effect=socket.gaierror):
            self.code(replace(self.target, host='sql.example'), 'SQL_HOST_UNRESOLVABLE')

    def test_dns_is_pinned_and_tls_host_identity_preserved(self):
        record = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('172.16.20.12', 0))]
        with patch.object(sql.socket, 'getaddrinfo', return_value=record) as dns, patch.object(sql.pyodbc, 'connect') as connect:
            connect.return_value.__enter__.return_value.cursor.return_value.fetchone.return_value = ['demo', 'SQL Server\nmore']
            result = sql.test_sqlserver_connection(replace(self.target, host='sql.example', password='semi;brace}secret'))
            self.assertTrue(result['success'])
            connection_string = connect.call_args.args[0]
            self.assertIn('SERVER=tcp:172.16.20.12,1433;', connection_string)
            self.assertIn('HostnameInCertificate=sql.example;', connection_string)
            self.assertIn('Encrypt=yes;TrustServerCertificate=no;', connection_string)
            self.assertIn('PWD={semi;brace}}secret};', connection_string)
            self.assertNotIn('secret', str(result))
            dns.assert_called_once()

    def test_credentials_and_tls_switches_remain_validated(self):
        for target in [replace(self.target, database='demo;UID=evil'), replace(self.target, username='a}'),
                       replace(self.target, password='abc\x00'), replace(self.target, encrypt='false'),
                       replace(self.target, port=True), replace(self.target, timeout=False)]:
            with self.assertRaises(sql.SqlTargetPolicyError):
                sql.validate_target(target)
        self.code(replace(self.target, trust_server_certificate=True), 'UNTRUSTED_CERT_DISABLED')

    def test_driver_errors_are_classified_and_sanitized(self):
        cases = [('28000', 'Login failed 18456 demo-secret', 'SQL_LOGIN_FAILED'),
                 ('HYT00', 'login timeout expired demo-secret', 'SQL_CONNECTION_TIMEOUT'),
                 ('08001', 'certificate verify failed demo-secret', 'SQL_TLS_CERTIFICATE_UNTRUSTED'),
                 ('08001', 'connection refused demo-secret', 'SQL_HOST_UNREACHABLE'),
                 ('42000', 'cannot open database 4060 demo-secret', 'SQL_DATABASE_UNAVAILABLE'),
                 ('08001', 'SSL Provider handshake failure demo-secret', 'SQL_TLS_NEGOTIATION_FAILED'),
                 ('other', 'unexpected demo-secret', 'CONNECTION_FAILED')]
        for state, message, code in cases:
            with self.subTest(code=code), patch.object(sql.pyodbc, 'connect', side_effect=sql.pyodbc.Error(state, message)):
                result = sql.test_sqlserver_connection(self.target)
                self.assertFalse(result['success'])
                self.assertEqual(result['code'], code)
                self.assertNotIn('demo-secret', str(result))

    def test_local_interface_detection_uses_hostname_and_route(self):
        self.local.stop()
        record = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('172.16.20.12', 0))]
        with patch.object(sql.socket, 'getaddrinfo', return_value=record):
            self.assertTrue(sql._is_local_address(ipaddress.ip_address('172.16.20.12'), 1433))
        with patch.object(sql.socket, 'getaddrinfo', return_value=[]), patch.object(sql.socket, 'socket') as sock:
            sock.return_value.__enter__.return_value.getsockname.return_value = ('172.16.20.12', 0)
            self.assertTrue(sql._is_local_address(ipaddress.ip_address('172.16.20.12'), 1433))
        self.local.start()


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            'STUDIO_SQL_HOST_POLICY': 'dynamic', 'STUDIO_SQL_ALLOW_PRIVATE': 'true', 'STUDIO_SQL_ALLOWED_NETWORKS': '172.16.20.0/24',
            'STUDIO_SQL_ALLOWED_PORTS': '1433', 'STUDIO_ALLOW_UNTRUSTED_CERT': 'false',
            'CORE_ALLOWED_BROWSER_ORIGINS': 'http://localhost:5173',
        }); self.env.start()
        self.app = Flask('studio-policy-tests'); self.app.config['TESTING'] = True
        self.app.register_blueprint(api.studio_connections_bp)
        self.client = self.app.test_client()
        self.client.set_cookie('core_session', 'unit-session')
        self.client.set_cookie('core_csrf', 'unit-csrf')
        self.headers = {'Origin': 'http://localhost:5173', 'X-CSRF-Token': 'unit-csrf'}
        self.body = dict(connection_name='Unit test', server_host='172.16.20.12', server_port=1433,
                         database_name='demo', login_username='demo-user', password='demo-secret')
        self.session = patch.object(sessions.core_api, 'validate_user_session', return_value={'success': True, 'code': 'SESSION_VALID', 'user_id': 'unit-user'}); self.session.start()
        self.access = patch.object(api, 'get_user_access_profile', return_value={'menus': [{'route_key': 'data_studio'}]}); self.access.start()
        self.local = patch.object(sql, '_is_local_address', return_value=False); self.local.start()
        self.connect = patch.object(sql.pyodbc, 'connect'); self.driver = self.connect.start()
        self.driver.return_value.__enter__.return_value.cursor.return_value.fetchone.return_value = ['demo', 'SQL Server']

    def tearDown(self):
        self.connect.stop(); self.local.stop(); self.access.stop(); self.session.stop(); self.env.stop()

    def post(self, body=None, headers=None, path='/api/studio/connections/test'):
        return self.client.post(path, json=self.body if body is None else body, headers=self.headers if headers is None else headers)

    def test_test_endpoint_passes_new_allowed_host_without_ip_allowlist(self):
        for host in ['172.16.20.174', '172.16.20.12', '172.16.20.99']:
            response = self.post({**self.body, 'server_host': host})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json['success'], True)

    def test_network_denials_retain_403_json_contract(self):
        for host in ['127.0.0.1', '172.16.21.12']:
            response = self.post({**self.body, 'server_host': host})
            self.assertEqual(response.status_code, 403)
            self.assertFalse(response.json['success'])
        self.driver.assert_not_called()

    def test_missing_or_revoked_session_denied(self):
        self.client.delete_cookie('core_session')
        self.assertEqual(self.post().status_code, 401)
        self.client.set_cookie('core_session', 'revoked')
        with patch.object(sessions.core_api, 'validate_user_session', return_value={'success': False, 'code': 'SESSION_INVALID'}):
            self.assertEqual(self.post().status_code, 401)
        self.driver.assert_not_called()

    def test_missing_permission_denied_before_network(self):
        with patch.object(api, 'get_user_access_profile', return_value={'menus': []}):
            self.assertEqual(self.post().status_code, 403)
        self.driver.assert_not_called()

    def test_invalid_csrf_or_origin_denied_before_network(self):
        for headers in [{}, {'Origin': 'http://localhost:5173', 'X-CSRF-Token': 'wrong'},
                        {'Origin': 'http://evil.example', 'X-CSRF-Token': 'unit-csrf'}]:
            self.assertEqual(self.post(headers=headers).status_code, 403)
        self.driver.assert_not_called()

    def test_save_uses_the_same_policy_and_existing_encryption(self):
        key = Fernet.generate_key()
        with patch.dict(os.environ, {'STUDIO_FERNET_KEY': key.decode()}), patch.object(store.core_api, 'create_studio_connection', return_value={'data': [{'success': True, 'code': 'STUDIO_CONNECTION_CREATED', 'connection_id': 'unit'}]}) as create:
            response = self.post(path='/api/studio/connections')
            self.assertEqual(response.status_code, 201)
            payload = create.call_args.kwargs['record']
            self.assertNotIn('password', payload)
            self.assertNotIn('demo-secret', str(payload))
            self.assertEqual(Fernet(key).decrypt(base64.b64decode(payload['encrypted_password_base64'])), b'demo-secret')
            response = self.post({**self.body, 'server_host': '127.0.0.1'}, path='/api/studio/connections')
            self.assertEqual(response.status_code, 403)
            self.assertEqual(create.call_count, 1)
        self.driver.assert_not_called()

    def test_list_and_active_contracts_still_work(self):
        with patch.object(store, 'list_connections', return_value=[{'connection_name': 'Unit'}]):
            response = self.client.get('/api/studio/connections')
            self.assertEqual(response.json, {'success': True, 'data': [{'connection_name': 'Unit'}]})
        with patch.object(store, 'set_connection_active', return_value={'success': True}) as update:
            response = self.client.patch('/api/studio/connections/12345678-1234-1234-1234-123456789abc/active', json={'is_active': False}, headers=self.headers)
            self.assertEqual(response.status_code, 200)
            update.assert_called_once_with('unit-user', '12345678-1234-1234-1234-123456789abc', False)


class StartupTests(unittest.TestCase):
    def test_local_aliases_do_not_replace_explicit_generic_policy(self):
        script = (Path(__file__).resolve().parents[1] / 'start_coreanalytics_dev_fixed.sh').read_text()
        section = script[script.index('if [[ -f .env ]]; then'):script.index('log "SQL host policy:')]
        command = section + '\nprintf "%s\\n" "$STUDIO_SQL_HOST_POLICY" "$STUDIO_SQL_ALLOWED_NETWORKS" "$STUDIO_SQL_ALLOWED_PORTS"'
        clean = {key: value for key, value in os.environ.items() if not key.startswith('STUDIO_')}
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / '.env'
            env_file.write_text('STUDIO_DEV_SQL_HOST_POLICY=dynamic\nSTUDIO_DEV_SQL_ALLOWED_NETWORKS=10.0.0.0/8\nSTUDIO_DEV_SQL_ALLOWED_PORTS=1433,1444\n')
            result = subprocess.run(['bash', '-eu', '-c', command], cwd=directory, env=clean, check=True, text=True, capture_output=True)
            self.assertEqual(result.stdout.splitlines(), ['dynamic', '10.0.0.0/8', '1433,1444'])
            result = subprocess.run(['bash', '-eu', '-c', command], cwd=directory, env={**clean, 'STUDIO_SQL_HOST_POLICY': 'allowlist'}, check=True, text=True, capture_output=True)
            self.assertEqual(result.stdout.splitlines()[0], 'allowlist')
            env_file.write_text('')
            result = subprocess.run(['bash', '-eu', '-c', command], cwd=directory, env=clean, check=True, text=True, capture_output=True)
            self.assertEqual(result.stdout.splitlines(), ['dynamic', '', '1433'])


if __name__ == '__main__':
    unittest.main()
