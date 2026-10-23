import { useEffect, useState } from 'react';
import { Bell, BriefcaseBusiness, Lock, Moon, ShieldCheck, UserCircle2 } from 'lucide-react';
import api from '../lib/axios';
import { useAuthStore } from '../store/authStore';

const ROLE_COLORS = {
  admin: '#7C3AED',
  manager: '#F59E0B',
  hr: '#EC4899',
  team_lead: '#0EA5E9',
  accounting: '#22C55E',
  employee: '#F4631E',
};

const buildDefaultForm = (user = {}) => ({
  profile: {
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    email: user.email || '',
  },
  password: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  },
  notifications: {
    email: user.settings?.notifications?.email ?? true,
    push: user.settings?.notifications?.push ?? true,
    weeklyDigest: user.settings?.notifications?.weeklyDigest ?? false,
    leaveUpdates: user.settings?.notifications?.leaveUpdates ?? true,
  },
  workspace: {
    timezone: user.settings?.workspace?.timezone || 'UTC-05:00 (Eastern Time)',
    locale: user.settings?.workspace?.locale || 'English (US)',
    dashboard: user.settings?.workspace?.dashboard || 'dashboard',
  },
  security: {
    twoFactor: user.settings?.security?.twoFactor ?? false,
    sessionAlerts: user.settings?.security?.sessionAlerts ?? true,
    deviceTracking: user.settings?.security?.deviceTracking ?? true,
  },
  preferences: {
    darkMode: user.settings?.preferences?.darkMode ?? false,
    compactMode: user.settings?.preferences?.compactMode ?? false,
    autoSave: user.settings?.preferences?.autoSave ?? true,
    quietHours: user.settings?.preferences?.quietHours ?? true,
  },
  organization: {
    company_name: user.settings?.organization?.company_name || 'Happen',
    company_domain: user.settings?.organization?.company_domain || 'company.com',
    work_week: user.settings?.organization?.work_week || 'Mon-Fri',
    approval_flow: user.settings?.organization?.approval_flow || 'Manager approval',
    default_timezone: user.settings?.organization?.default_timezone || 'UTC-05:00 (Eastern Time)',
    leave_policy: user.settings?.organization?.leave_policy || 'Standard annual leave policy',
  },
  theme: user.settings?.theme || 'Light',
});

