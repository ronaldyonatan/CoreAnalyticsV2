"""Chart Library metadata contract tests; never contact BEAM or SQL Server."""
import json
import sys
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from flask import Flask
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.routes import studio_charts_api as api
from app.services import studio_charts
from app.services import studio_chart_query
from app.services.studio_charts import ChartError
from app.services.studio_chart_query import ChartQueryError
from app.services.studio_pipelines import PipelineError

USER = '00000000-0000-4000-8000-000000000001'
CHART = '00000000-0000-4000-8000-000000000002'
DATASET = '00000000-0000-4000-8000-000000000003'
CONFIG = {'dataset_id': DATASET, 'dataset_kind': 'PARQUET', 'dimension': 'ID', 'measure': None,
          'series': None, 'aggregation': 'count', 'chart_type': 'bar', 'filters': [],
          'sort': None, 'limit': 100, 'properties': {'palette': ['#111111']}}


def beam(*rows):
    return {'data': list(rows)}


class ChartSpecTests(unittest.TestCase):
    chart_types = ('stacked100', 'area100', 'heatmap', 'radar', 'pareto', 'step')
    dataset_kinds = ('DIRECT', 'PARQUET')

    def spec(self, **properties):
        return {'dataset_id': DATASET, 'dataset_kind': 'DIRECT', 'dimension': 'ID', 'measure': '',
                'series': '', 'aggregation': 'count', 'chart_type': 'pie', 'filters': [],
                'sort': 'value_desc', 'limit': 10, 'properties': properties}

    def test_properties_accept_fullscreen3d(self):
        parsed = studio_chart_query.parse_chart_spec(self.spec(fullscreen3d=True))
        self.assertIs(parsed['properties']['fullscreen3d'], True)

    def test_properties_reject_unknown_or_mistyped_keys(self):
        for properties in ({'palette': ['#111111']}, {'fullscreen3d': 'yes'}, {'fullscreen3d': 1}):
            with self.subTest(properties=properties), self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                studio_chart_query.parse_chart_spec(self.spec(**properties))

    def test_new_chart_types_accept_both_dataset_kinds_and_preserve_properties(self):
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    spec = self.spec(fullscreen3d=True)
                    spec.update(chart_type=chart_type, dataset_kind=dataset_kind,
                                series='Region' if chart_type in ('stacked100', 'area100', 'heatmap') else '')
                    parsed = studio_chart_query.parse_chart_spec(spec)
                    self.assertEqual(parsed, spec)
                    self.assertIs(parsed['properties']['fullscreen3d'], True)

    def test_new_chart_types_require_dimension(self):
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                for missing in (False, True):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, missing=missing):
                        spec = self.spec()
                        spec.update(chart_type=chart_type, dataset_kind=dataset_kind, dimension='',
                                    series='Region' if chart_type in ('stacked100', 'area100', 'heatmap') else '')
                        if missing:
                            del spec['dimension']
                        code = 'CHART_QUERY_INVALID' if missing else 'CHART_DIMENSION_REQUIRED'
                        with self.assertRaisesRegex(ChartQueryError, code):
                            studio_chart_query.parse_chart_spec(spec)

    def test_normalized_and_heatmap_charts_require_series(self):
        for chart_type in ('stacked100', 'area100', 'heatmap'):
            for dataset_kind in self.dataset_kinds:
                for missing in (False, True):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, missing=missing):
                        spec = self.spec()
                        spec.update(chart_type=chart_type, dataset_kind=dataset_kind)
                        if missing:
                            del spec['series']
                        with self.assertRaisesRegex(ChartQueryError, 'CHART_SERIES_REQUIRED'):
                            studio_chart_query.parse_chart_spec(spec)

    def test_pareto_rejects_series(self):
        for dataset_kind in self.dataset_kinds:
            with self.subTest(dataset_kind=dataset_kind):
                spec = self.spec()
                spec.update(chart_type='pareto', dataset_kind=dataset_kind, series='Region')
                with self.assertRaisesRegex(ChartQueryError, 'CHART_SERIES_UNSUPPORTED'):
                    studio_chart_query.parse_chart_spec(spec)

    def test_pareto_accepts_explicit_and_default_value_desc_sort(self):
        for dataset_kind in self.dataset_kinds:
            for missing in (False, True):
                with self.subTest(dataset_kind=dataset_kind, missing=missing):
                    spec = self.spec()
                    spec.update(chart_type='pareto', dataset_kind=dataset_kind)
                    if missing:
                        del spec['sort']
                    parsed = studio_chart_query.parse_chart_spec(spec)
                    self.assertEqual(parsed['sort'], 'value_desc')

    def test_pareto_rejects_other_sorts(self):
        for dataset_kind in self.dataset_kinds:
            for sort in ('value_asc', 'dimension_asc', 'dimension_desc', None, 'invalid'):
                with self.subTest(dataset_kind=dataset_kind, sort=sort):
                    spec = self.spec()
                    spec.update(chart_type='pareto', dataset_kind=dataset_kind, sort=sort)
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_SORT_INVALID'):
                        studio_chart_query.parse_chart_spec(spec)

    def test_radar_and_step_accept_optional_series(self):
        for chart_type in ('radar', 'step'):
            for dataset_kind in self.dataset_kinds:
                for series in (None, '', 'Region'):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, series=series):
                        spec = self.spec()
                        spec.update(chart_type=chart_type, dataset_kind=dataset_kind)
                        if series is None:
                            del spec['series']
                        else:
                            spec['series'] = series
                        parsed = studio_chart_query.parse_chart_spec(spec)
                        self.assertEqual(parsed['series'], series or '')

    def test_new_chart_types_reject_series_matching_dimension(self):
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    spec = self.spec()
                    spec.update(chart_type=chart_type, dataset_kind=dataset_kind, series='ID')
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_SERIES_INVALID'):
                        studio_chart_query.parse_chart_spec(spec)

    def test_new_chart_types_compile_unchanged_parameterized_direct_aggregates(self):
        source = {'schema': 'reporting', 'name': 'Sales'}
        columns = [{'name': 'ID', 'type': 'nvarchar'}, {'name': 'Region', 'type': 'nvarchar'},
                   {'name': 'Amount', 'type': 'decimal'}]
        filters = [{'column': 'ID', 'operator': 'eq', 'value': "x' OR 1=1 --"},
                   {'column': 'Region', 'operator': 'contains', 'value': '50%_[~'},
                   {'column': 'Amount', 'operator': 'gte', 'value': '10'}]
        for chart_type in self.chart_types:
            for series in (('Region',) if chart_type in ('stacked100', 'area100', 'heatmap') else
                           ('', 'Region') if chart_type in ('radar', 'step') else ('',)):
                for aggregation in ('count', 'sum'):
                    with self.subTest(chart_type=chart_type, series=series, aggregation=aggregation):
                        spec = self.spec(fullscreen3d=True)
                        spec.update(chart_type=chart_type, series=series, aggregation=aggregation,
                                    measure='Amount' if aggregation == 'sum' else '', filters=filters)
                        parsed = studio_chart_query.parse_chart_spec(spec)
                        sql, params = studio_chart_query.build_direct_query(parsed, source, columns)
                        baseline = {**parsed, 'chart_type': 'grouped' if series else 'bar'}
                        baseline = studio_chart_query.parse_chart_spec(baseline)
                        self.assertEqual((sql, params), studio_chart_query.build_direct_query(baseline, source, columns))
                        series_select = ('CONVERT(nvarchar(256),[Region]) AS series_value' if series else
                                         'CAST(NULL AS nvarchar(256)) AS series_value')
                        series_group = ',CONVERT(nvarchar(256),[Region])' if series else ''
                        aggregate = 'COUNT_BIG(*)' if aggregation == 'count' else 'SUM(CONVERT(decimal(38,6), [Amount]))'
                        expected_sql = (
                            'SELECT TOP (10) CONVERT(nvarchar(256),[ID]) AS dimension_value, '
                            f'{series_select}, {aggregate} AS metric_value FROM [reporting].[Sales]'
                            " WHERE [ID] = ? AND CONVERT(nvarchar(256),[Region]) LIKE ? ESCAPE '~' AND [Amount] >= ?"
                            f' GROUP BY CONVERT(nvarchar(256),[ID]){series_group}'
                            ' ORDER BY metric_value DESC, dimension_value ASC, series_value ASC'
                        )
                        self.assertEqual(sql, expected_sql)
                        self.assertEqual(params, ["x' OR 1=1 --", '%50~%~_~[~~%', '10'])
                        self.assertNotIn(filters[0]['value'], sql)


