"""Read immutable Spark outputs by run/node identity, never by caller-supplied paths."""
import base64
import datetime
import functools
import json
import math
import uuid
from pathlib import Path

PAGE_SIZE = 50
MAX_PAGE = 2**31 - 1
MAX_COLUMNS = 30
MAX_CELL = 256


class OutputError(ValueError):
    def __init__(self, code, status=409):
        super().__init__(code)
        self.http_status = status


def validate_request(value):
    if not isinstance(value, dict) or set(value) != {'run_id', 'node_id', 'page'}:
        raise OutputError('PARQUET_REQUEST_INVALID', 400)
    run, node, page = value['run_id'], value['node_id'], value['page']
    try:
        if not isinstance(run, str) or str(uuid.UUID(run)) != run:
            raise ValueError()
    except (ValueError, AttributeError):
        raise OutputError('PARQUET_REQUEST_INVALID', 400) from None
    if not isinstance(node, str) or not 1 <= len(node) <= 80 or type(page) is not int or not 1 <= page <= MAX_PAGE:
        raise OutputError('PARQUET_REQUEST_INVALID', 400)
    return run, node, page


def display_value(value):
    if value is None:
        return None, False
    if isinstance(value, bytes):
        result = base64.b64encode(value[:MAX_CELL]).decode('ascii')
        return result[:MAX_CELL], len(value) > MAX_CELL * 3 // 4
    if isinstance(value, (datetime.datetime, datetime.date, datetime.time)):
        result = value.isoformat()
    elif isinstance(value, bool):
        result = 'true' if value else 'false'
    elif isinstance(value, (list, dict)):
        # Bounded display only; the persisted Arrow values remain unchanged.
        result = json.dumps(value, ensure_ascii=False, default=str)
    elif isinstance(value, float) and not math.isfinite(value):
        result = str(value)
    else:
        result = str(value)
    return result[:MAX_CELL], len(result) > MAX_CELL


def safe_file(root, path):
    if path.is_symlink() or not path.resolve().is_relative_to(root):
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    return path


@functools.lru_cache(maxsize=8)
def output_index(root_name, run_id, node_id):
    import pyarrow.parquet as pq
    root = Path(root_name).resolve()
    run = safe_file(root, root / run_id)
    manifest_path = safe_file(root, run / 'manifest.json')
    if not manifest_path.is_file():
        raise OutputError('PARQUET_OUTPUT_NOT_FOUND', 404)
    if manifest_path.stat().st_size > 1024 * 1024:
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('version') != 1 or manifest.get('run_id') != run_id or not isinstance(manifest.get('outputs'), list) or not 1 <= len(manifest['outputs']) <= 6:
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    matching = [(i, o) for i, o in enumerate(manifest['outputs']) if isinstance(o, dict) and o.get('id') == node_id]
    if len(matching) != 1:
        raise OutputError('PARQUET_OUTPUT_NOT_FOUND', 404)
    index, output = matching[0]
    if output.get('path') != 'output-' + str(index) or type(output.get('row_count')) is not int or output['row_count'] < 0:
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    schema = output.get('schema')
    if not isinstance(schema, dict) or schema.get('type') != 'struct' or not isinstance(schema.get('fields'), list) or not 1 <= len(schema['fields']) <= 2048:
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    fields = schema['fields']
    names = [f.get('name') for f in fields if isinstance(f, dict)]
    if len(names) != len(fields) or any(not isinstance(n, str) or not n or len(n) > 128 for n in names) or len(set(names)) != len(names):
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    directory = safe_file(root, run / output['path'])
    if not directory.is_dir() or not safe_file(root, directory / '_SUCCESS').is_file():
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    # Stable physical order: sorted part filename, row group, then row within group.
    files = sorted(directory.glob('part-*.parquet'))
    if not files or len(files) > 10000:
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    groups, count, arrow_schema = [], 0, None
    for path in files:
        safe_file(root, path)
        with pq.ParquetFile(path, thrift_string_size_limit=1024*1024, thrift_container_size_limit=100000, coerce_int96_timestamp_unit='us') as parquet:
            if parquet.schema_arrow.names != names or (arrow_schema is not None and not parquet.schema_arrow.equals(arrow_schema, check_metadata=False)):
                raise OutputError('PARQUET_ARTIFACT_INVALID')
            arrow_schema = parquet.schema_arrow
            for group in range(parquet.num_row_groups):
                rows = parquet.metadata.row_group(group).num_rows
                groups.append((path, group, count, count + rows))
                count += rows
                if len(groups) > 100000:
                    raise OutputError('PARQUET_ARTIFACT_INVALID')
    if count != output['row_count']:
        raise OutputError('PARQUET_ARTIFACT_INVALID')
    return schema, tuple(groups), count


def read_page(root, value):
    import pyarrow.parquet as pq
    run_id, node_id, page = validate_request(value)
    schema, groups, count = output_index(str(Path(root).resolve()), run_id, node_id)
    fields = schema['fields']
    columns = [{'name': f['name'], 'type': f['type'] if isinstance(f.get('type'), str) else json.dumps(f.get('type'), ensure_ascii=False)} for f in fields]
    selected = [f['name'] for f in fields[:MAX_COLUMNS]]
    start, stop = (page - 1) * PAGE_SIZE, page * PAGE_SIZE
    rows, truncated = [], False
    for path, group, first, last in groups:
        if last <= start:
            continue
        if first >= stop:
            break
        remaining_skip = max(0, start - first)
        with pq.ParquetFile(path, coerce_int96_timestamp_unit='us') as parquet:
            for batch in parquet.iter_batches(batch_size=64, row_groups=[group], columns=selected, use_threads=False):
                if remaining_skip >= batch.num_rows:
                    remaining_skip -= batch.num_rows
                    continue
                batch = batch.slice(remaining_skip, min(PAGE_SIZE-len(rows), batch.num_rows-remaining_skip))
                remaining_skip = 0
                # Explicit lookup preserves literal names containing dots (Arrow projection may expand nested prefixes).
                for record in batch.to_pylist():
                    cells = [display_value(record[name]) for name in selected]
                    rows.append([c[0] for c in cells])
                    truncated = truncated or any(c[1] for c in cells)
                if len(rows) == PAGE_SIZE:
                    break
        if len(rows) == PAGE_SIZE:
            break
    return {'columns': columns, 'preview_columns': columns[:MAX_COLUMNS], 'rows': rows,
            'page': page, 'page_size': PAGE_SIZE, 'has_more': stop < count,
            'total_rows': count, 'omitted_columns': max(0, len(fields)-MAX_COLUMNS),
            'stable_order': True, 'truncated_cells': truncated, 'schema': schema}
