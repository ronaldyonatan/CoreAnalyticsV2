"""Single-session SQL result staging for the opt-in DEV ingest worker.

The caller executes the complete batch once on a dedicated source connection.
The last result set is streamed to Parquet in a private temporary directory.
Earlier result sets are consumed and removed. This module neither opens SQL
connections nor publishes final artifacts; the caller owns the staging folder.
"""
import datetime
import decimal
import uuid
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq


def stage_sql_script(cursor, script, folder, *, batch_size=1000, max_rows=10_000_000):
    """Execute once on the caller's dedicated session, then stage its results.

    The script may change source data. A caller must never retry it implicitly
    on staging, publishing, or lease failures. Script text is not logged here.
    """
    if not isinstance(script, str) or not script.strip() or len(script) > 32000 or '\x00' in script:
        raise ValueError('QUERY_INPUT_INVALID')
    cursor.execute(script)
    return stage_last_resultset(cursor, folder, batch_size=batch_size, max_rows=max_rows)


def _field(description):
    name, kind = description[0], description[1]
    if not isinstance(name, str) or not name or len(name) > 128:
        raise ValueError('QUERY_RESULT_COLUMN_INVALID')
    mapping = {str: pa.string(), bytes: pa.binary(), bytearray: pa.binary(),
               bool: pa.bool_(), int: pa.int64(), float: pa.float64(),
               datetime.datetime: pa.timestamp('us'), datetime.date: pa.date32(),
               datetime.time: pa.string(), uuid.UUID: pa.string()}
    if kind is decimal.Decimal:
        precision, scale = description[4], description[5]
        if type(precision) is not int or type(scale) is not int or not 1 <= precision <= 38 or not 0 <= scale <= precision:
            raise ValueError('QUERY_RESULT_DECIMAL_UNSUPPORTED')
        arrow_type = pa.decimal128(precision, scale)
    else:
        arrow_type = mapping.get(kind)
        if arrow_type is None:
            raise ValueError('QUERY_RESULT_TYPE_UNSUPPORTED')
    return pa.field(name, arrow_type, nullable=True), kind


def stage_last_resultset(cursor, folder, *, batch_size=1000, max_rows=10_000_000):
    """Stage result sets, preserving one cursor/session and executing no SQL.

    Cursor must already have executed the user batch. Returns (path, count).
    This function can consume large amounts of source work and local disk;
    caller must run it in a cancellable worker with quotas and clean up folder.
    """
    if type(batch_size) is not int or not 1 <= batch_size <= 10000 or type(max_rows) is not int or max_rows < 1:
        raise ValueError('QUERY_STAGING_CONFIGURATION_INVALID')
    folder = Path(folder)
    if not folder.is_dir() or folder.is_symlink():
        raise ValueError('QUERY_STAGING_DIRECTORY_INVALID')
    previous = None
    resultsets = 0
    while True:
        if cursor.description is not None:
            resultsets += 1
            if resultsets > 16 or not 1 <= len(cursor.description) <= 2048:
                raise ValueError('QUERY_RESULT_INVALID')
            spec = [_field(column) for column in cursor.description]
            names = [field.name for field, _ in spec]
            if len({name.casefold() for name in names}) != len(names):
                raise ValueError('QUERY_RESULT_DUPLICATE_COLUMN')
            schema = pa.schema([field for field, _ in spec])
            path = folder / ('result-' + str(resultsets) + '.parquet')
            if path.exists() or path.is_symlink():
                raise ValueError('QUERY_STAGING_FILE_EXISTS')
            count = 0
            with pq.ParquetWriter(str(path), schema, compression='snappy') as writer:
                while True:
                    rows = cursor.fetchmany(batch_size)
                    if not rows:
                        break
                    count += len(rows)
                    if count > max_rows:
                        raise ValueError('QUERY_RESULT_ROW_LIMIT')
                    columns = []
                    for index, (field, kind) in enumerate(spec):
                        values = [row[index] for row in rows]
                        if kind in (datetime.time, uuid.UUID):
                            values = [None if value is None else str(value) for value in values]
                        if kind is datetime.datetime and any(value is not None and value.utcoffset() is not None for value in values):
                            raise ValueError('QUERY_RESULT_TIMEZONE_UNSUPPORTED')
                        columns.append(pa.array(values, type=field.type, safe=True))
                    writer.write_table(pa.Table.from_arrays(columns, schema=schema))
            if previous is not None:
                previous.unlink()
            previous, last_count = path, count
        if not cursor.nextset():
            break
    if previous is None:
        raise ValueError('QUERY_RESULT_REQUIRED')
    return previous, last_count