function SettingsPage() {
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const roleColor = ROLE_COLORS[user?.role] || 'var(--orange)';
  const [form, setForm] = useState(buildDefaultForm(user));
  const [savedForm, setSavedForm] = useState(buildDefaultForm(user));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTab, setSelectedTab] = useState('profile');
  const [nameChangeData, setNameChangeData] = useState({ my_request: null, pending_requests: [] });
  const [submittingNameChange, setSubmittingNameChange] = useState(false);
  const [reviewingRequestId, setReviewingRequestId] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data } = await api.get('/me/settings');
        const nextForm = buildDefaultForm({ ...user, settings: data.settings, first_name: data.first_name, last_name: data.last_name, email: data.email });
        setForm(nextForm);
        setSavedForm(nextForm);
      } catch (error) {
        const fallback = buildDefaultForm(user);
        setForm(fallback);
        setSavedForm(fallback);
      } finally {
        setLoading(false);
      }

      try {
        const { data: nameRequests } = await api.get('/me/settings/name-change-requests');
        setNameChangeData(nameRequests);
      } catch (error) {
        console.error('Unable to load name change requests:', error);
      }
    };

    loadSettings();
  }, [user?.id, user?.email]);

  useEffect(() => {
    document.body.classList.toggle('dark-mode', !!form.preferences.darkMode);
    document.body.classList.toggle('compact-mode', !!form.preferences.compactMode);
  }, [form.preferences.darkMode, form.preferences.compactMode]);

  const setNested = (section, key, value) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
  };

  const toggle = (section, key) => {
    setForm((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: !prev[section][key],
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        email: form.profile.email,
        settings: {
          theme: form.preferences.darkMode ? 'Dark' : 'Light',
          notifications: form.notifications,
          workspace: form.workspace,
          security: form.security,
          preferences: form.preferences,
          organization: form.organization,
        },
      };

      const { data } = await api.patch('/me/settings', payload);
      const nextForm = buildDefaultForm({ ...user, ...data, settings: data.settings });
      setForm(nextForm);
      setSavedForm(nextForm);
      updateUser({ ...user, ...data, settings: data.settings });
    } catch (error) {
      const message = error?.response?.data?.error || 'Unable to save settings.';
      window.alert(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(savedForm);
  };

  const handleNameChangeRequest = async () => {
    setSubmittingNameChange(true);
    try {
      const { data } = await api.post('/me/settings/name-change-requests', {
        first_name: form.profile.first_name,
        last_name: form.profile.last_name,
      });
      setNameChangeData((previous) => ({ ...previous, my_request: data.request }));
      window.alert(data.message);
    } catch (error) {
      const message = error?.response?.data?.error || (error?.response?.status === 404
        ? 'Name change approvals are unavailable. Restart the Happen backend and try again.'
        : 'Unable to submit your name change request.');
      window.alert(message);
    } finally {
      setSubmittingNameChange(false);
    }
  };

  const handleNameChangeReview = async (requestId, decision) => {
    setReviewingRequestId(requestId);
    try {
      await api.patch(`/me/settings/name-change-requests/${requestId}/review`, { decision });
      setNameChangeData((previous) => ({
        ...previous,
        pending_requests: previous.pending_requests.filter((request) => request.id !== requestId),
      }));
    } catch (error) {
      window.alert(error?.response?.data?.error || 'Unable to review this name change request.');
    } finally {
      setReviewingRequestId(null);
    }
  };

  const handlePasswordChange = async () => {
    if (!form.password.currentPassword || !form.password.newPassword || !form.password.confirmPassword) {
      window.alert('Please complete all password fields.');
      return;
    }

    if (form.password.newPassword.length < 8) {
      window.alert('New password must be at least 8 characters long.');
      return;
    }

    if (form.password.newPassword !== form.password.confirmPassword) {
      window.alert('New password and confirmation do not match.');
      return;
    }

    try {
      await api.patch('/me/settings', {
        password: {
          currentPassword: form.password.currentPassword,
          newPassword: form.password.newPassword,
        },
      });
      setForm((prev) => ({
        ...prev,
        password: { currentPassword: '', newPassword: '', confirmPassword: '' },
      }));
      window.alert('Password updated successfully.');
    } catch (error) {
      window.alert(error?.response?.data?.error || 'Password update failed.');
    }
  };

  const settingsTabs = [
    { id: 'profile', label: 'Profile' },
    { id: 'password', label: 'Password' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'theme', label: 'Theme / Preferences' },
    ...(user?.role === 'admin' ? [{ id: 'organization', label: 'Admin organization settings' }] : []),
  ];

  const renderTabContent = () => {
    switch (selectedTab) {
      case 'profile':
        return (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'var(--orange-pale)' }}>
                <UserCircle2 size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Profile</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>First name</label>
                <input value={form.profile.first_name} onChange={(e) => setNested('profile', 'first_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Last name</label>
                <input value={form.profile.last_name} onChange={(e) => setNested('profile', 'last_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Email address</label>
                <input value={form.profile.email} onChange={(e) => setNested('profile', 'email', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Role</label>
                <input value={(user?.role || 'employee').replace('_', ' ')} className="w-full px-3 py-2 border rounded-lg bg-gray-50" style={{ borderColor: 'var(--border)' }} readOnly />
              </div>
              <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Name change approval</p>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Changes to your first or last name require manager or HR approval.</p>
                </div>
                {nameChangeData.my_request?.status === 'pending' && (
                  <p className="text-sm font-medium" style={{ color: '#B45309' }}>
                    Pending approval: {nameChangeData.my_request.requested_first_name} {nameChangeData.my_request.requested_last_name}
                  </p>
                )}
                {nameChangeData.my_request?.status === 'rejected' && (
                  <p className="text-sm" style={{ color: '#B91C1C' }}>
                    Your last request for {nameChangeData.my_request.requested_first_name} {nameChangeData.my_request.requested_last_name} was not approved. You can submit a new request.
                  </p>
                )}
                {nameChangeData.my_request?.status === 'approved' && (
                  <p className="text-sm" style={{ color: '#15803D' }}>Your latest name change was approved.</p>
                )}
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleNameChangeRequest}
                  disabled={submittingNameChange || nameChangeData.my_request?.status === 'pending' || (form.profile.first_name === user?.first_name && form.profile.last_name === user?.last_name)}
                >
                  {submittingNameChange ? 'Submitting...' : 'Request name change'}
                </button>
              </div>
              {['manager', 'hr'].includes(user?.role) && (
                <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border)' }}>
                  <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>Name changes awaiting review</p>
                  {nameChangeData.pending_requests.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No requests need review.</p>
                  ) : nameChangeData.pending_requests.map((request) => (
                    <div key={request.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>{request.requester?.first_name} {request.requester?.last_name}</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {request.current_first_name} {request.current_last_name} <span aria-hidden="true">→</span> {request.requested_first_name} {request.requested_last_name}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{request.requester?.email}</p>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" className="btn-primary" onClick={() => handleNameChangeReview(request.id, 'approved')} disabled={reviewingRequestId === request.id}>Approve</button>
                        <button type="button" className="px-3 py-2 rounded-lg border text-sm font-medium" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} onClick={() => handleNameChangeReview(request.id, 'rejected')} disabled={reviewingRequestId === request.id}>Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      case 'password':
        return (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'var(--orange-pale)' }}>
                <Lock size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Password</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Current password</label>
                <input type="password" value={form.password.currentPassword} onChange={(e) => setNested('password', 'currentPassword', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>New password</label>
                <input type="password" value={form.password.newPassword} onChange={(e) => setNested('password', 'newPassword', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Confirm new password</label>
                <input type="password" value={form.password.confirmPassword} onChange={(e) => setNested('password', 'confirmPassword', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <button className="btn-primary" onClick={handlePasswordChange}>Update password</button>
            </div>
          </div>
        );
      case 'notifications':
        return (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'var(--orange-pale)' }}>
                <Bell size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</h3>
            </div>
            <div className="space-y-4">
              {[
                ['email', 'Email alerts'],
                ['push', 'Push notifications'],
                ['leaveUpdates', 'Leave updates'],
                ['weeklyDigest', 'Weekly digest'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <button type="button" onClick={() => toggle('notifications', key)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: form.notifications[key] ? 'var(--orange)' : '#D1D5DB' }} aria-label={label} aria-pressed={!!form.notifications[key]}>
                    <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform" style={{ transform: form.notifications[key] ? 'translateX(22px)' : 'translateX(4px)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'theme':
        return (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'var(--orange-pale)' }}>
                <Moon size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Theme & Preferences</h3>
            </div>
            <div className="space-y-4">
              {[
                ['darkMode', 'Dark mode'],
                ['compactMode', 'Compact layout'],
                ['autoSave', 'Auto-save forms'],
                ['quietHours', 'Quiet hours'],
              ].map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
                  <button type="button" onClick={() => toggle('preferences', key)} className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors" style={{ background: form.preferences[key] ? 'var(--orange)' : '#D1D5DB' }} aria-label={label} aria-pressed={!!form.preferences[key]}>
                    <span className="inline-block h-5 w-5 transform rounded-full bg-white transition-transform" style={{ transform: form.preferences[key] ? 'translateX(22px)' : 'translateX(4px)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      case 'organization':
        return (
          <div className="card space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg" style={{ background: 'var(--orange-pale)' }}>
                <BriefcaseBusiness size={18} style={{ color: 'var(--orange)' }} />
              </div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Admin organization settings</h3>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Company name</label>
                <input value={form.organization.company_name} onChange={(e) => setNested('organization', 'company_name', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Company domain</label>
                <input value={form.organization.company_domain} onChange={(e) => setNested('organization', 'company_domain', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Work week</label>
                <select value={form.organization.work_week} onChange={(e) => setNested('organization', 'work_week', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }}>
                  <option value="Mon-Fri">Mon-Fri</option>
                  <option value="Mon-Sat">Mon-Sat</option>
                  <option value="Tue-Mon">Tue-Mon</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Approval flow</label>
                <select value={form.organization.approval_flow} onChange={(e) => setNested('organization', 'approval_flow', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }}>
                  <option value="Manager approval">Manager approval</option>
                  <option value="Team lead approval">Team lead approval</option>
                  <option value="HR review">HR review</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Default timezone</label>
                <input value={form.organization.default_timezone} onChange={(e) => setNested('organization', 'default_timezone', e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>Leave policy</label>
                <textarea value={form.organization.leave_policy} onChange={(e) => setNested('organization', 'leave_policy', e.target.value)} rows={3} className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2" style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }} />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const initials = `${user?.first_name?.charAt(0) || ''}${user?.last_name?.charAt(0) || ''}`.toUpperCase() || 'JD';

  if (loading) {
    return (
      <div className="card" data-testid="settings-page">
        <p style={{ color: 'var(--text-secondary)' }}>Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div className="card">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ background: roleColor }}>
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.12em] mb-1" style={{ color: 'var(--orange)' }}>Account overview</p>
              <h2 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{user?.first_name || form.profile.first_name} {user?.last_name || form.profile.last_name}</h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{form.profile.email || user?.email} · {user?.role?.replace('_', ' ') || 'employee'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
            <button className="px-4 py-2 rounded-lg font-medium border" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)', background: '#fff' }} onClick={handleCancel}>Cancel</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2 mb-5">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedTab(tab.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
              style={{
                borderColor: selectedTab === tab.id ? 'var(--orange)' : 'var(--border)',
                background: selectedTab === tab.id ? 'var(--orange-pale)' : 'transparent',
                color: selectedTab === tab.id ? 'var(--orange)' : 'var(--text-primary)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderTabContent()}
      </div>
    </div>
  );
}

export default SettingsPage;
