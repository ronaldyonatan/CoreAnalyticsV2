FROM python:3.12-slim@sha256:5e2bdb1b0d542d5039cffb8181c65930093949194a65c365dfb1b0fe13a4fa5b
RUN pip install --no-cache-dir pyarrow==20.0.0 Flask==3.1.2 gunicorn==23.0.0
WORKDIR /opt/reader
COPY parquet_reader.py server.py ./
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STUDIO_BATCH_STORAGE_ROOT=/var/lib/coreanalytics/parquet
ENTRYPOINT ["python3", "server.py"]
