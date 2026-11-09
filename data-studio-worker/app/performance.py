"""Request-local column storage for bounded Spark previews; never joins by row position."""
import uuid
from pyspark.sql.types import StructType, StructField, StringType
from app.operation_common import fields, schema, text


class PerformanceError(ValueError):
    def __init__(self, code, detail):
        super().__init__('PERFORMANCE_' + code)
        self.detail = detail[:1000]


def fail(code, detail):
    raise PerformanceError(code, detail)


def select_store(frame, step, store_id, stores):
    fields(step, 'type columns key')
    names = frame.columns; selected = step['columns']; key = text(step['key'], 128, True)
    if not isinstance(selected, list) or not selected or any(not isinstance(name, str) or name not in names for name in selected) or len(set(selected)) != len(selected):
        fail('INVALID_SELECTION', 'Pilih minimal satu kolom input yang unik.')
    if key.lower() in {name.lower() for name in names}: fail('KEY_COLLISION', 'Nama kunci restore harus berbeda dari seluruh kolom input.')
    schema(selected + [key])
    rows = frame.take(51)
    if len(rows) > 50: fail('ROW_LIMIT', 'Penyimpanan preview maksimal 50 baris.')
    omitted = [name for name in names if name not in selected]
    stored_fields = [frame.schema[name] for name in omitted]
    values, outgoing = {}, []
    for row in rows:
        token = uuid.uuid4().hex
        values[token] = [row[names.index(name)] for name in omitted]
        outgoing.append([row[names.index(name)] for name in selected] + [token])
    stores[store_id] = {'key': key, 'columns': omitted, 'fields': stored_fields, 'rows': values}
    return frame.sparkSession.createDataFrame(outgoing, StructType([frame.schema[name] for name in selected] + [StructField(key, StringType(), False)])).coalesce(1)


def restore(frame, step, stores):
    fields(step, 'type store key')
    if not isinstance(step['store'], str) or step['store'] not in stores: fail('STORE_NOT_AVAILABLE', 'Pilih Select and Store Columns dari jalur input yang sama.')
    saved = stores[step['store']]; key = step['key']; names = frame.columns
    if key != saved['key'] or key not in names: fail('KEY_MISSING', 'Kunci restore hilang atau diganti nama; teruskan kunci tersebut melalui script.')
    if not isinstance(frame.schema[key].dataType, StringType): fail('KEY_CHANGED', 'Kunci restore harus tetap berupa Text tanpa perubahan nilai.')
    remaining = [name for name in names if name != key]
    try: schema(remaining + saved['columns'])
    except ValueError: fail('COLUMN_CONFLICT', 'Nama kolom hasil berbenturan dengan kolom tersimpan atau melebihi 30 kolom; ubah nama/hapus kolom yang berbenturan.')
    rows = frame.take(51)
    if len(rows) > 50: fail('ROW_LIMIT', 'Restore preview maksimal 50 baris.')
    restored = []
    for row in rows:
        token = row[names.index(key)]
        if not isinstance(token, str) or token not in saved['rows']: fail('KEY_CHANGED', 'Kunci restore NULL/tidak dikenal; jangan mengubah nilai kunci atau menambahkan baris tanpa kunci yang valid.')
        restored.append([row[names.index(name)] for name in remaining] + saved['rows'][token])
    # Stored columns retain their original Spark types, including dates, decimals and NULL.
    return frame.sparkSession.createDataFrame(restored, StructType([frame.schema[name] for name in remaining] + saved['fields'])).coalesce(1)
