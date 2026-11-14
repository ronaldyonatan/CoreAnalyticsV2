"""Local-only entrypoint for the existing private Parquet Reader.

Run with the data-studio-worker Python environment (Flask, pyarrow, duckdb).
Never bind this development server to a public interface.
"""
import os
from pathlib import Path

from server import create_app


def main():
    root = os.environ.get('STUDIO_BATCH_STORAGE_ROOT', '')
    token_file = os.environ.get('STUDIO_PARQUET_READER_TOKEN_FILE', '')
    if not root or not Path(root).is_absolute() or not Path(root).is_dir():
        raise SystemExit('STUDIO_BATCH_STORAGE_ROOT must be an existing absolute directory')
    if not token_file or not Path(token_file).is_file():
        raise SystemExit('STUDIO_PARQUET_READER_TOKEN_FILE must point to the reader token file')
    token = Path(token_file).read_text(encoding='ascii').strip()
    app = create_app(root, token)
    app.run(host='127.0.0.1', port=8090, debug=False, use_reloader=False)


if __name__ == '__main__':
    main()
