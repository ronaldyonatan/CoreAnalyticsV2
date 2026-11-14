"""Exercise signed routing with fresh nonexistent IDs; never claim or tick."""
import uuid
import os
from app.services.studio_worker_beam import ingest, WorkerBeamError


def main():
    worker, run = str(uuid.uuid4()), str(uuid.uuid4())
    for action, values in (('Heartbeat', {}), ('Fail', {'error_code': 'INGEST_WORKER_STOPPED'}),
                           ('Complete', {'row_count': 0, 'schema_json': '{}',
                                         'storage_relative_path': run + '/output-0'})):
        row = ingest(action, worker, run, **values)
        if row.get('affected') != 0:
            raise WorkerBeamError('WORKER_BEAM_UNEXPECTED_AFFECTED')
        print(action.lower() + '_unknown_run: PASS')
    if os.getenv('STUDIO_WORKER_TARGETED_PROBE', '').lower() == 'true':
        if ingest('ClaimSpecific', worker, run) is not None:
            raise WorkerBeamError('WORKER_BEAM_UNEXPECTED_CLAIM')
        print('targeted_unknown_run: PASS')


if __name__ == '__main__':
    try:
        main()
    except Exception:
        raise SystemExit('WORKER_BEAM_NONDESTRUCTIVE_PROBE_FAILED') from None
