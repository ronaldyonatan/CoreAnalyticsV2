import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './MyAccount.css';

const API_BASE =
  import.meta.env.VITE_VOICE_API_URL ||
  'http://127.0.0.1:5001';

interface AccountUser {
  user_id: string;
  username: string;
  display_name: string;
  auth_method?: 'voice' | 'password';
}

interface VoiceProfile {
  voice_profile_id?: string;
  model_name?: string;
  model_version?: string;
  sample_count?: number;
  threshold?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

interface VoiceSample {
  blob: Blob;
  url: string;
  durationMs: number;
}

interface MyAccountProps {
  open: boolean;
  user: AccountUser | null;
  onClose: () => void;
  onPasswordChanged: () => void;
}

type AccountTab = 'security' | 'voice';

const VOICE_PHRASES = [
  'Core Analytics, buka Daily Tracking.',
  'Tampilkan dashboard Company Performance.',
  'Core Analytics, tampilkan revenue hari ini.',
  'Buka informasi performa layanan.',
  'Core Analytics, kembali ke dashboard utama.',
];

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      {open ? (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
          <circle cx="12" cy="12" r="2.5" />
        </>
      ) : (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16 16 0 0 1-2.4 3.1" />
          <path d="M6.2 6.2C3.8 8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 4-1" />
        </>
      )}
    </svg>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20c.6-4 2.9-6.2 6.5-6.2s5.9 2.2 6.5 6.2" />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5" />
    </svg>
  );
}

