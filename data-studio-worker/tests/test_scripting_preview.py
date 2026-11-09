import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from app.script_runner import ScriptError, run_script, runtime_status, validate_table


class ScriptContractTests(unittest.TestCase):
    def test_invalid_code_and_schema_rejected_before_container(self):
        with patch('app.script_runner.runtime_status') as status:
            for language, code in [('shell', 'echo x'), ('python', ''), ('r', 'x' * 8001)]:
                with self.assertRaises(ScriptError): run_script(language, ['x'], [['1']], code)
            for table in [{'columns': ['x', 'X'], 'rows': []}, {'columns': ['x'], 'rows': [[1]]}, {'columns': ['x'], 'rows': [['1']] * 51}]:
                with self.assertRaises(ScriptError): validate_table(table)
            status.assert_not_called()

    def test_unavailable_runtime_never_executes_on_host(self):
        with patch('app.script_runner.runtime_status', return_value={'python': False, 'r': False}), patch('app.script_runner.subprocess.Popen') as process:
            with self.assertRaisesRegex(ScriptError, 'SCRIPT_RUNTIME_NOT_READY'): run_script('python', ['x'], [['1']], 'output = df.copy()')
            process.assert_not_called()


@unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SCRIPT') == '1', 'Set STUDIO_TEST_REAL_SCRIPT=1 to test Docker runtime')
class RealScriptTests(unittest.TestCase):
    def test_real_python_and_r_tables_and_logs(self):
        self.assertTrue(runtime_status()['python'])
        for language, code in [('python', 'output = df.copy()\noutput["n"] = pd.to_numeric(df["x"]) * 2\nprint("Python ok")'), ('r', 'output <- df\noutput$n <- as.numeric(df$x) * 2\ncat("R ok")')]:
            with self.subTest(language=language):
                result = run_script(language, ['x'], [['2'], [None]], code)
                self.assertEqual(result['columns'], ['x', 'n']); self.assertEqual(result['rows'][0][0], '2'); self.assertEqual(float(result['rows'][0][1]), 4.0)
                self.assertEqual(result['rows'][1], [None, None]); self.assertIn('ok', result['logs'])

    def test_zero_rows_preserves_columns(self):
        for language, code in [('python', 'output = df.iloc[0:0].copy()'), ('r', 'output <- df[FALSE, , drop=FALSE]')]:
            result = run_script(language, ['x'], [['2']], code)
            self.assertEqual(result['rows'], []); self.assertEqual(result['columns'], ['x'])

    def test_errors_are_bounded_and_reported(self):
        for language, code, expected in [
            ('python', 'x = 1', 'SCRIPT_OUTPUT_REQUIRED'), ('r', 'x <- 1', 'SCRIPT_OUTPUT_REQUIRED'),
            ('python', 'output = [1]', 'SCRIPT_OUTPUT_DATAFRAME_REQUIRED'), ('r', 'output <- 1', 'SCRIPT_OUTPUT_DATAFRAME_REQUIRED'),
            ('python', 'output = pd.DataFrame({"x": range(51)})', 'SCRIPT_TOO_MANY_ROWS'), ('r', 'output <- data.frame(x=seq_len(51))', 'SCRIPT_TOO_MANY_ROWS'),
            ('python', 'output = pd.DataFrame({"x": ["a" * 257]})', 'SCRIPT_CELL_TOO_LARGE'),
            ('python', 'output = (', 'SCRIPT_EXECUTION_FAILED'), ('r', 'output <- (', 'SCRIPT_EXECUTION_FAILED'),
        ]:
            with self.subTest(language=language, code=code), self.assertRaisesRegex(ScriptError, expected): run_script(language, ['x'], [['1']], code)

    def test_container_has_no_host_files_credentials_network_or_root_write_access(self):
        with tempfile.TemporaryDirectory(prefix='studio-script-test-') as folder:
            sentinel = Path(folder) / 'sentinel'; sentinel.write_text('fixture-only')
            code = f'''import os, socket
try:
    open('/etc/studio-forbidden', 'w').write('x')
    root_write = True
except OSError:
    root_write = False
try:
    connection = socket.create_connection(('192.0.2.1', 80), timeout=0.2)
    network = True
    connection.close()
except OSError:
    network = False
output = pd.DataFrame({{'host_file': [os.path.exists({str(sentinel)!r})], 'secret': [os.getenv('CORE_SCRIPT_TEST_SECRET')], 'root_write': [root_write], 'network': [network], 'uid': [os.getuid()], 'proxy': [os.getenv('HTTP_PROXY')], 'docker_socket': [os.path.exists('/var/run/docker.sock')]}})
'''
            with patch.dict(os.environ, {'CORE_SCRIPT_TEST_SECRET': 'fixture-secret'}):
                result = run_script('python', ['x'], [['1']], code)
            self.assertEqual(result['rows'], [['false', None, 'false', 'false', '65532', '', 'false']])
            r = run_script('r', ['x'], [['1']], f'output <- data.frame(host_file=file.exists({str(sentinel)!r}), secret=Sys.getenv("CORE_SCRIPT_TEST_SECRET", unset=NA_character_))')
            self.assertEqual(r['rows'], [['false', None]])

    def test_log_and_output_sizes_are_bounded(self):
        result = run_script('python', ['x'], [['1']], 'print("x" * 20000)\noutput = df.copy()')
        self.assertEqual(len(result['logs']), 8192)
        with self.assertRaisesRegex(ScriptError, 'SCRIPT_OUTPUT_TOO_LARGE'):
            run_script('python', ['x'], [['1']], 'import os\nos.write(1, b"x" * 1100000)\noutput = df.copy()')

    def test_timeout_is_enforced(self):
        with self.assertRaisesRegex(ScriptError, 'SCRIPT_TIMEOUT'):
            run_script('python', ['x'], [['1']], 'while True: pass')