class ExtendedChartSpecTests(unittest.TestCase):
    chart_types = ('cumulative_line', 'cumulative_bar', 'variance', 'slope', 'combo', 'progress')
    ordered_types = ('cumulative_line', 'cumulative_bar', 'variance', 'slope')
    dataset_kinds = ('DIRECT', 'PARQUET')

    @staticmethod
    def full_properties():
        return {'showXAxis': True, 'showYAxis': False, 'showGrid': True, 'showLegend': False,
                'showTooltip': True, 'showDataLabels': False, 'showTitle': True,
                'xAxisLabel': 'Categories', 'yAxisLabel': 'Revenue', 'legendPosition': 'bottom',
                'numberFormat': 'currency', 'currencySymbol': '$', 'decimals': 2, 'divideBy': 1000,
                'negativeParentheses': True, 'fontSize': 14, 'chartHeight': 400,
                'noDataMessage': 'No results', 'colorDirection': 'forward', 'gaugeTarget': 100,
                'fullscreen3d': False, 'orientation': 'horizontal', 'trendStyle': 'step',
                'trendMarkers': False, 'varianceMode': 'percent', 'comboLineSeries': 'L' * 256,
                'slopeStart': 'S' * 256, 'slopeEnd': 'E' * 256}

    def spec(self, chart_type, dataset_kind='DIRECT', **overrides):
        spec = {'dataset_id': DATASET, 'dataset_kind': dataset_kind, 'dimension': 'ID',
                'measure': '', 'series': 'Region' if chart_type == 'combo' else '',
                'aggregation': 'count', 'chart_type': chart_type, 'filters': [], 'limit': 10}
        if chart_type == 'progress':
            spec['properties'] = {'gaugeTarget': 100}
        spec.update(overrides)
        return spec

    def test_extended_ids_accept_both_dataset_kinds(self):
        self.assertEqual(len(studio_chart_query.CHART_TYPES), 30)
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    spec = self.spec(chart_type, dataset_kind)
                    parsed = studio_chart_query.parse_chart_spec(spec)
                    sort = 'dimension_asc' if chart_type in self.ordered_types else 'value_desc'
                    self.assertEqual(parsed, {**spec, 'sort': sort})

    def test_extended_ids_require_dimension(self):
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                for missing in (False, True):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, missing=missing):
                        spec = self.spec(chart_type, dataset_kind, dimension='')
                        if missing:
                            del spec['dimension']
                        code = 'CHART_QUERY_INVALID' if missing else 'CHART_DIMENSION_REQUIRED'
                        with self.assertRaisesRegex(ChartQueryError, code):
                            studio_chart_query.parse_chart_spec(spec)

    def test_ordered_ids_accept_optional_series(self):
        for chart_type in self.ordered_types:
            for dataset_kind in self.dataset_kinds:
                for series in ('missing', '', 'Region'):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, series=series):
                        spec = self.spec(chart_type, dataset_kind)
                        if series == 'missing':
                            del spec['series']
                        else:
                            spec['series'] = series
                        parsed = studio_chart_query.parse_chart_spec(spec)
                        self.assertEqual(parsed['series'], '' if series == 'missing' else series)

    def test_combo_requires_series(self):
        for dataset_kind in self.dataset_kinds:
            for series in ('missing', ''):
                with self.subTest(dataset_kind=dataset_kind, series=series):
                    spec = self.spec('combo', dataset_kind, series=series)
                    if series == 'missing':
                        del spec['series']
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_SERIES_REQUIRED'):
                        studio_chart_query.parse_chart_spec(spec)

    def test_extended_ids_reject_series_matching_dimension(self):
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_SERIES_INVALID'):
                        studio_chart_query.parse_chart_spec(self.spec(chart_type, dataset_kind, series='ID'))

    def test_progress_forbids_series_but_accepts_absent_or_empty(self):
        for dataset_kind in self.dataset_kinds:
            for series in ('missing', '', 'Region'):
                with self.subTest(dataset_kind=dataset_kind, series=series):
                    spec = self.spec('progress', dataset_kind, series=series)
                    if series == 'missing':
                        del spec['series']
                    if series == 'Region':
                        with self.assertRaisesRegex(ChartQueryError, 'CHART_SERIES_UNSUPPORTED'):
                            studio_chart_query.parse_chart_spec(spec)
                    else:
                        self.assertEqual(studio_chart_query.parse_chart_spec(spec)['series'], '')

    def test_progress_requires_explicit_nonzero_target(self):
        for dataset_kind in self.dataset_kinds:
            for properties in ('missing', None, {}, {'orientation': 'horizontal'}, {'gaugeTarget': 0}):
                with self.subTest(dataset_kind=dataset_kind, properties=properties):
                    spec = self.spec('progress', dataset_kind)
                    if properties == 'missing':
                        del spec['properties']
                    else:
                        spec['properties'] = properties
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_TARGET_REQUIRED'):
                        studio_chart_query.parse_chart_spec(spec)

    def test_progress_mistyped_or_out_of_bounds_target_is_properties_invalid(self):
        for dataset_kind in self.dataset_kinds:
            for target in (None, False, True, '100', 100.0, [], {}, -1, 1000000001):
                with self.subTest(dataset_kind=dataset_kind, target=target):
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                        studio_chart_query.parse_chart_spec(self.spec('progress', dataset_kind,
                                                                      properties={'gaugeTarget': target}))
            for properties in ([], '100', 100):
                with self.subTest(dataset_kind=dataset_kind, properties=properties):
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                        studio_chart_query.parse_chart_spec(self.spec('progress', dataset_kind, properties=properties))

    def test_progress_accepts_positive_integer_target_without_defaults(self):
        for dataset_kind in self.dataset_kinds:
            for target in (1, 1000000000):
                with self.subTest(dataset_kind=dataset_kind, target=target):
                    spec = self.spec('progress', dataset_kind, properties={'gaugeTarget': target})
                    parsed = studio_chart_query.parse_chart_spec(spec)
                    self.assertEqual(parsed['properties'], {'gaugeTarget': target})
                    self.assertEqual(parsed['dimension'], 'ID')

    def test_other_extended_ids_do_not_require_or_default_properties(self):
        for chart_type in self.chart_types[:-1]:
            for dataset_kind in self.dataset_kinds:
                for properties in ('missing', None, {}, {'gaugeTarget': 0}):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, properties=properties):
                        spec = self.spec(chart_type, dataset_kind)
                        if properties != 'missing':
                            spec['properties'] = properties
                        parsed = studio_chart_query.parse_chart_spec(spec)
                        if properties == 'missing':
                            self.assertNotIn('properties', parsed)
                        else:
                            self.assertEqual(parsed['properties'], properties)

    def test_ordered_ids_default_and_explicit_sort_are_dimension_asc(self):
        for chart_type in self.ordered_types:
            for dataset_kind in self.dataset_kinds:
                for missing in (False, True):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, missing=missing):
                        spec = self.spec(chart_type, dataset_kind, sort='dimension_asc')
                        if missing:
                            del spec['sort']
                        self.assertEqual(studio_chart_query.parse_chart_spec(spec)['sort'], 'dimension_asc')

    def test_ordered_ids_reject_every_other_sort(self):
        for chart_type in self.ordered_types:
            for dataset_kind in self.dataset_kinds:
                for sort in ('value_desc', 'value_asc', 'dimension_desc', None, '', 'invalid', [], {}, True, 1):
                    with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, sort=sort):
                        with self.assertRaisesRegex(ChartQueryError, 'CHART_SORT_INVALID'):
                            studio_chart_query.parse_chart_spec(self.spec(chart_type, dataset_kind, sort=sort))

    def test_combo_progress_and_existing_charts_keep_generic_sort_behavior(self):
        for chart_type in ('combo', 'progress', 'bar', 'line', 'radar', 'step'):
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    self.assertEqual(studio_chart_query.parse_chart_spec(self.spec(chart_type, dataset_kind))['sort'],
                                     'value_desc')
                    for sort in ('value_desc', 'value_asc', 'dimension_asc', 'dimension_desc'):
                        spec = self.spec(chart_type, dataset_kind, sort=sort)
                        self.assertEqual(studio_chart_query.parse_chart_spec(spec)['sort'], sort)

    def test_enum_properties_accept_all_values(self):
        for key, values in (('orientation', ('vertical', 'horizontal')),
                            ('trendStyle', ('linear', 'smooth', 'step')),
                            ('varianceMode', ('absolute', 'percent'))):
            for value in values:
                for chart_type in self.chart_types + ('bar',):
                    with self.subTest(key=key, value=value, chart_type=chart_type):
                        spec = self.spec(chart_type)
                        spec.setdefault('properties', {})[key] = value
                        parsed = studio_chart_query.parse_chart_spec(spec)
                        self.assertEqual(parsed['properties'], spec['properties'])

    def test_enum_properties_reject_invalid_values_and_unhashable_types(self):
        for key in ('orientation', 'trendStyle', 'varianceMode'):
            for value in ('invalid', '', 'Vertical', 'LINEAR', 'Percent', None, [], {}, 1, 1.0, True):
                with self.subTest(key=key, value=value):
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                        studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))

    def test_new_and_existing_flags_are_strict_booleans(self):
        flags = ('showXAxis', 'showYAxis', 'showGrid', 'showLegend', 'showTooltip', 'showDataLabels',
                 'showTitle', 'negativeParentheses', 'fullscreen3d', 'trendMarkers')
        for key in flags:
            for value in (True, False):
                with self.subTest(key=key, value=value):
                    parsed = studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))
                    self.assertIs(parsed['properties'][key], value)
            for value in (0, 1, 0.0, 1.0, 'true', None, [], {}):
                with self.subTest(key=key, value=value):
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                        studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))

    def test_result_label_properties_accept_256_characters_only(self):
        for key in ('comboLineSeries', 'slopeStart', 'slopeEnd'):
            for value in ('', 'a' * 100, 'a' * 101, 'a' * 256, '\u05d0' * 256):
                with self.subTest(key=key, value=value):
                    parsed = studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))
                    self.assertEqual(parsed['properties'], {key: value})
            for value in ('a' * 257, None, [], {}, 1, True):
                with self.subTest(key=key, value=value):
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                        studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))

    def test_full_28_property_config_is_preserved_for_new_and_existing_ids(self):
        properties = self.full_properties()
        self.assertEqual(len(properties), 28)
        for chart_type in self.chart_types + ('bar',):
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    spec = self.spec(chart_type, dataset_kind, properties=properties)
                    original = json.loads(json.dumps(spec))
                    parsed = studio_chart_query.parse_chart_spec(spec)
                    self.assertEqual(parsed['properties'], original['properties'])
                    self.assertEqual(spec, original)
        for invalid in ({**properties, 'palette': []}, {'unknown': 'x'}):
            with self.subTest(properties=invalid), self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                studio_chart_query.parse_chart_spec(self.spec('bar', properties=invalid))

    def test_existing_property_semantics_stay_unchanged(self):
        for key in ('xAxisLabel', 'yAxisLabel', 'legendPosition', 'numberFormat', 'currencySymbol',
                    'noDataMessage', 'colorDirection'):
            with self.subTest(key=key):
                parsed = studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: 'x' * 100}))
                self.assertEqual(parsed['properties'], {key: 'x' * 100})
                with self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                    studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: 'x' * 101}))
        for key in ('decimals', 'fontSize', 'chartHeight', 'divideBy', 'gaugeTarget'):
            for value in (0, 1000000000):
                with self.subTest(key=key, value=value):
                    parsed = studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))
                    self.assertEqual(parsed['properties'], {key: value})
            for value in (-1, 1000000001, True, '1', 1.0, None, [], {}):
                with self.subTest(key=key, value=value), self.assertRaisesRegex(ChartQueryError, 'CHART_PROPERTIES_INVALID'):
                    studio_chart_query.parse_chart_spec(self.spec('bar', properties={key: value}))

    def test_extended_ids_keep_max_250_limit(self):
        for chart_type in self.chart_types:
            for dataset_kind in self.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    self.assertEqual(studio_chart_query.parse_chart_spec(self.spec(chart_type, dataset_kind, limit=250))['limit'], 250)
                    for limit in (0, 251, True, 1.0, '10'):
                        with self.subTest(limit=limit), self.assertRaisesRegex(ChartQueryError, 'CHART_LIMIT_INVALID'):
                            studio_chart_query.parse_chart_spec(self.spec(chart_type, dataset_kind, limit=limit))

    def test_extended_ids_compile_identical_generic_parameterized_count_and_sum(self):
        source = {'schema': 'reporting', 'name': 'Sales'}
        columns = [{'name': 'ID', 'type': 'nvarchar'}, {'name': 'Region', 'type': 'nvarchar'},
                   {'name': 'Amount', 'type': 'decimal'}]
        filters = [{'column': 'ID', 'operator': 'eq', 'value': "x' OR 1=1 --"},
                   {'column': 'Region', 'operator': 'contains', 'value': '50%_[~'},
                   {'column': 'Amount', 'operator': 'gte', 'value': '10'}]
        for chart_type in self.chart_types:
            series_values = ('Region',) if chart_type == 'combo' else ('',) if chart_type == 'progress' else ('', 'Region')
            for dataset_kind in self.dataset_kinds:
                for series in series_values:
                    for aggregation in ('count', 'sum'):
                        with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind, series=series, aggregation=aggregation):
                            spec = self.spec(chart_type, dataset_kind, series=series, aggregation=aggregation,
                                             measure='Amount' if aggregation == 'sum' else '', filters=filters)
                            parsed = studio_chart_query.parse_chart_spec(spec)
                            sql, params = studio_chart_query.build_direct_query(parsed, source, columns)
                            baseline = studio_chart_query.parse_chart_spec({**parsed, 'chart_type': 'grouped' if series else 'bar'})
                            self.assertEqual((sql, params), studio_chart_query.build_direct_query(baseline, source, columns))
                            aggregate = 'COUNT_BIG(*)' if aggregation == 'count' else 'SUM(CONVERT(decimal(38,6), [Amount]))'
                            series_select = ('CONVERT(nvarchar(256),[Region]) AS series_value' if series else
                                             'CAST(NULL AS nvarchar(256)) AS series_value')
                            series_group = ',CONVERT(nvarchar(256),[Region])' if series else ''
                            ordering = ('dimension_value ASC, series_value ASC' if chart_type in self.ordered_types else
                                        'metric_value DESC, dimension_value ASC, series_value ASC')
                            self.assertEqual(sql, (
                                'SELECT TOP (10) CONVERT(nvarchar(256),[ID]) AS dimension_value, '
                                f'{series_select}, {aggregate} AS metric_value FROM [reporting].[Sales]'
                                " WHERE [ID] = ? AND CONVERT(nvarchar(256),[Region]) LIKE ? ESCAPE '~' AND [Amount] >= ?"
                                f' GROUP BY CONVERT(nvarchar(256),[ID]){series_group} ORDER BY {ordering}'
                            ))
                            self.assertEqual(params, ["x' OR 1=1 --", '%50~%~_~[~~%', '10'])
                            self.assertNotIn(filters[0]['value'], sql)

    def test_extended_ids_keep_measure_numeric_and_catalog_security_checks(self):
        source = {'schema': 'report]ing', 'name': 'Sa]les'}
        columns = [{'name': 'ID', 'type': 'nvarchar'}, {'name': 'Region', 'type': 'nvarchar'}]
        for chart_type in self.chart_types:
            with self.subTest(chart_type=chart_type):
                count = studio_chart_query.parse_chart_spec(self.spec(chart_type, measure='ID'))
                sql, _ = studio_chart_query.build_direct_query(count, source, columns)
                self.assertIn('COUNT_BIG(*)', sql)
                self.assertIn('FROM [report]]ing].[Sa]]les]', sql)
                with self.assertRaisesRegex(ChartQueryError, 'CHART_MEASURE_REQUIRED'):
                    studio_chart_query.parse_chart_spec(self.spec(chart_type, aggregation='sum'))
                total = studio_chart_query.parse_chart_spec(self.spec(chart_type, aggregation='sum', measure='ID'))
                with self.assertRaisesRegex(ChartQueryError, 'CHART_MEASURE_NOT_NUMERIC'):
                    studio_chart_query.build_direct_query(total, source, columns)
                for field in ('dimension', 'measure'):
                    spec = studio_chart_query.parse_chart_spec(self.spec(chart_type, **{field: 'ID]; DROP TABLE Sales --'}))
                    with self.assertRaisesRegex(ChartQueryError, 'CHART_COLUMN_NOT_FOUND'):
                        studio_chart_query.build_direct_query(spec, source, columns)
                for filters, code in (([{'column': 'missing', 'operator': 'eq', 'value': 'x'}], 'CHART_FILTER_COLUMN_INVALID'),
                                      ([{'column': 'ID', 'operator': 'gte', 'value': 'x'}], 'CHART_FILTER_OPERATOR_INVALID')):
                    spec = studio_chart_query.parse_chart_spec(self.spec(chart_type, filters=filters))
                    with self.assertRaisesRegex(ChartQueryError, code):
                        studio_chart_query.build_direct_query(spec, source, columns)
                with self.assertRaisesRegex(ChartQueryError, 'CHART_FILTER_INVALID'):
                    studio_chart_query.parse_chart_spec(self.spec(chart_type, filters=[{'column': 'ID', 'operator': 'eq', 'value': 'x'}] * 9))


