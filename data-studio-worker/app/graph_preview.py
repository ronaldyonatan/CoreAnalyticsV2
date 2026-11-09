"""Acyclic, bounded multi-input/multi-output Spark preview."""
from functools import reduce
from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, StringType, NumericType
from app.operation_common import fields, text, schema, source, col, quote, number
from app.expressions import expression
from app.preview import transform


def combine(frames, step):
    left, right = frames
    ln, rn = left.columns, right.columns
    kind = step.get('type')
    if kind == 'append':
        fields(step, 'type mode conflict')
        if step['mode'] not in ('all', 'shared') or step['conflict'] not in ('compatible', 'error'): raise ValueError('INVALID_APPEND')
        names = schema([name for name in ln if name in rn] if step['mode'] == 'shared' else ln + [name for name in rn if name not in ln])
        projections = [[], []]
        for name in names:
            types = [frame.schema[name].dataType for frame in frames if name in frame.columns]
            if any(item != types[0] for item in types):
                if step['conflict'] == 'error': raise ValueError('APPEND_TYPE_CONFLICT')
                target = 'double' if all(isinstance(item, NumericType) for item in types) else 'string'
            else: target = types[0].simpleString()
            for i, frame in enumerate(frames): projections[i].append((col(name).cast(target) if name in frame.columns else F.lit(None).cast(target)).alias(name))
        return {'main': left.select(*projections[0]).unionByName(right.select(*projections[1]))}
    fields(step, 'type join keys prefix key_kind nulls')
    if kind not in ('join', 'split_join') or step['join'] not in ('Inner', 'Left Outer', 'Right Outer', 'Left Anti', 'Right Anti', 'Full Outer', 'Cross Join') or step['key_kind'] not in ('Text', 'Number') or type(step['nulls']) is not bool: raise ValueError('INVALID_JOIN')
    prefix = text(step['prefix'], 64)
    keys = step['keys']
    if not isinstance(keys, list) or len(keys) > 10 or (not keys and step['join'] != 'Cross Join'): raise ValueError('INVALID_JOIN_KEYS')
    l, r = left.alias('studio_left'), right.alias('studio_right')
    lcol = lambda name: F.col('studio_left.' + quote(name))
    rcol = lambda name: F.col('studio_right.' + quote(name))
    predicates = []
    for key in keys:
        fields(key, 'left right'); source(key['left'], ln); source(key['right'], rn)
        a, b = lcol(key['left']), rcol(key['right'])
        a, b = (number(a), number(b)) if step['key_kind'] == 'Number' else (a.cast('string'), b.cast('string'))
        predicates.append(a.eqNullSafe(b) if step['nulls'] else a == b)
    condition = reduce(lambda a, b: a & b, predicates) if predicates else F.lit(True)
    def joined(how):
        if how == 'Left Anti': return l.join(r, condition, 'left_anti').select(*[lcol(name).alias(name) for name in ln])
        if how == 'Right Anti': return r.join(l, condition, 'left_anti').select(*[rcol(name).alias(name) for name in rn])
        names = schema(ln + [prefix + name for name in rn])
        modes = {'Inner': 'inner', 'Left Outer': 'left', 'Right Outer': 'right', 'Full Outer': 'full', 'Cross Join': 'cross'}
        frame = l.crossJoin(r) if how == 'Cross Join' else l.join(r, condition, modes[how])
        return frame.select(*[lcol(name).alias(name) for name in ln], *[rcol(name).alias(prefix + name) for name in rn])
    if kind == 'split_join': return {'matched': joined('Inner'), 'left_only': joined('Left Anti'), 'right_only': joined('Right Anti')}
    return {'main': joined(step['join'])}


def validate_graph(sources, nodes, outputs):
    if not isinstance(sources, list) or not 1 <= len(sources) <= 4 or not isinstance(nodes, list) or len(nodes) > 30 or not isinstance(outputs, list) or not 1 <= len(outputs) <= 6 or len(sources) + len(nodes) + len(outputs) > 30: raise ValueError('INVALID_GRAPH_SIZE')
    known, dependencies, all_ids = set(), {}, set()
    def identifier(value):
        text(value, 80, True)
        if value in all_ids: raise ValueError('DUPLICATE_GRAPH_ID')
        all_ids.add(value); return value
    def reference(ref):
        fields(ref, 'node port'); text(ref['port'], 128, True)
        if ref['node'] not in known: raise ValueError('GRAPH_REFERENCE_INVALID')
        return ref['node']
    for item in sources:
        fields(item, 'id columns rows'); identifier(item['id']); known.add(item['id']); dependencies[item['id']] = []
        schema(item['columns'])
        if not isinstance(item['rows'], list) or len(item['rows']) > 50 or any(not isinstance(row, list) or len(row) != len(item['columns']) or any(value is not None and (not isinstance(value, str) or len(value) > 256) for value in row) for row in item['rows']): raise ValueError('INVALID_GRAPH_ROWS')
    count = 0
    ancestors, stored = {}, {}
    scripts = 0
    for node in nodes:
        fields(node, 'id inputs steps'); identifier(node['id'])
        if not isinstance(node['inputs'], list) or not 1 <= len(node['inputs']) <= 2 or not isinstance(node['steps'], list) or not node['steps']: raise ValueError('INVALID_GRAPH_NODE')
        dependencies[node['id']] = [reference(ref) for ref in node['inputs']]
        ancestry = set(dependencies[node['id']])
        for parent in dependencies[node['id']]: ancestry.update(ancestors.get(parent, set()))
        ancestors[node['id']] = ancestry
        for step in node['steps']:
            if not isinstance(step, dict) or step.get('type') not in ('select_store', 'restore_columns'): continue
            if len(node['steps']) != 1 or len(node['inputs']) != 1: raise ValueError('PERFORMANCE_INVALID_GRAPH')
            if step['type'] == 'select_store':
                fields(step, 'type columns key'); text(step['key'], 128, True)
                stored[node['id']] = step['key']
            else:
                fields(step, 'type store key')
                if not isinstance(step['store'], str) or step['store'] not in ancestry or step['store'] not in stored or stored[step['store']] != step['key']: raise ValueError('PERFORMANCE_STORE_NOT_AVAILABLE')

        count += len(node['steps'])
        scripts += sum(isinstance(step, dict) and step.get('type') == 'script' for step in node['steps'])
        if scripts > 4: raise ValueError('SCRIPT_TOO_MANY_STEPS')
        if count > 30: raise ValueError('GRAPH_TOO_MANY_STEPS')
        known.add(node['id'])
    roots = []
    for output in outputs:
        fields(output, 'id name input'); identifier(output['id']); text(output['name'], 150, True); roots.append(reference(output['input']))
    used = set()
    def mark(node):
        if node in used: return
        used.add(node)
        for parent in dependencies[node]: mark(parent)
    for root in roots: mark(root)
    if used != known: raise ValueError('GRAPH_UNUSED_NODES')


