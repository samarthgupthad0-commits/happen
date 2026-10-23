import { useEffect, useState } from 'react';
import api from '../../lib/axios';
import { toast } from 'sonner';
import { Check, Copy } from 'lucide-react';

function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [draftTeams, setDraftTeams] = useState({});
  const [draftRoles, setDraftRoles] = useState({});
  const [newMember, setNewMember] = useState({ first_name: '', last_name: '', email: '', team_id: '', role: 'employee' });
  const [createdCredential, setCreatedCredential] = useState(null);

  const roleDisplay = {
    employee: 'Employee',
    team_lead: 'Team Lead',
    manager: 'Manager',
    hr: 'HR',
    accounting: 'Accounting',
    admin: 'Admin',
  };
  const [copiedCredential, setCopiedCredential] = useState(false);
  const [savingUserId, setSavingUserId] = useState(null);
  const [creatingMember, setCreatingMember] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const [userResponse, teamResponse] = await Promise.all([
        api.get('/admin/users'),
        api.get('/admin/teams'),
      ]);
      setUsers(userResponse.data);
      setTeams(teamResponse.data);
      setDraftTeams(Object.fromEntries(userResponse.data.map(user => [
        user._id,
        user.team_id?._id || user.team_id || '',
      ])));
      setDraftRoles(Object.fromEntries(userResponse.data.map(user => [
        user._id,
        user.role || 'employee',
      ])));
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to load users and teams');
    } finally {
      setLoading(false);
    }
  };

  const saveUser = async (userId) => {
    setSavingUserId(userId);
    try {
      const response = await api.patch(`/admin/users/${userId}`, {
        team_id: draftTeams[userId] || null,
        role: draftRoles[userId] || 'employee',
      });
      setUsers(current => current.map(user => user._id === userId ? response.data : user));
      setDraftTeams(current => ({ ...current, [userId]: response.data.team_id?._id || response.data.team_id || '' }));
      setDraftRoles(current => ({ ...current, [userId]: response.data.role || 'employee' }));
      toast.success('User updated');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to update user');
    } finally {
      setSavingUserId(null);
    }
  };

  const createMember = async (event) => {
    event.preventDefault();
    setCreatingMember(true);
    try {
      const response = await api.post('/admin/users', newMember);
      const { user, temporary_password } = response.data;
      await fetchUsers();
      setDraftTeams(current => ({ ...current, [user._id]: user.team_id }));
      setDraftRoles(current => ({ ...current, [user._id]: user.role || 'employee' }));
      setNewMember({ first_name: '', last_name: '', email: '', team_id: '', role: 'employee' });
      setCreatedCredential({ email: user.email, password: temporary_password });
      setCopiedCredential(false);
      toast.success('Team member created');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to create team member');
    } finally {
      setCreatingMember(false);
    }
  };

  const copyCredential = async () => {
    try {
      await navigator.clipboard.writeText(createdCredential.password);
      setCopiedCredential(true);
    } catch {
      toast.error('Clipboard access is unavailable; select and copy the password');
    }
  };

  return (
    <div className="card" data-testid="admin-users-page">
      <h2 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
        User Management
      </h2>
      {loading ? (
        <p className="py-6 text-center" style={{ color: 'var(--text-secondary)' }}>Loading users...</p>
      ) : (
      <>
      <form onSubmit={createMember} className="mb-6 border-b pb-6" style={{ borderColor: 'var(--border)' }}>
        <h3 className="font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Add Team Member</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <input
            aria-label="First name"
            autoComplete="given-name"
            required
            value={newMember.first_name}
            onChange={event => setNewMember(current => ({ ...current, first_name: event.target.value }))}
            placeholder="First name"
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            aria-label="Last name"
            autoComplete="family-name"
            required
            value={newMember.last_name}
            onChange={event => setNewMember(current => ({ ...current, last_name: event.target.value }))}
            placeholder="Last name"
            className="rounded border px-3 py-2 text-sm"
          />
          <input
            aria-label="Work email"
            type="email"
            autoComplete="email"
            required
            value={newMember.email}
            onChange={event => setNewMember(current => ({ ...current, email: event.target.value }))}
            placeholder="Work email"
            className="rounded border px-3 py-2 text-sm"
          />
          <select
            aria-label="Assign team"
            required
            value={newMember.team_id}
            onChange={event => setNewMember(current => ({ ...current, team_id: event.target.value }))}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="">Select team</option>
            {teams.map(team => <option key={team._id} value={team._id}>{team.name}</option>)}
          </select>
          <select
            aria-label="Assign role"
            required
            value={newMember.role}
            onChange={event => setNewMember(current => ({ ...current, role: event.target.value }))}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="employee">Employee</option>
            <option value="team_lead">Team Lead</option>
            <option value="manager">Manager</option>
            <option value="hr">HR</option>
            <option value="accounting">Accounting</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            disabled={creatingMember || !teams.length}
            className="rounded px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--orange)' }}
          >
            {creatingMember ? 'Creating...' : 'Create Member'}
          </button>
        </div>
      </form>
      {createdCredential && (
        <div className="mb-6 rounded border border-green-200 bg-green-50 p-4" role="status">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-green-900">Account created for {createdCredential.email}</p>
              <p className="mt-1 text-sm text-green-800">Starts with their name plus 123. Copy it now; it will not be shown again.</p>
              <code className="mt-2 inline-block select-all rounded bg-white px-2 py-1 text-sm text-gray-900">{createdCredential.password}</code>
            </div>
            <button
              type="button"
              onClick={copyCredential}
              className="inline-flex items-center gap-2 rounded border border-green-700 px-3 py-2 text-sm font-semibold text-green-800"
            >
              {copiedCredential ? <Check size={16} /> : <Copy size={16} />}
              {copiedCredential ? 'Copied' : 'Copy password'}
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Name
              </th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Email
              </th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Role
              </th>
              <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Team
              </th>
              <th className="text-right py-3 px-4 font-medium" style={{ color: 'var(--text-secondary)' }}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-b hover:bg-orange-50 transition-colors duration-150" style={{ borderColor: 'var(--border)' }}>
                <td className="py-3 px-4 font-medium">{user.first_name} {user.last_name}</td>
                <td className="py-3 px-4">{user.email}</td>
                <td className="py-3 px-4">
                  <select
                    aria-label={`Role for ${user.first_name} ${user.last_name}`}
                    value={draftRoles[user._id] || user.role || 'employee'}
                    onChange={event => setDraftRoles(current => ({ ...current, [user._id]: event.target.value }))}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="employee">Employee</option>
                    <option value="team_lead">Team Lead</option>
                    <option value="manager">Manager</option>
                    <option value="hr">HR</option>
                    <option value="accounting">Accounting</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="py-3 px-4">
                  <select
                    aria-label={`Team for ${user.first_name} ${user.last_name}`}
                    value={draftTeams[user._id] || ''}
                    onChange={event => setDraftTeams(current => ({ ...current, [user._id]: event.target.value }))}
                    className="rounded border px-2 py-1 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {teams.map(team => <option key={team._id} value={team._id}>{team.name}</option>)}
                  </select>
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => saveUser(user._id)}
                    disabled={
                      savingUserId === user._id ||
                      (
                        (draftTeams[user._id] || user.team_id?._id || user.team_id || '') === (user.team_id?._id || user.team_id || '') &&
                        (draftRoles[user._id] || user.role || 'employee') === (user.role || 'employee')
                      )
                    }
                    className="px-3 py-1.5 rounded text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--orange)' }}
                  >
                    {savingUserId === user._id ? 'Saving...' : 'Save'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>
      )}
    </div>
  );
}

export default AdminUsersPage;
