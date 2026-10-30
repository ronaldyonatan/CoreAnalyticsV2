FROM python:3.11-slim

# Supaya log Python langsung muncul di docker logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Dependency OS yang dibutuhkan audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libsndfile1 \
    libportaudio2 \
    portaudio19-dev \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies terlebih dahulu
# supaya Docker layer bisa di-cache
COPY requirements.txt .

RUN pip install --no-cache-dir \
    torch==2.15.0+cpu \
    torchaudio==2.11.1+cpu \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source backend + tmp_model
COPY . .

# Pastikan storage tersedia
RUN mkdir -p /app/voice-profiles

EXPOSE 5001

CMD ["python", "server.py"]