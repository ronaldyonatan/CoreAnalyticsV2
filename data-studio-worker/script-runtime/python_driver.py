"""Python/pandas scripting contract, inside the disposable container only."""
import contextlib
import datetime
import io
import json
import math
import sys
import traceback
import numpy as np
import pandas as pd


class LogBuffer(io.TextIOBase):
    def __init__(self): self.value = ''
    def write(self, text):
        self.value = (self.value + str(text))[-8192:]
        return len(text)
    def flush(self): pass


def main():
    log = LogBuffer()
    try:
        request = json.load(sys.stdin)
        source = pd.DataFrame(request['rows'], columns=request['columns'], dtype=object)
        namespace = {'input': source.copy(deep=True), 'df': source.copy(deep=True), 'pd': pd, 'np': np}
        with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
            exec(compile(request['code'], '<studio-python>', 'exec'), namespace)
        if 'output' not in namespace: raise ValueError('SCRIPT_OUTPUT_REQUIRED')
        output = namespace['output']
        if not isinstance(output, pd.DataFrame): raise ValueError('SCRIPT_OUTPUT_DATAFRAME_REQUIRED')
        if not 1 <= len(output.columns) <= 30: raise ValueError('SCRIPT_COLUMNS_INVALID')
        columns = list(output.columns)
        if any(not isinstance(name, str) or not name.strip() or len(name) > 128 for name in columns) or len({name.lower() for name in columns}) != len(columns): raise ValueError('SCRIPT_COLUMNS_INVALID')
        if len(output.index) > 50: raise ValueError('SCRIPT_TOO_MANY_ROWS')
        def cell(value):
            if value is None or value is pd.NA or value is pd.NaT: return None
            if isinstance(value, np.generic): value = value.item()
            if isinstance(value, (datetime.datetime, datetime.date)): return value.isoformat()
            if isinstance(value, float) and not math.isfinite(value): return None
            if not isinstance(value, (str, int, float, bool)): raise ValueError('SCRIPT_CELL_INVALID')
            result = ('true' if value else 'false') if isinstance(value, bool) else str(value)
            if len(result) > 256: raise ValueError('SCRIPT_CELL_TOO_LARGE')
            return result
        rows = [[cell(value) for value in row] for row in output.itertuples(index=False, name=None)]
        return {'success': True, 'data': {'columns': columns, 'rows': rows, 'logs': log.value}}
    except Exception as error:
        message = str(error)
        if isinstance(error, ValueError) and message.startswith('SCRIPT_'):
            return {'success': False, 'code': message}
        if isinstance(error, SyntaxError): detail = f'{type(error).__name__}: {error.msg} (line {error.lineno})'
        else: detail = f'{type(error).__name__}: {message}'
        return {'success': False, 'code': 'SCRIPT_EXECUTION_FAILED', 'detail': detail[:1000], 'logs': log.value}


if __name__ == '__main__':
    sys.stdout.write(json.dumps(main(), ensure_ascii=False, allow_nan=False))
