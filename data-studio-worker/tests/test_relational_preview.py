import unittest
from pyspark.sql import SparkSession
from app.preview import preview
from app.graph_preview import graph_preview


def ref(node, port='main'): return {'node': node, 'port': port}
def fixed(id, columns, rows): return {'id': id, 'columns': columns, 'rows': rows}
def node(id, parents, steps): return {'id': id, 'inputs': parents, 'steps': steps}
def output(id, parent, port='main'): return {'id': id, 'name': id, 'input': ref(parent, port)}
def aggregate(op, column, output, kind='Number'): return {'op': op, 'column': column, 'output': output, 'kind': kind}
def lit(value): return {'kind': 'literal', 'value': value}
def column(name): return {'kind': 'column', 'name': name}


class RelationalPreviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.spark = SparkSession.builder.master('local[2]').appName('Relational preview tests').config('spark.ui.enabled', 'false').config('spark.sql.shuffle.partitions', '2').config('spark.sql.ansi.enabled', 'true').getOrCreate()
        cls.spark.sparkContext.setLogLevel('ERROR')

    @classmethod
    def tearDownClass(cls): cls.spark.stop()

    def run_steps(self, columns, rows, steps): return preview(rows, columns, steps, spark=self.spark)
    def graph(self, sources, nodes, outputs): return graph_preview(sources, nodes, outputs, spark=self.spark)

    def test_deduplicate_case_keys_null_and_first_representative(self):
        rows = [['A', 'first'], ['a', 'second'], [None, 'null1'], [None, 'null2']]
        result = self.run_steps(['key', 'value'], rows, [{'type': 'deduplicate', 'keys': ['key'], 'insensitive': True}])
        self.assertEqual(result['rows'], [['A', 'first'], [None, 'null1']])
        self.assertEqual(len(self.run_steps(['key', 'value'], rows, [{'type': 'deduplicate', 'keys': ['key'], 'insensitive': False}])['rows']), 3)

    def test_expression_filter_numeric_and_null(self):
        predicate = {'kind': 'binary', 'op': '>=', 'left': column('amount'), 'right': lit(10)}
        result = self.run_steps(['amount'], [['2'], ['10'], ['20'], [None], ['bad']], [{'type': 'expression_filter', 'predicate': predicate}])
        self.assertEqual(result['rows'], [['10'], ['20']])

    def test_group_aggregations_and_invalid_numbers(self):
        specs = [aggregate(op, 'value', op) for op in ('sum', 'avg', 'min', 'max', 'count', 'count_distinct', 'first', 'last')] + [aggregate('count', '*', 'rows')]
        result = self.run_steps(['team', 'value'], [['A', '2'], ['A', '10'], ['A', None], ['B', 'bad']], [{'type': 'group', 'groups': ['team'], 'aggregates': specs}])
        by_team = {row[0]: row[1:] for row in result['rows']}
        self.assertEqual(by_team['A'][:6], ['12.0', '6.0', '2.0', '10.0', '2', '2'])
        self.assertEqual(by_team['A'][-1], '3')
        self.assertEqual(by_team['B'][:4], [None, None, None, None])

    def test_global_count_empty_input(self):
        result = self.run_steps(['value'], [], [{'type': 'group', 'groups': [], 'aggregates': [aggregate('count', '*', 'count')]}])
        self.assertEqual(result['rows'], [['0']])

    def test_window_ties_partition_running_and_offsets(self):
        rules = [{'op': op, 'column': 'amount', 'output': op, 'amount': 1} for op in ('row_number', 'rank', 'dense_rank', 'percent_rank', 'cume_dist', 'ntile', 'lag', 'lead', 'running_sum', 'running_avg', 'running_count', 'running_min', 'running_max')]
        result = self.run_steps(['team', 'amount'], [['A', '10'], ['A', '10'], ['A', '20'], ['B', '5']], [{'type': 'window', 'partition': ['team'], 'order': 'amount', 'direction': 'asc', 'kind': 'Number', 'calculations': rules}])
        a = sorted([dict(zip(result['columns'], row)) for row in result['rows'] if row[0] == 'A'], key=lambda row: int(row['row_number']))
        self.assertEqual([row['rank'] for row in a], ['1', '1', '3'])
        self.assertEqual([row['dense_rank'] for row in a], ['1', '1', '2'])
        self.assertEqual([row['running_sum'] for row in a], ['10.0', '20.0', '40.0'])
        self.assertEqual([row['lag'] for row in a], [None, '10', '10'])
        self.assertEqual([row['lead'] for row in a], ['10', '20', None])
        self.assertEqual([row['running_count'] for row in a], ['1', '2', '3'])

    def test_pivot_duplicate_labels_and_missing_values(self):
        specs = [{**aggregate('sum', 'value', 'Jan'), 'label': 'Jan'}, {**aggregate('sum', 'value', 'Feb'), 'label': 'Feb'}]
        result = self.run_steps(['team', 'month', 'value'], [['A', 'Jan', '2'], ['A', 'Jan', '3'], ['B', 'Feb', '7']], [{'type': 'pivot', 'groups': ['team'], 'label': 'month', 'aggregates': specs}])
        self.assertEqual(sorted(result['rows']), [['A', '5.0', None], ['B', None, '7.0']])

    def test_unpivot_and_dynamic_preserve_keys_nulls_and_labels(self):
        for dynamic in (False, True):
            step = {'type': 'unpivot', 'keep': ['id'], 'mappings': None if dynamic else [{'column': 'a', 'label': 'a'}, {'column': 'b', 'label': 'b'}], 'dynamic': dynamic, 'label': 'metric', 'value': 'amount', 'include_nulls': True}
            result = self.run_steps(['id', 'a', 'b'], [['1', '10', None]], [step])
            self.assertEqual(result['rows'], [['1', 'a', '10'], ['1', 'b', None]])
            step['include_nulls'] = False
            self.assertEqual(self.run_steps(['id', 'a', 'b'], [['1', '10', None]], [step])['rows'], [['1', 'a', '10']])

    def sources(self): return [fixed('l', ['id', 'left'], [['1', 'A'], ['2', 'B'], [None, 'N']]), fixed('r', ['id', 'right'], [['1', 'C'], ['3', 'D'], [None, 'M']])]
    def join_step(self, kind='Inner', split=False, nulls=False): return {'type': 'split_join' if split else 'join', 'join': kind, 'keys': [] if kind == 'Cross Join' else [{'left': 'id', 'right': 'id'}], 'prefix': 'r_', 'key_kind': 'Text', 'nulls': nulls}

    def test_all_join_types_and_null_keys(self):
        for kind, count in [('Inner', 1), ('Left Outer', 3), ('Right Outer', 3), ('Left Anti', 2), ('Right Anti', 2), ('Full Outer', 5), ('Cross Join', 9)]:
            with self.subTest(kind=kind):
                result = self.graph(self.sources(), [node('j', [ref('l'), ref('r')], [self.join_step(kind)])], [output('out', 'j')])
                self.assertEqual(len(result['rows']), count)
        result = self.graph(self.sources(), [node('j', [ref('l'), ref('r')], [self.join_step(nulls=True)])], [output('out', 'j')])
        self.assertEqual(len(result['rows']), 2)

    def test_split_join_has_three_independent_outputs(self):
        result = self.graph(self.sources(), [node('j', [ref('l'), ref('r')], [self.join_step(split=True)])], [output('match', 'j', 'matched'), output('left', 'j', 'left_only'), output('right', 'j', 'right_only')])
        self.assertEqual([len(item['rows']) for item in result['outputs']], [1, 2, 2])
        self.assertEqual(result['outputs'][1]['columns'], ['id', 'left'])
        self.assertEqual(result['outputs'][2]['columns'], ['id', 'right'])

    def test_append_union_and_shared_columns(self):
        for mode, columns in [('all', ['id', 'left', 'right']), ('shared', ['id'])]:
            result = self.graph(self.sources(), [node('a', [ref('l'), ref('r')], [{'type': 'append', 'mode': mode, 'conflict': 'compatible'}])], [output('out', 'a')])
            self.assertEqual(result['columns'], columns); self.assertEqual(len(result['rows']), 6)
            self.assertEqual(result['rows'][0][0], '1')

    def test_append_type_conflict_and_compatible_numeric_types(self):
        sources = [fixed('l', ['original'], [['x']]), fixed('r', ['original'], [['y']])]
        nodes = [node('a', [ref('l')], [{'type': 'constant', 'output': 'n', 'kind': 'Integer', 'value': '1'}]), node('b', [ref('r')], [{'type': 'constant', 'output': 'n', 'kind': 'Floating Decimal', 'value': '2.5'}])]
        append = node('append', [ref('a'), ref('b')], [{'type': 'append', 'mode': 'all', 'conflict': 'error'}])
        with self.assertRaisesRegex(ValueError, 'APPEND_TYPE_CONFLICT'):
            self.graph(sources, nodes + [append], [output('out', 'append')])
        append['steps'][0]['conflict'] = 'compatible'
        result = self.graph(sources, nodes + [append], [output('out', 'append')])
        self.assertEqual([row[-1] for row in result['rows']], ['1.0', '2.5'])

    def test_split_filter_first_match_nulls_and_recombine(self):
        source = fixed('s', ['n'], [['2'], ['10'], ['20'], [None], ['bad']])
        branches = [{'port': 'high', 'predicate': {'kind': 'binary', 'op': '>=', 'left': column('n'), 'right': lit(10)}}, {'port': 'positive', 'predicate': {'kind': 'binary', 'op': '>', 'left': column('n'), 'right': lit(0)}}]
        nodes = [node('f', [ref('s')], [{'type': 'split_filter', 'branches': branches}]), node('a', [ref('f', 'high'), ref('f', 'positive')], [{'type': 'append', 'mode': 'all', 'conflict': 'compatible'}])]
        result = self.graph([source], nodes, [output('combined', 'a'), output('else', 'f', 'else')])
        self.assertEqual(result['outputs'][0]['rows'], [['10'], ['20'], ['2']])
        self.assertEqual(result['outputs'][1]['rows'], [[None], ['bad']])

    def test_join_expansion_is_capped_and_reported(self):
        sources = [fixed('l', ['x'], [[str(i)] for i in range(10)]), fixed('r', ['y'], [[str(i)] for i in range(10)])]
        result = self.graph(sources, [node('j', [ref('l'), ref('r')], [self.join_step('Cross Join')])], [output('out', 'j')])
        self.assertEqual(len(result['rows']), 50); self.assertTrue(result['has_more'])

    def test_invalid_graph_references_cycles_ports_and_schema_collisions(self):
        for nodes in [[node('j', [ref('j')], [{'type': 'limit', 'count': 1, 'offset': 0}])], [node('j', [ref('l', 'missing'), ref('r')], [self.join_step()])], [node('j', [ref('l'), ref('r')], [{**self.join_step(), 'prefix': ''}])]]:
            with self.subTest(nodes=nodes), self.assertRaises(ValueError): self.graph(self.sources(), nodes, [output('out', 'j')])
