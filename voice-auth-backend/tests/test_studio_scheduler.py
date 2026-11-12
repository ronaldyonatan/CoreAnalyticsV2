"""Unit regression checks for Phase 3.1 Scheduler; no database/network involved."""
import importlib
import sys
import types
import unittest
from unittest.mock import patch


class SchedulerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Fake BEAM-dependent imports so tests are runnable without live credentials.
        clients = types.ModuleType('app.clients.core_api_client')
        clients.core_api = types.SimpleNamespace(session=object(), url='unused', timeout=1)
        connections = types.ModuleType('app.services.studio_connections')
        connections._rows = lambda x: x
        with patch.dict(sys.modules, {
            'app.clients.core_api_client': clients,
            'app.services.studio_connections': connections,
        }):
            cls.scheduler = importlib.import_module('app.services.studio_scheduler')

    def form(self, **updates):
        result = dict(schedule_id=None, schedule_name='Finance pagi', target_type='STORED',
                      target_id='c8355667-4044-4d24-a334-f8d4f88d0c9f', pipeline_version=None,
                      frequency='DAILY', interval_minutes=None, time_of_day='07:00',
                      week_day=None, month_day=None, enabled=True)
        result.update(updates)
        return result

    def test_daily_stored_data_accepts_correct_fields(self):
        with patch.object(self.scheduler, '_rpc', return_value={'success': True}) as rpc:
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13', self.form())
            self.assertEqual(rpc.call_args.kwargs['Frequency'], 'DAILY')
            self.assertEqual(rpc.call_args.kwargs['TargetType'], 'STORED')

    def test_pipeline_requires_pinned_version(self):
        with self.assertRaises(self.scheduler.SchedulerError):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                self.form(target_type='PIPELINE'))
        with patch.object(self.scheduler, '_rpc', return_value={'success': True}) as rpc:
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                self.form(target_type='PIPELINE', pipeline_version=2))
            self.assertEqual(rpc.call_args.kwargs['PipelineVersion'], 2)

    def test_weekly_and_monthly_validations(self):
        with patch.object(self.scheduler, '_rpc', return_value={'success': True}):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                self.form(frequency='WEEKLY', week_day=7))
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                self.form(frequency='MONTHLY', month_day=31))
        with self.assertRaises(self.scheduler.SchedulerError):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                self.form(frequency='MONTHLY', month_day=32))

    def test_multi_day_weekly_uses_one_mask(self):
        with patch.object(self.scheduler, '_rpc', return_value={'success': True}) as rpc:
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                self.form(frequency='WEEKLY', week_days_mask=21))  # Senin, Rabu, Jumat
            self.assertEqual(rpc.call_args.kwargs['WeekDaysMask'], 21)
            self.assertIsNone(rpc.call_args.kwargs['WeekDay'])

    def test_daily_repeat_minutes_and_hourly(self):
        with patch.object(self.scheduler, '_rpc', return_value={'success': True}) as rpc:
            for interval in (30, 360):
                self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',
                                    self.form(frequency='DAILY', repeat_minutes=interval))
                self.assertEqual(rpc.call_args.kwargs['RepeatMinutes'], interval)

    def test_invalid_multi_week_and_repeat_values(self):
        bad = [self.form(frequency='WEEKLY', week_days_mask=0),
               self.form(frequency='WEEKLY', week_days_mask=128),
               self.form(frequency='WEEKLY', week_days_mask=3, week_day=2),
               self.form(frequency='DAILY', repeat_minutes=4),
               self.form(frequency='DAILY', repeat_minutes=1441),
               self.form(frequency='MONTHLY',month_day=15,repeat_minutes=30),
               self.form(frequency='INTERVAL',interval_minutes=60,time_of_day=None,repeat_minutes=15)]
        for form in bad:
            with self.assertRaises(self.scheduler.SchedulerError):self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',form)

    def test_rejects_bad_clock_and_low_interval(self):
        with self.assertRaises(self.scheduler.SchedulerError):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',self.form(time_of_day='25:00'))
        with self.assertRaises(self.scheduler.SchedulerError):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',self.form(frequency='INTERVAL',interval_minutes=1,time_of_day=None))

    def test_rejects_unknown_fields_and_non_boolean_enabled(self):
        with self.assertRaises(self.scheduler.SchedulerError):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',self.form(password='bad'))
        with self.assertRaises(self.scheduler.SchedulerError):
            self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',self.form(enabled=1))

    def test_rejects_unauthorized_uuid_values(self):
        with patch.object(self.scheduler, '_rpc', return_value={'success': True}):
            with self.assertRaises(self.scheduler.SchedulerError):
                self.scheduler.save('397ebb69-2aab-4bb0-89b6-731c1b95ab13',self.form(target_id='../outside'))
            with self.assertRaises(self.scheduler.SchedulerError):
                self.scheduler.toggle('397ebb69-2aab-4bb0-89b6-731c1b95ab13','bad-id',True)


if __name__ == '__main__':
    unittest.main()
