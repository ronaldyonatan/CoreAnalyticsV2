import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const API_BASE =
  import.meta.env.VITE_VOICE_API_URL ||
  'http://127.0.0.1:5001';

type GroupStatusFilter = 'all' | 'active' | 'inactive';

interface GroupSummary {
  total_groups: number;
  active_groups: number;
  inactive_groups: number;
}

interface ManagedGroup {
  group_id: string;
  group_name: string;
  description?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  member_count?: number | null;
  group_code?: string;
  user_count?: number;
}


interface GroupMenuAccess {
  menu_id: string;
  menu_code: string;
  menu_name: string;
  parent_menu_id?: string | null;
  parent_menu_name?: string | null;
  route_key?: string | null;
  sort_order?: number | null;
  can_view: boolean;
}

interface GroupListResponse {
  success: boolean;
  page: number;
  page_size: number;
  total_items: number;
  total_pages: number;
  summary: GroupSummary;
  items: ManagedGroup[];
  message?: string;
}

const EMPTY_SUMMARY: GroupSummary = {
  total_groups: 0,
  active_groups: 0,
  inactive_groups: 0,
};

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function GroupIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="8" cy="9" r="3" />
      <circle cx="16.5" cy="10" r="2.5" />
      <path d="M2.5 20c.5-3.5 2.5-5.5 5.5-5.5s5 2 5.5 5.5" />
      <path d="M13.5 15c3.8-.8 6.7 1 7.5 5" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 6v5h-5" />
      <path d="M4.8 9A8 8 0 0 1 19.5 7M4 18v-5h5" />
      <path d="M19.2 15A8 8 0 0 1 4.5 17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

