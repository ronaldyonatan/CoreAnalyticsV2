import unittest

from app.services.studio_chart_query import ChartQueryError, build_direct_query, parse_chart_spec


def spec(kind='filter_dropdown'):
    return {'dataset_id': 'id', 'dataset_kind': 'DIRECT', 'dimension': 'Healthcare',
            'measure': '', 'series': '', 'aggregation': 'count', 'chart_type': kind,
            'filters': [], 'sort': 'dimension_asc', 'limit': 30}


class FilterCardContractTests(unittest.TestCase):
    def test_both_kinds_work_for_both_dataset_types(self):
        for kind in ('filter_dropdown', 'filter_date'):
            for source in ('DIRECT', 'PARQUET'):
                with self.subTest(kind=kind, source=source):
                    self.assertEqual(parse_chart_spec({**spec(kind), 'dataset_kind': source})['chart_type'], kind)

    def test_filter_cards_reject_chart_aggregation_and_series(self):
        for changes in ({'measure': 'value'}, {'series': 'region'}, {'aggregation': 'sum', 'measure': 'value'}):
            with self.subTest(changes=changes), self.assertRaises(ChartQueryError):
                parse_chart_spec({**spec(), **changes})

    def test_date_card_requires_a_date_column(self):
        card = parse_chart_spec(spec('filter_date'))
        with self.assertRaisesRegex(ChartQueryError, 'CHART_FILTER_DATE_COLUMN_INVALID'):
            build_direct_query(card, {'schema': 'dbo', 'name': 'items'}, [{'name': 'Healthcare', 'type': 'nvarchar'}])
        build_direct_query(card, {'schema': 'dbo', 'name': 'items'}, [{'name': 'Healthcare', 'type': 'datetime2'}])

    def test_dropdown_queries_one_extra_row_for_truncation(self):
        sql, _ = build_direct_query(parse_chart_spec(spec()), {'schema': 'dbo', 'name': 'items'}, [{'name': 'Healthcare', 'type': 'nvarchar'}])
        self.assertIn('TOP (31)', sql)


if __name__ == '__main__':
    unittest.main()
