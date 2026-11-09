FROM python:3.13-slim-bookworm@sha256:a5a7017efc5969e00ae2b91c8eb0631049a569652aa4ffc4501769049ae45c72
RUN apt-get update && apt-get install -y --no-install-recommends r-base-core r-cran-jsonlite && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir numpy==2.2.6 pandas==2.2.3
COPY main.py python_driver.py r_driver.R /opt/studio-runner/
LABEL coreanalytics.script-runtime="1"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 HOME=/work TMPDIR=/tmp
USER 65532:65532
WORKDIR /work
ENTRYPOINT ["python", "-I", "-B", "/opt/studio-runner/main.py"]
