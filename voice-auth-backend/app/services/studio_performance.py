"""Validate performance references before source credentials/data are accessed."""
def validate_performance(nodes):
    ancestors, stored = {}, {}
    for node in nodes:
        parents = [ref['node'] for ref in node['inputs']]
        ancestry = set(parents)
        for parent in parents: ancestry.update(ancestors.get(parent, set()))
        ancestors[node['id']] = ancestry
        steps = node['steps']
        performance = [step for step in steps if isinstance(step, dict) and step.get('type') in ('select_store', 'restore_columns')]
        if not performance: continue
        if len(steps) != 1 or len(parents) != 1: raise ValueError('PERFORMANCE_INVALID_GRAPH')
        step = performance[0]
        if step['type'] == 'select_store':
            if set(step) != {'type', 'columns', 'key'} or not isinstance(step['key'], str) or not step['key'].strip() or len(step['key']) > 128 or not isinstance(step['columns'], list) or not 1 <= len(step['columns']) <= 29 or any(not isinstance(name, str) or not name.strip() or len(name) > 128 for name in step['columns']) or len({name.lower() for name in step['columns']}) != len(step['columns']) or step['key'].lower() in {name.lower() for name in step['columns']}: raise ValueError('PERFORMANCE_INVALID_SELECTION')
            stored[node['id']] = step['key']
        else:
            if set(step) != {'type', 'store', 'key'} or not isinstance(step['store'], str) or step['store'] not in ancestry or step['store'] not in stored or step['key'] != stored[step['store']]: raise ValueError('PERFORMANCE_STORE_NOT_AVAILABLE')