function formatDate(value?: string | null) {
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

function groupInitials(name?: string) {
  const parts = (name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

function MetricCard({
  label,
  value,
  accent,
  subtitle,
}: {
  label: string;
  value: number;
  accent: 'cyan' | 'emerald' | 'rose';
  subtitle: string;
}) {
  const accents = {
    cyan: {
      ring: 'border-cyan-400/25',
      glow: 'shadow-[0_0_28px_rgba(34,211,238,.055)]',
      dot: 'bg-cyan-300',
      value: 'text-cyan-100',
    },
    emerald: {
      ring: 'border-emerald-400/22',
      glow: 'shadow-[0_0_28px_rgba(52,211,153,.05)]',
      dot: 'bg-emerald-300',
      value: 'text-emerald-100',
    },
    rose: {
      ring: 'border-rose-400/20',
      glow: 'shadow-[0_0_28px_rgba(251,113,133,.04)]',
      dot: 'bg-rose-300',
      value: 'text-rose-100',
    },
  };

  const style = accents[accent];

  return (
    <div className={`relative overflow-hidden rounded-xl border bg-[#04101f]/55 px-4 py-3.5 backdrop-blur-md ${style.ring} ${style.glow}`}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[8px] font-black tracking-[0.18em] text-slate-500 uppercase">{label}</div>
          <div className={`mt-1.5 text-2xl font-black tracking-tight ${style.value}`}>{value}</div>
          <div className="mt-1 text-[8px] tracking-[0.10em] text-slate-400 uppercase">{subtitle}</div>
        </div>
        <span className={`mt-1 h-2 w-2 rounded-full ${style.dot} shadow-[0_0_12px_currentColor]`} />
      </div>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[8px] font-black tracking-[0.14em] uppercase ${
      active
        ? 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300'
        : 'border-rose-400/20 bg-rose-950/20 text-rose-300/85'
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        active ? 'bg-emerald-300 shadow-[0_0_7px_rgba(52,211,153,.85)]' : 'bg-rose-300/80'
      }`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function GroupFormModal({
  mode,
  group,
  busy,
  onClose,
  onSave,
}: {
  mode: 'create' | 'edit';
  group: ManagedGroup | null;
  busy: boolean;
  onClose: () => void;
  onSave: (groupName: string, description: string) => Promise<void>;
}) {
  const [groupName, setGroupName] = useState(group?.group_name || '');
  const [description, setDescription] = useState(group?.description || '');
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setGroupName(group?.group_name || '');
    setDescription(group?.description || '');
    setLocalError('');
  }, [group, mode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = groupName.trim();
    if (!name) {
      setLocalError('Group name wajib diisi.');
      return;
    }
    setLocalError('');
    await onSave(name, description.trim());
  };

  return (
    <div className="absolute inset-0 z-[100] grid place-items-center bg-[#00050a]/65 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-[500px] overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#020b17]/98 shadow-[0_24px_70px_rgba(0,0,0,.58)]">
        <div className="flex items-center justify-between border-b border-cyan-400/12 px-4 py-3">
          <div>
            <div className="text-[8px] font-black tracking-[0.18em] text-cyan-400 uppercase">
              {mode === 'create' ? 'Register Group' : 'Edit Group'}
            </div>
            <div className="mt-0.5 text-[8px] text-slate-400">
              {mode === 'create' ? 'Create a new access group' : 'Update group identity'}
            </div>
          </div>
          <button type="button" disabled={busy} onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600/20 text-slate-500 transition hover:border-cyan-400/25 hover:text-cyan-200 disabled:opacity-40">
            <CloseIcon />
          </button>
        </div>

        <div className="p-4">
          <label className="block">
            <span className="text-[8px] font-black tracking-[0.14em] text-slate-500 uppercase">Group Name</span>
            <input
              autoFocus
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Example: Executive Management"
              className="mt-2 h-11 w-full rounded-lg border border-sky-500/18 bg-[#061322]/65 px-3 text-[11px] text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-[8px] font-black tracking-[0.14em] text-slate-500 uppercase">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe this group's purpose..."
              rows={4}
              className="mt-2 w-full resize-none rounded-lg border border-sky-500/18 bg-[#061322]/65 px-3 py-3 text-[11px] leading-relaxed text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45"
            />
          </label>

          {localError && (
            <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-950/15 px-3 py-2 text-[9px] text-rose-200">
              {localError}
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-slate-600/20 bg-slate-900/20 px-4 py-2 text-[9px] font-black tracking-[0.10em] text-slate-400 uppercase transition hover:text-slate-200 disabled:opacity-40">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-4 py-2 text-[9px] font-black tracking-[0.10em] text-cyan-100 uppercase transition hover:border-cyan-200/60 hover:bg-cyan-500/15 disabled:opacity-40">
              {busy ? 'Saving...' : mode === 'create' ? 'Create Group' : 'Save Changes'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function GroupManagement() {
  const [items, setItems] = useState<ManagedGroup[]>([]);
  const [summary, setSummary] = useState<GroupSummary>(EMPTY_SUMMARY);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<GroupStatusFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<ManagedGroup | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<ManagedGroup | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [formTarget, setFormTarget] = useState<ManagedGroup | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [menuAccess, setMenuAccess] = useState<GroupMenuAccess[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [menuSaving, setMenuSaving] = useState(false);
  const [menuError, setMenuError] = useState('');
  const [menuDirty, setMenuDirty] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [accessSearch, setAccessSearch] = useState('');
  const [accessFilter, setAccessFilter] = useState<'all' | 'granted' | 'not_granted'>('all');
  const [accessCategory, setAccessCategory] = useState('all');
  const requestIdRef = useRef(0);

  const loadGroups = useCallback(async (options?: { forcePage?: number }) => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        page: String(options?.forcePage ?? page),
        page_size: String(pageSize),
        status: statusFilter,
      });
      if (search) params.set('search', search);

      const response = await fetch(`${API_BASE}/api/management/groups?${params.toString()}`);
      const result: GroupListResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengambil group directory.');
      }
      if (requestId !== requestIdRef.current) return;

      setItems(result.items || []);
      setSummary(result.summary || EMPTY_SUMMARY);
      setPage(result.page || 1);
      setTotalItems(result.total_items || 0);
      setTotalPages(result.total_pages || 0);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : 'Gagal mengambil group directory.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [page, pageSize, search, statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadGroups();
  }, [page, pageSize, search, statusFilter, loadGroups]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const close = () => setActionMenuId(null);
    if (actionMenuId) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [actionMenuId]);

  const statusLabel = useMemo(() => {
    if (statusFilter === 'active') return 'Active groups';
    if (statusFilter === 'inactive') return 'Inactive groups';
    return 'All groups';
  }, [statusFilter]);

  const openCreate = () => {
    setActionMenuId(null);
    setFormTarget(null);
    setFormMode('create');
  };

  const openEdit = (group: ManagedGroup) => {
    setActionMenuId(null);
    setFormTarget(group);
    setFormMode('edit');
  };

  const saveGroup = async (groupName: string, description: string) => {
    setFormBusy(true);
    setError('');

    try {
      const editing = formMode === 'edit' && formTarget;
      const response = await fetch(
        editing
          ? `${API_BASE}/api/management/groups/${formTarget.group_id}`
          : `${API_BASE}/api/management/groups`,
        {
          method: editing ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_name: groupName,
            description,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Gagal menyimpan group.');
      }

      setToast(editing ? `${groupName} berhasil diperbarui.` : `${groupName} berhasil dibuat.`);
      setFormMode(null);
      setFormTarget(null);
      setPage(1);
      await loadGroups({ forcePage: 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan group.');
    } finally {
      setFormBusy(false);
    }
  };

  const loadGroupMenuAccess = useCallback(async (groupId: string) => {
    setMenuLoading(true);
    setMenuError('');
    setMenuDirty(false);
    try {
      const response = await fetch(`${API_BASE}/api/management/groups/${groupId}/menus`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Gagal mengambil menu access group.');
      const rows = Array.isArray(result.items) ? result.items : Array.isArray(result.data) ? result.data : [];
      setMenuAccess(rows.map((x: GroupMenuAccess) => ({ ...x, can_view: Boolean(x.can_view) })));
    } catch (err) {
      setMenuAccess([]);
      setMenuError(err instanceof Error ? err.message : 'Gagal mengambil menu access group.');
    } finally { setMenuLoading(false); }
  }, []);

  useEffect(() => {
    if (!selectedGroup) { setMenuAccess([]); setMenuError(''); setMenuDirty(false); return; }
    loadGroupMenuAccess(selectedGroup.group_id);
  }, [selectedGroup?.group_id, loadGroupMenuAccess]);

  const toggleMenuAccess = (menuId: string) => {
    setMenuAccess(prev => prev.map(m => m.menu_id === menuId ? { ...m, can_view: !m.can_view } : m));
    setMenuDirty(true);
  };

  const saveMenuAccess = async () => {
    if (!selectedGroup) return;
    setMenuSaving(true); setMenuError('');
    try {
      const menuIds = menuAccess.filter(m => m.can_view && Boolean(m.route_key)).map(m => m.menu_id);
      const response = await fetch(`${API_BASE}/api/management/groups/${selectedGroup.group_id}/menus`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ menu_ids: menuIds }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Gagal menyimpan menu access group.');
      setToast(`Menu access ${selectedGroup.group_name} berhasil disimpan.`);
      setMenuDirty(false);
      await loadGroupMenuAccess(selectedGroup.group_id);
    } catch (err) { setMenuError(err instanceof Error ? err.message : 'Gagal menyimpan menu access group.'); }
    finally { setMenuSaving(false); }
  };

  const menuCategories = useMemo(() => {
    const parents = menuAccess.filter(m => !m.parent_menu_id).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
    const result = parents.map(p => ({ key:p.menu_id, name:p.menu_name, menus:menuAccess.filter(m=>m.parent_menu_id===p.menu_id && Boolean(m.route_key)).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)) }));
    const standalone = menuAccess.filter(m => !m.parent_menu_id && Boolean(m.route_key));
    if (standalone.length) result.push({key:'standalone',name:'Other',menus:standalone});
    return result.filter(x=>x.menus.length);
  }, [menuAccess]);

  const accessStats = useMemo(() => {
    const menus = menuAccess.filter(m => Boolean(m.route_key));
    return { total: menus.length, granted: menus.filter(m => m.can_view).length };
  }, [menuAccess]);

  const accessCategories = useMemo(() => menuCategories.map(category => ({
    ...category,
    total: category.menus.length,
    granted: category.menus.filter(menu => menu.can_view).length,
  })), [menuCategories]);

  const visibleAccessCategories = useMemo(() => {
    const q = accessSearch.trim().toLowerCase();
    return accessCategories
      .filter(category => accessCategory === 'all' || category.key === accessCategory)
      .map(category => ({
        ...category,
        menus: category.menus.filter(menu => {
          const found = !q || menu.menu_name.toLowerCase().includes(q) ||
            menu.menu_code.toLowerCase().includes(q) ||
            String(menu.route_key || '').toLowerCase().includes(q);
          const filtered = accessFilter === 'all' ||
            (accessFilter === 'granted' && menu.can_view) ||
            (accessFilter === 'not_granted' && !menu.can_view);
          return found && filtered;
        }),
      })).filter(category => category.menus.length > 0);
  }, [accessCategories, accessCategory, accessFilter, accessSearch]);

  const setAllMenuAccess = (value: boolean) => {
    setMenuAccess(prev => prev.map(menu => menu.route_key ? { ...menu, can_view: value } : menu));
    setMenuDirty(true);
  };

  const setCategoryMenuAccess = (categoryKey: string, value: boolean) => {
    const category = accessCategories.find(item => item.key === categoryKey);
    if (!category) return;
    const ids = new Set(category.menus.map(menu => menu.menu_id));
    setMenuAccess(prev => prev.map(menu => ids.has(menu.menu_id) ? { ...menu, can_view: value } : menu));
    setMenuDirty(true);
  };

  const changeStatus = async () => {
    if (!statusTarget) return;

    setStatusBusy(true);
    setError('');
    const nextStatus = !statusTarget.is_active;

    try {
      const response = await fetch(
        `${API_BASE}/api/management/groups/${statusTarget.group_id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: nextStatus }),
        }
      );

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Gagal mengubah status group.');
      }

      setToast(
        nextStatus
          ? `${statusTarget.group_name} berhasil diaktifkan.`
          : `${statusTarget.group_name} berhasil dinonaktifkan.`
      );

      if (selectedGroup?.group_id === statusTarget.group_id) {
        setSelectedGroup((prev) => prev ? { ...prev, is_active: nextStatus } : prev);
      }

      setStatusTarget(null);
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengubah status group.');
    } finally {
      setStatusBusy(false);
    }
  };

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden text-slate-200">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(0,207,255,.07),transparent_30%),radial-gradient(circle_at_90%_20%,rgba(52,211,153,.035),transparent_26%)]" />

      <div className="relative flex h-full min-h-0 flex-col">
        {/* HEADER */}
        <div className="flex flex-shrink-0 flex-col gap-3 border-b border-cyan-400/15 bg-[#020b18]/48 px-3 py-3 backdrop-blur-md sm:px-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="text-[8px] font-black tracking-[0.22em] text-cyan-400 uppercase">
              CoreAnalytics · Management Center
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="truncate text-lg font-black tracking-tight text-cyan-50 sm:text-xl">
                Group Directory
              </h2>
            </div>
            <p className="mt-1 text-[9px] tracking-[0.07em] text-slate-500">
              Manage access groups and prepare application permissions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadGroups()}
              disabled={loading}
              title="Refresh group directory"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600/25 bg-[#071525]/65 text-slate-400 transition hover:border-cyan-400/30 hover:text-cyan-200 disabled:opacity-40"
            >
              <span className={loading ? 'animate-spin' : ''}><RefreshIcon /></span>
            </button>

            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3.5 text-[9px] font-black tracking-[0.14em] text-cyan-100 uppercase shadow-[0_0_20px_rgba(34,211,238,.07)] transition hover:border-cyan-200/60 hover:bg-cyan-500/15"
            >
              <span className="text-base leading-none">+</span>
              Register Group
            </button>
          </div>
        </div>

        {/* SCROLL CONTENT */}
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <MetricCard label="Total Groups" value={summary.total_groups} accent="cyan" subtitle="All access groups" />
            <MetricCard label="Active" value={summary.active_groups} accent="emerald" subtitle="Available for assignment" />
            <MetricCard label="Inactive" value={summary.inactive_groups} accent="rose" subtitle="Assignment disabled" />
          </div>

          {/* TOOLBAR */}
          <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-sky-500/15 bg-[#04101f]/48 p-2.5 backdrop-blur-md lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <SearchIcon />
              </div>
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search group name or description..."
                className="h-10 w-full rounded-lg border border-sky-500/18 bg-[#020b17]/75 pl-10 pr-3 text-[11px] text-cyan-50 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/45 focus:shadow-[0_0_16px_rgba(34,211,238,.06)]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[8px] font-black tracking-[0.14em] text-slate-400 uppercase">Status</div>
              {(['all', 'active', 'inactive'] as GroupStatusFilter[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setPage(1);
                    setStatusFilter(value);
                  }}
                  className={`rounded-lg border px-3 py-2 text-[8px] font-black tracking-[0.12em] uppercase transition ${
                    statusFilter === value
                      ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100'
                      : 'border-slate-600/20 bg-[#071422]/45 text-slate-500 hover:border-sky-500/25 hover:text-slate-300'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-950/15 px-3 py-2.5 text-[10px] text-rose-200">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} className="text-rose-300/70 hover:text-rose-100">
                <CloseIcon />
              </button>
            </div>
          )}

          {/* TABLE PANEL */}
          <div className="mt-3 overflow-hidden rounded-xl border border-sky-500/15 bg-[#020b17]/52 shadow-[0_12px_40px_rgba(0,0,0,.16)] backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-sky-500/12 px-3 py-2">
              <div>
                <div className="text-[9px] font-black tracking-[0.16em] text-cyan-100 uppercase">{statusLabel}</div>
                <div className="mt-0.5 text-[8px] tracking-[0.08em] text-slate-400">
                  {totalItems} record{totalItems === 1 ? '' : 's'}
                </div>
              </div>
              {loading && (
                <div className="flex items-center gap-2 text-[8px] font-bold tracking-[0.12em] text-cyan-400 uppercase">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
                  Syncing
                </div>
              )}
            </div>

            {/* DESKTOP TABLE */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[900px] table-fixed border-collapse" style={{ tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '31%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '4%' }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-sky-500/10 bg-[#061322]/45 text-left">
                    <th className="px-4 py-2 text-[8px] font-black tracking-[0.15em] text-slate-400 uppercase">Group</th>
                    <th className="px-4 py-2 text-[8px] font-black tracking-[0.15em] text-slate-400 uppercase">Description</th>
                    <th className="px-4 py-2 text-[8px] font-black tracking-[0.15em] text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-2 text-[8px] font-black tracking-[0.15em] text-slate-400 uppercase">Created</th>
                    <th className="px-2 py-2 text-center text-[8px] font-black tracking-[0.15em] text-slate-400 uppercase">Action</th>
                  </tr>
                </thead>

                <tbody>
                  {!loading && items.map((group) => (
                    <tr
                      key={group.group_id}
                      onDoubleClick={() => setSelectedGroup(group)}
                      className="group h-[50px] border-b border-sky-500/[0.07] transition hover:bg-cyan-500/[0.035]"
                    >
                      <td className="h-[50px] px-4 py-0 align-middle">
                        <button
                          type="button"
                          onClick={() => setSelectedGroup(group)}
                          className="flex w-full min-w-0 items-center gap-2.5 text-left"
                        >
                          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border text-[10px] font-black tracking-[0.05em] ${
                            group.is_active
                              ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-200'
                              : 'border-slate-600/20 bg-slate-900/35 text-slate-500'
                          }`}>
                            {groupInitials(group.group_name)}
                          </div>
                          <div className="min-w-0">
                            <div className="max-w-[300px] truncate text-[10px] font-bold text-slate-200 transition group-hover:text-cyan-100">
                              {group.group_name}
                            </div>
                            <div className="mt-0.5 max-w-[300px] truncate font-mono text-[7px] text-slate-400">
                              {group.group_id}
                            </div>
                          </div>
                        </button>
                      </td>

                      <td className="h-[50px] px-4 py-0 align-middle">
                        <div className="truncate text-[9px] text-slate-500">
                          {group.description || '—'}
                        </div>
                      </td>

                      <td className="h-[50px] px-4 py-0 align-middle">
                        <StatusBadge active={group.is_active} />
                      </td>

                      <td className="h-[50px] px-4 py-0 align-middle text-[9px] text-slate-500">
                        {formatDate(group.created_at)}
                      </td>

                      <td className="relative h-[50px] px-2 py-0 text-center align-middle">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActionMenuId((prev) => prev === group.group_id ? null : group.group_id);
                          }}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-transparent text-slate-500 transition hover:border-cyan-400/20 hover:bg-cyan-950/20 hover:text-cyan-200"
                        >
                          <MoreIcon />
                        </button>

                        {actionMenuId === group.group_id && (
                          <div
                            onClick={(event) => event.stopPropagation()}
                            className="absolute right-8 top-9 z-30 w-44 overflow-hidden rounded-xl border border-cyan-400/20 bg-[#020b17]/98 p-1.5 text-left shadow-[0_16px_45px_rgba(0,0,0,.62)] backdrop-blur-xl"
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGroup(group);
                                setActionMenuId(null);
                              }}
                              className="w-full rounded-lg px-3 py-2 text-left text-[9px] font-bold text-slate-300 transition hover:bg-cyan-950/25 hover:text-cyan-100"
                            >
                              View Group
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(group)}
                              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-[9px] font-bold text-cyan-200 transition hover:bg-cyan-950/25"
                            >
                              Edit Group
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setStatusTarget(group);
                                setActionMenuId(null);
                              }}
                              className={`mt-1 w-full rounded-lg px-3 py-2 text-left text-[9px] font-bold transition ${
                                group.is_active
                                  ? 'text-rose-300 hover:bg-rose-950/25'
                                  : 'text-emerald-300 hover:bg-emerald-950/25'
                              }`}
                            >
                              {group.is_active ? 'Deactivate Group' : 'Activate Group'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE CARDS */}
            <div className="divide-y divide-sky-500/[0.07] md:hidden">
              {!loading && items.map((group) => (
                <div key={group.group_id} className="p-3">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border text-[10px] font-black ${
                      group.is_active
                        ? 'border-cyan-400/25 bg-cyan-950/25 text-cyan-200'
                        : 'border-slate-600/20 bg-slate-900/35 text-slate-500'
                    }`}>
                      {groupInitials(group.group_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-bold text-slate-200">{group.group_name}</div>
                      <div className="mt-0.5 line-clamp-2 text-[9px] text-slate-400">{group.description || 'No description'}</div>
                    </div>
                    <StatusBadge active={group.is_active} />
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setSelectedGroup(group)} className="flex-1 rounded-lg border border-cyan-400/20 bg-cyan-950/15 px-3 py-2 text-[8px] font-black tracking-[0.10em] text-cyan-200 uppercase">
                      View
                    </button>
                    <button type="button" onClick={() => openEdit(group)} className="flex-1 rounded-lg border border-sky-400/20 bg-sky-950/15 px-3 py-2 text-[8px] font-black tracking-[0.10em] text-sky-200 uppercase">
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setStatusTarget(group)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-[8px] font-black tracking-[0.10em] uppercase ${
                        group.is_active
                          ? 'border-rose-400/20 bg-rose-950/15 text-rose-300'
                          : 'border-emerald-400/20 bg-emerald-950/15 text-emerald-300'
                      }`}
                    >
                      {group.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {loading && (
              <div className="grid min-h-[260px] place-items-center">
                <div className="text-center">
                  <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-cyan-400/15 border-t-cyan-300" />
                  <div className="mt-3 text-[8px] font-black tracking-[0.18em] text-cyan-300 uppercase">Loading Directory</div>
                </div>
              </div>
            )}

            {!loading && items.length === 0 && (
              <div className="grid min-h-[260px] place-items-center p-6 text-center">
                <div>
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-600/20 bg-slate-900/25 text-slate-400">
                    <GroupIcon />
                  </div>
                  <div className="mt-3 text-[10px] font-black tracking-[0.15em] text-slate-400 uppercase">No Groups Found</div>
                  <div className="mt-1 text-[9px] text-slate-400">Try another search/status filter or register a group.</div>
                </div>
              </div>
            )}

            {/* PAGINATION */}
            <div className="flex flex-col gap-2 border-t border-sky-500/10 bg-[#04101f]/35 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-[8px] tracking-[0.08em] text-slate-400">
                <span>
                  Page <strong className="text-slate-400">{totalPages === 0 ? 0 : page}</strong> of{' '}
                  <strong className="text-slate-400">{totalPages}</strong>
                </span>
                <span className="text-slate-800">·</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPage(1);
                    setPageSize(Number(e.target.value));
                  }}
                  className="rounded-md border border-slate-600/20 bg-[#061322] px-2 py-1 text-[8px] text-slate-400 outline-none"
                >
                  <option value={10}>10 / page</option>
                  <option value={20}>20 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={loading || page <= 1}
                  onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                  className="rounded-lg border border-slate-600/20 bg-[#071523]/55 px-3 py-1.5 text-[8px] font-black tracking-[0.10em] text-slate-400 uppercase transition hover:border-cyan-400/25 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={loading || totalPages === 0 || page >= totalPages}
                  onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                  className="rounded-lg border border-cyan-400/20 bg-cyan-950/15 px-3 py-1.5 text-[8px] font-black tracking-[0.10em] text-cyan-200 uppercase transition hover:border-cyan-300/40 hover:bg-cyan-950/25 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* GROUP DETAIL DRAWER */}
      {selectedGroup && (
        <div className="absolute inset-0 z-[80] flex justify-end">
          <button
            type="button"
            aria-label="Close group detail"
            className="absolute inset-0 bg-[#00050a]/55 backdrop-blur-[2px]"
            onClick={() => setSelectedGroup(null)}
          />

          <aside className="relative z-10 flex h-full w-full max-w-[420px] flex-col border-l border-cyan-400/20 bg-[#020b17]/96 shadow-[-20px_0_60px_rgba(0,0,0,.48)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-cyan-400/15 px-4 py-3">
              <div>
                <div className="text-[8px] font-black tracking-[0.18em] text-cyan-400 uppercase">Group Profile</div>
                <div className="mt-0.5 text-[8px] text-slate-400">Access group identity</div>
              </div>
              <button type="button" onClick={() => setSelectedGroup(null)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600/20 text-slate-500 transition hover:border-cyan-400/25 hover:text-cyan-200">
                <CloseIcon />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border text-sm font-black ${
                  selectedGroup.is_active
                    ? 'border-cyan-400/30 bg-cyan-950/25 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,.06)]'
                    : 'border-slate-600/25 bg-slate-900/30 text-slate-500'
                }`}>
                  {groupInitials(selectedGroup.group_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-base font-black text-cyan-50">{selectedGroup.group_name}</div>
                  <div className="mt-2"><StatusBadge active={selectedGroup.is_active} /></div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-sky-500/15 bg-[#061322]/45 p-3">
                <div className="text-[8px] font-black tracking-[0.16em] text-slate-500 uppercase">Group Identity</div>
                <dl className="mt-3 grid gap-3">
                  <div>
                    <dt className="text-[7px] tracking-[0.12em] text-slate-400 uppercase">Group ID</dt>
                    <dd className="mt-1 break-all font-mono text-[9px] text-slate-300">{selectedGroup.group_id}</dd>
                  </div>
                  <div>
                    <dt className="text-[7px] tracking-[0.12em] text-slate-400 uppercase">Description</dt>
                    <dd className="mt-1 text-[9px] leading-relaxed text-slate-400">{selectedGroup.description || '—'}</dd>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-[7px] tracking-[0.12em] text-slate-400 uppercase">Created</dt>
                      <dd className="mt-1 text-[9px] text-slate-400">{formatDate(selectedGroup.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="text-[7px] tracking-[0.12em] text-slate-400 uppercase">Last Update</dt>
                      <dd className="mt-1 text-[9px] text-slate-400">{formatDate(selectedGroup.updated_at)}</dd>
                    </div>
                  </div>
                </dl>
              </div>

              <div className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-950/[0.08] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[8px] font-black tracking-[0.16em] text-cyan-400 uppercase">Access Management</div>
                    <div className="mt-1 text-[8px] text-slate-400">Application and dashboard permissions.</div>
                  </div>
                  {!menuLoading && <div className="font-mono text-[9px] font-bold text-cyan-300">{accessStats.granted}/{accessStats.total}</div>}
                </div>
                {menuError && <div className="mt-3 rounded-lg border border-rose-400/20 bg-rose-950/15 px-3 py-2 text-[9px] text-rose-200">{menuError}</div>}
                {menuLoading ? (
                  <div className="py-7 text-center text-[8px] font-black tracking-[0.14em] text-cyan-400 uppercase">Loading Access...</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {accessCategories.map(category => (
                      <div key={category.key} className="flex items-center justify-between rounded-lg border border-sky-500/10 bg-[#061322]/40 px-3 py-2.5">
                        <span className="text-[9px] font-bold text-slate-300">{category.name}</span>
                        <span className="font-mono text-[9px] text-cyan-300">{category.granted}/{category.total}</span>
                      </div>
                    ))}
                  </div>
                )}
                <button type="button" disabled={menuLoading || !selectedGroup.is_active}
                  onClick={() => { setAccessSearch(''); setAccessFilter('all'); setAccessCategory('all'); setAccessOpen(true); }}
                  className="mt-3 w-full rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 py-2.5 text-[8px] font-black tracking-[0.14em] text-cyan-100 uppercase transition hover:bg-cyan-500/15 disabled:opacity-35">
                  Manage Access
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 border-t border-cyan-400/15 p-4">
              <button
                type="button"
                onClick={() => openEdit(selectedGroup)}
                className="rounded-xl border border-cyan-400/25 bg-cyan-950/15 px-4 py-3 text-[9px] font-black tracking-[0.14em] text-cyan-200 uppercase transition hover:bg-cyan-950/25"
              >
                Edit Group
              </button>
              <button
                type="button"
                onClick={() => setStatusTarget(selectedGroup)}
                className={`rounded-xl border px-4 py-3 text-[9px] font-black tracking-[0.14em] uppercase transition ${
                  selectedGroup.is_active
                    ? 'border-rose-400/25 bg-rose-950/15 text-rose-300 hover:bg-rose-950/25'
                    : 'border-emerald-400/25 bg-emerald-950/15 text-emerald-300 hover:bg-emerald-950/25'
                }`}
              >
                {selectedGroup.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {accessOpen && selectedGroup && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-[#00050a]/80 p-4 backdrop-blur-md">
          <div className="flex h-[90%] w-full max-w-[1100px] flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#020b17]/98 shadow-[0_24px_80px_rgba(0,0,0,.7)]">
            <div className="flex items-center justify-between border-b border-cyan-400/15 px-5 py-4">
              <div>
                <div className="text-[8px] font-black tracking-[0.18em] text-cyan-400 uppercase">Access Management</div>
                <div className="mt-1 text-base font-black text-cyan-50">{selectedGroup.group_name}</div>
              </div>
              <button type="button" onClick={() => setAccessOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-600/20 text-slate-500 hover:text-cyan-100"><CloseIcon /></button>
            </div>

            <div className="flex flex-col gap-2 border-b border-cyan-400/10 px-5 py-3 lg:flex-row">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400"><SearchIcon /></div>
                <input value={accessSearch} onChange={e => setAccessSearch(e.target.value)}
                  placeholder="Find menu by name, code or route..."
                  className="h-10 w-full rounded-lg border border-sky-500/18 bg-[#061322]/65 pl-10 pr-3 text-[10px] text-cyan-50 outline-none placeholder:text-slate-500 focus:border-cyan-300/45" />
              </div>
              <div className="flex gap-1 rounded-lg border border-sky-500/12 bg-[#061322]/50 p-1">
                {(['all','granted','not_granted'] as const).map(value => (
                  <button key={value} type="button" onClick={() => setAccessFilter(value)}
                    className={`rounded-md px-3 py-2 text-[7px] font-black uppercase ${accessFilter === value ? 'bg-cyan-500/15 text-cyan-100' : 'text-slate-400'}`}>
                    {value === 'all' ? 'All' : value === 'granted' ? 'Granted' : 'Not Granted'}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setAllMenuAccess(true)} className="rounded-lg border border-emerald-400/20 px-3 py-2 text-[7px] font-black text-emerald-300 uppercase">Select All</button>
              <button type="button" onClick={() => setAllMenuAccess(false)} className="rounded-lg border border-rose-400/20 px-3 py-2 text-[7px] font-black text-rose-300 uppercase">Clear All</button>
            </div>

            <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)]">
              <aside className="overflow-y-auto border-r border-cyan-400/10 bg-[#020913]/70 p-3">
                <div className="mb-2 px-2 text-[7px] font-black tracking-[0.16em] text-slate-400 uppercase">Application</div>
                <button type="button" onClick={() => setAccessCategory('all')}
                  className={`mb-1 flex w-full justify-between rounded-lg px-3 py-2.5 text-[9px] ${accessCategory === 'all' ? 'bg-cyan-500/10 text-cyan-100' : 'text-slate-500'}`}>
                  <span>All Applications</span><span>{accessStats.granted}/{accessStats.total}</span>
                </button>
                {accessCategories.map(category => (
                  <button key={category.key} type="button" onClick={() => setAccessCategory(category.key)}
                    className={`mb-1 flex w-full justify-between rounded-lg px-3 py-2.5 text-[9px] ${accessCategory === category.key ? 'bg-cyan-500/10 text-cyan-100' : 'text-slate-500'}`}>
                    <span className="truncate">{category.name}</span><span>{category.granted}/{category.total}</span>
                  </button>
                ))}
              </aside>

              <main className="min-h-0 overflow-y-auto p-4">
                {visibleAccessCategories.length ? <div className="space-y-3">
                  {visibleAccessCategories.map(category => (
                    <section key={category.key} className="overflow-hidden rounded-xl border border-sky-500/12">
                      <div className="flex items-center justify-between border-b border-sky-500/10 bg-[#071727]/55 px-4 py-3">
                        <div><div className="text-[9px] font-black text-cyan-200 uppercase">{category.name}</div><div className="mt-1 text-[7px] text-slate-400">{category.granted} of {category.total} granted</div></div>
                        <div className="flex gap-1">
                          <button type="button" onClick={() => setCategoryMenuAccess(category.key,true)} className="rounded border border-emerald-400/15 px-2 py-1.5 text-[7px] text-emerald-300">Select All</button>
                          <button type="button" onClick={() => setCategoryMenuAccess(category.key,false)} className="rounded border border-rose-400/15 px-2 py-1.5 text-[7px] text-rose-300">Clear</button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-px bg-sky-500/[0.07]">
                        {category.menus.map(menu => (
                          <button key={menu.menu_id} type="button" onClick={() => toggleMenuAccess(menu.menu_id)}
                            className={`flex min-h-[72px] items-center gap-3 bg-[#04111e] px-4 py-3 text-left hover:bg-[#071a2a] ${menu.can_view ? 'shadow-[inset_3px_0_0_rgba(34,211,238,.75)]' : ''}`}>
                            <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-[11px] ${menu.can_view ? 'border-cyan-300 bg-cyan-400 text-[#00101a]' : 'border-slate-600 text-transparent'}`}>✓</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-[9px] font-bold text-slate-200">{menu.menu_name}</span><span className="mt-1 block truncate font-mono text-[7px] text-slate-400">{menu.menu_code}</span></span>
                            <span className={`text-[6px] font-black uppercase ${menu.can_view ? 'text-emerald-300' : 'text-slate-400'}`}>{menu.can_view ? 'Granted' : 'No Access'}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))}
                </div> : <div className="grid h-full place-items-center text-[9px] text-slate-400">No menu found.</div>}
              </main>
            </div>

            <div className="flex items-center justify-between border-t border-cyan-400/15 px-5 py-3">
              <div><div className="text-[9px] text-slate-300">{accessStats.granted} of {accessStats.total} menus granted</div><div className={`mt-1 text-[7px] ${menuDirty ? 'text-amber-300' : 'text-slate-400'}`}>{menuDirty ? 'Unsaved access changes' : 'Access is synchronized'}</div></div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAccessOpen(false)} className="rounded-lg border border-slate-600/20 px-4 py-2 text-[8px] font-black text-slate-400 uppercase">Close</button>
                <button type="button" disabled={menuSaving || !menuDirty} onClick={saveMenuAccess} className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-5 py-2 text-[8px] font-black text-cyan-100 uppercase disabled:opacity-35">{menuSaving ? 'Saving...' : 'Save Access'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {formMode && (
        <GroupFormModal
          mode={formMode}
          group={formTarget}
          busy={formBusy}
          onClose={() => {
            if (formBusy) return;
            setFormMode(null);
            setFormTarget(null);
          }}
          onSave={saveGroup}
        />
      )}

      {/* CONFIRM STATUS MODAL */}
      {statusTarget && (
        <div className="absolute inset-0 z-[110] grid place-items-center bg-[#00050a]/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-[420px] overflow-hidden rounded-2xl border border-cyan-400/20 bg-[#020b17]/98 shadow-[0_24px_70px_rgba(0,0,0,.58)]">
            <div className="border-b border-cyan-400/12 px-4 py-3">
              <div className="text-[8px] font-black tracking-[0.18em] text-cyan-400 uppercase">Confirm Group Status</div>
            </div>
            <div className="p-4">
              <div className="text-sm font-bold text-slate-100">
                {statusTarget.is_active ? 'Deactivate' : 'Activate'} {statusTarget.group_name}?
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                {statusTarget.is_active
                  ? 'Group akan dinonaktifkan dan tidak dapat digunakan untuk assignment akses baru. Data group tetap disimpan.'
                  : 'Group akan kembali aktif dan dapat digunakan untuk assignment akses.'}
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={statusBusy}
                  onClick={() => setStatusTarget(null)}
                  className="rounded-lg border border-slate-600/20 bg-slate-900/20 px-4 py-2 text-[9px] font-black tracking-[0.10em] text-slate-400 uppercase transition hover:text-slate-200 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={statusBusy}
                  onClick={changeStatus}
                  className={`rounded-lg border px-4 py-2 text-[9px] font-black tracking-[0.10em] uppercase transition disabled:opacity-40 ${
                    statusTarget.is_active
                      ? 'border-rose-400/25 bg-rose-950/25 text-rose-300 hover:bg-rose-950/40'
                      : 'border-emerald-400/25 bg-emerald-950/25 text-emerald-300 hover:bg-emerald-950/40'
                  }`}
                >
                  {statusBusy ? 'Processing...' : statusTarget.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[120] -translate-x-1/2">
          <div className="rounded-xl border border-emerald-400/25 bg-[#031712]/95 px-4 py-2.5 text-[9px] font-bold text-emerald-200 shadow-[0_14px_45px_rgba(0,0,0,.48),0_0_18px_rgba(52,211,153,.06)] backdrop-blur-xl">
            ✓ {toast}
          </div>
        </div>
      )}
    </div>
  );
}
