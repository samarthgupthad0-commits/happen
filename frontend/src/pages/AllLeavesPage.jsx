import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { toast } from 'sonner';
import { formatApiErrorDetail } from '../utils/formatError';
import { Calendar, User, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

function AllLeavesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, pending, queued, approved, denied, emergency
  const [selectedLeave, setSelectedLeave] = useState(null);

  useEffect(() => {
    fetchAllLeaves();
  }, []);

  const fetchAllLeaves = async () => {
    try {
      setLoading(true);
      const res = await api.get('/leave-requests/all');
      setLeaves(res.data);
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || 'Failed to fetch leaves');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (leaveId) => {
    try {
      await api.patch(`/leave-requests/${leaveId}/approve`);
      toast.success('Leave request approved');
      fetchAllLeaves();
      setSelectedLeave(null);
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || 'Failed to approve');
    }
  };

  const handleDeny = async (leaveId, reason) => {
    try {
      await api.patch(`/leave-requests/${leaveId}/deny`, { reason });
      toast.success('Leave request denied');
      fetchAllLeaves();
      setSelectedLeave(null);
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || 'Failed to deny');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved':
        return 'var(--success)';
      case 'pending':
        return 'var(--warning)';
      case 'queued':
        return 'var(--orange)';
      case 'denied':
        return 'var(--danger)';
      case 'emergency':
        return '#DC2626';
      default:
        return 'var(--text-secondary)';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={16} />;
      case 'denied':
        return <XCircle size={16} />;
      case 'queued':
        return <Clock size={16} />;
      case 'emergency':
        return <AlertCircle size={16} />;
      default:
        return <Clock size={16} />;
    }
  };

  const filteredLeaves = leaves.filter((leave) => {
    if (filter === 'all') return true;
    return leave.status === filter;
  });

  const canManage = ['team_lead', 'manager', 'hr', 'admin'].includes(user?.role);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="all-leaves-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            All Leave Requests
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            View and manage all leave requests across the organization
          </p>
        </div>
        <button
          onClick={() => navigate('/leave/request')}
          className="px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
          style={{ background: 'var(--orange)' }}
        >
          New Request
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="card">
        <div className="flex gap-2 flex-wrap">
          {['all', 'pending', 'queued', 'approved', 'emergency', 'denied'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className="px-4 py-2 rounded-lg font-medium transition-all duration-200 capitalize"
              style={{
                background: filter === status ? 'var(--orange)' : 'white',
                color: filter === status ? 'white' : 'var(--text-primary)',
                border: `2px solid ${filter === status ? 'var(--orange)' : 'var(--border)'}`,
              }}
            >
              {status} ({leaves.filter((l) => status === 'all' || l.status === status).length})
            </button>
          ))}
        </div>
      </div>

      {/* Leaves Grid */}
      <div className="grid gap-4">
        {filteredLeaves.length === 0 ? (
          <div className="card text-center py-12">
            <Calendar size={48} className="mx-auto mb-4 opacity-30" />
            <p style={{ color: 'var(--text-secondary)' }}>No leave requests found</p>
          </div>
        ) : (
          filteredLeaves.map((leave) => (
            <div
              key={leave.id}
              className="card hover:shadow-lg transition-all duration-200 cursor-pointer"
              onClick={() => setSelectedLeave(leave)}
              style={{
                borderLeft: `4px solid ${getStatusColor(leave.status)}`,
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <User size={20} style={{ color: 'var(--text-secondary)' }} />
                      <span className="font-semibold text-lg">
                        {leave.first_name} {leave.last_name}
                      </span>
                    </div>
                    <span
                      className="px-3 py-1 rounded-full text-xs font-medium capitalize text-white flex items-center gap-1"
                      style={{ background: getStatusColor(leave.status) }}
                    >
                      {getStatusIcon(leave.status)}
                      {leave.status}
                      {leave.status === 'queued' && leave.queue_position && ` #${leave.queue_position}`}
                    </span>
                    <span
                      className="px-3 py-1 rounded-full text-xs font-medium capitalize"
                      style={{ background: 'var(--orange-pale)', color: 'var(--orange)' }}
                    >
                      {leave.type}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p style={{ color: 'var(--text-secondary)' }}>Start Date</p>
                      <p className="font-medium">{leave.start_date ? new Date(`${leave.start_date}T12:00:00`).toLocaleDateString() : 'Immediate'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)' }}>End Date</p>
                      <p className="font-medium">{leave.end_date ? new Date(`${leave.end_date}T12:00:00`).toLocaleDateString() : 'Immediate'}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--text-secondary)' }}>Duration</p>
                      <p className="font-medium">{leave.days_count} day{leave.days_count !== 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  {leave.reason && (
                    <div className="mt-3">
                      <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                        Reason: {leave.reason}
                      </p>
                    </div>
                  )}

                  <div className="mt-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Requested on {new Date(leave.created_at).toLocaleDateString()} at{' '}
                    {new Date(leave.created_at).toLocaleTimeString()}
                  </div>
                </div>

                {canManage && ['pending', 'queued'].includes(leave.status) && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(leave.id);
                      }}
                      className="px-4 py-2 rounded-lg font-medium text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                      style={{ background: 'var(--success)' }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const reason = prompt('Enter reason for denial (optional):');
                        if (reason !== null) {
                          handleDeny(leave.id, reason);
                        }
                      }}
                      className="px-4 py-2 rounded-lg font-medium border-2 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                      style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                    >
                      Deny
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {selectedLeave && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedLeave(null)}
        >
          <div
            className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Leave Request Details
              </h3>
              <button
                onClick={() => setSelectedLeave(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Employee
                </label>
                <p className="text-lg font-semibold">
                  {selectedLeave.first_name} {selectedLeave.last_name}
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {selectedLeave.email}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Leave Type
                  </label>
                  <p className="text-lg font-semibold capitalize">{selectedLeave.type}</p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Status
                  </label>
                  <p className="text-lg font-semibold capitalize">{selectedLeave.status}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Start Date
                  </label>
                  <p className="text-lg font-semibold">
                    {selectedLeave.start_date ? new Date(`${selectedLeave.start_date}T12:00:00`).toLocaleDateString() : 'Immediate'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    End Date
                  </label>
                  <p className="text-lg font-semibold">
                    {selectedLeave.end_date ? new Date(`${selectedLeave.end_date}T12:00:00`).toLocaleDateString() : 'Immediate'}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Duration
                </label>
                <p className="text-lg font-semibold">
                  {selectedLeave.days_count} day{selectedLeave.days_count !== 1 ? 's' : ''}
                </p>
              </div>

              {selectedLeave.reason && (
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Reason
                  </label>
                  <p className="text-base">{selectedLeave.reason}</p>
                </div>
              )}

              {selectedLeave.queue_position && (
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Queue Position
                  </label>
                  <p className="text-lg font-semibold">#{selectedLeave.queue_position}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Requested At
                </label>
                <p className="text-base">
                  {new Date(selectedLeave.created_at).toLocaleString()}
                </p>
              </div>

              {selectedLeave.decision_date && (
                <div>
                  <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Decision Date
                  </label>
                  <p className="text-base">
                    {new Date(selectedLeave.decision_date).toLocaleString()}
                  </p>
                </div>
              )}

              {canManage && ['pending', 'queued'].includes(selectedLeave.status) && (
                <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => handleApprove(selectedLeave.id)}
                    className="flex-1 py-3 rounded-lg font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                    style={{ background: 'var(--success)' }}
                  >
                    Approve Request
                  </button>
                  <button
                    onClick={() => {
                      const reason = prompt('Enter reason for denial (optional):');
                      if (reason !== null) {
                        handleDeny(selectedLeave.id, reason);
                      }
                    }}
                    className="flex-1 py-3 rounded-lg font-semibold border-2 transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                    style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
                  >
                    Deny Request
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AllLeavesPage;
