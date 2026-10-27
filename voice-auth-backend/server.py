import os
import subprocess
import asyncio
import io
import soundfile as sf
import numpy as np
import torch
import edge_tts
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from speechbrain.inference.speaker import SpeakerRecognition
from app.routes.management_api import management_bp
from app.routes.voice_auth_api import voice_auth_bp


app = Flask(__name__)
CORS(app)  # Mengizinkan akses dari front-end React/Vite

app.register_blueprint(management_bp)
app.register_blueprint(voice_auth_bp)

# Pastikan folder penyimpanan profil suara tersedia
os.makedirs("voice-profiles", exist_ok=True)

print("Loading local SpeechBrain speaker verification model...")
try:
    verification_model = SpeakerRecognition.from_hparams(
        source="tmp_model", 
        savedir="tmp_model"
    )
    print("Model loaded successfully!")
except Exception as e:
    print(f"Error loading model: {e}")

def fix_wav_format(input_path, output_path):
    """Mengonversi audio webm/blob dari browser ke PCM WAV standar menggunakan ffmpeg"""
    try:
        command = [
            'ffmpeg', '-y', '-i', input_path,
            '-ar', '16000', '-ac', '1', '-sample_fmt', 's16',
            output_path
        ]
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr.decode('utf-8')}")
            if input_path != output_path:
                with open(input_path, 'rb') as f_in, open(output_path, 'wb') as f_out:
                    f_out.write(f_in.read())
    except Exception as e:
        print(f"Conversion exception: {e}")
        if input_path != output_path:
            with open(input_path, 'rb') as f_in, open(output_path, 'wb') as f_out:
                f_out.write(f_in.read())

@app.route('/register-voice', methods=['POST'])
def register_voice():
    audio_file = request.files.get('audio')
    passphrase = request.form.get('passphrase')
    
    if not audio_file or not passphrase:
        return jsonify({"status": "error", "message": "Missing audio or passphrase"}), 400
    
    raw_path = f"voice-profiles/raw_{passphrase}.tmp"
    audio_file.save(raw_path)
    
    final_path = os.path.join("voice-profiles", f"{passphrase}.wav")
    fix_wav_format(raw_path, final_path)
    
    if os.path.exists(raw_path):
        os.remove(raw_path)
    
    print(f"Voice profile successfully registered & converted for: {passphrase}")
    return jsonify({"status": "success", "message": "Voice registered successfully!"}), 200

@app.route('/verify-voice', methods=['POST'])
def verify_voice():
    audio_file = request.files.get('audio')
    passphrase = request.form.get('passphrase')
    
    if not audio_file or not passphrase:
        return jsonify({"status": "error", "message": "Missing audio or passphrase"}), 400

    profile_path = os.path.join("voice-profiles", f"{passphrase}.wav")
    if not os.path.exists(profile_path):
        return jsonify({"status": "rejected", "message": "Voice profile not found."}), 401

    raw_temp = "tmp_raw.tmp"
    audio_file.save(raw_temp)
    
    temp_path = "tmp_incoming.wav"
    fix_wav_format(raw_temp, temp_path)
    
    if os.path.exists(raw_temp):
        os.remove(raw_temp)

    try:
        score, prediction = verification_model.verify_files(profile_path, temp_path)
        
        print(f"DEBUG -> User: {passphrase} | Similarity Score: {score} | Raw Prediction: {prediction[0]}")

        is_matched = bool(prediction[0])

        if os.path.exists(temp_path):
            os.remove(temp_path)

        if not is_matched:
            print("ACCESS DENIED: Voice does not match!")
            return jsonify({"status": "rejected", "message": "Voice does not match! Access Denied."}), 401

        print("ACCESS GRANTED: Voice verified.")
        return jsonify({"status": "success", "message": "Voice verified successfully!"}), 200

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print(f"Error during verification: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/identify-voice', methods=['POST'])
def identify_voice():
    audio_file = request.files.get('audio')
    
    if not audio_file:
        return jsonify({"status": "error", "message": "Missing audio file"}), 400

    raw_temp = "tmp_raw_id.tmp"
    audio_file.save(raw_temp)
    
    temp_path = "tmp_incoming_id.wav"
    fix_wav_format(raw_temp, temp_path)
    
    if os.path.exists(raw_temp):
        os.remove(raw_temp)

    try:
        profiles_dir = "voice-profiles"
        if not os.path.exists(profiles_dir):
            return jsonify({"status": "rejected", "message": "No voice profiles registered."}), 404

        best_match = None
        highest_score = -999.0

        for file in os.listdir(profiles_dir):
            if file.endswith(".wav"):
                profile_name = os.path.splitext(file)[0]
                profile_path = os.path.join(profiles_dir, file)
                
                try:
                    score, prediction = verification_model.verify_files(profile_path, temp_path)
                    current_score = float(score)
                    
                    print(f"Comparing with profile '{profile_name}' -> Score: {current_score}")
                    
                    if current_score > highest_score:
                        highest_score = current_score
                        best_match = profile_name
                except Exception as inner_e:
                    print(f"Error comparing with {profile_name}: {inner_e}")

        if os.path.exists(temp_path):
            os.remove(temp_path)

        # Threshold mikrofon laptop
        CONFIDENCE_THRESHOLD = -0.15

        if best_match and highest_score >= CONFIDENCE_THRESHOLD:
            print(f"IDENTIFIED: {best_match} with score {highest_score}")
            return jsonify({
                "status": "success", 
                "matched_user": best_match, 
                "score": highest_score
            }), 200
        else:
            print(f"IDENTIFICATION FAILED: Highest score was {highest_score}")
            return jsonify({
                "status": "rejected", 
                "message": "Voice not recognized in system database."
            }), 401

    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        print(f"Error during identification: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500


# ROUTE TTS AZURE EDGE (English Neural Voice)
@app.route('/tts', methods=['POST'])
def text_to_speech():
    data = request.json or {}
    text = data.get('text', '')
    
    if not text:
        return jsonify({"error": "Text empty"}), 400

    # Suara AI Bahasa Inggris Premium
    voice = "en-US-JennyNeural"

    async def generate_audio():
        communicate = edge_tts.Communicate(text, voice)
        audio_bytes = b""
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_bytes += chunk["data"]
        return audio_bytes

    try:
        audio_data = asyncio.run(generate_audio())
        return send_file(
            io.BytesIO(audio_data),
            mimetype="audio/mp3"
        )
    except Exception as e:
        print("TTS Generation Error:", e)
        return jsonify({"error": str(e)}), 500


if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=5001,
        debug=False,
        use_reloader=False
    )

