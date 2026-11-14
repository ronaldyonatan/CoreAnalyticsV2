"""Conservative shape validation for a dataset source query.

This is not a SQL parser and is not an authorization boundary. A future caller
must execute under a separately provisioned read-only database principal; do
not use this helper to run user SQL with the credentials of a Connection.
"""
import re

MAX_QUERY_LENGTH = 32000
_WORD = re.compile(r'[A-Za-z_][A-Za-z_0-9$]*')
_FORBIDDEN = frozenset({
    'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'UPSERT', 'CREATE',
    'ALTER', 'DROP', 'TRUNCATE', 'GRANT', 'DENY', 'REVOKE', 'EXEC', 'EXECUTE',
    'CALL', 'COPY', 'INTO', 'REVERT', 'USE', 'SET', 'RESET', 'DO', 'CALLER',
    'OPENROWSET', 'OPENQUERY', 'OPENDATASOURCE', 'BULK', 'DBCC',
})


class SourceQueryError(ValueError):
    pass


def validate_source_query(query, dialect, *, _return_terminator=False):
    """Return the original single SELECT/CTE query after conservative checks.

    SQL Server brackets, PostgreSQL dollar-quoted strings, SQL string literals,
    double-quoted identifiers and nested block comments are handled while
    searching for statement separators and forbidden keywords. SQL syntax and
    database permissions must still be validated separately.
    """
    if dialect not in ('sqlserver', 'postgresql'):
        raise SourceQueryError('QUERY_DIALECT_UNSUPPORTED')
    if not isinstance(query, str) or not query.strip() or len(query) > MAX_QUERY_LENGTH or '\x00' in query:
        raise SourceQueryError('QUERY_INPUT_INVALID')
    words = []
    i, n, terminated, terminator = 0, len(query), False, None
    while i < n:
        ch = query[i]
        if ch.isspace():
            i += 1
        elif query.startswith('--', i):
            end = query.find('\n', i + 2)
            i = n if end == -1 else end + 1
        elif query.startswith('/*', i):
            depth, i = 1, i + 2
            while i < n and depth:
                if query.startswith('/*', i): depth, i = depth + 1, i + 2
                elif query.startswith('*/', i): depth, i = depth - 1, i + 2
                else: i += 1
            if depth: raise SourceQueryError('QUERY_UNTERMINATED_COMMENT')
        elif terminated:
            raise SourceQueryError('QUERY_MULTIPLE_STATEMENTS')
        elif ch == ';':
            terminated, terminator, i = True, i, i + 1
        elif ch in ("'", '"') or (ch == '[' and dialect == 'sqlserver'):
            close = ']' if ch == '[' else ch
            escaped_backslash = dialect == 'postgresql' and ch == "'" and i > 0 and query[i-1] in 'Ee' and (i < 2 or not (query[i-2].isalnum() or query[i-2] in '_$'))
            i += 1
            while i < n:
                if escaped_backslash and query[i] == '\\': i += 2; continue
                if query[i] == close:
                    if i + 1 < n and query[i + 1] == close: i += 2; continue
                    i += 1
                    break
                i += 1
            else: raise SourceQueryError('QUERY_UNTERMINATED_LITERAL')
        elif ch == '$' and dialect == 'postgresql':
            match = re.match(r'\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$', query[i:])
            if not match: raise SourceQueryError('QUERY_TOKEN_UNSUPPORTED')
            marker = match.group()
            end = query.find(marker, i + len(marker))
            if end < 0: raise SourceQueryError('QUERY_UNTERMINATED_LITERAL')
            i = end + len(marker)
        elif (match := _WORD.match(query, i)):
            words.append(match.group().upper())
            i = match.end()
        else:
            i += 1
    if not words or words[0] not in ('SELECT', 'WITH') or 'SELECT' not in words:
        raise SourceQueryError('QUERY_SELECT_REQUIRED')
    if any(word in _FORBIDDEN for word in words):
        raise SourceQueryError('QUERY_UNSUPPORTED_OPERATION')
    if any(words[i:i+3] == ['NEXT', 'VALUE', 'FOR'] for i in range(len(words) - 2)):
        raise SourceQueryError('QUERY_UNSUPPORTED_OPERATION')
    return terminator if _return_terminator else query


def validate_stored_sqlserver_query(query):
    """Validate the currently supported Spark derived-table subset.

    This is an integration constraint, not an authorization boundary. CTEs
    and leading comments need a separately reviewed JDBC prepareQuery design.
    """
    validate_source_query(query, 'sqlserver')
    value = query.strip()
    if (len(value) <= 6 or value[:6].upper() != 'SELECT'
            or not (value[6].isspace() or value[6] == '(')):
        raise SourceQueryError('QUERY_INGEST_SELECT_REQUIRED')
    try:
        encoded_length = len(query.encode('utf-16le'))
    except UnicodeEncodeError:
        raise SourceQueryError('QUERY_INPUT_INVALID') from None
    if encoded_length > 64000:
        raise SourceQueryError('QUERY_INPUT_INVALID')
    return query


def sqlserver_derived_table_query(query):
    """Remove the one allowed terminator without touching quoted literals.

    The worker wraps this in a SQL Server derived table, where a top-level
    trailing semicolon is not valid. Preserve trailing comments and add a
    newline in the worker before closing the wrapper.
    """
    validate_stored_sqlserver_query(query)
    position = validate_source_query(query, 'sqlserver', _return_terminator=True)
    return query if position is None else query[:position] + query[position + 1:]
