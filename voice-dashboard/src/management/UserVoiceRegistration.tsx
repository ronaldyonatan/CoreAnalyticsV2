import React, {
  useMemo,
  useRef,
  useState,
} from "react";

import "./UserVoiceRegistration.css";


type RegisteredUser = {
  user_id: string;
  username: string;
  display_name: string;
  email?: string | null;
  is_active?: boolean;
};


type VoiceSample = {
  blob: Blob;
  url: string;
  durationMs: number;
};


const PHRASES = [
  "Core Analytics, buka Daily Tracking.",
  "Tampilkan dashboard Demography.",
  "Core Analytics, tampilkan revenue hari ini.",
  "Buka informasi performa layanan.",
  "Core Analytics, kembali ke dashboard utama.",
];


const API_BASE =
  import.meta.env.VITE_VOICE_API_URL
  || "http://127.0.0.1:5001";


export default function UserVoiceRegistration() {
  const [username, setUsername] =
    useState("");

  const [displayName, setDisplayName] =
    useState("");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [user, setUser] =
    useState<RegisteredUser | null>(null);

  const [samples, setSamples] =
    useState<VoiceSample[]>([]);

  const [recording, setRecording] =
    useState(false);

  const [
    recordStartedAt,
    setRecordStartedAt,
  ] = useState<number | null>(null);

  const [message, setMessage] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  const [completed, setCompleted] =
    useState(false);

  const [voiceSkipped, setVoiceSkipped] =
    useState(false);

  const recorderRef =
    useRef<MediaRecorder | null>(null);

  const chunksRef =
    useRef<BlobPart[]>([]);

  const streamRef =
    useRef<MediaStream | null>(null);


  const currentSampleNo =
    samples.length + 1;


  const currentPhrase =
    useMemo(() => {
      return PHRASES[
        Math.min(
          samples.length,
          PHRASES.length - 1
        )
      ];
    }, [samples.length]);


  const passwordPolicy =
    useMemo(() => ({
      length:
        password.length >= 8
        && password.length <= 128,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special:
        /[^A-Za-z0-9\s]/.test(password),
    }), [password]);


  const passwordIsValid =
    Object.values(passwordPolicy)
      .every(Boolean);


  async function registerUser() {
    setMessage("");

    const normalizedEmail =
      email.trim().toLowerCase();

    const emailIsValid =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(normalizedEmail);

    if (
      !username.trim()
      || !displayName.trim()
      || !normalizedEmail
      || !passwordIsValid
    ) {
      setMessage(
        "Lengkapi data dan gunakan password 8-128 karakter "
        + "yang memiliki huruf besar, huruf kecil, angka, "
        + "dan karakter khusus."
      );

      return;
    }

    if (!emailIsValid) {
      setMessage(
        "Format email tidak valid."
      );

      return;
    }

    if (password !== confirmPassword) {
      setMessage(
        "Password dan confirm password tidak sama."
      );

      return;
    }

    setBusy(true);

    try {
      const response = await fetch(
        `${API_BASE}/api/management/users/register`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            username:
              username.trim(),

            display_name:
              displayName.trim(),

            email:
              normalizedEmail,

            password,
          }),
        }
      );

      const result =
        await response.json();

      if (
        !response.ok
        || !result.success
      ) {
        throw new Error(
          result.message
          || "Registrasi user gagal."
        );
      }

      setUser(result.user);

      setMessage(
        "User berhasil dibuat. "
        + "Lanjutkan enrollment suara."
      );

    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Registrasi user gagal."
      );

    } finally {
      setBusy(false);
    }
  }


  async function startRecording() {
    setMessage("");

    if (samples.length >= 5) {
      return;
    }

    try {
      const stream =
        await navigator.mediaDevices
          .getUserMedia({
            audio: {
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });

      streamRef.current = stream;

      const preferredMimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];

      const mimeType =
        preferredMimeTypes.find(
          value =>
            MediaRecorder
              .isTypeSupported(value)
        ) || "";

      const recorder =
        mimeType
          ? new MediaRecorder(
              stream,
              { mimeType }
            )
          : new MediaRecorder(
              stream
            );

      chunksRef.current = [];

      recorder.ondataavailable =
        event => {
          if (event.data.size > 0) {
            chunksRef.current.push(
              event.data
            );
          }
        };

      recorder.onstop = () => {
        const durationMs =
          recordStartedAt
            ? Date.now()
              - recordStartedAt
            : 0;

        const blob =
          new Blob(
            chunksRef.current,
            {
              type:
                recorder.mimeType
                || "audio/webm",
            }
          );

        const url =
          URL.createObjectURL(
            blob
          );

        setSamples(previous => [
          ...previous,
          {
            blob,
            url,
            durationMs,
          },
        ]);

        stream
          .getTracks()
          .forEach(
            track =>
              track.stop()
          );

        streamRef.current = null;
        setRecordStartedAt(null);
      };

      recorderRef.current =
        recorder;

      setRecordStartedAt(
        Date.now()
      );

      recorder.start();

      setRecording(true);

      window.setTimeout(
        () => {
          if (
            recorder.state
            === "recording"
          ) {
            recorder.stop();
            setRecording(false);
          }
        },
        8000
      );

    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Microphone tidak dapat digunakan."
      );
    }
  }


  function stopRecording() {
    const recorder =
      recorderRef.current;

    if (
      recorder
      && recorder.state
        === "recording"
    ) {
      recorder.stop();
    }

    setRecording(false);
  }


  function deleteSample(
    index: number
  ) {
    if (
      recording
      || busy
    ) {
      return;
    }

    setSamples(previous => {
      const target =
        previous[index];

      if (target) {
        URL.revokeObjectURL(
          target.url
        );
      }

      return previous.filter(
        (_, sampleIndex) =>
          sampleIndex !== index
      );
    });
  }


  function skipVoiceEnrollment() {
    if (busy || recording || !user) {
      return;
    }

    const confirmed = window.confirm(
      "Lewati voice enrollment? User tetap dapat menggunakan "
      + "account dan login dengan username/password, tetapi "
      + "voice authentication belum tersedia sampai voice profile "
      + "didaftarkan kemudian."
    );

    if (!confirmed) {
      return;
    }

    samples.forEach(sample => {
      URL.revokeObjectURL(sample.url);
    });

    setSamples([]);
    setVoiceSkipped(true);
    setCompleted(true);
    setMessage(
      "Account berhasil dibuat. Voice enrollment dilewati "
      + "dan dapat dilakukan kemudian."
    );
  }


  async function enrollVoice() {
    if (!user) {
      setMessage(
        "User belum dibuat."
      );

      return;
    }

    if (samples.length !== 5) {
      setMessage(
        "Enrollment membutuhkan "
        + "tepat 5 sample suara."
      );

      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const form =
        new FormData();

      form.append(
        "user_id",
        user.user_id
      );

      samples.forEach(
        (sample, index) => {

          const extension =
            sample.blob.type
              .includes("mp4")
              ? "m4a"
              : "webm";

          form.append(
            "samples",
            sample.blob,
            `sample_${
              String(index + 1)
                .padStart(3, "0")
            }.${extension}`
          );
        }
      );

      const response =
        await fetch(
          `${API_BASE}/api/management/voice/enroll`,
          {
            method: "POST",
            body: form,
          }
        );

      const result =
        await response.json();

      if (
        !response.ok
        || !result.success
      ) {
        throw new Error(
          result.message
          || "Enrollment suara gagal."
        );
      }

      setCompleted(true);

      setMessage(
        `Voice enrollment berhasil. `
        + `${result.sample_count} sample, `
        + `embedding `
        + `${result.embedding_dimension} dimensi.`
      );

    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Enrollment suara gagal."
      );

    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="uvr-shell">
      <div className="uvr-card">

        <div className="uvr-eyebrow">
          COREANALYTICS · MANAGEMENT CENTER
        </div>

        <h1 className="uvr-title">
          User & Voice Registration
        </h1>

        <p className="uvr-subtitle">
          Buat akun user, lalu daftarkan
          5 sample suara sebagai
          biometric voice profile.
        </p>


        <div className="uvr-steps">

          <div
            className={
              `uvr-step ${
                !user
                  ? "active"
                  : "done"
              }`
            }
          >
            <span>1</span>
            Account
          </div>


          <div
            className={
              `uvr-step ${
                user && !completed
                  ? "active"
                  : voiceSkipped
                    ? "skipped"
                    : completed
                      ? "done"
                      : ""
              }`
            }
          >
            <span>2</span>
            {voiceSkipped ? "Voice Skipped" : "Voice"}
          </div>


          <div
            className={
              `uvr-step ${
                completed
                  ? "done active"
                  : ""
              }`
            }
          >
            <span>3</span>
            Complete
          </div>

        </div>


        {!user && (
          <section className="uvr-section">

            <label>
              Username

              <input
                value={username}
                onChange={
                  event =>
                    setUsername(
                      event.target.value
                    )
                }
                placeholder="ronald"
                autoComplete="off"
              />
            </label>


            <label>
              Display Name

              <input
                value={displayName}
                onChange={
                  event =>
                    setDisplayName(
                      event.target.value
                    )
                }
                placeholder="Ronald Yonatan"
              />
            </label>


            <label>
              Email Address

              <input
                type="email"
                value={email}
                onChange={
                  event =>
                    setEmail(
                      event.target.value
                    )
                }
                placeholder="ronald@jec.co.id"
                autoComplete="email"
              />
            </label>


            <label>
              Password

              <input
                type="password"
                value={password}
                onChange={
                  event =>
                    setPassword(
                      event.target.value
                    )
                }
                placeholder="8-128 karakter"
                autoComplete="new-password"
                maxLength={128}
              />

              <div className="uvr-policy">
                <span className={passwordPolicy.length ? "ok" : ""}>
                  {passwordPolicy.length ? "✓" : "○"} 8-128 karakter
                </span>
                <span className={passwordPolicy.uppercase ? "ok" : ""}>
                  {passwordPolicy.uppercase ? "✓" : "○"} Huruf besar
                </span>
                <span className={passwordPolicy.lowercase ? "ok" : ""}>
                  {passwordPolicy.lowercase ? "✓" : "○"} Huruf kecil
                </span>
                <span className={passwordPolicy.number ? "ok" : ""}>
                  {passwordPolicy.number ? "✓" : "○"} Angka
                </span>
                <span className={passwordPolicy.special ? "ok" : ""}>
                  {passwordPolicy.special ? "✓" : "○"} Karakter khusus
                </span>
              </div>
            </label>


            <label>
              Confirm Password

              <input
                type="password"
                value={confirmPassword}
                onChange={
                  event =>
                    setConfirmPassword(
                      event.target.value
                    )
                }
                placeholder="Ulangi password"
                autoComplete="new-password"
                maxLength={128}
              />
            </label>


            <button
              className="uvr-primary"
              onClick={registerUser}
              disabled={busy}
            >
              {
                busy
                  ? "Creating..."
                  : "Create User"
              }
            </button>

          </section>
        )}


        {user && !completed && (
          <section className="uvr-section">

            <div className="uvr-user">

              <div>
                <strong>
                  {user.display_name}
                </strong>

                <small>
                  @{user.username}
                </small>
              </div>

              <code>
                {user.user_id}
              </code>

            </div>


            {samples.length < 5 && (
              <div className="uvr-recorder">

                <div className="uvr-counter">
                  SAMPLE {currentSampleNo} / 5
                </div>

                <div className="uvr-phrase">
                  {currentPhrase}
                </div>


                {!recording ? (
                  <button
                    className="uvr-record"
                    onClick={startRecording}
                    disabled={busy}
                  >
                    ● Start Recording
                  </button>

                ) : (
                  <button
                    className="uvr-stop"
                    onClick={stopRecording}
                  >
                    ■ Stop Recording
                  </button>
                )}


                <small>
                  Disarankan 3–8 detik.
                  Browser akan meminta
                  izin microphone.
                </small>

              </div>
            )}


            <div className="uvr-samples">

              {samples.map(
                (sample, index) => (

                  <div
                    className="uvr-sample"
                    key={sample.url}
                  >

                    <div className="uvr-sample-index">
                      {
                        String(index + 1)
                          .padStart(2, "0")
                      }
                    </div>


                    <audio
                      controls
                      src={sample.url}
                    />


                    <span>
                      {
                        (
                          sample.durationMs
                          / 1000
                        ).toFixed(1)
                      }s
                    </span>


                    <button
                      onClick={
                        () =>
                          deleteSample(index)
                      }
                      disabled={
                        recording
                        || busy
                      }
                    >
                      Remove
                    </button>

                  </div>
                )
              )}

            </div>


            <div className="uvr-actions">
              <button
                className="uvr-primary"
                onClick={enrollVoice}
                disabled={
                  busy
                  || samples.length !== 5
                  || recording
                }
              >
                {
                  busy
                    ? "Processing Voice..."
                    : "Enroll Voice Profile"
                }
              </button>

              <button
                className="uvr-secondary"
                onClick={skipVoiceEnrollment}
                disabled={busy || recording}
              >
                Skip Voice Enrollment
              </button>
            </div>

          </section>
        )}


        {completed && user && (
          <section className="uvr-success">

            <div className="uvr-success-icon">
              ✓
            </div>

            <h2 className="uvr-success-title">
              Registration Complete
            </h2>

            <p>
              {voiceSkipped
                ? `${user.display_name} sudah memiliki account. `
                  + "Voice profile belum didaftarkan dan dapat "
                  + "dienroll kemudian."
                : `${user.display_name} sudah memiliki account `
                  + "dan active voice profile."}
            </p>

            <code>
              {user.user_id}
            </code>

          </section>
        )}


        {message && (
          <div className="uvr-message">
            {message}
          </div>
        )}

      </div>
    </div>
  );
}