import unittest
import math
from app.data_science import compute, ScienceError
from app.automl import train, infer


def step(op, **values):
    return {'type': 'data_science', 'operation': op, 'output': 'result', **values}


class ScienceTests(unittest.TestCase):
    def test_linear_regression_predicts_unseen_rows_and_keeps_test_schema(self):
        train_rows = [[str(i), str(2*i+3)] for i in range(1, 9)]
        names, rows = compute([(['X','Y'], train_rows), (['X'], [['10'],['20']])], step('prediction', target='Y', numeric=['X'], categorical=[], algorithm='Linear Regression'))
        self.assertEqual(names, ['X', 'result']); self.assertAlmostEqual(float(rows[0][1]), 23); self.assertAlmostEqual(float(rows[1][1]), 43)

    def test_all_supervised_algorithms_and_categorical_predictors(self):
        for algorithm in ('Random Forest', 'Naive Bayes'):
            _, rows = compute([(['Group','Target'], [['low','A'],['low','A'],['high','B'],['high','B']]), (['Group'], [['low'],['high'],['new']])], step('classification', target='Target', numeric=[], categorical=['Group'], algorithm=algorithm))
            self.assertEqual([r[-1] for r in rows[:2]], ['A','B']); self.assertIn(rows[2][-1], ['A','B'])
        _, rows = compute([(['X','Y'], [['1','5'],['2','7'],['3','9'],['4','11']])], step('prediction', target='Y', numeric=['X'], categorical=[], algorithm='Random Forest'))
        self.assertTrue(all(math.isfinite(float(row[-1])) for row in rows))

    def test_numeric_failures_and_target_leakage_are_explicit(self):
        base = step('prediction', target='Y', numeric=['X'], categorical=[], algorithm='Linear Regression')
        for bad in ('oops', None, 'NaN', 'Infinity', '1e999'):
            with self.assertRaisesRegex(ScienceError, 'INVALID_NUMBER'): compute([(['X','Y'], [[bad,'1'],['2','3']])], base)
        with self.assertRaisesRegex(ScienceError, 'DEGENERATE_MODEL'):
            compute([(['X','Y'], [['0','A'],['0','B']])], step('classification', target='Y', numeric=['X'], categorical=[], algorithm='Naive Bayes'))
        with self.assertRaisesRegex(ScienceError, 'INVALID_FEATURES'): compute([(['X','Y'], [['1','2'],['2','3']])], {**base, 'numeric':['Y']})

    def test_clustering_keeps_two_groups_for_both_algorithms(self):
        for algorithm in ('k-means', 'k-medians'):
            _, rows = compute([(['X'], [['0'],['1'],['20'],['21']])], step('clustering', features=['X'], count=2, algorithm=algorithm))
            self.assertEqual(rows[0][-1], rows[1][-1]); self.assertEqual(rows[2][-1], rows[3][-1]); self.assertNotEqual(rows[0][-1], rows[2][-1])
        with self.assertRaisesRegex(ScienceError, 'INSUFFICIENT_CLUSTERS'): compute([(['X'], [['1'],['1']])], step('clustering', features=['X'], count=2, algorithm='k-means'))

    def test_outlier_std_mad_and_multivariate(self):
        for algorithm in ('Standard Deviation', 'Mean Absolute Deviation'):
            _, rows = compute([(['X'], [[str(v)] for v in [1]*10+[100]])], step('outlier', source='X', cutoff=2, algorithm=algorithm))
            self.assertEqual(rows[-1][-1], 'true'); self.assertEqual(rows[0][-1], 'false')
        _, rows = compute([(['X'], [[str(i%3)] for i in range(20)] + [['100']])], step('multivariate', features=['X'], cutoff=.95))
        self.assertEqual(rows[-1][-1], '1'); self.assertEqual(rows[0][-1], '0')
        with self.assertRaisesRegex(ScienceError, 'SINGULAR'): compute([(['X','Y'], [['1','2'],['2','4'],['3','6']])], step('multivariate', features=['X','Y'], cutoff=.95))

    def test_forecast_appends_dates_and_bounds_history_is_not_prediction(self):
        rows = [[f'2026-01-{i:02d}', str(10+2*i+(i%3))] for i in range(1,17)]
        config = step('forecasting', time='T', target='Y', periods=3, history=4, band=95, frequency=1, lower='lower', upper='upper')
        names, result = compute([(['T','Y'], list(reversed(rows)))], config)
        self.assertEqual(names, ['T','Y','result','lower','upper']); self.assertEqual(len(result), 7)
        self.assertEqual(result[0], rows[-4]+[None,None,None]); self.assertEqual(result[-1][0], '2026-01-19'); self.assertIsNone(result[-1][1])
        for row in result[-3:]: self.assertLessEqual(float(row[-2]), float(row[-3])); self.assertLessEqual(float(row[-3]), float(row[-1]))
        with self.assertRaisesRegex(ScienceError, 'FORECAST_ROW_LIMIT'): self._over_limit(config)
        with self.assertRaisesRegex(ScienceError, 'INVALID_TIME'): compute([(['T','Y'], rows + [rows[-1]])], config)

    def _over_limit(self, config):
        from datetime import date, timedelta
        rows = [[(date(2026,1,1)+timedelta(days=i)).isoformat(), str(i)] for i in range(40)]
        return compute([(['T','Y'], rows)], {**config, 'periods': 25, 'history': 40})

    def test_automl_training_and_independent_inference(self):
        constant = train({'columns':['X','Y'], 'rows':[['0', 'A' if i<3 else 'B'] for i in range(6)], 'target':'Y', 'numeric':['X'], 'categorical':[], 'task':'classification'})
        self.assertEqual(constant['algorithm'], 'Random Forest')
        for task in ('prediction', 'classification'):
            request = {'columns':['X','Category','Y'], 'rows': [[str(i), 'low' if i<8 else 'high', str(2*i+3) if task=='prediction' else ('A' if i<8 else 'B')] for i in range(16)], 'target':'Y', 'numeric':['X'], 'categorical':['Category'], 'task':task}
            model = train(request)
            self.assertIn(model['algorithm'], ('Linear Regression','Random Forest','Naive Bayes')); self.assertTrue(math.isfinite(model['score']))
            predictions = infer(['Category','X'], [['high','20']], model)
            if task == 'prediction': self.assertAlmostEqual(float(predictions[0]), 43, places=5)
            else: self.assertEqual(predictions, ['B'])
            names, rows = compute([(['Category','X'], [['high','20']])], step('inference_trusted', _trusted_model=model))
            self.assertEqual(names, ['Category','X','result']); self.assertEqual(rows[0][-1], predictions[0])
