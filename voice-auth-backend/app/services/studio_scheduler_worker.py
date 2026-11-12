"""Small dedicated, manually launched scheduler poller.

Only calls studio.spSchedulerDispatch; SQL handles atomic queueing, dedup and history.
Does NOT execute Spark, write Parquet, or start inside Flask.
"""
import argparse
import os
import signal
import sys
import time

STOP = False


def stop(*_):
    global STOP
    STOP = True


def connect():
    import pyodbc
    dsn = os.environ.get('STUDIO_SCHEDULER_SQL_CONNECTION_STRING') or os.environ.get('STUDIO_INGEST_SQL_CONNECTION_STRING')
    if not dsn or len(dsn) > 4096:
        raise RuntimeError('SCHEDULER_SQL_CONNECTION_NOT_CONFIGURED')
    return pyodbc.connect(dsn, autocommit=True, timeout=15)


def tick(connection):
    cursor = connection.cursor()
    try:
        cursor.execute('EXEC studio.spSchedulerDispatch @Action=?', ('Tick',))
        row = cursor.fetchone()
        if row is None:
            raise RuntimeError('SCHEDULER_RESPONSE_INVALID')
        cols = [desc[0] for desc in cursor.description]
        result = dict(zip(cols, row))
        if result.get('has_event') not in (0, 1, False, True):
            raise RuntimeError('SCHEDULER_RESPONSE_INVALID')
        return result
    finally:
        cursor.close()


def main():
    parser = argparse.ArgumentParser(description='CoreAnalyticsV2 SQL-backed scheduler')
    parser.add_argument('mode', choices=['once', 'serve'])
    parser.add_argument('--poll-seconds', type=int, default=15)
    args = parser.parse_args()
    if not 5 <= args.poll_seconds <= 3600:
        parser.error('--poll-seconds must be between 5 and 3600')
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    print('SCHEDULER_START mode=' + args.mode, flush=True)
    while not STOP:
        try:
            connection = connect()
            try:
                # Each tick dispatches one due slot, never more than 50 per polling cycle.
                # This avoids running unbounded work after downtime.
                for _ in range(50):
                    event = tick(connection)
                    if not event['has_event']:
                        break
                    print('SCHEDULER_' + str(event.get('result', 'UNKNOWN')) + ' ' +
                          str(event.get('schedule_id', '')), flush=True)
            finally:
                connection.close()
        except Exception:
            # Do not log raw ODBC errors: some driver traces contain connection secrets.
            print('SCHEDULER_TICK_FAILED', file=sys.stderr, flush=True)
            if args.mode == 'once':
                return 1
        if args.mode == 'once':
            break
        # poll frequently, but terminate promptly on SIGINT/SIGTERM.
        for _ in range(args.poll_seconds):
            if STOP:
                break
            time.sleep(1)
    return 0


if __name__ == '__main__':
    sys.exit(main())
