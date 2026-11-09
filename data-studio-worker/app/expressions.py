"""Evaluate validated expression trees as Spark Columns. No eval or SQL execution."""
from pyspark.sql import functions as F
from app.operation_common import fields, text, source, literal, number, finite, schema, integer, col, quote


def expression(tree, names, depth=0, budget=None):
    budget = [0] if budget is None else budget
    budget[0] += 1
    if depth > 20 or budget[0] > 256 or not isinstance(tree, dict):
        raise ValueError('EXPRESSION_TOO_COMPLEX')
    evaluate = lambda node: expression(node, names, depth + 1, budget)
    kind = tree.get('kind')
    if kind == 'literal':
        fields(tree, 'kind value')
        return literal(tree['value'])
    if kind == 'column':
        fields(tree, 'kind name')
        return source(tree['name'], names)
    if kind == 'unary':
        fields(tree, 'kind op arg')
        arg = evaluate(tree['arg'])
        if tree['op'] == 'NOT':
            return ~arg.cast('boolean')
        if tree['op'] not in ('+', '-'):
            raise ValueError('INVALID_UNARY_OPERATOR')
        return number(arg) if tree['op'] == '+' else -number(arg)
    if kind == 'is_null':
        fields(tree, 'kind arg negate')
        if type(tree['negate']) is not bool:
            raise ValueError('INVALID_NULL_EXPRESSION')
        arg = evaluate(tree['arg'])
        return arg.isNotNull() if tree['negate'] else arg.isNull()
    if kind == 'binary':
        fields(tree, 'kind op left right')
        op = tree['op']
        left, right = evaluate(tree['left']), evaluate(tree['right'])
        if op in ('+', '-', '*', '/', '%', '**'):
            a, b = number(left), number(right)
            if op == '+': result = a + b
            elif op == '-': result = a - b
            elif op == '*': result = a * b
            elif op == '/': result = a / F.when(b != 0, b)
            elif op == '%': result = a % F.when(b != 0, b)
            else: result = F.pow(a, b)
            return finite(result)
        if op in ('AND', 'OR'):
            return (left.cast('boolean') & right.cast('boolean')) if op == 'AND' else (left.cast('boolean') | right.cast('boolean'))
        if op not in ('=', '!=', '<>', '<', '<=', '>', '>='):
            raise ValueError('INVALID_BINARY_OPERATOR')
        # Numeric literals compare numerically with stringified source samples.
        numeric_literal = lambda node: node.get('kind') == 'literal' and type(node.get('value')) in (int, float)
        if numeric_literal(tree['left']) or numeric_literal(tree['right']):
            left, right = number(left), number(right)
        if op == '=': return left == right
        if op in ('!=', '<>'): return left != right
        if op == '<': return left < right
        if op == '<=': return left <= right
        if op == '>': return left > right
        return left >= right
    if kind == 'call':
        fields(tree, 'kind name args')
        name, args = tree['name'], tree['args']
        limits = {'abs': (1, 1), 'ceil': (1, 1), 'ceiling': (1, 1), 'floor': (1, 1), 'round': (1, 1), 'sqrt': (1, 1), 'power': (2, 2), 'lower': (1, 1), 'upper': (1, 1), 'trim': (1, 1), 'length': (1, 1), 'coalesce': (2, 10), 'concat': (2, 10), 'year': (1, 1), 'month': (1, 1), 'dayofmonth': (1, 1)}
        if not isinstance(name, str) or name not in limits or not isinstance(args, list) or not limits[name][0] <= len(args) <= limits[name][1]:
            raise ValueError('INVALID_EXPRESSION_FUNCTION')
        values = [evaluate(arg) for arg in args]
        if name in ('coalesce', 'concat'):
            return (F.coalesce if name == 'coalesce' else F.concat)(*[value.cast('string') for value in values])
        if name == 'power': return finite(F.pow(number(values[0]), number(values[1])))
        if name in ('abs', 'ceil', 'ceiling', 'floor', 'round', 'sqrt'):
            fn = {'abs': F.abs, 'ceil': F.ceil, 'ceiling': F.ceil, 'floor': F.floor, 'round': F.round, 'sqrt': F.sqrt}[name]
            return finite(fn(number(values[0])).cast('double'))
        if name in ('lower', 'upper', 'trim', 'length'):
            return {'lower': F.lower, 'upper': F.upper, 'trim': F.trim, 'length': F.length}[name](values[0].cast('string'))
        # Date expression functions operate on ISO source text with tolerant parsing.
        value = values[0].cast('string')
        parsed = F.try_to_timestamp(value, F.lit('yyyy-MM-dd')).cast('date')
        return {'year': F.year, 'month': F.month, 'dayofmonth': F.dayofmonth}[name](parsed)
    raise ValueError('INVALID_EXPRESSION')


def apply_query(frame, names, step):
    fields(step, 'type select where order limit offset')
    projections, order = step['select'], step['order']
    if not isinstance(projections, list) or not 1 <= len(projections) <= 30 or not isinstance(order, list) or len(order) > 30:
        raise ValueError('INVALID_QUERY')
    output, columns = [], []
    if step['where'] is not None:
        frame = frame.filter(expression(step['where'], names))
    for item in projections:
        if isinstance(item, dict) and item == {'star': True}:
            output.extend(names); columns.extend(col(name) for name in names)
        else:
            fields(item, 'name expression')
            name = text(item['name'], 128, True)
            output.append(name); columns.append(expression(item['expression'], names).alias(name))
    schema(output)
    frame = frame.select(*columns)
    sorting = []
    for item in order:
        fields(item, 'column direction')
        value = source(item['column'], output)
        if item['direction'] not in ('asc', 'desc'):
            raise ValueError('INVALID_ORDER')
        sorting.append(value.asc_nulls_last() if item['direction'] == 'asc' else value.desc_nulls_last())
    if sorting:
        frame = frame.orderBy(*sorting)
    frame = frame.offset(integer(step['offset']))
    if step['limit'] is not None:
        frame = frame.limit(integer(step['limit']))
    return frame, output