@unittest.skipUnless(os.getenv('STUDIO_TEST_REAL_SCRIPT') == '1', 'Set STUDIO_TEST_REAL_SCRIPT=1 for scripting + Spark')
class ScriptSparkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from pyspark.sql import SparkSession
        cls.spark = SparkSession.builder.master('local[2]').appName('Scripting Spark tests').config('spark.ui.enabled', 'false').config('spark.sql.shuffle.partitions', '2').getOrCreate()
        cls.spark.sparkContext.setLogLevel('ERROR')

    @classmethod
    def tearDownClass(cls): cls.spark.stop()

    def test_python_then_r_then_spark_calculation(self):
        from app.preview import preview
        steps = [
            {'type': 'script', 'language': 'python', 'code': 'output = df.copy()\noutput["Total"] = pd.to_numeric(df["Price"]) * pd.to_numeric(df["Qty"])\noutput = output[["Name", "Total"]]\nprint("python done")', 'outputs': [{'name': 'Name', 'kind': 'Text'}, {'name': 'Total', 'kind': 'Floating Decimal'}]},
            {'type': 'script', 'language': 'r', 'code': 'output <- df\noutput$Total <- as.numeric(output$Total) + 5\ncat("r done")', 'outputs': [{'name': 'Name', 'kind': 'Text'}, {'name': 'Total', 'kind': 'Floating Decimal'}]},
            {'type': 'calculate', 'op': 'multiplication', 'output': 'Doubled', 'left': {'kind': 'column', 'value': 'Total'}, 'right': {'kind': 'value', 'value': '2'}},
        ]
        result = preview([['Andi', '10', '2']], ['Name', 'Price', 'Qty'], steps, spark=self.spark)
        self.assertEqual(result['columns'], ['Name', 'Total', 'Doubled']); self.assertEqual(result['rows'], [['Andi', '25.0', '50.0']])
        self.assertEqual(len(result['script_logs']), 2)

    def test_schema_mismatch_rejected_before_downstream(self):
        from app.preview import preview
        with self.assertRaisesRegex(ScriptError, 'SCRIPT_SCHEMA_MISMATCH'):
            preview([['1']], ['x'], [{'type': 'script', 'language': 'python', 'code': 'output = df.copy()', 'outputs': [{'name': 'wrong', 'kind': 'Text'}]}], spark=self.spark)
