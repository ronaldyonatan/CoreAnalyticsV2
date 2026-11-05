FROM python:3.11-slim-bookworm

# Supaya log Python langsung muncul di docker logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Basis Debian 12 (bookworm) diselaraskan dengan repositori Microsoft ODBC 18.
# Pertahankan library voice/audio + tambahkan library native SQL Server.
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends \
      ffmpeg \
      libsndfile1 \
      libportaudio2 \
      portaudio19-dev \
      gcc \
      g++ \
      ca-certificates \
      curl \
      unixodbc-dev \
      libgssapi-krb5-2 \
      libssl3; \
    curl -fsSL \
      https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
      -o /tmp/packages-microsoft-prod.deb; \
    dpkg -i /tmp/packages-microsoft-prod.deb; \
    apt-get update; \
    ACCEPT_EULA=Y apt-get install -y --no-install-recommends msodbcsql18; \
    rm -f /tmp/packages-microsoft-prod.deb; \
    rm -rf /var/lib/apt/lists/*; \
    odbcinst -q -d | grep -F 'ODBC Driver 18 for SQL Server'

# Install Python dependencies terlebih dahulu
# supaya Docker layer bisa di-cache
COPY requirements.txt .

# SpeechBrain 1.1.2 membutuhkan torch/torchaudio >= 2.7.1.
# Instal wheel CPU-only dari indeks resmi PyTorch, lalu cocokkan lock versi
# di requirements.txt supaya pip tidak menginstal CUDA/NVIDIA dari PyPI.
# Kedua instalasi ditempatkan dalam SATU layer untuk menghindari
# sisa layer Torch lama jika resolver diubah pada release berikutnya.
RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir \
      'torch==2.7.1+cpu' \
      'torchaudio==2.7.1+cpu' \
      --index-url https://download.pytorch.org/whl/cpu && \
    python -m pip install --no-cache-dir -r requirements.txt && \
    python -m pip check

# Fail-fast: CPU-only, speech model import, dan tidak ada runtime NVIDIA.
RUN python -c "import importlib.metadata as m; import torch, torchaudio; from speechbrain.inference.speaker import SpeakerRecognition; assert torch.__version__.startswith('2.7.1+cpu'), torch.__version__; assert torchaudio.__version__.startswith('2.7.1+cpu'), torchaudio.__version__; assert torch.version.cuda is None, torch.version.cuda; gpu=[d.metadata['Name'] for d in m.distributions() if d.metadata.get('Name','').lower().startswith('nvidia-')]; assert not gpu, gpu; print('SpeechBrain CPU-only OK:', torch.__version__, torchaudio.__version__)"

# Build langsung gagal bila driver native atau enkripsi Data Studio tidak tersedia.
RUN python -c "import pyodbc; from cryptography.fernet import Fernet; drivers=pyodbc.drivers(); assert 'ODBC Driver 18 for SQL Server' in drivers, drivers; print('Data Studio Docker dependencies OK:', drivers)"

# Copy source backend + tmp_model
# PENTING: pastikan .dockerignore mengecualikan .env dan .venv
# agar secret/kunci Fernet tidak masuk ke image.
COPY . .

# Pastikan storage tersedia
RUN mkdir -p /app/voice-profiles

EXPOSE 5001

CMD ["python", "server.py"]