class ChartServiceTests(unittest.TestCase):
    def test_list_accepts_empty_json_without_error(self):
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam({'success': True, 'code': 'CHART_LIST', 'items_json': '[]'})):
            self.assertEqual(studio_charts.list_charts(USER), [])

    def test_list_returns_saved_items_and_scopes_user(self):
        item = {'chart_id': CHART, 'name': 'Revenue', 'version': 3, 'config': {'chart_type': 'bar'}}
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam({'success': True, 'code': 'CHART_LIST', 'items_json': json.dumps([item])})) as call:
            self.assertEqual(studio_charts.list_charts(USER), [item])
        self.assertEqual(call.call_args.args[0], 'CoreStudioCharts')
        self.assertEqual(call.call_args.args[1]['UserID'], USER)

    def test_list_invalid_items_json_is_metadata_unavailable(self):
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam({'success': True, 'code': 'CHART_LIST', 'items_json': '{not-json'})):
            with self.assertRaises(ChartError) as error:
                studio_charts.list_charts(USER)
        self.assertEqual(str(error.exception), 'CHART_METADATA_UNAVAILABLE')
        self.assertEqual(error.exception.http_status, 503)

    def test_get_normalizes_uuid_version_and_config(self):
        row = {'success': True, 'code': 'CHART_GET', 'chart_id': CHART, 'chart_name': 'Revenue',
               'version': 2, 'created_at': '2026-01-01T00:00:00', 'updated_at': '2026-01-02T00:00:00',
               'config_json': json.dumps(CONFIG)}
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam(row)):
            result = studio_charts.get_chart(USER, CHART)
        self.assertEqual(result['chart_id'], CHART)
        self.assertEqual(result['name'], 'Revenue')
        self.assertEqual(result['version'], 2)
        self.assertEqual(result['config'], CONFIG)

    def test_get_rejects_invalid_id_before_beam(self):
        with patch.object(studio_charts.core_api, '_post_mode') as call:
            with self.assertRaisesRegex(ChartError, 'CHART_ID_INVALID'):
                studio_charts.get_chart(USER, '../../etc/passwd')
        call.assert_not_called()

    def test_get_missing_contract_fields_is_metadata_unavailable(self):
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam({'success': True, 'code': 'CHART_GET', 'chart_id': CHART})):
            with self.assertRaisesRegex(ChartError, 'CHART_METADATA_UNAVAILABLE'):
                studio_charts.get_chart(USER, CHART)

    def test_save_validates_name_and_version_before_beam(self):
        for name, version, code in (('', 0, 'CHART_NAME_INVALID'), ('x' * 151, 0, 'CHART_NAME_INVALID'),
                                    ('ok', -1, 'CHART_VERSION_INVALID'), ('ok', True, 'CHART_VERSION_INVALID'),
                                    ('ok', '1', 'CHART_VERSION_INVALID')):
            with self.subTest(name=name, version=version), patch.object(studio_charts.core_api, '_post_mode') as call:
                with self.assertRaisesRegex(ChartError, code):
                    studio_charts.save_chart(USER, name, CONFIG, expected_version=version)
                call.assert_not_called()

    def test_save_new_chart_sends_full_config_and_null_id(self):
        row = {'success': True, 'code': 'CHART_SAVED', 'chart_id': CHART, 'version': 1}
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam(row)) as call:
            result = studio_charts.save_chart(USER, '  Revenue  ', CONFIG)
        self.assertEqual(result['chart_id'], CHART)
        payload = call.call_args.args[1]
        self.assertEqual(payload['Action'], 'Save')
        self.assertIsNone(payload['ChartID'])
        self.assertEqual(payload['ChartName'], 'Revenue')
        self.assertEqual(payload['ExpectedVersion'], 0)
        self.assertEqual(json.loads(payload['ConfigJSON']), CONFIG)

    def test_update_sends_chart_id_and_expected_version(self):
        row = {'success': True, 'code': 'CHART_SAVED', 'chart_id': CHART, 'version': 4}
        with patch.object(studio_charts.core_api, '_post_mode', return_value=beam(row)) as call:
            studio_charts.save_chart(USER, 'Revenue', CONFIG, CHART, 3)
        payload = call.call_args.args[1]
        self.assertEqual(payload['ChartID'], CHART)
        self.assertEqual(payload['ExpectedVersion'], 3)

    def test_server_codes_map_to_http_status(self):
        cases = [({'success': False, 'code': 'CHART_VERSION_CONFLICT'}, 'CHART_VERSION_CONFLICT', 409),
                 ({'success': False, 'code': 'CHART_NOT_FOUND'}, 'CHART_NOT_FOUND', 404),
                 ({'success': False, 'code': 'SOMETHING_ELSE'}, 'CHART_METADATA_UNAVAILABLE', 503)]
        for row, code, status in cases:
            with self.subTest(code=code), patch.object(studio_charts.core_api, '_post_mode', return_value=beam(row)):
                with self.assertRaises(ChartError) as error:
                    studio_charts.delete_chart(USER, CHART)
                self.assertEqual(str(error.exception), code)
                self.assertEqual(error.exception.http_status, status)

    def test_empty_or_transport_failure_is_metadata_unavailable(self):
        for response in ({'data': []}, None):
            with self.subTest(response=response):
                if response is None:
                    context = patch.object(studio_charts.core_api, '_post_mode', side_effect=RuntimeError('BEAM down'))
                else:
                    context = patch.object(studio_charts.core_api, '_post_mode', return_value=response)
                with context:
                    with self.assertRaises(ChartError) as error:
                        studio_charts.list_charts(USER)
                self.assertEqual(str(error.exception), 'CHART_METADATA_UNAVAILABLE')
                self.assertEqual(error.exception.http_status, 503)

    def test_delete_rejects_invalid_id_before_beam(self):
        with patch.object(studio_charts.core_api, '_post_mode') as call:
            with self.assertRaisesRegex(ChartError, 'CHART_ID_INVALID'):
                studio_charts.delete_chart(USER, 'not-a-uuid')
        call.assert_not_called()


