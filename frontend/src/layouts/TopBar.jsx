import { useState, useEffect, useRef } from 'react';
import { Bell, Search, ChevronDown, LogOut, Settings, Users } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import api from '../lib/axios';

const ROLE_COLORS = {
  admin: '#7C3AED', manager: '#F59E0B', hr: '#EC4899',
  team_lead: '#0EA5E9', accounting: '#22C55E', employee: '#F4631E',
};
const ROLE_LABELS = {
  admin: 'Admin', manager: 'Manager', hr: 'HR',
  team_lead: 'Team Lead', accounting: 'Accounting', employee: 'Employee',
};
const ROLE_ORDER = ['admin', 'manager', 'hr', 'team_lead', 'accounting', 'employee'];

function TopBar({ title }) {
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchUsers, setSwitchUsers] = useState([]);
  const [switchUsersStatus, setSwitchUsersStatus] = useState('idle');
  const [switchUsersError, setSwitchUsersError] = useState('');
  const [endingImpersonation, setEndingImpersonation] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationStatus, setNotificationStatus] = useState('loading');
  const [notificationError, setNotificationError] = useState('');
  const [showNotifs, setShowNotifs] = useState(false);
  const dropRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    fetchNotifications(true);
    const interval = window.setInterval(() => fetchNotifications(false), 30000);
    return () => window.clearInterval(interval);
  }, [user?.id]);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setShowDropdown(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!showDropdown || user?.role !== 'admin') return;
    let active = true;
    setSwitchUsersStatus('loading');
    setSwitchUsersError('');
    api.get('/admin/users')
      .then(({ data }) => {
        if (active) {
          setSwitchUsers(data.filter(member => member.is_active !== false));
          setSwitchUsersStatus('loaded');
        }
      })
      .catch(() => {
        if (active) {
          setSwitchUsersError('Unable to load members');
          setSwitchUsersStatus('error');
        }
      });
    return () => { active = false; };
  }, [showDropdown, user?.role]);

  const fetchNotifications = async (showLoading = false) => {
    if (showLoading) setNotificationStatus('loading');
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
      setNotificationError('');
      setNotificationStatus('loaded');
    } catch {
      setNotificationError('Could not load notifications.');
      setNotificationStatus('error');
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleSwitchUser = async (targetUser) => {
    setSwitching(true);
    setShowDropdown(false);
    try {
      const { data } = await api.post('/admin/impersonate', { target_user_id: targetUser._id });
      login(data.user, data.token);
      // Force full navigation to dashboard to reset all component state
      window.location.href = '/dashboard';
    } catch (e) {
      console.error('Switch failed', e);
      setSwitching(false);
    }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch { /* silent */ }
    logout();
    navigate('/login');
  };

  const handleStopImpersonating = async () => {
    setEndingImpersonation(true);
    try {
      const { data } = await api.post('/admin/impersonate/stop');
      login(data.user, data.token);
      window.location.href = '/admin';
    } catch (error) {
      console.error('Unable to stop impersonation:', error);
      setEndingImpersonation(false);
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(current => current.map(n => ({ ...n, is_read: true })));
      setNotificationError('');
    } catch {
      setNotificationError('Unable to mark notifications as read. Try again.');
    }
  };

  const getInitials = (u) => u
    ? `${u.first_name?.charAt(0) || ''}${u.last_name?.charAt(0) || ''}`.toUpperCase()
    : 'U';

  const switchUserGroups = ROLE_ORDER.map(role => ({
    role,
    label: ROLE_LABELS[role],
    color: ROLE_COLORS[role],
    users: switchUsers.filter(member => member.role === role && (role !== 'admin' || member._id === user?.id || member._id === user?._id)),
  })).filter(group => group.users.length > 0);

  const roleColor = ROLE_COLORS[user?.role] || 'var(--orange)';

  return (
    <header
      className="sticky top-0 h-16 bg-white border-b flex items-center justify-between gap-2 px-3 sm:px-6 z-40"
      style={{ borderColor: 'var(--border)' }}
    >
      <h1 className="min-w-0 truncate text-lg font-semibold sm:text-xl" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h1>

      <div className="flex items-center gap-3">
        {user?.impersonated_by && (
          <button
            type="button"
            onClick={handleStopImpersonating}
            disabled={endingImpersonation}
            className="rounded border px-3 py-2 text-sm font-semibold disabled:opacity-50"
            style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
          >
            {endingImpersonation ? 'Returning...' : 'Stop impersonating'}
          </button>
        )}
        {/* Search */}
        <div className="relative hidden md:block">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="pl-9 pr-4 py-2 rounded-lg bg-gray-100 text-sm border-0 focus:outline-none focus:ring-2 w-52"
            style={{ '--tw-ring-color': 'var(--orange)' }}
          />
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={showNotifs}
            aria-controls="notifications-menu"
          >
            <Bell size={20} style={{ color: 'var(--text-secondary)' }} />
            {unreadCount > 0 && (
              <span
                className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold"
                style={{ background: 'var(--orange)' }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {showNotifs && (
            <div id="notifications-menu" role="region" aria-label="Notifications" className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] bg-white rounded-xl shadow-xl border overflow-hidden z-50 animate-fadeIn" style={{ borderColor: 'var(--border)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <span className="font-semibold text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <button type="button" onClick={markAllRead} className="text-xs" style={{ color: 'var(--orange)' }}>
                    Mark all read
                  </button>
                )}
              </div>
              {notificationError && <p className="px-4 py-2 text-xs" role="alert" style={{ color: 'var(--danger)' }}>{notificationError}</p>}
              <div className="max-h-72 overflow-y-auto">
                {notificationStatus === 'loading' ? (
                  <p className="text-center py-8 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>Loading notifications…</p>
                ) : notificationStatus === 'error' ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Notifications are unavailable.</p>
                    <button type="button" onClick={() => fetchNotifications(true)} className="rounded border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: 'var(--border)' }}>Retry</button>
                  </div>
                ) : notifications.length === 0 ? (
                  <p className="text-center py-8 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>No notifications</p>
                ) : notifications.map(n => (
                  <button
                    type="button"
                    key={n.id}
                    className="block w-full px-4 py-3 border-b text-left hover:bg-gray-50 transition-colors"
                    aria-label={`${n.title}${n.is_read ? '' : ', unread'}`}
                    style={{
                      borderColor: 'var(--border)',
                      background: n.is_read ? 'white' : 'var(--orange-pale)',
                    }}
                    onClick={async () => {
                      // Mark read
                      if (!n.is_read) {
                        try {
                          await api.patch(`/notifications/${n.id}/read`);
                          setNotificationError('');
                        } catch {
                          setNotificationError('Unable to mark this notification as read. Try again.');
                          return;
                        }
                        setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                      }
                      // Navigate if link exists
                      if (n.link) {
                        setShowNotifs(false);
                        navigate(n.link);
                      }
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
                        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                          {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {n.link && (
                        <span className="text-xs mt-1 flex-shrink-0 font-semibold" style={{ color: 'var(--orange)' }}>
                          View →
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Switcher Dropdown */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 hover:bg-gray-100 rounded-xl px-3 py-2 transition-colors"
            disabled={switching}
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0"
              style={{ background: roleColor }}
            >
              {switching ? '…' : getInitials(user)}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
                {user?.first_name} {user?.last_name}
              </p>
              <p className="text-xs capitalize leading-tight" style={{ color: roleColor }}>
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
            <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} />
          </button>

          {showDropdown && (
            <div
              className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border overflow-hidden z-50 animate-fadeIn"
              style={{ borderColor: 'var(--border)' }}
            >
              {/* Current user header */}
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--page-bg)' }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: roleColor }}
                  >
                    {getInitials(user)}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{user?.first_name} {user?.last_name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{user?.email}</p>
                  </div>
                </div>
              </div>

              {/* Switch user section */}
              <div className="px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <Users size={13} style={{ color: 'var(--text-secondary)' }} />
                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Switch Demo User
                  </span>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {user?.role !== 'admin' ? (
                    <p className="px-2 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>Available to admins only</p>
                  ) : switchUsersStatus === 'loading' ? (
                    <p className="px-2 py-3 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>Loading members...</p>
                  ) : switchUsersError ? (
                    <p className="px-2 py-3 text-sm" role="alert" style={{ color: 'var(--danger)' }}>{switchUsersError}</p>
                  ) : switchUserGroups.length === 0 ? (
                    <p className="px-2 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>No members found</p>
                  ) : switchUserGroups.map(group => (
                    <div key={group.role}>
                      <p
                        className="text-xs font-bold px-2 py-1 rounded uppercase tracking-wide"
                        style={{ color: group.color, background: `${group.color}15` }}
                      >
                        {group.label}
                      </p>
                      {group.users.map(member => {
                        const isCurrent = member.email === user?.email;
                        const memberName = `${member.first_name} ${member.last_name}`.trim();
                        const memberTeam = typeof member.team_id === 'object' ? member.team_id?.name : '';
                        const canSwitch = !isCurrent && member.role !== 'admin';
                        return (
                          <button
                            key={member._id}
                            onClick={() => canSwitch && handleSwitchUser(member)}
                            disabled={!canSwitch || switching}
                            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-all duration-150 disabled:cursor-default"
                            style={{
                              background: isCurrent ? `${group.color}20` : 'transparent',
                            }}
                            onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = `${group.color}10`; }}
                            onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
                          >
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                              style={{ background: group.color }}
                            >
                              {getInitials(member)}
                            </div>
                            <span className="text-sm font-medium flex-1" style={{ color: 'var(--text-primary)' }}>
                              {memberName}
                              {memberTeam && <span className="text-xs ml-1" style={{ color: 'var(--text-secondary)' }}>· {memberTeam}</span>}
                            </span>
                            {isCurrent && (
                              <span className="text-xs px-1.5 py-0.5 rounded font-semibold text-white" style={{ background: group.color }}>
                                active
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="p-2">
                <button
                  onClick={() => { setShowDropdown(false); navigate('/settings'); }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors text-sm"
                >
                  <Settings size={16} style={{ color: 'var(--text-secondary)' }} />
                  <span>Settings</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors text-sm text-red-600"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default TopBar;
