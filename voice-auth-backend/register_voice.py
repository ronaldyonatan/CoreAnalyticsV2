from flask import Blueprint, request, jsonify
import os

voice_bp = Blueprint('voice', __name__)
UPLOAD_FOLDER = 'backend/voices'  # Sesuaikan direktori penyimpanan Anda
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

@voice_bp.route('/register-voice', methods=['POST'])
def register_voice():
    if 'audio' not in request.files:
        return jsonify({"error": "Tidak ada file audio yang diunggah"}), 400
    
    file = request.files['audio']
    user_id = request.form.get('user_id', 'default_user')
    
    # Simpan file sebagai referensi suara user
    file_path = os.path.join(UPLOAD_FOLDER, f"{user_id}_reference.wav")
    file.save(file_path)
    
    # (Opsional) Jalankan fungsi ekstraksi embedding suara di sini
    
    return jsonify({
        "status": "success",
        "message": "Suara biometrik berhasil didaftarkan ulang",
        "path": file_path
    }), 200