class ChartApiTests(unittest.TestCase):
    def setUp(self):
        app = Flask(__name__)
        app.register_blueprint(api.studio_charts_bp)
        self.client = app.test_client()
        self.spec = {'dataset_id': DATASET, 'dataset_kind': 'PARQUET'}

    def test_authorization_denied_before_any_metadata_call(self):
        with patch.object(api, '_principal', side_effect=PermissionError('AUTH_REQUIRED')), patch.object(api, 'list_charts') as call:
            response = self.client.get('/api/studio/charts')
        self.assertEqual(response.status_code, 401)
        call.assert_not_called()

    def test_unexpected_failure_logs_location_without_sensitive_details(self):
        detail = 'sensitive-payload-value'
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                patch.object(api, 'validate_spec', return_value=(self.spec, {})), \
                patch.object(api, 'save_chart', side_effect=RuntimeError(detail)), \
                self.assertLogs(self.client.application.logger, level='ERROR') as logs:
            response = self.client.post('/api/studio/charts', json={'name': 'A', 'config': CONFIG})
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json, {'success': False, 'code': 'CHART_SERVICE_UNAVAILABLE'})
        output = ' '.join(logs.output)
        self.assertIn('Chart service failure (RuntimeError)', output)
        self.assertIn('create:', output)
        self.assertNotIn(detail, output)
        self.assertNotIn('palette', output)

    def test_create_requires_csrf_before_save(self):
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating', side_effect=PermissionError('CSRF_ORIGIN_REJECTED')), patch.object(api, 'save_chart') as call:
            response = self.client.post('/api/studio/charts', json={'name': 'A', 'config': CONFIG})
        self.assertEqual(response.status_code, 403)
        call.assert_not_called()

    def test_create_rejects_extra_or_missing_keys(self):
        for body in ({'name': 'A'}, {'name': 'A', 'config': CONFIG, 'chart_id': CHART}):
            with self.subTest(body=body), patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), patch.object(api, 'save_chart') as call:
                response = self.client.post('/api/studio/charts', json=body)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json['code'], 'CHART_INPUT_INVALID')
                call.assert_not_called()

    def test_create_uses_validated_spec_and_returns_201(self):
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                patch.object(api, 'validate_spec', return_value=(self.spec, {})) as validate, \
                patch.object(api, 'save_chart', return_value={'chart_id': CHART, 'version': 1}) as save:
            response = self.client.post('/api/studio/charts', json={'name': 'A', 'config': CONFIG})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json['data']['chart_id'], CHART)
        self.assertEqual(response.headers['Cache-Control'], 'no-store')
        validate.assert_called_once_with(USER, CONFIG)
        self.assertEqual(save.call_args.args[1:], ('A', self.spec))

    def test_new_chart_types_create_update_and_reopen_with_validated_config(self):
        for chart_type in ChartSpecTests.chart_types:
            for dataset_kind in ChartSpecTests.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    config = ChartSpecTests().spec(fullscreen3d=True)
                    config.update(chart_type=chart_type, dataset_kind=dataset_kind,
                                  series='Region' if chart_type in ('stacked100', 'area100', 'heatmap') else '')
                    parsed = studio_chart_query.parse_chart_spec(config)
                    saved = {'chart_id': CHART, 'name': 'New chart', 'version': 2, 'config': parsed}
                    with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                            patch.object(api, 'authorized_dataset', return_value={}) as authorize, \
                            patch.object(api, 'save_chart', return_value={'chart_id': CHART, 'version': 2}) as save, \
                            patch.object(api, 'get_chart', return_value=saved):
                        created = self.client.post('/api/studio/charts', json={'name': 'New chart', 'config': config})
                        self.assertEqual(created.status_code, 201)
                        self.assertEqual(save.call_args.args, (USER, 'New chart', parsed))
                        updated = self.client.put('/api/studio/charts/' + CHART,
                                                  json={'name': 'New chart', 'config': config, 'expected_version': 1})
                        self.assertEqual(updated.status_code, 200)
                        self.assertEqual(save.call_args.args, (USER, 'New chart', parsed, CHART, 1))
                        reopened = self.client.get('/api/studio/charts/' + CHART)
                        self.assertEqual(reopened.status_code, 200)
                        self.assertEqual(reopened.json['data']['config'], parsed)
                        self.assertEqual(authorize.call_count, 3)
                        authorize.assert_called_with(USER, DATASET, dataset_kind)

    def test_extended_ids_create_update_reopen_preserve_properties_with_real_parser(self):
        specs = ExtendedChartSpecTests()
        for chart_type in specs.chart_types:
            for dataset_kind in specs.dataset_kinds:
                with self.subTest(chart_type=chart_type, dataset_kind=dataset_kind):
                    properties = specs.full_properties()
                    config = specs.spec(chart_type, dataset_kind, properties=properties)
                    changed_properties = {**properties, 'orientation': 'vertical', 'trendStyle': 'smooth',
                                          'trendMarkers': True, 'varianceMode': 'absolute', 'gaugeTarget': 200,
                                          'comboLineSeries': 'C' * 256, 'slopeStart': 'A' * 256, 'slopeEnd': 'Z' * 256}
                    changed = {**config, 'properties': changed_properties}
                    parsed = studio_chart_query.parse_chart_spec(config)
                    updated_spec = studio_chart_query.parse_chart_spec(changed)
                    persisted = {'version': 0}

                    def metadata(mode, payload):
                        if payload['Action'] == 'Save':
                            persisted.update(version=persisted['version'] + 1,
                                             chart_name=payload['ChartName'], config_json=payload['ConfigJSON'])
                            return beam({'success': True, 'code': 'CHART_SAVED', 'chart_id': CHART,
                                         'version': persisted['version']})
                        return beam({'success': True, 'code': 'CHART_GET', 'chart_id': CHART,
                                     'chart_name': persisted['chart_name'], 'version': persisted['version'],
                                     'created_at': '2026-01-01', 'updated_at': '2026-01-02',
                                     'config_json': persisted['config_json']})

                    with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                            patch.object(api, 'authorized_dataset', return_value={}) as authorize, \
                            patch.object(api, 'parse_chart_spec', wraps=studio_chart_query.parse_chart_spec) as parse, \
                            patch.object(studio_charts.core_api, '_post_mode', side_effect=metadata) as rpc:
                        created = self.client.post('/api/studio/charts', json={'name': 'Extended chart', 'config': config})
                        self.assertEqual(created.status_code, 201)
                        self.assertEqual(created.json['data']['version'], 1)
                        create_payload = rpc.call_args.args[1]
                        self.assertIsNone(create_payload['ChartID'])
                        self.assertEqual(create_payload['ExpectedVersion'], 0)
                        self.assertEqual(json.loads(create_payload['ConfigJSON']), parsed)
                        self.assertEqual(json.loads(create_payload['ConfigJSON'])['properties'], properties)
                        reopened = self.client.get('/api/studio/charts/' + CHART)
                        self.assertEqual(reopened.status_code, 200)
                        self.assertEqual(reopened.json['data']['config'], parsed)
                        self.assertEqual(reopened.json['data']['version'], 1)

                        updated = self.client.put('/api/studio/charts/' + CHART,
                                                  json={'name': 'Updated chart', 'config': changed, 'expected_version': 1})
                        self.assertEqual(updated.status_code, 200)
                        self.assertEqual(updated.json['data']['version'], 2)
                        update_payload = rpc.call_args.args[1]
                        self.assertEqual(update_payload['ChartID'], CHART)
                        self.assertEqual(update_payload['ExpectedVersion'], 1)
                        self.assertEqual(json.loads(update_payload['ConfigJSON']), updated_spec)
                        self.assertEqual(json.loads(update_payload['ConfigJSON'])['properties'], changed_properties)
                        reopened = self.client.get('/api/studio/charts/' + CHART)
                        self.assertEqual(reopened.status_code, 200)
                        self.assertEqual(reopened.json['data']['name'], 'Updated chart')
                        self.assertEqual(reopened.json['data']['version'], 2)
                        self.assertEqual(reopened.json['data']['config'], updated_spec)
                        self.assertEqual(reopened.json['data']['config']['properties'], changed_properties)
                        self.assertEqual(parse.call_count, 2)
                        self.assertEqual(parse.call_args_list[0].args, (config,))
                        self.assertEqual(parse.call_args_list[1].args, (changed,))
                        self.assertEqual(authorize.call_count, 4)
                        authorize.assert_called_with(USER, DATASET, dataset_kind)
                        self.assertEqual([call.args[1]['Action'] for call in rpc.call_args_list], ['Save', 'Get', 'Save', 'Get'])
                        for call in rpc.call_args_list:
                            self.assertEqual(call.args[0], 'CoreStudioCharts')
                            self.assertEqual(call.args[1]['UserID'], USER)

    def test_extended_invalid_configs_fail_api_before_metadata(self):
        specs = ExtendedChartSpecTests()
        cases = [(specs.spec('combo', series=''), 'CHART_SERIES_REQUIRED'),
                 (specs.spec('progress', series='Region'), 'CHART_SERIES_UNSUPPORTED'),
                 (specs.spec('progress', properties={}), 'CHART_TARGET_REQUIRED'),
                 (specs.spec('progress', properties={'gaugeTarget': 0}), 'CHART_TARGET_REQUIRED'),
                 (specs.spec('progress', properties={'gaugeTarget': True}), 'CHART_PROPERTIES_INVALID'),
                 (specs.spec('slope', sort='value_desc'), 'CHART_SORT_INVALID'),
                 (specs.spec('variance', properties={'varianceMode': []}), 'CHART_PROPERTIES_INVALID'),
                 (specs.spec('cumulative_line', properties={'trendStyle': {}}), 'CHART_PROPERTIES_INVALID'),
                 (specs.spec('cumulative_bar', properties={'orientation': None}), 'CHART_PROPERTIES_INVALID')]
        for config, code in cases:
            for method in ('post', 'put'):
                with self.subTest(config=config, method=method), \
                        patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                        patch.object(api, 'authorized_dataset') as authorize, \
                        patch.object(studio_charts.core_api, '_post_mode') as rpc:
                    body = {'name': 'Invalid', 'config': config}
                    if method == 'put':
                        body['expected_version'] = 1
                    response = getattr(self.client, method)('/api/studio/charts' + ('/' + CHART if method == 'put' else ''), json=body)
                    self.assertEqual(response.status_code, 400)
                    self.assertEqual(response.json, {'success': False, 'code': code})
                    authorize.assert_not_called()
                    rpc.assert_not_called()

    def test_update_forwards_version_and_rejects_stale_contract(self):
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                patch.object(api, 'validate_spec', return_value=(self.spec, {})), \
                patch.object(api, 'save_chart', return_value={'chart_id': CHART, 'version': 2}) as save:
            response = self.client.put('/api/studio/charts/' + CHART, json={'name': 'A', 'config': CONFIG, 'expected_version': 1})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(save.call_args.args, (USER, 'A', self.spec, CHART, 1))

    def test_conflict_is_surfaced_as_409_without_leaking_detail(self):
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                patch.object(api, 'validate_spec', return_value=(self.spec, {})), \
                patch.object(api, 'save_chart', side_effect=ChartError('CHART_VERSION_CONFLICT', 409)):
            response = self.client.put('/api/studio/charts/' + CHART, json={'name': 'A', 'config': CONFIG, 'expected_version': 1})
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json, {'success': False, 'code': 'CHART_VERSION_CONFLICT'})

    def test_get_reauthorizes_saved_dataset_and_hides_it_on_denial(self):
        saved = {'chart_id': CHART, 'name': 'A', 'version': 1, 'config': self.spec}
        with patch.object(api, '_principal', return_value=USER), \
                patch.object(api, 'get_chart', return_value=saved), \
                patch.object(api, 'authorized_dataset', side_effect=ChartError('CHART_DATASET_NOT_FOUND', 404)):
            response = self.client.get('/api/studio/charts/' + CHART)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json['code'], 'CHART_DATASET_NOT_FOUND')

    def test_get_returns_saved_chart_when_dataset_still_authorized(self):
        saved = {'chart_id': CHART, 'name': 'A', 'version': 1, 'config': self.spec}
        with patch.object(api, '_principal', return_value=USER), \
                patch.object(api, 'get_chart', return_value=saved), \
                patch.object(api, 'authorized_dataset', return_value={}) as authorize:
            response = self.client.get('/api/studio/charts/' + CHART)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['data'], saved)
        authorize.assert_called_once_with(USER, DATASET, 'PARQUET')

    def test_parquet_dataset_denied_when_pipeline_output_is_unavailable(self):
        saved = {'chart_id': CHART, 'name': 'A', 'version': 1, 'config': self.spec}
        with patch.object(api, '_principal', return_value=USER), \
                patch.object(api, 'get_chart', return_value=saved), \
                patch.object(api.pipeline_store, 'output', side_effect=PipelineError('PIPELINE_OUTPUT_NOT_FOUND', 404)) as output:
                response = self.client.get('/api/studio/charts/' + CHART)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json['code'], 'PIPELINE_OUTPUT_NOT_FOUND')
        output.assert_called_once_with(USER, DATASET)

    def test_delete_invalid_id_fails_route_validation(self):
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), patch.object(api, 'delete_chart') as call:
            response = self.client.delete('/api/studio/charts/not-a-uuid')
        self.assertEqual(response.status_code, 404)
        call.assert_not_called()

    def test_delete_returns_deleted_contract(self):
        with patch.object(api, '_principal', return_value=USER), patch.object(api, '_mutating'), \
                patch.object(api, 'delete_chart', return_value={'chart_id': CHART, 'deleted': True}) as call:
            response = self.client.delete('/api/studio/charts/' + CHART)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json['data']['deleted'])
        call.assert_called_once_with(USER, CHART)


if __name__ == '__main__':
    unittest.main()
