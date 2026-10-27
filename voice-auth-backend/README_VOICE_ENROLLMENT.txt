COREANALYTICS PHASE 1 - VOICE ENROLLMENT

COPY FILES
==========

voice-auth-backend/
  app/
    services/
      audio_processing.py
      speaker_engine.py
      enrollment_service.py

  test_speaker_embedding.py
  test_voice_enrollment.py


REQUIREMENTS
============

Merge requirements_phase1_voice.txt into your existing requirements.txt.

Important:
ffmpeg is an OS dependency, not a pip package.

macOS:
  brew install ffmpeg


ENV OPTIONAL
============

VOICE_MODEL_PATH=tmp_model
VOICE_MODEL_VERSION=local-tmp_model-v1
VOICE_DEFAULT_THRESHOLD=0.55


STEP 1 - TEST MODEL/EMBEDDING
=============================

python test_speaker_embedding.py "/path/to/sample.wav"

Expected:
  Quality: ... is_valid=True
  Embedding dimension: 192 (or model-specific dimension)
  Embedding norm: approximately 1.0


STEP 2 - GET USER ID
====================

SQL:
SELECT user_id, username, display_name
FROM [CoreAnalytics].dbo.core_user
WHERE username = 'ronald';


STEP 3 - RECORD 5 DIFFERENT SAMPLES
===================================

Do not duplicate the same WAV five times.

Use natural speech from the same speaker.
Recommended 3-8 seconds each.


STEP 4 - ENROLL
===============

python test_voice_enrollment.py \
  --user-id "YOUR-UUID" \
  sample1.wav sample2.wav sample3.wav sample4.wav sample5.wav


EXPECTED DATABASE
=================

core_voice_profile:
  one active profile for the user
  sample_count = 5
  centroid_embedding not null

core_voice_sample:
  five rows

storage/voice/<user_uuid>/enrollment:
  sample_001.wav
  ...
  sample_005.wav


NEXT STEP
=========

After enrollment works:
- build identification_service.py
- get CoreVoiceProfileActive
- create incoming embedding
- cosine similarity
- best score
- second best score
- margin
- VERIFIED / AMBIGUOUS / UNKNOWN / REJECTED_QUALITY
- refactor Flask /identify-voice