function formatProfileDate(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function MyAccount({
  open,
  user,
  onClose,
  onPasswordChanged,
}: MyAccountProps) {
  const [tab, setTab] = useState<AccountTab>('security');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  const [voicePassword, setVoicePassword] = useState('');
  const [showVoicePassword, setShowVoicePassword] = useState(false);
  const [voiceVerified, setVoiceVerified] = useState(false);
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [samples, setSamples] = useState<VoiceSample[]>([]);
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recordStartedAtRef = useRef<number | null>(null);

  const currentPhrase = useMemo(
    () => VOICE_PHRASES[Math.min(samples.length, VOICE_PHRASES.length - 1)],
    [samples.length]
  );

  const revokeSamples = (items: VoiceSample[]) => {
    items.forEach((sample) => {
      try { URL.revokeObjectURL(sample.url); } catch {}
    });
  };

  const stopMedia = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      try { recorder.stop(); } catch {}
    }
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  };

  const resetVoice = () => {
    stopMedia();
    revokeSamples(samples);
    setSamples([]);
    setVoicePassword('');
    setShowVoicePassword(false);
    setVoiceVerified(false);
    setVoiceProfile(null);
    setVoiceBusy(false);
    setVoiceError('');
    setVoiceMessage('');
  };

  const resetPassword = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setPasswordBusy(false);
    setPasswordError('');
    setPasswordSuccess('');
  };

  useEffect(() => {
    if (!open) {
      resetPassword();
      resetVoice();
      setTab('security');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => {
    stopMedia();
    revokeSamples(samples);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!open || !user || typeof document === 'undefined') return null;

  const close = () => {
    if (passwordBusy || voiceBusy || recording) return;
    onClose();
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;

    if (!currentPassword) {
      setPasswordError('Password saat ini wajib diisi.');
      return;
    }
    if (!newPassword) {
      setPasswordError('Password baru wajib diisi.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Konfirmasi password baru tidak sama.');
      return;
    }

    setPasswordBusy(true);
    setPasswordError('');
    setPasswordSuccess('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Password gagal diubah.');
      }

      setPasswordSuccess('Password berhasil diubah. Session akan ditutup agar Anda login ulang.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      window.setTimeout(() => {
        try { localStorage.removeItem('core_authenticated_user'); } catch {}
        onPasswordChanged();
      }, 1000);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Password gagal diubah.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const verifyVoiceIdentity = async (event: React.FormEvent) => {
    event.preventDefault();
    if (voiceBusy) return;
    if (!voicePassword) {
      setVoiceError('Password saat ini wajib diisi untuk mengelola voice profile.');
      return;
    }

    setVoiceBusy(true);
    setVoiceError('');
    setVoiceMessage('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/voice-profile-self`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: user.username,
          current_password: voicePassword,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Identity verification gagal.');
      }

      setVoiceVerified(true);
      setVoiceProfile(result.voice_profile ?? null);
      if (result.voice_profile) setVoicePassword('');
      setVoiceMessage(
        result.voice_profile
          ? 'Identity verified. Voice profile aktif ditemukan.'
          : 'Identity verified. Anda dapat mendaftarkan voice profile baru.'
      );
    } catch (error) {
      setVoiceVerified(false);
      setVoiceProfile(null);
      setVoiceError(error instanceof Error ? error.message : 'Identity verification gagal.');
    } finally {
      setVoiceBusy(false);
    }
  };

  const startRecording = async () => {
    if (recording || voiceBusy || !voiceVerified || voiceProfile || samples.length >= 5) return;
    setVoiceError('');
    setVoiceMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ].find((value) => MediaRecorder.isTypeSupported(value)) || '';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recordStartedAtRef.current = Date.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const durationMs = recordStartedAtRef.current
          ? Date.now() - recordStartedAtRef.current
          : 0;
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        });
        const url = URL.createObjectURL(blob);
        setSamples((previous) => [...previous, { blob, url, durationMs }]);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        recordStartedAtRef.current = null;
        setRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);

      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 8000);
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Microphone tidak dapat digunakan.');
      stopMedia();
    }
  };

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') recorder.stop();
    setRecording(false);
  };

  const deleteSample = (index: number) => {
    if (recording || voiceBusy) return;
    setSamples((previous) => {
      const target = previous[index];
      if (target) {
        try { URL.revokeObjectURL(target.url); } catch {}
      }
      return previous.filter((_, sampleIndex) => sampleIndex !== index);
    });
  };

  const enrollVoice = async () => {
    if (voiceBusy || !voiceVerified || voiceProfile) return;
    if (samples.length !== 5) {
      setVoiceError('Enrollment membutuhkan tepat 5 sample suara.');
      return;
    }

    setVoiceBusy(true);
    setVoiceError('');
    setVoiceMessage('Uploading and building biometric voice profile...');

    try {
      const form = new FormData();
      form.append('username', user.username);
      form.append('current_password', voicePassword);

      samples.forEach((sample, index) => {
        const extension = sample.blob.type.includes('mp4') ? 'm4a' : 'webm';
        form.append('samples', sample.blob, `sample_${String(index + 1).padStart(3, '0')}.${extension}`);
      });

      const response = await fetch(`${API_BASE}/api/auth/voice-enroll-self`, {
        method: 'POST',
        body: form,
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Voice enrollment gagal.');
      }

      revokeSamples(samples);
      setSamples([]);
      setVoiceProfile(result.voice_profile ?? {
        sample_count: result.sample_count ?? 5,
        model_name: result.model_name,
        model_version: result.model_version,
        is_active: true,
      });
      setVoicePassword('');
      setVoiceMessage('Voice profile berhasil didaftarkan. Voice Login sekarang dapat digunakan.');
    } catch (error) {
      setVoiceError(error instanceof Error ? error.message : 'Voice enrollment gagal.');
      setVoiceMessage('');
    } finally {
      setVoiceBusy(false);
    }
  };

  const modal = (
    <div className="my-account-overlay" role="dialog" aria-modal="true" aria-label="My Account">
      <button type="button" className="my-account-backdrop" onClick={close} aria-label="Close My Account" />

      <section className="my-account-shell">
        <header className="my-account-header">
          <div className="my-account-avatar"><UserIcon /></div>
          <div className="my-account-identity">
            <div className="my-account-eyebrow">COREANALYTICS · MY ACCOUNT</div>
            <h2>{user.display_name || user.username}</h2>
            <div className="my-account-username">@{user.username} · {user.auth_method === 'voice' ? 'VOICE LOGIN' : 'PASSWORD LOGIN'}</div>
          </div>
          <button type="button" className="my-account-close" onClick={close} disabled={passwordBusy || voiceBusy || recording}>×</button>
        </header>

        <nav className="my-account-tabs" aria-label="My Account sections">
          <button type="button" className={tab === 'security' ? 'active' : ''} onClick={() => setTab('security')}>
            <LockIcon />
            <span>Account Security</span>
          </button>
          <button type="button" className={tab === 'voice' ? 'active' : ''} onClick={() => setTab('voice')}>
            <VoiceIcon />
            <span>Voice Identity</span>
          </button>
        </nav>

        <div className="my-account-content">
          {tab === 'security' ? (
            <form className="my-account-panel" onSubmit={changePassword}>
              <div className="my-account-section-title">CHANGE PASSWORD</div>
              <p className="my-account-help">
                Password saat ini diverifikasi ulang oleh backend. Password baru minimal 8 karakter dan harus memiliki huruf besar, huruf kecil, angka, serta karakter khusus.
              </p>

              <label className="my-account-field">
                <span>Current Password</span>
                <div className="my-account-input-wrap">
                  <input type={showCurrent ? 'text' : 'password'} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={passwordBusy} autoComplete="current-password" />
                  <button type="button" onClick={() => setShowCurrent((value) => !value)} aria-label="Toggle current password"><EyeIcon open={showCurrent} /></button>
                </div>
              </label>

              <label className="my-account-field">
                <span>New Password</span>
                <div className="my-account-input-wrap">
                  <input type={showNew ? 'text' : 'password'} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={passwordBusy} autoComplete="new-password" />
                  <button type="button" onClick={() => setShowNew((value) => !value)} aria-label="Toggle new password"><EyeIcon open={showNew} /></button>
                </div>
              </label>

              <label className="my-account-field">
                <span>Confirm New Password</span>
                <input type={showNew ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} disabled={passwordBusy} autoComplete="new-password" />
              </label>

              {passwordError && <div className="my-account-alert error">{passwordError}</div>}
              {passwordSuccess && <div className="my-account-alert success">✓ {passwordSuccess}</div>}

              <div className="my-account-actions">
                <button type="button" className="secondary" onClick={close} disabled={passwordBusy}>Cancel</button>
                <button type="submit" className="primary" disabled={passwordBusy || Boolean(passwordSuccess)}>{passwordBusy ? 'Changing...' : 'Change Password'}</button>
              </div>
            </form>
          ) : (
            <div className="my-account-panel">
              <div className="my-account-section-title">VOICE IDENTITY</div>
              <p className="my-account-help">
                Voice profile adalah biometric credential. Untuk keamanan, password saat ini harus diverifikasi sebelum status profile dapat dibaca atau voice baru didaftarkan.
              </p>

              {!voiceVerified ? (
                <form onSubmit={verifyVoiceIdentity} className="my-account-voice-verify">
                  <label className="my-account-field">
                    <span>Current Password</span>
                    <div className="my-account-input-wrap">
                      <input type={showVoicePassword ? 'text' : 'password'} value={voicePassword} onChange={(event) => setVoicePassword(event.target.value)} disabled={voiceBusy} autoComplete="current-password" />
                      <button type="button" onClick={() => setShowVoicePassword((value) => !value)} aria-label="Toggle voice verification password"><EyeIcon open={showVoicePassword} /></button>
                    </div>
                  </label>
                  <div className="my-account-actions compact">
                    <button type="submit" className="primary" disabled={voiceBusy}>{voiceBusy ? 'Verifying...' : 'Verify Identity'}</button>
                  </div>
                </form>
              ) : voiceProfile ? (
                <div className="my-account-voice-status enrolled">
                  <div className="my-account-status-orb">✓</div>
                  <div className="my-account-status-copy">
                    <strong>Voice Profile Enrolled</strong>
                    <span>Biometric identity is active for this account.</span>
                  </div>
                  <div className="my-account-profile-grid">
                    <div><span>Samples</span><strong>{String(voiceProfile.sample_count ?? '—')}</strong></div>
                    <div><span>Model</span><strong>{String(voiceProfile.model_name ?? '—')}</strong></div>
                    <div><span>Version</span><strong>{String(voiceProfile.model_version ?? '—')}</strong></div>
                    <div><span>Updated</span><strong>{formatProfileDate(String(voiceProfile.updated_at ?? voiceProfile.created_at ?? ''))}</strong></div>
                  </div>
                  <div className="my-account-note">
                    Re-enrollment belum diaktifkan pada self-service versi pertama agar profile biometric aktif tidak tertimpa tanpa prosedur penggantian yang aman.
                  </div>
                </div>
              ) : (
                <div className="my-account-enroll">
                  <div className="my-account-enroll-head">
                    <div>
                      <strong>New Voice Enrollment</strong>
                      <span>Record exactly 5 samples. Each sample stops automatically after 8 seconds.</span>
                    </div>
                    <div className="my-account-counter">{samples.length} / 5</div>
                  </div>

                  {samples.length < 5 && (
                    <div className="my-account-recorder">
                      <div className="my-account-phrase-label">SAMPLE {samples.length + 1}</div>
                      <div className="my-account-phrase">“{currentPhrase}”</div>
                      <button type="button" className={recording ? 'record stop' : 'record'} onClick={recording ? stopRecording : startRecording} disabled={voiceBusy}>
                        {recording ? '■ STOP RECORDING' : '● START RECORDING'}
                      </button>
                      <small>{recording ? 'Recording... speak naturally and clearly.' : 'Use a quiet room and keep a consistent microphone distance.'}</small>
                    </div>
                  )}

                  {samples.length > 0 && (
                    <div className="my-account-samples">
                      {samples.map((sample, index) => (
                        <div className="my-account-sample" key={`${sample.url}-${index}`}>
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <audio controls preload="metadata" src={sample.url} />
                          <small>{Math.max(0, Math.round(sample.durationMs / 100) / 10)}s</small>
                          <button type="button" onClick={() => deleteSample(index)} disabled={recording || voiceBusy}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="my-account-actions">
                    <button type="button" className="secondary" onClick={() => { revokeSamples(samples); setSamples([]); }} disabled={recording || voiceBusy || samples.length === 0}>Clear Samples</button>
                    <button type="button" className="primary" onClick={enrollVoice} disabled={recording || voiceBusy || samples.length !== 5}>{voiceBusy ? 'Enrolling...' : 'Enroll Voice Profile'}</button>
                  </div>
                </div>
              )}

              {voiceMessage && <div className="my-account-alert info">{voiceMessage}</div>}
              {voiceError && <div className="my-account-alert error">{voiceError}</div>}
            </div>
          )}
        </div>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
}