def graph_preview(sources, nodes, outputs, spark=None):
    validate_graph(sources, nodes, outputs)
    owned = spark is None
    spark = spark or SparkSession.builder.master('local[2]').appName('CoreAnalytics graph preview').config('spark.ui.enabled', 'false').config('spark.sql.shuffle.partitions', '2').getOrCreate()
    frames, truncated, script_logs = {}, False, []
    stores = {}
    from app.ai_services import AIBudget
    ai_budget, ai_usage = AIBudget(), []
    def materialize(frame):
        nonlocal truncated
        schema(frame.columns)
        bounded, _ = transform(frame, frame.columns, [])
        rows = bounded.take(51); truncated = truncated or len(rows) > 50
        return spark.createDataFrame(rows[:50], bounded.schema).coalesce(1)
    def read(ref):
        if ref['node'] not in frames or ref['port'] not in frames[ref['node']]: raise ValueError('GRAPH_PORT_INVALID')
        return frames[ref['node']][ref['port']]
    try:
        for item in sources:
            frame = spark.createDataFrame(item['rows'], StructType([StructField(name, StringType(), True) for name in item['columns']])).coalesce(1)
            frames[item['id']] = {'main': frame}
        for node in nodes:
            incoming = [read(ref) for ref in node['inputs']]; steps = node['steps']; first = steps[0]
            if not isinstance(first, dict): raise ValueError('INVALID_STEP')
            if first.get('type') in ('append', 'join', 'split_join'):
                if len(incoming) != 2 or len(steps) != 1: raise ValueError('INVALID_COMBINE_INPUTS')
                result = combine(incoming, first)
            elif first.get('type') in ('select_store', 'restore_columns'):
                from app.performance import select_store, restore
                if len(steps) != 1 or len(incoming) != 1: raise ValueError('PERFORMANCE_INVALID_GRAPH')
                result = {'main': select_store(incoming[0], first, node['id'], stores) if first['type'] == 'select_store' else restore(incoming[0], first, stores)}
            elif first.get('type') == 'data_science':
                from app.data_science import apply_science
                if len(steps) != 1: raise ValueError('INVALID_DATA_SCIENCE_STEPS')
                result = {'main': apply_science(incoming, first)}
            elif first.get('type') == 'split_filter':
                fields(first, 'type branches')
                if len(incoming) != 1 or len(steps) != 1 or not isinstance(first['branches'], list) or not 1 <= len(first['branches']) <= 5: raise ValueError('INVALID_SPLIT_FILTER')
                frame = incoming[0]; remaining = F.lit(True); result = {}
                for branch in first['branches']:
                    fields(branch, 'port predicate'); port = text(branch['port'], 128, True)
                    if port == 'else' or port in result: raise ValueError('INVALID_BRANCH_PORT')
                    predicate = F.coalesce(expression(branch['predicate'], frame.columns).cast('boolean'), F.lit(False))
                    result[port] = frame.filter(remaining & predicate); remaining = remaining & ~predicate
                result['else'] = frame.filter(remaining)
            else:
                if len(incoming) != 1: raise ValueError('INVALID_NODE_INPUTS')
                frame, _ = transform(incoming[0], incoming[0].columns, steps, script_logs, node['id'], ai_usage, ai_budget); result = {'main': frame}
            frames[node['id']] = {port: materialize(frame) for port, frame in result.items()}
        result = []
        for output in outputs:
            frame = read(output['input']); names = frame.columns
            frame = frame.select(*[F.substring(col(name).cast('string'), 1, 256).alias(name) for name in names])
            result.append({'id': output['id'], 'name': output['name'], 'columns': names, 'rows': [list(row) for row in frame.take(50)], 'has_more': truncated})
        response = {**{key: result[0][key] for key in ('columns', 'rows', 'has_more')}, 'outputs': result}
        if script_logs: response['script_logs'] = script_logs
        if ai_usage: response['ai_usage'] = ai_usage
        return response
    finally:
        if owned: spark.stop()
