import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const getUserName = (user) =>
  `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.name || user.email || 'User';

function AdminImpersonatePage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [impersonatingUserId, setImpersonatingUserId] = useState(null);
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get('/admin/users');
      setUsers(res.data.filter((u) => u.role && u.role !== 'admin' && u.is_active !== false));
    } catch (error) {
      setLoadError(error.response?.data?.error || 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  const handleImpersonate = async () => {
    if (!selectedUser) return;
    setImpersonatingUserId(selectedUser._id);
    try {
      const res = await api.post('/admin/impersonate', { target_user_id: selectedUser._id });
      login(res.data.user, res.data.token);
      toast.success(`Now impersonating ${getUserName(selectedUser)}`);
      navigate('/dashboard');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Unable to impersonate user');
      setImpersonatingUserId(null);
      setSelectedUser(null);
    }
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    const searchable = `${getUserName(user)} ${user.email} ${user.role} ${user.team_id?.name || ''}`.toLowerCase();
    return searchable.includes(normalizedSearch);
  });

  return (
    <div className="space-y-5" data-testid="admin-impersonate-page">
      <div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Impersonate User</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>Start a session using an active non-admin account.</p>
      </div>

      <div className="border-l-4 px-4 py-3" style={{ borderLeftColor: 'var(--warning)', background: '#FFF7ED' }} role="note">
        <p className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
          Impersonation start and end are recorded in Audit Logs. The target account’s permissions apply during the session.
        </p>
      </div>

      <label className="relative block max-w-lg">
        <span className="sr-only">Search users</span>
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, role, or team"
          className="w-full rounded border py-2 pl-9 pr-3 text-sm"
          style={{ borderColor: 'var(--border)' }}
        />
      </label>

      {loadError ? (
        <div className="flex flex-col gap-3 rounded border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="text-sm text-red-700">{loadError}</p>
          <button type="button" onClick={fetchUsers} className="self-start rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 sm:self-auto">Retry</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <th className="py-3 pr-4 font-semibold">User</th>
                <th className="py-3 pr-4 font-semibold">Role</th>
                <th className="py-3 pr-4 font-semibold">Team</th>
                <th className="py-3 pr-4 font-semibold">Last login</th>
                <th className="py-3 text-right font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="py-10 text-center" role="status" style={{ color: 'var(--text-secondary)' }}>Loading users…</td></tr>
              ) : filteredUsers.length ? filteredUsers.map((user) => (
                <tr key={user._id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="py-3 pr-4">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{getUserName(user)}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                  </td>
                  <td className="py-3 pr-4 capitalize">{user.role?.replaceAll('_', ' ') || '—'}</td>
                  <td className="py-3 pr-4">{user.team_id?.name || '—'}</td>
                  <td className="whitespace-nowrap py-3 pr-4" style={{ color: 'var(--text-secondary)' }}>
                    {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedUser(user)}
                      disabled={impersonatingUserId !== null}
                      className="rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--orange)' }}
                      data-testid={`impersonate-${user._id}`}
                    >
                      Login as user
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="py-12 text-center" style={{ color: 'var(--text-secondary)' }}>
                  {users.length ? 'No users match this search.' : 'No active non-admin accounts found.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedUser(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="impersonation-confirm-title"
            className="w-full max-w-md bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="impersonation-confirm-title" className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
              Start impersonation?
            </h3>
            <p className="mt-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
              You will act as <strong>{getUserName(selectedUser)}</strong> ({selectedUser.email}) with the <strong>{selectedUser.role?.replaceAll('_', ' ')}</strong> role. This action is recorded.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setSelectedUser(null)} disabled={impersonatingUserId !== null} className="rounded border px-4 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>
                Cancel
              </button>
              <button type="button" onClick={handleImpersonate} disabled={impersonatingUserId !== null} className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--orange)' }}>
                {impersonatingUserId ? 'Starting…' : 'Confirm'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminImpersonatePage;
