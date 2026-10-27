import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import UserVoiceRegistration from './UserVoiceRegistration';

const API_BASE =
  import.meta.env.VITE_VOICE_API_URL ||
  'http://127.0.0.1:5001';

type UserStatusFilter =
  | 'all'
  | 'active'
  | 'inactive';

type ManagementView =
  | 'directory'
  | 'register';

interface UserSummary {
  total_users: number;
  active_users: number;
  inactive_users: number;
  voice_enrolled: number;
}

interface ManagedUser {
  user_id: string;
  username: string;
  display_name: string;
  email?: string | null;
  is_active: boolean;
  is_locked: boolean;
  failed_login_count: number;
  locked_at?: string | null;
  lock_reason?: string | null;
  last_failed_login_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;

  voice_enrolled: boolean;
  voice_profile_id?: string | null;
  voice_sample_count?: number | null;
  voice_threshold?: number | null;
  voice_model_name?: string | null;
  voice_model_version?: string | null;
}

interface UserListResponse {
  success: boolean;
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  summary: UserSummary;
  items: ManagedUser[];
  message?: string;
}

interface UserGroupAccess {
  group_id: string;
  group_code?: string | null;
  group_name: string;
  description?: string | null;
  is_active: boolean;
  is_assigned: boolean;
}

interface EffectiveAccessMenu {
  menu_id: string;
  menu_code?: string | null;
  menu_name: string;
  parent_menu_id?: string | null;
  parent_menu_code?: string | null;
  parent_menu_name?: string | null;
  route_key?: string | null;
  icon_key?: string | null;
  sort_order?: number | null;
}

interface UserManagementProps {
  selectedHealthcareId?: string;
  healthcareList?: unknown[];
}

const EMPTY_SUMMARY: UserSummary = {
  total_users: 0,
  active_users: 0,
  inactive_users: 0,
  voice_enrolled: 0,
};

function SearchIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c.7-4.2 3.3-6.5 7.5-6.5s6.8 2.3 7.5 6.5" />
    </svg>
  );
}

function VoiceIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <path d="M5 10v4M9 7v10M13 4v16M17 7v10M21 10v4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M20 6v5h-5" />
      <path d="M4.8 9A8 8 0 0 1 19.5 7M4 18v-5h5" />
      <path d="M19.2 15A8 8 0 0 1 4.5 17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function initials(
  displayName?: string,
  username?: string
) {
  const source =
    (displayName || username || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (source.length >= 2) {
    return (
      source[0][0] +
      source[source.length - 1][0]
    ).toUpperCase();
  }

  return (source[0]?.slice(0, 2) || '?')
    .toUpperCase();
}

function formatDate(
  value?: string | null
) {
  if (!value) return '—';

  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    'id-ID',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  ).format(date);
}

function MetricCard({
  label,
  value,
  accent,
  subtitle,
}: {
  label: string;
  value: number;
  accent:
    | 'cyan'
    | 'emerald'
    | 'rose'
    | 'amber';
  subtitle: string;
}) {
  const accents = {
    cyan: {
      ring: 'border-cyan-400/25',
      glow:
        'shadow-[0_0_28px_rgba(34,211,238,.055)]',
      dot: 'bg-cyan-300',
      value: 'text-cyan-100',
    },
    emerald: {
      ring: 'border-emerald-400/22',
      glow:
        'shadow-[0_0_28px_rgba(52,211,153,.05)]',
      dot: 'bg-emerald-300',
      value: 'text-emerald-100',
    },
    rose: {
      ring: 'border-rose-400/20',
      glow:
        'shadow-[0_0_28px_rgba(251,113,133,.04)]',
      dot: 'bg-rose-300',
      value: 'text-rose-100',
    },
    amber: {
      ring: 'border-amber-400/20',
      glow:
        'shadow-[0_0_28px_rgba(251,191,36,.04)]',
      dot: 'bg-amber-300',
      value: 'text-amber-100',
    },
  };

  const style =
    accents[accent];

  return (
    <div
      className={`
        relative
        overflow-hidden
        rounded-xl
        border
        bg-[#04101f]/55
        px-4
        py-3.5
        backdrop-blur-md
        ${style.ring}
        ${style.glow}
      `}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black tracking-[0.18em] text-slate-500 uppercase">
            {label}
          </div>

          <div
            className={`
              mt-1.5
              text-2xl
              font-black
              tracking-tight
              ${style.value}
            `}
          >
            {value}
          </div>

          <div className="mt-1 text-[10px] tracking-[0.10em] text-slate-500 uppercase">
            {subtitle}
          </div>
        </div>

        <span
          className={`
            mt-1
            h-2
            w-2
            rounded-full
            ${style.dot}
            shadow-[0_0_12px_currentColor]
          `}
        />
      </div>
    </div>
  );
}

function StatusBadge({
  active,
}: {
  active: boolean;
}) {
  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        rounded-full
        border
        px-2.5
        py-1
        text-[10px]
        font-black
        tracking-[0.14em]
        uppercase
        ${
          active
            ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300'
            : 'border-rose-400/20 bg-rose-950/20 text-rose-300/85'
        }
      `}
    >
      <span
        className={`
          h-1.5
          w-1.5
          rounded-full
          ${
            active
              ? 'bg-emerald-300 shadow-[0_0_7px_rgba(52,211,153,.85)]'
              : 'bg-rose-300/80'
          }
        `}
      />

      {active
        ? 'Active'
        : 'Inactive'}
    </span>
  );
}

function LockBadge({
  locked,
  attempts,
}: {
  locked: boolean;
  attempts?: number;
}) {
  if (!locked && !attempts) {
    return null;
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border
        px-2.5 py-1 text-[10px] font-black tracking-[0.12em] uppercase
        ${locked
          ? 'border-amber-400/30 bg-amber-950/25 text-amber-200'
          : 'border-slate-600/20 bg-slate-900/25 text-slate-500'}
      `}
    >
      {locked
        ? `Locked · ${attempts ?? 3}/3`
        : `Failed · ${attempts ?? 0}/3`}
    </span>
  );
}

