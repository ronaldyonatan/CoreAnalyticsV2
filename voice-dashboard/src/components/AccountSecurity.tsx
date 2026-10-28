import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const API_BASE =
  import.meta.env.VITE_VOICE_API_URL ||
  'http://127.0.0.1:5001';

interface StoredAuthenticatedUser {
  user_id?: string;
  username?: string;
  display_name?: string;
  auth_method?: 'voice' | 'password';
}

interface AccountSecurityProps {
  expanded?: boolean;
  onPasswordChanged?: () => void;
}

function readSession(): StoredAuthenticatedUser | null {
  try {
    const raw = localStorage.getItem('core_authenticated_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function LockIcon() {
  return (
    <svg
      className="h-4 w-4 flex-shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <path d="M12 14v2.5" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
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

export default function AccountSecurity({
  expanded = true,
  onPasswordChanged,
}: AccountSecurityProps) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const session = useMemo(() => (open ? readSession() : null), [open]);

  const closeModal = () => {
    if (busy) return;
    setOpen(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    setShowCurrent(false);
    setShowNew(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const username = String(session?.username || '').trim();
    if (!username) {
      setError('Session user tidak ditemukan. Silakan logout lalu login kembali.');
      return;
    }

    if (!currentPassword) {
      setError('Password saat ini wajib diisi.');
      return;
    }

    if (!newPassword) {
      setError('Password baru wajib diisi.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Konfirmasi password baru tidak sama.');
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Password gagal diubah.');
      }

      setSuccess('Password berhasil diubah. Anda akan diminta login kembali.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      window.setTimeout(() => {
        try {
          localStorage.removeItem('core_authenticated_user');
        } catch {
          // Continue to the login screen even if localStorage is unavailable.
        }
        setOpen(false);
        onPasswordChanged?.();
      }, 900);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Password gagal diubah.'
      );
    } finally {
      setBusy(false);
    }
  };

  const modal = open && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[10000] grid place-items-center bg-[#00050a]/75 p-4 font-mono text-slate-200 backdrop-blur-md">
          <button
            type="button"
            aria-label="Close change password"
            className="absolute inset-0 cursor-default"
            onClick={closeModal}
          />

          <div className="relative z-10 w-full max-w-[520px] overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#020b17]/98 shadow-[0_26px_90px_rgba(0,0,0,.72),0_0_42px_rgba(34,211,238,.10)]">
            <div className="flex items-center justify-between border-b border-cyan-400/15 bg-[#041321]/75 px-5 py-4">
              <div>
                <div className="text-[10px] font-black tracking-[0.20em] text-cyan-300 uppercase">
                  Account Security
                </div>
                <div className="mt-1 text-base font-black text-cyan-50">
                  Change Password
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {session?.display_name || session?.username || 'Authenticated user'}
                  {session?.username ? ` · @${session.username}` : ''}
                </div>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={closeModal}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600/25 text-slate-500 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-40"
              >
                ×
              </button>
            </div>

            <form onSubmit={submit} className="p-5">
              <div className="rounded-xl border border-sky-500/15 bg-[#061322]/45 px-3 py-2.5 text-[10px] leading-relaxed text-slate-500">
                Password baru minimal 8 karakter dan harus memiliki huruf besar, huruf kecil, angka, serta karakter khusus. Password saat ini selalu diverifikasi ulang oleh backend.
              </div>

              <label className="mt-4 block">
                <span className="text-[9px] font-black tracking-[0.14em] text-slate-500 uppercase">
                  Current Password
                </span>
                <div className="relative mt-1.5">
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    disabled={busy}
                    autoComplete="current-password"
                    className="h-11 w-full rounded-lg border border-cyan-400/20 bg-[#010916]/90 px-3 pr-11 text-[12px] text-cyan-50 outline-none transition focus:border-cyan-300/50 focus:shadow-[0_0_16px_rgba(34,211,238,.07)] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-600 transition hover:text-cyan-300"
                    aria-label="Toggle current password visibility"
                  >
                    <EyeIcon open={showCurrent} />
                  </button>
                </div>
              </label>

              <label className="mt-3 block">
                <span className="text-[9px] font-black tracking-[0.14em] text-slate-500 uppercase">
                  New Password
                </span>
                <div className="relative mt-1.5">
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    disabled={busy}
                    autoComplete="new-password"
                    className="h-11 w-full rounded-lg border border-cyan-400/20 bg-[#010916]/90 px-3 pr-11 text-[12px] text-cyan-50 outline-none transition focus:border-cyan-300/50 focus:shadow-[0_0_16px_rgba(34,211,238,.07)] disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((value) => !value)}
                    className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-600 transition hover:text-cyan-300"
                    aria-label="Toggle new password visibility"
                  >
                    <EyeIcon open={showNew} />
                  </button>
                </div>
              </label>

              <label className="mt-3 block">
                <span className="text-[9px] font-black tracking-[0.14em] text-slate-500 uppercase">
                  Confirm New Password
                </span>
                <input
                  type={showNew ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={busy}
                  autoComplete="new-password"
                  className="mt-1.5 h-11 w-full rounded-lg border border-cyan-400/20 bg-[#010916]/90 px-3 text-[12px] text-cyan-50 outline-none transition focus:border-cyan-300/50 focus:shadow-[0_0_16px_rgba(34,211,238,.07)] disabled:opacity-50"
                />
              </label>

              {error && (
                <div className="mt-4 rounded-lg border border-rose-400/25 bg-rose-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-rose-200">
                  {error}
                </div>
              )}

              {success && (
                <div className="mt-4 rounded-lg border border-emerald-400/25 bg-emerald-950/20 px-3 py-2.5 text-[11px] leading-relaxed text-emerald-200">
                  ✓ {success}
                </div>
              )}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={closeModal}
                  className="rounded-lg border border-slate-600/20 bg-slate-900/20 px-4 py-2.5 text-[10px] font-black tracking-[0.12em] text-slate-400 uppercase transition hover:text-slate-200 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || Boolean(success)}
                  className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 py-2.5 text-[10px] font-black tracking-[0.12em] text-cyan-100 uppercase transition hover:border-cyan-200/55 hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {busy ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Change Password"
        className="flex w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-cyan-500/25 bg-cyan-950/14 p-2 font-bold whitespace-nowrap text-cyan-300/85 shadow-[0_0_8px_rgba(34,211,238,.06)] transition-all hover:bg-cyan-500/12 hover:text-cyan-100"
      >
        <LockIcon />
        {expanded && (
          <span className="text-[9px] tracking-wider uppercase">
            CHANGE PASSWORD
          </span>
        )}
      </button>
      {modal}
    </>
  );
}
