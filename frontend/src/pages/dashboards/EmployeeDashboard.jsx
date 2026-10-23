import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import api from '../../lib/axios';
import { downloadAuthenticatedFile } from '../../utils/downloadAuthenticatedFile';
import { TrendingUp, TrendingDown, Clock, CalendarDays, AlertTriangle, LogIn, LogOut } from 'lucide-react';
import { toast } from 'sonner';

const AGENT_URL = process.env.REACT_APP_AGENT_URL || 'http://localhost:8765';

function ScreenshotReviewItem({ sessionId, file, classification, onCorrect }) {
  const [imageUrl, setImageUrl] = useState(null);
  const [imageStatus, setImageStatus] = useState('loading');
  const [imageAttempt, setImageAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const displayedLabel = classification.corrected_label || classification.label;

  useEffect(() => {
    let active = true;
    let objectUrl;
    api.get(file.url, { responseType: 'blob' })
      .then(({ data }) => {
        objectUrl = URL.createObjectURL(data);
        if (active) {
          setImageUrl(objectUrl);
          setImageStatus('loaded');
        }
      })
      .catch(() => { if (active) setImageStatus('error'); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.url, imageAttempt]);

  const correctLabel = async (label) => {
    setSaving(true);
    try {
      const response = await api.patch(
        `/activity/${sessionId}/screenshots/${encodeURIComponent(file.filename)}/classification`,
        { label },
      );
      onCorrect(response.data);
      toast.success('Screenshot label corrected');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to correct screenshot label');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-w-0 rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
      {imageStatus === 'loaded' ? <img src={imageUrl} alt={`Captured screenshot ${file.filename}`} onError={() => setImageStatus('error')} className="mb-3 h-36 w-full rounded object-contain" style={{ background: '#111827' }} /> : (
        <div className="mb-3 flex h-36 flex-col items-center justify-center gap-2 rounded px-3 text-center text-xs" role={imageStatus === 'error' ? 'alert' : 'status'} style={{ background: 'var(--page-bg)', color: 'var(--text-secondary)' }}>
          {imageStatus === 'loading' ? 'Loading screenshot preview…' : <><span>Screenshot preview unavailable.</span><button type="button" onClick={() => { setImageStatus('loading'); setImageAttempt(value => value + 1); }} className="font-semibold underline">Retry preview</button></>}
        </div>
      )}
      <p className="truncate text-xs font-semibold" title={file.filename}>{file.filename}</p>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
        Suggested: {classification.label === 'work_related' ? 'Likely work-related' : 'Other'} · {Math.round(classification.confidence * 100)}% confidence
      </p>
      {classification.evidence?.map((item) => <p key={item} className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>{item}</p>)}
      {classification.corrected_label && <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--orange)' }}>Your correction: {classification.corrected_label === 'work_related' ? 'Work-related' : 'Other'}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => correctLabel('work_related')} disabled={saving || displayedLabel === 'work_related'} aria-pressed={displayedLabel === 'work_related'} aria-label={`Correct ${file.filename} to work-related`} className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>Work-related</button>
        <button type="button" onClick={() => correctLabel('other')} disabled={saving || displayedLabel === 'other'} aria-pressed={displayedLabel === 'other'} aria-label={`Correct ${file.filename} to other`} className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50" style={{ borderColor: 'var(--border)' }}>Other</button>
      </div>
    </div>
  );
}

function ScreenshotReviewList({ session, onCorrect }) {
  const [open, setOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(12);
  const screenshots = (session.files || []).filter(file => file.kind === 'screenshot').sort((left, right) => right.filename.localeCompare(left.filename));
  if (!screenshots.length) return null;
  const classifications = new Map((session.screenshot_classifications || []).map(item => [item.filename, item]));
  const classifiedScreenshots = screenshots.filter(file => classifications.has(file.filename));

  return (
    <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>
        {open ? 'Hide' : 'Review'} screenshot labels ({screenshots.length})
      </button>
      <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>App labels are suggestions only. Screenshots alone are not proof of productivity.</p>
      {open && (classifiedScreenshots.length ? <>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{classifiedScreenshots.slice(0, visibleCount).map(file => {
        const classification = classifications.get(file.filename);
        return <ScreenshotReviewItem key={file.filename} sessionId={session.id} file={file} classification={classification} onCorrect={onCorrect} />;
        })}</div>
        {visibleCount < classifiedScreenshots.length && <button type="button" onClick={() => setVisibleCount(count => count + 12)} className="mt-3 rounded border px-3 py-2 text-sm font-semibold" style={{ borderColor: 'var(--border)' }}>Show next screenshots ({classifiedScreenshots.length - visibleCount} remaining)</button>}
      </> : <p className="mt-3 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>No screenshot labels are available for this session.</p>)}
    </div>
  );
}

function EmployeeDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [balance, setBalance] = useState(null);
  const [workload, setWorkload] = useState(null);
  const [queuePos, setQueuePos] = useState(null);
  const [activity, setActivity] = useState([]);
  const [teamLeaves, setTeamLeaves] = useState([]);
  const [managerLeaves, setManagerLeaves] = useState([]);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [emergencyLoading, setEmergencyLoading] = useState(false);

  // Activity / attendance tracking state
  const [tracking, setTracking] = useState({ status: 'idle', loading: false, agentOnline: null, current: null, history: [] });
  const [trackingHistoryStatus, setTrackingHistoryStatus] = useState('loading');

  const handleEmergencyLeave = async () => {
    setEmergencyLoading(true);
    try {
      await api.post('/leave-requests', { type: 'emergency' });
      toast.success('Emergency leave granted. HR and your manager have been notified.');
      setShowEmergencyConfirm(false);
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to submit emergency leave');
    } finally {
      setEmergencyLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, [user?.id]);

  const fetchAll = async () => {
    try {
      const [balRes, qRes, actRes] = await Promise.all([
        api.get('/me/leave-balance'),
        api.get('/me/queue-position'),
        api.get('/me/activity'),
      ]);
      setBalance(balRes.data);
      setQueuePos(qRes.data);
      setActivity(actRes.data);

      if (user?.team_id) {
        const [wlRes, calRes] = await Promise.all([
          api.get(`/teams/${user.team_id?._id || user.team_id}/workload`),
          api.get(`/teams/${user.team_id?._id || user.team_id}/calendar`),
        ]);
        setWorkload(wlRes.data);
        setTeamLeaves(calRes.data.slice(0, 5));
      }

      const mgRes = await api.get('/manager-leave');
      const today = new Date().toISOString().split('T')[0];
      setManagerLeaves(mgRes.data.filter(l => l.end_date >= today).slice(0, 3));
    } catch (e) {
      console.error(e);
    }
  };

  const pct = workload?.workload_current ?? 0;
  const gaugeColor = pct >= 80 ? '#EF4444' : pct >= 50 ? '#F59E0B' : '#22C55E';
  const conicBg = `conic-gradient(${gaugeColor} ${pct * 3.6}deg, #E5E7EB ${pct * 3.6}deg)`;

  // ---- Attendance / activity tracking ----
  const loadTracking = async () => {
    try {
      const res = await api.get('/activity/me');
      setTracking(t => ({ ...t, current: res.data.current, history: res.data.history }));
      setTrackingHistoryStatus('loaded');
    } catch {
      setTrackingHistoryStatus('error');
    }
  };

  useEffect(() => { loadTracking(); }, []);

  useEffect(() => {
    if (tracking.current) {
      const t = setInterval(loadTracking, 15000);
      return () => clearInterval(t);
    }
  }, [tracking.current]);

  const checkAgent = async () => {
    try {
      const res = await fetch(`${AGENT_URL}/health`, { method: 'GET' });
      return res.ok;
    } catch { return false; }
  };

  const handleCheckIn = async () => {
    setTracking(t => ({ ...t, loading: true }));
    try {
      // 1. Create/open a session on the backend
      const { data } = await api.post('/activity/check-in');
      const sessionId = data.id || data._id;
      const token = localStorage.getItem('happen_token');

      // 2. Ask the local agent to start tracking
      const agentOk = await checkAgent();
      setTracking(t => ({ ...t, agentOnline: agentOk }));
      if (!agentOk) {
        toast.error('Companion agent not running. Please start tracker/agent.py on this computer.');
        setTracking(t => ({ ...t, loading: false }));
        return;
      }

      const agentRes = await fetch(`${AGENT_URL}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, token, backendUrl: process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000' }),
      });
      const agentData = await agentRes.json().catch(() => ({}));
      if (!agentRes.ok) {
        toast.error(agentData.error || 'Failed to start tracking locally');
        setTracking(t => ({ ...t, loading: false }));
        return;
      }

      setTracking(t => ({ ...t, current: data, loading: false }));
      toast.success(`Tracking started (${agentData.sessionName || ''})`);
      loadTracking();
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to check in');
      setTracking(t => ({ ...t, loading: false }));
    }
  };

  const handleCheckOut = async () => {
    setTracking(t => ({ ...t, loading: true }));
    try {
      const agentOk = await checkAgent();
      setTracking(t => ({ ...t, agentOnline: agentOk }));

      let upload = null;
      if (agentOk) {
        const agentRes = await fetch(`${AGENT_URL}/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const agentData = await agentRes.json().catch(() => ({}));
        if (!agentRes.ok) {
          toast.error(agentData.error || 'Failed to stop tracking locally');
          setTracking(t => ({ ...t, loading: false }));
          return;
        }
        upload = agentData.upload;
      }

      // Refresh — the agent already uploaded the report to the backend
      await loadTracking();
      toast.success(upload?.ok ? 'Checked out. Report uploaded.' : 'Checked out.');
    } catch (e) {
      toast.error('Failed to check out');
    } finally {
      setTracking(t => ({ ...t, loading: false }));
    }
  };

  const activityIcons = { 'login': '🔑', 'leave_request.created': '📋', 'leave_request.approved': '✅', 'leave_request.denied': '❌', 'password.reset': '🔒' };

  return (
    <div className="space-y-5">
      {/* Check In / Check Out */}
      <div className="card border-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4" style={{ borderColor: tracking.current ? '#22C55E' : 'var(--border)' }}>
        <div>
          <p className="font-bold text-lg flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
            <Clock size={20} style={{ color: tracking.current ? '#22C55E' : 'var(--orange)' }} />
            {tracking.current ? 'Active Tracking Session' : 'Work Session'}
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {tracking.current
              ? `Checked in at ${new Date(tracking.current.check_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
              : 'Check in to start tracking your work activity.'}
          </p>
          {tracking.agentOnline === false && (
            <p className="text-xs mt-1 font-medium" style={{ color: 'var(--danger)' }}>
              Companion agent is not running. Install & start tracker/agent.py to enable tracking.
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {tracking.current ? (
            <button
              onClick={handleCheckOut}
              disabled={tracking.loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white disabled:opacity-50"
              style={{ background: '#EF4444' }}
            >
              <LogOut size={18} />
              {tracking.loading ? 'Checking out…' : 'Check Out'}
            </button>
          ) : (
            <button
              onClick={handleCheckIn}
              disabled={tracking.loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-white disabled:opacity-50"
              style={{ background: 'var(--orange)' }}
            >
              <LogIn size={18} />
              {tracking.loading ? 'Checking in…' : 'Check In'}
            </button>
          )}
        </div>
      </div>

      <details className="rounded-lg border px-4 py-3" style={{ borderColor: 'var(--border)' }}>
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Activity tracking: collected data and retention</summary>
        <div className="mt-3 space-y-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
          <p>While you are checked in, the companion app captures a screenshot every 30 seconds, the foreground app/process and window title, available browser tab titles and URLs, and keyboard/mouse activity counts with active/idle timing. It does not save the characters you type.</p>
          <p>You can review your sessions and correct screenshot app labels. Your team lead can access activity reports only for your team; managers, HR, and admins can access organization-wide reports.</p>
          <p>Session details, screenshots, and uploaded reports are automatically deleted after 30 days. Screenshot labels are suggestions and screenshots alone are never proof of productivity.</p>
        </div>
      </details>

      {/* Recent tracking sessions */}
      <div className="card">
          <h3 className="font-bold text-lg mb-3" style={{ color: 'var(--text-primary)' }}>Recent Work Sessions</h3>
          {trackingHistoryStatus === 'loading' && <p className="py-5 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>Loading your sessions…</p>}
          {trackingHistoryStatus === 'error' && <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" role="alert"><p className="text-sm" style={{ color: 'var(--danger)' }}>Could not load your activity sessions.</p><button type="button" onClick={loadTracking} className="self-start rounded border px-3 py-2 text-sm font-semibold sm:self-auto" style={{ borderColor: 'var(--border)' }}>Retry</button></div>}
          {trackingHistoryStatus === 'loaded' && tracking.history.length === 0 && <p className="py-5 text-sm" role="status" style={{ color: 'var(--text-secondary)' }}>No completed sessions yet. Start a work session when you are ready.</p>}
          {trackingHistoryStatus === 'loaded' && tracking.history.length > 0 && (
          <div className="space-y-2">
            {tracking.history.slice(0, 5).map(s => {
              const report = s.files?.find(f => f.kind === 'report');
              return (
                <div key={s.id} className="rounded-xl p-3" style={{ background: 'var(--page-bg)' }}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {new Date(s.check_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
                        {new Date(s.check_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        {' → '}
                        {s.check_out_at ? new Date(s.check_out_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {(s.summary?.total_active_time || 0) / 60 > 0 ? `${((s.summary.total_active_time || 0) / 60).toFixed(1)} min active` : ''}
                        {s.summary?.productivity_score != null ? ` · Productivity ${s.summary.productivity_score}/100` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#F0FDF4', color: '#22C55E' }}>Completed</span>
                      {report && (
                        <button type="button" onClick={() => downloadAuthenticatedFile(report.url, report.filename).catch(() => toast.error('Unable to download activity report'))} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--orange)' }}>
                          Report
                        </button>
                      )}
                    </div>
                  </div>
                  <ScreenshotReviewList
                    session={s}
                    onCorrect={(corrected) => setTracking(current => ({
                      ...current,
                      history: current.history.map(item => item.id !== s.id ? item : {
                        ...item,
                        screenshot_classifications: item.screenshot_classifications.map(classification => classification.filename === corrected.filename ? corrected : classification),
                      }),
                    }))}
                  />
                </div>
              );
            })}
          </div>
          )}
      </div>

      {/* Manager/HR leave banners */}
      {managerLeaves.map(l => (
        <div key={l.id} className="card border-l-4 flex items-center gap-4 py-3" style={{ borderLeftColor: '#8B5CF6', background: '#F5F3FF' }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: '#8B5CF6' }}>
            {l.first_name?.charAt(0)}{l.last_name?.charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: '#4C1D95' }}>
              {l.role === 'hr' ? 'HR' : 'Manager'} Leave Notice
            </p>
            <p className="text-sm" style={{ color: '#6D28D9' }}>
              <b>{l.first_name} {l.last_name}</b> on leave {new Date(l.start_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})} – {new Date(l.end_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
            </p>
          </div>
        </div>
      ))}

      {/* Queue banner */}
      {queuePos?.position && (
        <div className="card border-l-4 flex items-center justify-between py-3" style={{ borderLeftColor: 'var(--orange)', background: 'var(--orange-pale)' }}>
          <div className="flex items-center gap-3">
            <Clock size={22} style={{ color: 'var(--orange)' }} />
            <div>
              <p className="font-semibold">You're #{queuePos.position} in the leave queue</p>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Est. approval: {new Date(queuePos.estimated_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/leave/queue')} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--orange)' }}>
            View Queue
          </button>
        </div>
      )}

      {/* 3-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT — Leave Balances */}
        <div className="card space-y-4">
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Leave Balances</h3>

          {balance ? (
            <>
              {[
                { label: 'Annual', value: balance.annual, total: 20, color: 'var(--orange)' },
                { label: 'Sick', value: balance.sick, total: 10, color: 'var(--success)' },
                { label: 'Wellness', value: 2 - (balance.wellness_used ?? 0), total: 2, color: '#8B5CF6' },
                { label: 'Emergency', value: 3 - (balance.emergency_used ?? 0), total: 3, color: '#DC2626' },
              ].map(({ label, value, total, color }) => (
                <div key={label}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="font-bold" style={{ color }}>{value} <span className="text-xs font-normal text-gray-400">/ {total} days</span></span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all duration-500" style={{ background: color, width: `${Math.max(0,(value/total)*100)}%` }} />
                  </div>
                </div>
              ))}

              <div className="pt-2 space-y-2">
                <button onClick={() => navigate('/leave/request')} className="w-full py-2.5 rounded-lg font-semibold text-white text-sm hover:-translate-y-0.5 transition-all" style={{ background: 'var(--orange)' }}>
                  Request Leave
                </button>
                <button
                  onClick={() => setShowEmergencyConfirm(true)}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm text-white hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                  style={{ background: '#DC2626' }}
                >
                  <AlertTriangle size={16} />
                  Emergency Leave
                </button>
                <button onClick={() => navigate('/calendar')} className="w-full py-2.5 rounded-lg font-semibold text-sm border-2 hover:-translate-y-0.5 transition-all" style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}>
                  My Calendar
                </button>
              </div>

              {/* Emergency Confirmation Modal */}
              {showEmergencyConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={() => setShowEmergencyConfirm(false)}>
                  <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl" onClick={e => e.stopPropagation()}>
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#FEF2F2' }}>
                      <AlertTriangle size={32} style={{ color: '#DC2626' }} />
                    </div>
                    <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Emergency Leave</h3>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
                      This will immediately notify your <strong>HR team</strong> and <strong>manager</strong>. No dates or description needed. Proof may be required within 24 hours.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setShowEmergencyConfirm(false)}
                        className="flex-1 py-3 rounded-lg font-semibold border-2"
                        style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleEmergencyLeave}
                        disabled={emergencyLoading}
                        className="flex-1 py-3 rounded-lg font-semibold text-white disabled:opacity-50"
                        style={{ background: '#DC2626' }}
                      >
                        {emergencyLoading ? 'Sending…' : 'Confirm'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="shimmer h-8 rounded" />)}</div>
          )}
        </div>

        {/* MIDDLE — Team Workload */}
        <div className="card space-y-4">
          <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>Team Workload</h3>

          {workload ? (
            <>
              <div className="relative w-40 h-40 mx-auto">
                <div className="w-full h-full rounded-full" style={{ background: conicBg }}>
                  <div className="absolute inset-3 bg-white rounded-full flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold" style={{ color: gaugeColor }}>{pct}%</span>
                    <div className="flex items-center gap-1 mt-1">
                      {pct > 50 ? <TrendingUp size={14} style={{ color: '#EF4444' }} /> : <TrendingDown size={14} style={{ color: '#22C55E' }} />}
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {pct >= 80 ? 'High' : pct >= 50 ? 'Medium' : 'Low'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>On Leave This Month</p>
                {workload.upcoming_deadlines?.length > 0 ? (
                  workload.upcoming_deadlines.map((d, i) => (
                    <div key={i} className="flex justify-between items-center py-1.5 border-b last:border-0 text-sm" style={{ borderColor: 'var(--border)' }}>
                      <span>{d.first_name} {d.last_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--orange-pale)', color: 'var(--orange)' }}>
                        {new Date(d.start_date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-center py-4" style={{ color: 'var(--text-secondary)' }}>No upcoming leaves</p>
                )}
              </div>
            </>
          ) : (
            <div className="shimmer h-48 rounded" />
          )}
        </div>

        {/* RIGHT — Team Members */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>My Team</h3>
            <button onClick={() => navigate('/team')} className="text-xs font-semibold" style={{ color: 'var(--orange)' }}>
              View All →
            </button>
          </div>

          {teamLeaves.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>On Leave Now</p>
              {teamLeaves.slice(0, 4).map((l, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--orange-pale)' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'var(--orange)' }}>
                    {l.first_name?.charAt(0)}{l.last_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{l.first_name} {l.last_name}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>{l.type} leave</p>
                  </div>
                  {l.end_date && (
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      until {new Date(l.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-lg" style={{ background: '#F0FDF4' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
              <p className="text-sm font-medium" style={{ color: '#22C55E' }}>Everyone's in today</p>
            </div>
          )}

          {/* Quick team navigation */}
          <div className="pt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => navigate('/team')} className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-all hover:-translate-y-0.5" style={{ background: 'var(--orange)' }}>
              View My Team
            </button>
            <button onClick={() => navigate('/calendar')} className="w-full py-2 rounded-lg text-sm font-semibold border-2 transition-all hover:-translate-y-0.5" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              Team Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h3 className="font-bold text-lg mb-4" style={{ color: 'var(--text-primary)' }}>Recent Activity</h3>
        {activity.length > 0 ? (
          <div className="space-y-3">
            {activity.slice(0,5).map((item, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="relative flex-shrink-0">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-base" style={{ background: 'var(--orange-pale)' }}>
                    {activityIcons[item.action] || '📌'}
                  </div>
                  {i < 4 && <div className="absolute left-1/2 -translate-x-1/2 top-8 w-0.5 h-6" style={{ background: 'var(--border)' }} />}
                </div>
                <div className="flex-1 pb-3">
                  <p className="text-sm font-medium capitalize" style={{ color: 'var(--text-primary)' }}>
                    {item.action?.replace(/_/g,' ').replace(/\./g,' — ')}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{item.details}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {new Date(item.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No recent activity</p>
        )}
      </div>
    </div>
  );
}

export default EmployeeDashboard;
