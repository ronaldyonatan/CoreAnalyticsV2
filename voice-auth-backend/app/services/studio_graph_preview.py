"""Validate graph structure before reading any source credentials or datasets."""
import json
import uuid


def validate_graph_request(body):
    def fail(): raise ValueError('INVALID_PREVIEW_GRAPH')
    def exact(item, keys):
        if not isinstance(item, dict) or set(item) != set(keys.split()): fail()
    def identifier(value):
        if not isinstance(value, str) or not value.strip() or len(value) > 80: fail()
    exact(body, 'sources nodes outputs')
    sources, nodes, outputs = body['sources'], body['nodes'], body['outputs']
    if not isinstance(sources, list) or not 1 <= len(sources) <= 4 or not isinstance(nodes, list) or len(nodes) > 30 or not isinstance(outputs, list) or not 1 <= len(outputs) <= 6 or len(sources) + len(nodes) + len(outputs) > 30: fail()
    if len(json.dumps(body, ensure_ascii=False).encode('utf-8')) > 512000: fail()
    known, all_ids, dependencies = set(), set(), {}
    def register(value):
        identifier(value)
        if value in all_ids: fail()
        all_ids.add(value)
    def reference(ref):
        exact(ref, 'node port'); identifier(ref['node'])
        if ref['node'] not in known or not isinstance(ref['port'], str) or not ref['port'] or len(ref['port']) > 128: fail()
        return ref['node']
    for item in sources:
        if not isinstance(item, dict): fail()
        if item.get('kind') == 'fixed':
            exact(item, 'id kind columns rows')
            columns, rows = item['columns'], item['rows']
            if not isinstance(columns, list) or not 1 <= len(columns) <= 30 or any(not isinstance(name, str) or not name.strip() or len(name) > 128 for name in columns) or len({name.lower() for name in columns}) != len(columns): fail()
            if not isinstance(rows, list) or len(rows) > 50 or any(not isinstance(row, list) or len(row) != len(columns) or any(value is not None and (not isinstance(value, str) or len(value) > 256) for value in row) for row in rows): fail()
        elif item.get('kind') == 'dataset':
            exact(item, 'id kind dataset_id')
            if not isinstance(item['dataset_id'], str): fail()
            try: uuid.UUID(item['dataset_id'])
            except ValueError: fail()
        else: fail()
        register(item['id']); known.add(item['id']); dependencies[item['id']] = []
    count = 0
    scripts = 0
    for node in nodes:
        exact(node, 'id inputs steps'); register(node['id'])
        if not isinstance(node['inputs'], list) or not 1 <= len(node['inputs']) <= 2 or not isinstance(node['steps'], list) or not node['steps'] or any(not isinstance(step, dict) for step in node['steps']): fail()
        dependencies[node['id']] = [reference(ref) for ref in node['inputs']]
        count += len(node['steps'])
        scripts += sum(step.get('type') == 'script' for step in node['steps'])
        if scripts > 4: raise ValueError('SCRIPT_TOO_MANY_STEPS')
        if count > 30: fail()
        known.add(node['id'])
    roots = []
    for output in outputs:
        exact(output, 'id name input'); register(output['id'])
        if not isinstance(output['name'], str) or not output['name'].strip() or len(output['name']) > 150: fail()
        roots.append(reference(output['input']))
    used = set()
    def mark(node):
        if node in used: return
        used.add(node)
        for parent in dependencies[node]: mark(parent)
    for root in roots: mark(root)
    if used != known: fail()

    from app.services.studio_performance import validate_performance
    validate_performance(nodes)
