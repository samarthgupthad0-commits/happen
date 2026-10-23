import { useEffect, useState } from 'react';
import { Check, Copy, KeyRound, Search, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../lib/axios';

function AdminPasswordsPage() {
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [credential, setCredential] = useState(null);
  const [visibleCredentialId, setVisibleCredentialId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [resettingUserId, setResettingUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/users')
      .then(response => setUsers(response.data))
      .catch(error => toast.error(error.response?.data?.error || 'Unable to load users'))
      .finally(() => setLoading(false));
  }, []);

  const resetPassword = async (user) => {
    setResettingUserId(user._id);
    try {
      const response = await api.post(`/admin/users/${user._id}/reset-password`);
      setCredential({ ...response.data.user, id: user._id, password: response.data.temporary_password });
      setVisibleCredentialId(null);
      setCopied(false);
      toast.success('Temporary password generated');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to reset password');
    } finally {
      setResettingUserId(null);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard.writeText(credential.password);
      setCopied(true);
    } catch {
      toast.error('Clipboard access is unavailable; select and copy the password');
    }
  };

  const normalizedQuery = query.trim().toLowerCase();
  const filteredUsers = users.filter(user =>
    `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(normalizedQuery)
  );

  return (
    <div className="card" data-testid="admin-passwords-page">
      <div className="flex items-start gap-3 border-b pb-5" style={{ borderColor: 'var(--border)' }}>
        <ShieldCheck size={24} style={{ color: 'var(--success)' }} />
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
        Password Vault
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Reset an account’s password. The new password starts with their name and ends with 123, so it is easy to type. Existing passwords cannot be viewed.
          </p>
        </div>
      </div>

      {credential && (
        <div className="my-5 rounded border border-green-200 bg-green-50 p-4" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-green-900">Temporary password for {credential.email}</p>
              <p className="mt-1 text-sm text-green-800">It starts with their name and ends with 123. Copy and share it privately; it is only shown until you leave this page.</p>
              <code className="mt-2 inline-block select-all rounded bg-white px-2 py-1 text-sm text-gray-900">
                {visibleCredentialId === credential.id ? credential.password : '********'}
              </code>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setVisibleCredentialId(current => current === credential.id ? null : credential.id)}
                className="rounded border border-green-700 px-3 py-2 text-sm font-semibold text-green-800"
              >
                {visibleCredentialId === credential.id ? 'Hide password' : 'Show password'}
              </button>
              <button
                type="button"
                onClick={copyPassword}
                className="inline-flex items-center gap-2 rounded border border-green-700 px-3 py-2 text-sm font-semibold text-green-800"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy password'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{users.length} accounts</p>
        <label className="relative block sm:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search name or email"
            aria-label="Search users"
            className="w-full rounded border py-2 pl-9 pr-3 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <p className="py-8 text-center" style={{ color: 'var(--text-secondary)' }}>Loading accounts...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b text-left" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 text-right font-medium">Password</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(user => (
                <tr key={user._id} className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-3">
                    <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{user.first_name} {user.last_name}</p>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>{user.role.replace('_', ' ')}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setVisibleCredentialId(current => current === user._id ? null : user._id)}
                        disabled={credential?.id !== user._id}
                        className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        {visibleCredentialId === user._id ? 'Hide' : 'Show'}
                      </button>
                      <button
                        type="button"
                        onClick={() => resetPassword(user)}
                        disabled={resettingUserId === user._id}
                        className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                        style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
                      >
                        <KeyRound size={16} />
                        {resettingUserId === user._id ? 'Generating...' : 'Generate new password'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredUsers.length && (
                <tr>
                  <td colSpan="3" className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                    No matching accounts
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AdminPasswordsPage;
