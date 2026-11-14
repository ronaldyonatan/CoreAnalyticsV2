import unittest

from app.services.studio_source_query_validation import SourceQueryError, validate_source_query


class SourceQueryValidationTests(unittest.TestCase):
    def test_select_and_cte_remain_unchanged(self):
        for statement in ("SELECT [date], N'update; hello' FROM [dbo].[Data] WHERE [date] >= @start; -- end",
                          'WITH x AS (SELECT id FROM dbo.t) SELECT id FROM x'):
            self.assertEqual(validate_source_query(statement, 'sqlserver'), statement)

    def test_mutations_and_multiple_statements_are_rejected(self):
        for statement in ('DELETE FROM t', 'SELECT * INTO t FROM x', 'SELECT 1; DELETE FROM x',
                          'WITH x AS (DELETE FROM t RETURNING id) SELECT * FROM x', 'SELECT 1; REVERT',
                          'SELECT NEXT /*x*/ VALUE FOR dbo.seq', "SELECT * FROM OPENROWSET('provider', 'source', 'query')"):
            with self.subTest(statement=statement), self.assertRaises(SourceQueryError):
                validate_source_query(statement, 'sqlserver')

    def test_comments_and_quoted_identifiers_do_not_bypass_checks(self):
        self.assertEqual(validate_source_query('SELECT [delete], "update" FROM [x] /* UPDATE */', 'sqlserver'),
                         'SELECT [delete], "update" FROM [x] /* UPDATE */')
        for statement in ('SELECT 1 /* unfinished', "SELECT 'unfinished", 'SELECT 1; /*x*/ SELECT 2'):
            with self.subTest(statement=statement), self.assertRaises(SourceQueryError):
                validate_source_query(statement, 'sqlserver')

    def test_postgresql_dollar_strings_do_not_create_fake_statement_boundaries(self):
        query = 'SELECT $tag$hello; DELETE$tag$ FROM foo'
        self.assertEqual(validate_source_query(query, 'postgresql'), query)
        with self.assertRaises(SourceQueryError):
            validate_source_query('SELECT $tag$unfinished', 'postgresql')

    def test_invalid_input_and_unrecognized_dialect_are_rejected(self):
        for query, dialect in ((None, 'sqlserver'), ('', 'sqlserver'), ('SELECT 1\x00', 'sqlserver'), ('SELECT 1', 'unknown')):
            with self.subTest(query=query, dialect=dialect), self.assertRaises(SourceQueryError):
                validate_source_query(query, dialect)


if __name__ == '__main__':
    unittest.main()
