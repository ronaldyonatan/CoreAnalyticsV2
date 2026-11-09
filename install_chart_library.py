#!/usr/bin/env python3
"""Safely wire Chart Library into the user's CURRENT frontend source.

Does NOT replace entire DataStudioWorkspace.tsx, preserving local ETL changes.
Run from any location: python3 install_chart_library.py --dry-run ~/CoreAnalyticsV2
Then: python3 install_chart_library.py --apply ~/CoreAnalyticsV2
"""
import argparse
import re
from pathlib import Path

parser = argparse.ArgumentParser()
mode = parser.add_mutually_exclusive_group(required=True)
mode.add_argument('--dry-run', action='store_true')
mode.add_argument('--apply', action='store_true')
parser.add_argument('project_root', type=Path)
args = parser.parse_args()
root = args.project_root.expanduser().resolve()
folder = root / 'voice-dashboard' / 'src' / 'dataStudio'
workspace = folder / 'DataStudioWorkspace.tsx'
modules = folder / 'modules.tsx'
if not (workspace.exists() and modules.exists()):
    raise SystemExit(f'MISSING_SOURCE: expected {workspace} and {modules}')

source = workspace.read_text(encoding='utf-8')
updated = source
if "import ChartLibrary from './ChartLibrary';" not in updated:
    anchor = "import Datasets from './Datasets';"
    if anchor not in updated:
        raise SystemExit('ANCHOR_MISSING: Datasets import')
    updated = updated.replace(anchor, anchor + "\nimport ChartLibrary from './ChartLibrary';", 1)
if "{selected === 'charts' && <ChartLibrary />}" not in updated:
    anchor = "{selected === 'datasets' &&"
    pos = updated.find(anchor)
    if pos < 0:
        raise SystemExit('ANCHOR_MISSING: module datasets render')
    updated = updated[:pos] + "{selected === 'charts' && <ChartLibrary />}\n          " + updated[pos:]

msrc = modules.read_text(encoding='utf-8')
# Match only the Chart Library module, preserving all other statuses/custom UI.
pattern = r"(\{\s*id:\s*'charts'\s*,[^\n]*?status:\s*)'planned'"
mupdated, count = re.subn(pattern, r"\1'preview'", msrc, count=1)
if count == 0 and "id: 'charts'" in msrc and "status: 'preview'" not in msrc.split("id: 'charts'",1)[1].split("},",1)[0]:
    raise SystemExit('ANCHOR_MISSING: Chart Library module status')

changed = [(workspace, source, updated), (modules, msrc, mupdated)]
for target, previous, current in changed:
    print(('CHANGE ' if current != previous else 'UNCHANGED ') + str(target))
if args.dry_run:
    print('DRY RUN: nothing written')
else:
    for target, previous, current in changed:
        if current != previous:
            backup = target.with_suffix(target.suffix + '.chartstage1.bak')
            if backup.exists():
                raise SystemExit(f'BACKUP_EXISTS: {backup}. Please move old backup before reapplying.')
            backup.write_text(previous, encoding='utf-8')
            target.write_text(current, encoding='utf-8')
    print('PATCHED. Existing ETL, Dataset, and popup code preserved.')
