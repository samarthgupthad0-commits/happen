import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { toast } from 'sonner';
import { Clock, CheckCircle, Users, Info } from 'lucide-react';

function LeavesQueuePage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [queue, setQueue] = useState([]);
  const [myPosition, setMyPosition] = useState(null);
  const [loading, setLoading] = useState(true);
  const [grantingRequestId, setGrantingRequestId] = useState(null);
  const [grantReasons, setGrantReasons] = useState({});

  const canGrant = ['manager', 'hr'].includes(user?.role);
  const showMyPosition = ['employee', 'team_lead', 'accounting'].includes(user?.role);

  const fetchQueue = useCallback(async () => {
    try {
      setLoading(true);

      const calls = [api.get('/queue')];
      if (showMyPosition) calls.push(api.get('/me/queue-position'));

      const results = await Promise.allSettled(calls);

      if (results[0].status === 'fulfilled') {
        setQueue(results[0].value.data || []);
      } else {
        console.error('Queue fetch failed:', results[0].reason);
        setQueue([]);
      }

      if (showMyPosition && results[1]?.status === 'fulfilled') {
        setMyPosition(results[1].value.data);
      }
    } catch (e) {
      console.error('fetchQueue error:', e);
    } finally {
      setLoading(false);
    }
  }, [showMyPosition]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleGrantSelected = async (request) => {
    const requestId = request._id || request.id;
    const reason = grantReasons[requestId]?.trim();
    if (!reason) {
      toast.error('Enter a reason before granting this leave.');
      return;
    }

    setGrantingRequestId(requestId);
    try {
      const res = await api.post(`/queue/${requestId}/grant`, { reason });
      toast.success(res.data.message);
      fetchQueue();
    } catch (err) {
      const data = err.response?.data;
      toast.error(data?.error || 'Failed to grant leave');
    } finally {
      setGrantingRequestId(null);
    }
  };

  const typeColor = (type) => ({
    annual: 'var(--orange)', sick: 'var(--success)',
    wellness: '#8B5CF6', emergency: '#DC2626',
  }[type] || '#6B7280');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Leave Queue</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Review queued leave requests and their current position
          </p>
        </div>
        {showMyPosition && (
          <button
            onClick={() => navigate('/leave/request')}
            className="px-4 py-2 rounded-lg font-medium text-white transition-all hover:-translate-y-0.5"
            style={{ background: 'var(--orange)' }}
          >
            + New Request
          </button>
        )}
      </div>

      {/* ── Manager / HR grant instructions ── */}
      {canGrant && (
        <div className="card flex items-start gap-3" style={{ background: 'var(--orange-pale)', borderLeft: '4px solid var(--orange)' }}>
          <Info size={18} style={{ color: 'var(--orange)', flexShrink: 0, marginTop: 2 }} />
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            You can grant leave to any person in the queue. Enter a reason on that person’s request before granting it.
          </p>
        </div>
      )}

      {/* ── My position banner (non-manager/HR) ── */}
      {showMyPosition && (
        myPosition?.position ? (
          <div
            className="card border-l-4 flex items-center justify-between gap-4"
            style={{ borderLeftColor: 'var(--orange)', background: 'var(--orange-pale)' }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
                style={{ background: 'var(--orange)' }}
              >
                #{myPosition.position}
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--text-primary)' }}>
                  You're #{myPosition.position} in the queue
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Est. approval:{' '}
                  <span className="font-semibold">
                    {new Date(myPosition.estimated_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate('/leave')}
              className="px-4 py-2 rounded-lg font-medium border-2 transition-all hover:-translate-y-0.5 flex-shrink-0"
              style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
            >
              My Requests
            </button>
          </div>
        ) : (
          <div className="card flex items-center gap-3" style={{ background: '#F0FDF4', borderLeft: '4px solid var(--success)' }}>
            <CheckCircle size={24} style={{ color: 'var(--success)' }} />
            <p className="font-medium" style={{ color: 'var(--success)' }}>
              You have no pending requests in the queue.
            </p>
          </div>
        )
      )}

      {/* ── Info note ── */}
      <div className="card flex items-start gap-3" style={{ background: '#EFF6FF', borderLeft: '4px solid #3B82F6' }}>
        <Info size={18} style={{ color: '#3B82F6', flexShrink: 0, marginTop: 2 }} />
        <p className="text-sm" style={{ color: '#1E40AF' }}>
          Requests are ordered by queue position. Managers and HR may grant a specific request with a reason. Requests auto-approve when team workload drops below 50%; emergency leaves bypass the queue.
        </p>
      </div>

      {/* ── Queue list ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
            All Queued Requests
          </h3>
          <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
            <Users size={16} />
            <span>{queue.length} request{queue.length !== 1 ? 's' : ''} waiting</span>
          </div>
        </div>

        {queue.length === 0 ? (
          <div className="text-center py-16">
            <Clock size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-semibold text-lg" style={{ color: 'var(--text-secondary)' }}>Queue is empty</p>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>All requests have been processed</p>
          </div>
        ) : (
          <div className="space-y-3">
            {queue.map((req, idx) => {
              const myId = user?._id || user?.id;
              const reqUserId = req.user_id?.toString();
              const isMe = myId && reqUserId && reqUserId === myId.toString();
              const pos = idx + 1;

              return (
                <div
                  key={req._id || req.id || idx}
                  className="flex flex-wrap items-center gap-4 p-4 rounded-xl border transition-all hover:shadow-md"
                  style={{
                    borderColor: isMe ? '#8B5CF6' : 'var(--border)',
                    background: isMe ? '#F5F3FF' : 'white',
                  }}
                >
                  {/* Position badge */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg flex-shrink-0"
                    style={{
                      background: '#F3F4F6',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {pos}
                  </div>

                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                    style={{ background: '#6B7280' }}
                  >
                    {req.first_name?.charAt(0)}{req.last_name?.charAt(0)}
                  </div>

                  {/* Name + dates */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{req.first_name} {req.last_name}</span>
                      {isMe && (
                        <span className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ background: '#8B5CF6' }}>
                          You
                        </span>
                      )}
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold text-white capitalize"
                        style={{ background: typeColor(req.type) }}
                      >
                        {req.type}
                      </span>
                    </div>
                    <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                      {req.start_date
                        ? new Date(req.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                      {req.end_date && req.end_date !== req.start_date
                        ? ` – ${new Date(req.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                        : ''}
                      {req.days_count ? ` · ${req.days_count} day${req.days_count !== 1 ? 's' : ''}` : ''}
                    </p>
                    {req.reason && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Request reason: {req.reason}</p>}
                  </div>

                  {/* Submitted */}
                  <div className="text-right text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    <p>Submitted</p>
                    <p className="font-semibold">
                      {new Date(req.createdAt || req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>

                  <div className="text-xs flex-shrink-0" style={{ color: 'var(--text-secondary)' }}>
                    Queue position {pos}
                  </div>

                  {canGrant && (
                    <div className="w-full border-t pt-3 flex flex-col sm:flex-row gap-3" style={{ borderColor: 'var(--border)' }}>
                      <textarea
                        value={grantReasons[req._id || req.id] || ''}
                        onChange={(event) => setGrantReasons((previous) => ({ ...previous, [req._id || req.id]: event.target.value }))}
                        rows={2}
                        maxLength={500}
                        placeholder={`Reason for granting leave to ${req.first_name || 'this employee'} (required)`}
                        aria-label={`Reason for granting leave to ${req.first_name || 'this employee'}`}
                        className="w-full sm:flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2"
                        style={{ borderColor: 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
                      />
                      <button
                        type="button"
                        onClick={() => handleGrantSelected(req)}
                        disabled={grantingRequestId === (req._id || req.id) || !grantReasons[req._id || req.id]?.trim()}
                        className="px-4 py-2 rounded-lg font-semibold text-white self-stretch sm:self-center disabled:opacity-50 disabled:cursor-not-allowed"
                        style={{ background: 'var(--orange)' }}
                      >
                        {grantingRequestId === (req._id || req.id) ? 'Granting...' : 'Grant this leave'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default LeavesQueuePage;
