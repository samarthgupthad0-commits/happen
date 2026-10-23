import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search, X } from 'lucide-react';
import api from '../../lib/axios';

const PAGE_SIZE = 25;
const EMPTY_FILTERS = { search: '', action: '', user: '', from: '', to: '' };

const displayName = (user) =>
  user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email : 'System';

function AdminAuditPage() {
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [users, setUsers] = useState([]);
  const [actions, setActions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = Object.fromEntries(
        Object.entries({ page, limit: PAGE_SIZE, ...filters }).filter(([, value]) => value !== ''),
      );
      const { data } = await api.get('/admin/audit-logs', { params });
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setActions(data.actions || []);
    } catch (requestError) {
      setLogs([]);
      setTotal(0);
      setError(requestError.response?.data?.error || 'Unable to load audit logs.');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    let active = true;
    api.get('/admin/users')
      .then(({ data }) => { if (active) setUsers(data || []); })
      .catch(() => { if (active) setUsers([]); });
    return () => { active = false; };
  }, []);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setFilters({
      search: draftFilters.search.trim(),
      action: draftFilters.action,
      user: draftFilters.user,
      from: draftFilters.from,
      to: draftFilters.to,
    });
  };

  const clearFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setPage(1);
    setFilters(EMPTY_FILTERS);
  };

  const updateFilter = (key) => (event) => {
    setDraftFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstResult = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const lastResult = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="space-y-5" data-testid="admin-audit-page">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Audit Logs</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            {total.toLocaleString()} recorded events
          </p>
        </div>
        <button
          type="button"
          onClick={fetchLogs}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 self-start rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50 sm:self-auto"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <form onSubmit={applyFilters} className="grid grid-cols-1 gap-3 border-b pb-5 sm:grid-cols-2 xl:grid-cols-6" style={{ borderColor: 'var(--border)' }}>
        <label className="relative sm:col-span-2 xl:col-span-2">
          <span className="sr-only">Search audit logs</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="search"
            value={draftFilters.search}
            onChange={updateFilter('search')}
            placeholder="Search actor, action, details, IP"
            className="w-full rounded border py-2 pl-9 pr-3 text-sm"
            style={{ borderColor: 'var(--border)' }}
          />
        </label>
        <label>
          <span className="sr-only">Filter by action</span>
          <select value={draftFilters.action} onChange={updateFilter('action')} className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            <option value="">All actions</option>
            {actions.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by user</span>
          <select value={draftFilters.user} onChange={updateFilter('user')} className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }}>
            <option value="">All users</option>
            {users.map((user) => <option key={user._id} value={user._id}>{displayName(user)}</option>)}
          </select>
        </label>
        <label>
          <span className="sr-only">From date</span>
          <input type="date" value={draftFilters.from} onChange={updateFilter('from')} className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </label>
        <label>
          <span className="sr-only">To date</span>
          <input type="date" value={draftFilters.to} onChange={updateFilter('to')} className="w-full rounded border px-3 py-2 text-sm" style={{ borderColor: 'var(--border)' }} />
        </label>
        <div className="flex gap-2 sm:col-span-2 xl:col-span-6">
          <button type="submit" className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white" style={{ background: 'var(--orange)' }}>
            <Search size={15} /> Apply filters
          </button>
          <button type="button" onClick={clearFilters} className="inline-flex items-center gap-2 rounded border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <X size={15} /> Clear
          </button>
        </div>
      </form>

      {error ? (
        <div className="flex flex-col gap-3 rounded border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={fetchLogs} className="self-start rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 sm:self-auto">Retry</button>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <th className="py-3 pr-4 font-semibold">Time</th>
                  <th className="py-3 pr-4 font-semibold">Actor</th>
                  <th className="py-3 pr-4 font-semibold">Action</th>
                  <th className="py-3 pr-4 font-semibold">Details</th>
                  <th className="py-3 font-semibold">IP address</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" className="py-10 text-center" style={{ color: 'var(--text-secondary)' }}>Loading audit events…</td></tr>
                ) : logs.length ? logs.map((log) => (
                  <tr key={log._id} className="border-b align-top" style={{ borderColor: 'var(--border)' }}>
                    <td className="whitespace-nowrap py-3 pr-4" style={{ color: 'var(--text-secondary)' }}>
                      {log.createdAt ? new Date(log.createdAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{displayName(log.user_id)}</p>
                      {log.user_id?.email && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{log.user_id.email}</p>}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 font-semibold" style={{ color: 'var(--orange)' }}>{log.action}</td>
                    <td className="max-w-xl whitespace-pre-wrap break-words py-3 pr-4">{log.details || '—'}</td>
                    <td className="whitespace-nowrap py-3 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{log.ip_address || '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="5" className="py-12 text-center" style={{ color: 'var(--text-secondary)' }}>No audit events match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Showing {firstResult}–{lastResult} of {total.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="Previous page" className="rounded border p-2 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                <ChevronLeft size={16} />
              </button>
              <span className="min-w-24 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading} aria-label="Next page" className="rounded border p-2 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default AdminAuditPage;