function VoiceBadge({
  enrolled,
}: {
  enrolled: boolean;
}) {
  return (
    <span
      className={`
        inline-flex
        items-center
        gap-1.5
        rounded-full
        border
        px-2.5
        py-1
        text-[10px]
        font-black
        tracking-[0.12em]
        uppercase
        ${
          enrolled
            ? 'border-cyan-400/25 bg-cyan-950/20 text-cyan-200'
            : 'border-slate-600/25 bg-slate-900/25 text-slate-500'
        }
      `}
    >
      <VoiceIcon />

      {enrolled
        ? 'Enrolled'
        : 'No Voice'}
    </span>
  );
}

export default function UserManagement(
  _props: UserManagementProps
) {
  const [view, setView] =
    useState<ManagementView>(
      'directory'
    );

  const [items, setItems] =
    useState<ManagedUser[]>([]);

  const [summary, setSummary] =
    useState<UserSummary>(
      EMPTY_SUMMARY
    );

  const [page, setPage] =
    useState(1);

  const [pageSize, setPageSize] =
    useState(20);

  const [
    totalItems,
    setTotalItems,
  ] = useState(0);

  const [
    totalPages,
    setTotalPages,
  ] = useState(0);

  const [searchInput, setSearchInput] =
    useState('');

  const [search, setSearch] =
    useState('');

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<UserStatusFilter>(
      'all'
    );

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState('');

  const [
    selectedUser,
    setSelectedUser,
  ] =
    useState<ManagedUser | null>(
      null
    );

  const [
    actionMenuId,
    setActionMenuId,
  ] =
    useState<string | null>(
      null
    );

  const [
    statusTarget,
    setStatusTarget,
  ] =
    useState<ManagedUser | null>(
      null
    );

  const [
    statusBusy,
    setStatusBusy,
  ] =
    useState(false);

  const [
    unlockBusy,
    setUnlockBusy,
  ] = useState(false);

  const [
    groupAccess,
    setGroupAccess,
  ] = useState<UserGroupAccess[]>([]);

  const [
    effectiveMenus,
    setEffectiveMenus,
  ] = useState<EffectiveAccessMenu[]>([]);

  const [groupLoading, setGroupLoading] =
    useState(false);
  const [groupSaving, setGroupSaving] =
    useState(false);
  const [groupDirty, setGroupDirty] =
    useState(false);
  const [groupError, setGroupError] =
    useState('');

  const [
    toast,
    setToast,
  ] =
    useState('');

  const requestIdRef =
    useRef(0);

  const loadUsers =
    useCallback(
      async (
        options?: {
          forcePage?: number;
        }
      ) => {
        if (
          view !==
          'directory'
        ) {
          return;
        }

        const requestId =
          ++requestIdRef.current;

        setLoading(true);
        setError('');

        try {
          const params =
            new URLSearchParams({
              page: String(
                options?.forcePage ??
                  page
              ),
              page_size:
                String(
                  pageSize
                ),
              status:
                statusFilter,
            });

          if (search) {
            params.set(
              'search',
              search
            );
          }

          const response =
            await fetch(
              `${API_BASE}/api/management/users?${params.toString()}`
            );

          const result:
            UserListResponse =
            await response.json();

          if (
            !response.ok ||
            !result.success
          ) {
            throw new Error(
              result.message ||
                'Gagal mengambil user directory.'
            );
          }

          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setItems(
            result.items || []
          );

          setSummary(
            result.summary ||
              EMPTY_SUMMARY
          );

          setPage(
            result.page || 1
          );

          setTotalItems(
            result.total_items ||
              0
          );

          setTotalPages(
            result.total_pages ||
              0
          );
        } catch (err) {
          if (
            requestId !==
            requestIdRef.current
          ) {
            return;
          }

          setError(
            err instanceof Error
              ? err.message
              : 'Gagal mengambil user directory.'
          );
        } finally {
          if (
            requestId ===
            requestIdRef.current
          ) {
            setLoading(
              false
            );
          }
        }
      },
      [
        page,
        pageSize,
        search,
        statusFilter,
        view,
      ]
    );

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          setPage(1);
          setSearch(
            searchInput.trim()
          );
        },
        350
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [searchInput]);

  useEffect(() => {
    if (
      view ===
      'directory'
    ) {
      loadUsers();
    }
  }, [
    view,
    page,
    pageSize,
    search,
    statusFilter,
    loadUsers,
  ]);

  useEffect(() => {
    if (!toast) return;

    const timer =
      window.setTimeout(
        () => {
          setToast('');
        },
        3200
      );

    return () =>
      window.clearTimeout(
        timer
      );
  }, [toast]);

  useEffect(() => {
    const close =
      () => {
        setActionMenuId(
          null
        );
      };

    if (actionMenuId) {
      window.addEventListener(
        'click',
        close
      );
    }

    return () => {
      window.removeEventListener(
        'click',
        close
      );
    };
  }, [actionMenuId]);

  const loadUserAccess = useCallback(
    async (userId: string) => {
      setGroupLoading(true);
      setGroupError('');
      setGroupDirty(false);

      try {
        const [groupResponse, accessResponse] =
          await Promise.all([
            fetch(
              `${API_BASE}/api/management/users/${userId}/groups`
            ),
            fetch(
              `${API_BASE}/api/management/users/${userId}/access`
            ),
          ]);

        const groupResult = await groupResponse.json();
        const accessResult = await accessResponse.json();

        if (!groupResponse.ok || !groupResult.success) {
          throw new Error(
            groupResult.message ||
              'Gagal mengambil group access user.'
          );
        }

        if (!accessResponse.ok || !accessResult.success) {
          throw new Error(
            accessResult.message ||
              'Gagal mengambil effective menu access.'
          );
        }

        setGroupAccess(
          Array.isArray(groupResult.items)
            ? groupResult.items
            : []
        );

        setEffectiveMenus(
          Array.isArray(accessResult.access?.menus)
            ? accessResult.access.menus
            : []
        );
      } catch (err) {
        setGroupAccess([]);
        setEffectiveMenus([]);
        setGroupError(
          err instanceof Error
            ? err.message
            : 'Gagal mengambil group access user.'
        );
      } finally {
        setGroupLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!selectedUser) {
      setGroupAccess([]);
      setEffectiveMenus([]);
      setGroupError('');
      setGroupDirty(false);
      return;
    }

    loadUserAccess(selectedUser.user_id);
  }, [selectedUser?.user_id, loadUserAccess]);

  const toggleUserGroup = (groupId: string) => {
    setGroupAccess((prev) =>
      prev.map((group) => {
        if (group.group_id !== groupId) {
          return group;
        }

        if (!group.is_active && !group.is_assigned) {
          return group;
        }

        return {
          ...group,
          is_assigned: !group.is_assigned,
        };
      })
    );
    setGroupDirty(true);
  };

  const saveUserGroupAccess = async () => {
    if (!selectedUser || groupSaving) {
      return;
    }

    setGroupSaving(true);
    setGroupError('');

    try {
      const groupIds = groupAccess
        .filter(
          (group) => group.is_assigned && group.is_active
        )
        .map((group) => group.group_id);

      const response = await fetch(
        `${API_BASE}/api/management/users/${selectedUser.user_id}/groups`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            group_ids: groupIds,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            'Gagal menyimpan group access user.'
        );
      }

      setToast(
        `Group access ${selectedUser.display_name} berhasil disimpan.`
      );
      setGroupDirty(false);
      await loadUserAccess(selectedUser.user_id);
      await loadUsers();
    } catch (err) {
      setGroupError(
        err instanceof Error
          ? err.message
          : 'Gagal menyimpan group access user.'
      );
    } finally {
      setGroupSaving(false);
    }
  };

  const statusLabel =
    useMemo(() => {
      if (
        statusFilter ===
        'active'
      ) {
        return 'Active users';
      }

      if (
        statusFilter ===
        'inactive'
      ) {
        return 'Inactive users';
      }

      return 'All users';
    }, [statusFilter]);

  const openRegistration =
    () => {
      setActionMenuId(null);
      setSelectedUser(null);
      setView('register');
    };

  const returnDirectory =
    () => {
      setView('directory');
      setPage(1);
      setSearchInput('');
      setSearch('');
      setStatusFilter(
        'all'
      );

      window.setTimeout(
        () => {
          loadUsers({
            forcePage: 1,
          });
        },
        0
      );
    };

  const changeStatus =
    async () => {
      if (!statusTarget) {
        return;
      }

      setStatusBusy(true);

      const nextStatus =
        !statusTarget.is_active;

      try {
        const response =
          await fetch(
            `${API_BASE}/api/management/users/${statusTarget.user_id}/status`,
            {
              method: 'PATCH',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body: JSON.stringify({
                is_active:
                  nextStatus,
              }),
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result.success
        ) {
          throw new Error(
            result.message ||
              'Gagal mengubah status user.'
          );
        }

        setToast(
          nextStatus
            ? `${statusTarget.display_name} berhasil diaktifkan.`
            : `${statusTarget.display_name} berhasil dinonaktifkan.`
        );

        setStatusTarget(
          null
        );

        if (
          selectedUser?.user_id ===
          statusTarget.user_id
        ) {
          setSelectedUser(
            (prev) =>
              prev
                ? {
                    ...prev,
                    is_active:
                      nextStatus,
                  }
                : prev
          );
        }

        await loadUsers();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal mengubah status user.'
        );
      } finally {
        setStatusBusy(
          false
        );
      }
    };

  const unlockUser =
    async (target: ManagedUser) => {
      if (!target.is_locked || unlockBusy) {
        return;
      }

      const confirmed = window.confirm(
        `Unlock account ${target.display_name}? Failed login counter akan di-reset ke 0.`
      );

      if (!confirmed) {
        return;
      }

      setUnlockBusy(true);
      setError('');

      try {
        const response = await fetch(
          `${API_BASE}/api/management/users/${target.user_id}/unlock`,
          { method: 'POST' }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || 'Gagal unlock account.'
          );
        }

        setToast(
          `${target.display_name} berhasil di-unlock.`
        );

        if (
          selectedUser?.user_id === target.user_id
        ) {
          setSelectedUser((prev) =>
            prev
              ? {
                  ...prev,
                  is_locked: false,
                  failed_login_count: 0,
                  locked_at: null,
                  lock_reason: null,
                  last_failed_login_at: null,
                }
              : prev
          );
        }

        setActionMenuId(null);
        await loadUsers();
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Gagal unlock account.'
        );
      } finally {
        setUnlockBusy(false);
      }
    };

  if (
    view ===
    'register'
  ) {
    return (
      <div className="h-full min-h-0 w-full overflow-y-auto">
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-cyan-400/15 bg-[#010817]/88 px-3 py-2 backdrop-blur-xl sm:px-4">
          <button
            type="button"
            onClick={
              returnDirectory
            }
            className="inline-flex items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-950/15 px-3 py-2 text-[11px] font-black tracking-[0.14em] text-cyan-200 uppercase transition hover:border-cyan-300/45 hover:bg-cyan-950/30"
          >
            ← User Directory
          </button>

          <div className="text-right">
            <div className="text-[10px] font-black tracking-[0.18em] text-cyan-200 uppercase">
              Registration Mode
            </div>
            <div className="mt-0.5 text-[9px] tracking-[0.10em] text-slate-500 uppercase">
              Account + Voice Enrollment
            </div>
          </div>
        </div>

        <UserVoiceRegistration />
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden text-slate-200">
      <div
        className="
          absolute
          inset-0
          pointer-events-none
          bg-[radial-gradient(circle_at_18%_0%,rgba(0,207,255,.07),transparent_30%),radial-gradient(circle_at_90%_20%,rgba(52,211,153,.035),transparent_26%)]
        "
      />

      <div className="relative flex h-full min-h-0 flex-col">
        {/* HEADER */}
        <div className="flex flex-shrink-0 flex-col gap-3 border-b border-cyan-400/15 bg-[#020b18]/48 px-3 py-3 backdrop-blur-md sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[10px] font-black tracking-[0.22em] text-cyan-400 uppercase">
              CoreAnalytics · Management Center
            </div>

            <div className="mt-1 flex items-center gap-2">
              <h1 className="truncate text-lg font-black tracking-tight text-cyan-50 sm:text-xl">
                User Directory
              </h1>

              <span className="hidden rounded border border-cyan-400/20 bg-cyan-950/20 px-2 py-0.5 text-[9px] font-black tracking-[0.16em] text-cyan-300 uppercase sm:inline-flex">
                Identity Control
              </span>
            </div>

            <p className="mt-1 text-[11px] tracking-[0.07em] text-slate-500">
              Manage account lifecycle and biometric voice identity.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                loadUsers()
              }
              disabled={loading}
              title="Refresh user directory"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600/25 bg-[#071525]/65 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-40"
            >
              <span
                className={
                  loading
                    ? 'animate-spin'
                    : ''
                }
              >
                <RefreshIcon />
              </span>
            </button>

            <button
              type="button"
              onClick={
                openRegistration
              }
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3.5 text-[11px] font-black tracking-[0.14em] text-cyan-100 uppercase shadow-[0_0_20px_rgba(34,211,238,.07)] transition hover:border-cyan-200/60 hover:bg-cyan-500/15"
            >
              <span className="text-base leading-none">
                +
              </span>
              Register User
            </button>
          </div>
        </div>

        {/* SCROLL CONTENT */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {/* METRICS */}
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <MetricCard
              label="Total Users"
              value={
                summary.total_users
              }
              accent="cyan"
              subtitle="All accounts"
            />

            <MetricCard
              label="Active"
              value={
                summary.active_users
              }
              accent="emerald"
              subtitle="Login enabled"
            />

            <MetricCard
              label="Inactive"
              value={
                summary.inactive_users
              }
              accent="rose"
              subtitle="Access disabled"
            />

            <MetricCard
              label="Voice Enrolled"
              value={
                summary.voice_enrolled
              }
              accent="amber"
              subtitle="Biometric profiles"
            />
          </div>

          {/* TOOLBAR */}
          <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-sky-500/15 bg-[#04101f]/48 p-2.5 backdrop-blur-md lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                <SearchIcon />
              </div>

              <input
                value={
                  searchInput
                }
                onChange={(e) =>
                  setSearchInput(
                    e.target.value
                  )
                }
                placeholder="Search display name or username..."
                className="h-10 w-full rounded-lg border border-sky-500/18 bg-[#020b17]/75 pl-10 pr-3 text-[13px] text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45 focus:shadow-[0_0_16px_rgba(34,211,238,.06)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[10px] font-black tracking-[0.14em] text-slate-500 uppercase">
                Status
              </div>

              {(
                [
                  'all',
                  'active',
                  'inactive',
                ] as UserStatusFilter[]
              ).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setPage(1);
                      setStatusFilter(
                        value
                      );
                    }}
                    className={`
                      rounded-lg
                      border
                      px-3
                      py-2
                      text-[10px]
                      font-black
                      tracking-[0.12em]
                      uppercase
                      transition
                      ${
                        statusFilter ===
                        value
                          ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100'
                          : 'border-slate-600/20 bg-[#071422]/45 text-slate-500 hover:border-sky-500/25 hover:text-slate-300'
                      }
                    `}
                  >
                    {value}
                  </button>
                )
              )}
            </div>
          </div>

          {/* INFO / ERROR */}
          {error && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-950/15 px-3 py-2.5 text-[12px] text-rose-200">
              <span>
                {error}
              </span>

              <button
                type="button"
                onClick={() =>
                  setError('')
                }
                className="text-rose-300/70 hover:text-rose-100"
              >
                <CloseIcon />
              </button>
            </div>
          )}

          {/* TABLE PANEL */}
          <div className="mt-3 overflow-hidden rounded-xl border border-sky-500/15 bg-[#020b17]/52 shadow-[0_12px_40px_rgba(0,0,0,.16)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-sky-500/12 px-3 py-2.5">
              <div>
                <div className="text-[11px] font-black tracking-[0.16em] text-cyan-100 uppercase">
                  {statusLabel}
                </div>

                <div className="mt-0.5 text-[10px] tracking-[0.08em] text-slate-500">
                  {totalItems}{' '}
                  record
                  {totalItems === 1
                    ? ''
                    : 's'}
                </div>
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-[10px] font-bold tracking-[0.12em] text-cyan-400 uppercase">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                  Syncing
                </div>
              )}
            </div>

            {/* DESKTOP TABLE */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[840px] border-collapse">
                <thead>
                  <tr className="border-b border-sky-500/10 bg-[#061322]/45 text-left">
                    <th className="px-4 py-3 text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      User
                    </th>
                    <th className="px-3 py-3 text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      Username
                    </th>
                    <th className="px-3 py-3 text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      Voice Identity
                    </th>
                    <th className="px-3 py-3 text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      Status
                    </th>
                    <th className="px-3 py-3 text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      Created
                    </th>
                    <th className="w-14 px-3 py-3 text-center text-[10px] font-black tracking-[0.15em] text-slate-500 uppercase">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {!loading &&
                    items.map(
                      (user) => (
                        <tr
                          key={
                            user.user_id
                          }
                          onDoubleClick={() =>
                            setSelectedUser(
                              user
                            )
                          }
                          className="group border-b border-sky-500/[0.07] transition hover:bg-cyan-500/[0.035]"
                        >
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedUser(
                                  user
                                )
                              }
                              className="flex items-center gap-3 text-left"
                            >
                              <div
                                className={`
                                  flex
                                  h-9
                                  w-9
                                  flex-shrink-0
                                  items-center
                                  justify-center
                                  rounded-xl
                                  border
                                  text-[12px]
                                  font-black
                                  tracking-[0.05em]
                                  ${
                                    user.is_active
                                      ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-200'
                                      : 'border-slate-600/20 bg-slate-900/35 text-slate-500'
                                  }
                                `}
                              >
                                {initials(
                                  user.display_name,
                                  user.username
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="max-w-[230px] truncate text-[13px] font-bold text-slate-200 transition group-hover:text-cyan-100">
                                  {
                                    user.display_name
                                  }
                                </div>

                                <div className="mt-0.5 max-w-[230px] truncate text-[10px] text-slate-500">
                                  {
                                    user.user_id
                                  }
                                </div>
                              </div>
                            </button>
                          </td>

                          <td className="px-3 py-3">
                            <span className="rounded-md border border-slate-600/15 bg-[#081523]/45 px-2 py-1 font-mono text-[11px] text-slate-400">
                              @
                              {
                                user.username
                              }
                            </span>
                          </td>

                          <td className="px-3 py-3">
                            <VoiceBadge
                              enrolled={
                                user.voice_enrolled
                              }
                            />

                            {user.voice_enrolled &&
                              user.voice_sample_count !=
                                null && (
                                <div className="mt-1 text-[9px] tracking-[0.08em] text-slate-500">
                                  {
                                    user.voice_sample_count
                                  }{' '}
                                  samples
                                </div>
                              )}
                          </td>

                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <StatusBadge
                                active={
                                  user.is_active
                                }
                              />
                              <LockBadge
                                locked={user.is_locked}
                                attempts={user.failed_login_count}
                              />
                            </div>
                          </td>

                          <td className="px-3 py-3 text-[11px] text-slate-500">
                            {formatDate(
                              user.created_at
                            )}
                          </td>

                          <td className="relative px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={(
                                event
                              ) => {
                                event.stopPropagation();
                                setActionMenuId(
                                  (prev) =>
                                    prev ===
                                    user.user_id
                                      ? null
                                      : user.user_id
                                );
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-cyan-400/20 hover:bg-cyan-950/20 hover:text-cyan-200"
                            >
                              <MoreIcon />
                            </button>

                            {actionMenuId ===
                              user.user_id && (
                              <div
                                onClick={(
                                  event
                                ) =>
                                  event.stopPropagation()
                                }
                                className="absolute right-8 top-9 z-30 w-44 overflow-hidden rounded-xl border border-cyan-400/20 bg-[#020b17]/98 p-1.5 text-left shadow-[0_16px_45px_rgba(0,0,0,.62)] backdrop-blur-xl"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedUser(
                                      user
                                    );
                                    setActionMenuId(
                                      null
                                    );
                                  }}
                                  className="w-full rounded-lg px-3 py-2 text-left text-[11px] font-bold text-slate-300 transition hover:bg-cyan-950/25 hover:text-cyan-100"
                                >
                                  View Profile
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setStatusTarget(
                                      user
                                    );
                                    setActionMenuId(
                                      null
                                    );
                                  }}
                                  className={`
                                    mt-1
                                    w-full
                                    rounded-lg
                                    px-3
                                    py-2
                                    text-left
                                    text-[11px]
                                    font-bold
                                    transition
                                    ${
                                      user.is_active
                                        ? 'text-rose-300 hover:bg-rose-950/25'
                                        : 'text-emerald-300 hover:bg-emerald-950/25'
                                    }
                                  `}
                                >
                                  {user.is_active
                                    ? 'Deactivate User'
                                    : 'Activate User'}
                                </button>

                                {user.is_locked && (
                                  <button
                                    type="button"
                                    disabled={unlockBusy}
                                    onClick={() =>
                                      unlockUser(user)
                                    }
                                    className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[11px] font-bold text-amber-200 transition hover:bg-amber-950/25 disabled:opacity-40"
                                  >
                                    Unlock Account
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    )}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="divide-y divide-sky-500/[0.07] md:hidden">
              {!loading &&
                items.map(
                  (user) => (
                    <div
                      key={
                        user.user_id
                      }
                      className="p-3"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`
                            flex
                            h-10
                            w-10
                            flex-shrink-0
                            items-center
                            justify-center
                            rounded-xl
                            border
                            text-[12px]
                            font-black
                            ${
                              user.is_active
                                ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-200'
                                : 'border-slate-600/20 bg-slate-900/35 text-slate-500'
                            }
                          `}
                        >
                          {initials(
                            user.display_name,
                            user.username
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-bold text-slate-200">
                            {
                              user.display_name
                            }
                          </div>

                          <div className="mt-0.5 truncate text-[11px] text-slate-500">
                            @
                            {
                              user.username
                            }
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1">
                          <StatusBadge
                            active={
                              user.is_active
                            }
                          />
                          <LockBadge
                            locked={user.is_locked}
                            attempts={user.failed_login_count}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <VoiceBadge
                          enrolled={
                            user.voice_enrolled
                          }
                        />

                        {user.voice_sample_count !=
                          null &&
                          user.voice_enrolled && (
                            <span className="text-[10px] text-slate-500">
                              {
                                user.voice_sample_count
                              }{' '}
                              samples
                            </span>
                          )}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedUser(
                              user
                            )
                          }
                          className="flex-1 rounded-lg border border-cyan-400/20 bg-cyan-950/15 px-3 py-2 text-[10px] font-black tracking-[0.10em] text-cyan-200 uppercase"
                        >
                          View
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setStatusTarget(
                              user
                            )
                          }
                          className={`
                            flex-1
                            rounded-lg
                            border
                            px-3
                            py-2
                            text-[10px]
                            font-black
                            tracking-[0.10em]
                            uppercase
                            ${
                              user.is_active
                                ? 'border-rose-400/20 bg-rose-950/15 text-rose-300'
                                : 'border-emerald-400/20 bg-emerald-950/15 text-emerald-300'
                            }
                          `}
                        >
                          {user.is_active
                            ? 'Deactivate'
                            : 'Activate'}
                        </button>
                      </div>
                    </div>
                  )
                )}
            </div>

            {/* LOADING */}
            {loading && (
              <div className="grid min-h-[260px] place-items-center">
                <div className="text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-cyan-400/15 border-t-cyan-300" />
                  <div className="mt-3 text-[10px] font-black tracking-[0.18em] text-cyan-300 uppercase">
                    Loading Directory
                  </div>
                </div>
              </div>
            )}

            {/* EMPTY */}
            {!loading &&
              items.length === 0 && (
                <div className="grid min-h-[260px] place-items-center p-6 text-center">
                  <div>
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-600/20 bg-slate-900/25 text-slate-500">
                      <UserIcon />
                    </div>

                    <div className="mt-3 text-[12px] font-black tracking-[0.15em] text-slate-400 uppercase">
                      No Users Found
                    </div>

                    <div className="mt-1 text-[11px] text-slate-500">
                      Try another search or status filter.
                    </div>
                  </div>
                </div>
              )}

            {/* PAGINATION */}
            <div className="flex flex-col gap-2 border-t border-sky-500/10 bg-[#04101f]/35 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[10px] tracking-[0.08em] text-slate-500">
                <span>
                  Page{' '}
                  <strong className="text-slate-400">
                    {totalPages === 0
                      ? 0
                      : page}
                  </strong>{' '}
                  of{' '}
                  <strong className="text-slate-400">
                    {
                      totalPages
                    }
                  </strong>
                </span>

                <span className="text-slate-800">
                  ·
                </span>

                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(
                      Number(
                        e.target.value
                      )
                    );
                  }}
                  className="rounded-md border border-slate-600/20 bg-[#061322] px-2 py-1 text-[10px] text-slate-400 outline-none"
                >
                  <option value={10}>
                    10 / page
                  </option>
                  <option value={20}>
                    20 / page
                  </option>
                  <option value={50}>
                    50 / page
                  </option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={
                    loading ||
                    page <= 1
                  }
                  onClick={() =>
                    setPage(
                      (prev) =>
                        Math.max(
                          1,
                          prev - 1
                        )
                    )
                  }
                  className="rounded-lg border border-slate-600/20 bg-[#071523]/55 px-3 py-1.5 text-[10px] font-black tracking-[0.10em] text-slate-400 uppercase transition hover:border-cyan-400/25 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Previous
                </button>

                <button
                  type="button"
                  disabled={
                    loading ||
                    totalPages === 0 ||
                    page >=
                      totalPages
                  }
                  onClick={() =>
                    setPage(
                      (prev) =>
                        Math.min(
                          totalPages,
                          prev + 1
                        )
                    )
                  }
                  className="rounded-lg border border-cyan-400/20 bg-cyan-950/15 px-3 py-1.5 text-[10px] font-black tracking-[0.10em] text-cyan-200 uppercase transition hover:border-cyan-300/40 hover:bg-cyan-950/25 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* USER DETAIL DRAWER */}
      {selectedUser && (
        <div className="absolute inset-0 z-[80] flex justify-end">
          <button
            type="button"
            aria-label="Close user detail"
            className="absolute inset-0 bg-[#00050a]/55 backdrop-blur-[2px]"
            onClick={() =>
              setSelectedUser(
                null
              )
            }
          />

          <aside className="relative z-10 flex h-full w-full max-w-[420px] flex-col border-l border-cyan-400/20 bg-[#020b17]/96 shadow-[-20px_0_60px_rgba(0,0,0,.48)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-cyan-400/15 px-4 py-3">
              <div>
                <div className="text-[10px] font-black tracking-[0.18em] text-cyan-400 uppercase">
                  User Profile
                </div>
                <div className="mt-0.5 text-[10px] text-slate-500">
                  Identity & authentication
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedUser(
                    null
                  )
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600/20 text-slate-500 transition hover:border-cyan-400/25 hover:text-cyan-200"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-3">
                <div
                  className={`
                    flex
                    h-14
                    w-14
                    items-center
                    justify-center
                    rounded-2xl
                    border
                    text-sm
                    font-black
                    ${
                      selectedUser.is_active
                        ? 'border-cyan-400/30 bg-cyan-950/25 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,.06)]'
                        : 'border-slate-600/25 bg-slate-900/30 text-slate-500'
                    }
                  `}
                >
                  {initials(
                    selectedUser.display_name,
                    selectedUser.username
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-black text-cyan-50">
                    {
                      selectedUser.display_name
                    }
                  </div>

                  <div className="mt-0.5 truncate text-[12px] text-slate-500">
                    @
                    {
                      selectedUser.username
                    }
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <StatusBadge
                      active={
                        selectedUser.is_active
                      }
                    />
                    <LockBadge
                      locked={selectedUser.is_locked}
                      attempts={selectedUser.failed_login_count}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-sky-500/15 bg-[#061322]/45 p-3">
                <div className="text-[10px] font-black tracking-[0.16em] text-slate-500 uppercase">
                  Account Identity
                </div>

                <dl className="mt-3 grid gap-3">
                  <div>
                    <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                      User ID
                    </dt>
                    <dd className="mt-1 break-all font-mono text-[11px] text-slate-300">
                      {
                        selectedUser.user_id
                      }
                    </dd>
                  </div>

                  <div>
                    <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                      Email
                    </dt>
                    <dd className="mt-1 break-all text-[11px] text-slate-400">
                      {selectedUser.email || '—'}
                    </dd>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                        Failed Login
                      </dt>
                      <dd className="mt-1 text-[11px] text-slate-400">
                        {selectedUser.failed_login_count || 0} / 3
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                        Locked At
                      </dt>
                      <dd className="mt-1 text-[11px] text-slate-400">
                        {formatDate(selectedUser.locked_at)}
                      </dd>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                        Created
                      </dt>
                      <dd className="mt-1 text-[11px] text-slate-400">
                        {formatDate(
                          selectedUser.created_at
                        )}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                        Last Update
                      </dt>
                      <dd className="mt-1 text-[11px] text-slate-400">
                        {formatDate(
                          selectedUser.updated_at
                        )}
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>

              <div className="mt-3 rounded-xl border border-violet-400/15 bg-violet-950/[0.08] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black tracking-[0.16em] text-violet-300 uppercase">
                      Group Access
                    </div>
                    <div className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      Menu access mengikuti gabungan seluruh active group.
                    </div>
                  </div>

                  <span className="rounded-full border border-violet-400/20 bg-violet-950/20 px-2 py-1 text-[9px] font-black tracking-[0.10em] text-violet-200 uppercase">
                    {groupAccess.filter((g) => g.is_assigned).length} Groups
                  </span>
                </div>

                {groupLoading ? (
                  <div className="mt-3 rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-3 text-[11px] text-slate-500">
                    Loading group access...
                  </div>
                ) : (
                  <>
                    {groupError && (
                      <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-950/15 px-3 py-2.5 text-[11px] leading-relaxed text-rose-300">
                        {groupError}
                      </div>
                    )}

                    <div className="mt-3 grid gap-2">
                      {groupAccess.length === 0 ? (
                        <div className="rounded-lg border border-slate-700/20 bg-slate-950/20 px-3 py-3 text-[11px] text-slate-500">
                          Belum ada group yang tersedia.
                        </div>
                      ) : (
                        groupAccess.map((group) => (
                          <label
                            key={group.group_id}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                              group.is_assigned
                                ? 'border-violet-400/30 bg-violet-950/20'
                                : 'border-slate-700/20 bg-slate-950/15'
                            } ${
                              !group.is_active && !group.is_assigned
                                ? 'cursor-not-allowed opacity-45'
                                : 'cursor-pointer hover:border-violet-400/25'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={group.is_assigned}
                              disabled={
                                !group.is_active &&
                                !group.is_assigned
                              }
                              onChange={() =>
                                toggleUserGroup(group.group_id)
                              }
                              className="mt-0.5 h-4 w-4 accent-violet-400"
                            />

                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2">
                                <span className="truncate text-[11px] font-bold text-slate-200">
                                  {group.group_name}
                                </span>
                                <span
                                  className={`shrink-0 text-[8px] font-black tracking-[0.10em] uppercase ${
                                    group.is_active
                                      ? 'text-emerald-300'
                                      : 'text-slate-600'
                                  }`}
                                >
                                  {group.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </span>
                              <span className="mt-0.5 block font-mono text-[9px] text-slate-600">
                                {group.group_code || group.group_id}
                              </span>
                            </span>
                          </label>
                        ))
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!groupDirty || groupSaving}
                      onClick={saveUserGroupAccess}
                      className="mt-3 w-full rounded-lg border border-violet-400/25 bg-violet-950/20 px-3 py-2.5 text-[10px] font-black tracking-[0.12em] text-violet-200 uppercase transition hover:bg-violet-950/35 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      {groupSaving
                        ? 'Saving Group Access...'
                        : groupDirty
                          ? 'Save Group Access'
                          : 'Group Access Saved'}
                    </button>

                    <div className="mt-4 border-t border-violet-400/10 pt-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[9px] font-black tracking-[0.14em] text-slate-500 uppercase">
                          Effective Menu Access
                        </div>
                        <div className="text-[9px] font-bold text-cyan-300">
                          {effectiveMenus.length} menus
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {effectiveMenus.length === 0 ? (
                          <span className="text-[10px] text-slate-600">
                            User belum memiliki menu access dari active group.
                          </span>
                        ) : (
                          effectiveMenus.map((menu) => (
                            <span
                              key={menu.menu_id}
                              title={menu.route_key || menu.menu_code || ''}
                              className="rounded-md border border-cyan-400/15 bg-cyan-950/15 px-2 py-1 text-[9px] font-bold text-cyan-100/80"
                            >
                              {menu.menu_name}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-950/[0.08] p-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-black tracking-[0.16em] text-cyan-400 uppercase">
                    Voice Identity
                  </div>

                  <VoiceBadge
                    enrolled={
                      selectedUser.voice_enrolled
                    }
                  />
                </div>

                {selectedUser.voice_enrolled ? (
                  <dl className="mt-3 grid gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                          Samples
                        </dt>
                        <dd className="mt-1 text-[13px] font-bold text-cyan-100">
                          {
                            selectedUser.voice_sample_count ??
                            '—'
                          }
                        </dd>
                      </div>

                      <div>
                        <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                          Threshold
                        </dt>
                        <dd className="mt-1 text-[13px] font-bold text-cyan-100">
                          {
                            selectedUser.voice_threshold ??
                            '—'
                          }
                        </dd>
                      </div>
                    </div>

                    <div>
                      <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                        Model
                      </dt>
                      <dd className="mt-1 text-[11px] text-slate-400">
                        {
                          selectedUser.voice_model_name ||
                          '—'
                        }
                        {selectedUser.voice_model_version
                          ? ` · ${selectedUser.voice_model_version}`
                          : ''}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-[9px] tracking-[0.12em] text-slate-500 uppercase">
                        Voice Profile ID
                      </dt>
                      <dd className="mt-1 break-all font-mono text-[10px] text-slate-500">
                        {
                          selectedUser.voice_profile_id ||
                          '—'
                        }
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <div className="mt-3 rounded-lg border border-amber-400/15 bg-amber-950/10 px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/70">
                    User belum memiliki active biometric voice profile.
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-cyan-400/15 p-4">
              {selectedUser.is_locked && (
                <button
                  type="button"
                  disabled={unlockBusy}
                  onClick={() => unlockUser(selectedUser)}
                  className="mb-2 w-full rounded-xl border border-amber-400/30 bg-amber-950/20 px-4 py-3 text-[11px] font-black tracking-[0.14em] text-amber-200 uppercase transition hover:bg-amber-950/35 disabled:opacity-40"
                >
                  {unlockBusy ? 'Unlocking...' : 'Unlock Account'}
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  setStatusTarget(
                    selectedUser
                  )
                }
                className={`
                  w-full
                  rounded-xl
                  border
                  px-4
                  py-3
                  text-[11px]
                  font-black
                  tracking-[0.14em]
                  uppercase
                  transition
                  ${
                    selectedUser.is_active
                      ? 'border-rose-400/25 bg-rose-950/15 text-rose-300 hover:bg-rose-950/25'
                      : 'border-emerald-400/25 bg-emerald-950/15 text-emerald-300 hover:bg-emerald-950/25'
                  }
                `}
              >
                {selectedUser.is_active
                  ? 'Deactivate User'
                  : 'Activate User'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* CONFIRM STATUS MODAL */}
      {statusTarget && (
        <div className="absolute inset-0 z-[100] grid place-items-center bg-[#00050a]/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#020b17]/98 shadow-[0_24px_70px_rgba(0,0,0,.58)]">
            <div className="border-b border-cyan-400/12 px-4 py-3">
              <div className="text-[10px] font-black tracking-[0.18em] text-cyan-400 uppercase">
                Confirm Account Status
              </div>
            </div>

            <div className="p-4">
              <div className="text-sm font-bold text-slate-100">
                {statusTarget.is_active
                  ? 'Deactivate'
                  : 'Activate'}{' '}
                {statusTarget.display_name}
                ?
              </div>

              <p className="mt-2 text-[12px] leading-relaxed text-slate-500">
                {statusTarget.is_active
                  ? 'User akan kehilangan akses login. Voice profile dan history tetap disimpan.'
                  : 'User akan kembali diizinkan login. Active voice profile yang valid akan dapat dipakai lagi.'}
              </p>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={
                    statusBusy
                  }
                  onClick={() =>
                    setStatusTarget(
                      null
                    )
                  }
                  className="rounded-lg border border-slate-600/20 bg-slate-900/20 px-4 py-2 text-[11px] font-black tracking-[0.10em] text-slate-400 uppercase transition hover:text-slate-200 disabled:opacity-40"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    statusBusy
                  }
                  onClick={
                    changeStatus
                  }
                  className={`
                    rounded-lg
                    border
                    px-4
                    py-2
                    text-[11px]
                    font-black
                    tracking-[0.10em]
                    uppercase
                    transition
                    disabled:opacity-40
                    ${
                      statusTarget.is_active
                        ? 'border-rose-400/25 bg-rose-950/25 text-rose-300 hover:bg-rose-950/40'
                        : 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300 hover:bg-emerald-950/40'
                    }
                  `}
                >
                  {statusBusy
                    ? 'Processing...'
                    : statusTarget.is_active
                    ? 'Deactivate'
                    : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[120] -translate-x-1/2">
          <div className="rounded-xl border border-emerald-400/25 bg-[#031712]/95 px-4 py-2.5 text-[11px] font-bold text-emerald-200 shadow-[0_14px_45px_rgba(0,0,0,.48),0_0_18px_rgba(52,211,153,.06)] backdrop-blur-xl">
            ✓ {toast}
          </div>
        </div>
      )}
    </div>
  );
}
