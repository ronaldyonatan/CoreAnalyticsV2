#!/usr/bin/env python3
"""Inventory literal gateway modes in application source; no network or secrets."""
import ast
import collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / 'voice-auth-backend' / 'app'


def literals(node):
    if node is None:
        return []
    return [n.value for n in ast.walk(node)
            if isinstance(n, ast.Constant) and isinstance(n.value, str)
            and n.value.startswith('Core')]


def inventory():
    modes = collections.defaultdict(set)
    parse_errors = []
    for path in sorted(APP.rglob('*.py')):
        if '__pycache__' in path.parts:
            continue
        try:
            tree = ast.parse(path.read_text(encoding='utf-8'), filename=str(path))
        except (SyntaxError, UnicodeError) as error:
            parse_errors.append(f'{path.relative_to(ROOT)}: {type(error).__name__}')
            continue
        for node in ast.walk(tree):
            found = []
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and node.func.attr == '_post_mode' and node.args):
                found = literals(node.args[0])
            if isinstance(node, ast.Dict):
                for key, value in zip(node.keys, node.values):
                    if isinstance(key, ast.Constant) and key.value == 'Mode':
                        found += literals(value)
            for mode in found:
                modes[mode].add(f'{path.relative_to(ROOT)}:{node.lineno}')
    return modes, parse_errors


def main():
    modes, errors = inventory()
    print('# CoreAnalytics gateway mode inventory')
    print('\nStatic source scan only; dynamic modes and calls outside the Python app may be missing. '
          'This does not inspect the live database or establish which routes are installed.')
    print(f'\n{len(modes)} distinct literal Core modes found.\n')
    print('| Mode | Source call sites |\n| --- | --- |')
    for mode, locations in sorted(modes.items()):
        print(f"| {mode} | {'; '.join(sorted(locations))} |")
    if errors:
        print('\nFiles that could not be parsed:')
        for error in errors:
            print(f'- {error}')


if __name__ == '__main__':
    main()
