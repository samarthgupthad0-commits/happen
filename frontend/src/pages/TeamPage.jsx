import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { toast } from 'sonner';
import {
  Users, Crown, CheckCircle, Clock, AlertTriangle,
  Heart, Stethoscope, Calendar, MessageSquare, Activity,
} from 'lucide-react';

const ROLE_COLORS = {
  team_lead:  '#0EA5E9',
  employee:   '#F4631E',
  accounting: '#22C55E',
};

const LEAVE_TYPE_CONFIG = {
  annual:    { label: 'Annual',    color: 'var(--orange)',  bg: 'var(--orange-pale)' },
  sick:      { label: 'Sick',      color: 'var(--success)', bg: '#F0FDF4' },
  wellness:  { label: 'Wellness',  color: '#8B5CF6',        bg: '#F5F3FF' },
  emergency: { label: 'Emergency', color: '#DC2626',        bg: '#FEF2F2' },
};

function MemberCard({ member, onMessage }) {
  const isOnLeave = !!member.current_leave;
  const hasPending = !!member.pending_leave;
  const roleColor = ROLE_COLORS[member.role] || '#6B7280';
  const lc = member.current_leave ? LEAVE_TYPE_CONFIG[member.current_leave.type] : null;

  return (
    <div
      className="card transition-all hover:shadow-lg hover:-translate-y-0.5"
      style={{
        borderLeft: `4px solid ${isOnLeave ? (lc?.color || 'var(--orange)') : member.is_team_lead ? '#0EA5E9' : 'var(--border)'}`,
        background: isOnLeave ? (lc?.bg || 'var(--orange-pale)') : 'white',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: roleColor }}
          >
            {member.first_name?.charAt(0)}{member.last_name?.charAt(0)}
          </div>
          {/* Online/leave indicator */}
          <div
            className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white flex items-center justify-center"
            style={{ background: isOnLeave ? '#DC2626' : '#22C55E' }}
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold truncate">{member.first_name} {member.last_name}</p>
            {member.is_team_lead && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: '#0EA5E9' }}>
                <Crown size={10} /> Lead
              </span>
            )}
          </div>
          <p className="text-xs capitalize mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {member.role?.replace('_', ' ')}
          </p>

          {/* Current leave status */}
          {isOnLeave ? (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ background: lc?.color || 'var(--orange)' }}>
                On {lc?.label || 'Leave'}
              </span>
              {member.current_leave.end_date && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  until {new Date(member.current_leave.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
              {member.current_leave.type === 'emergency' && (
                <span className="text-xs" style={{ color: '#DC2626' }}>Emergency</span>
              )}
            </div>
          ) : hasPending ? (
            <div className="mt-2 flex items-center gap-1.5">
              <Clock size={12} style={{ color: '#F59E0B' }} />
              <span className="text-xs" style={{ color: '#F59E0B' }}>
                {member.pending_leave.status === 'queued'
                  ? `Queued #${member.pending_leave.queue_position || '?'}`
                  : 'Leave pending'}
              </span>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-1.5">
              <CheckCircle size={12} style={{ color: '#22C55E' }} />
              <span className="text-xs" style={{ color: '#22C55E' }}>Available</span>
            </div>
          )}
        </div>

        {/* Message button */}
        <button
          onClick={() => onMessage(member.id)}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          title={`Message ${member.first_name}`}
          style={{ color: 'var(--text-secondary)' }}
        >
          <MessageSquare size={16} />
        </button>
      </div>

      {/* Leave balance mini bars */}
      <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2" style={{ borderColor: 'var(--border)' }}>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span style={{ color: 'var(--text-secondary)' }}>Annual</span>
            <span className="font-semibold" style={{ color: 'var(--orange)' }}>{member.leave_balance_annual}d</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full" style={{ width: `${(member.leave_balance_annual / 20) * 100}%`, background: 'var(--orange)' }} />
          </div>
        </div>
        <div>
          <div className="flex justify-between text-xs mb-0.5">
            <span style={{ color: 'var(--text-secondary)' }}>Sick</span>
            <span className="font-semibold" style={{ color: 'var(--success)' }}>{member.leave_balance_sick}d</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5">
            <div className="h-1.5 rounded-full" style={{ width: `${(member.leave_balance_sick / 10) * 100}%`, background: 'var(--success)' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const teamId = user?.team_id?._id || user?.team_id;
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!teamId) { setLoading(false); return; }
    api.get(`/teams/${teamId}/members`)
      .then(r => setTeamData(r.data))
      .catch(() => toast.error('Unable to load your team'))
      .finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} />
    </div>
  );

  if (!teamId || !teamData) return (
    <div className="card text-center py-16">
      <Users size={48} className="mx-auto mb-4 opacity-20" />
      <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>You are not assigned to a team</p>
    </div>
  );

  const { team, members } = teamData;
  const onLeave   = members.filter(m => m.current_leave);
  const available = members.filter(m => !m.current_leave);
  const workloadColor = team.workload_current >= 80 ? '#DC2626' : team.workload_current >= 50 ? '#F59E0B' : '#22C55E';
  const conicBg = `conic-gradient(${workloadColor} ${team.workload_current * 3.6}deg, #E5E7EB ${team.workload_current * 3.6}deg)`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {team.name} Team
          </h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            {members.length} member{members.length !== 1 ? 's' : ''} · {onLeave.length} on leave · {available.length} available
          </p>
        </div>
        <button
          onClick={() => navigate('/calendar')}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 text-sm font-semibold transition-all hover:-translate-y-0.5"
          style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
        >
          <Calendar size={16} /> Team Calendar
        </button>
      </div>

      {/* Team stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Workload gauge */}
        <div className="card flex items-center gap-4 col-span-2 md:col-span-1">
          <div className="relative w-14 h-14 flex-shrink-0">
            <div className="w-full h-full rounded-full" style={{ background: conicBg }}>
              <div className="absolute inset-1.5 bg-white rounded-full flex items-center justify-center">
                <span className="text-xs font-bold" style={{ color: workloadColor }}>{team.workload_current}%</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-bold text-lg" style={{ color: workloadColor }}>{team.workload_current}%</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Workload</p>
          </div>
        </div>

        <div className="card text-center">
          <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{members.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Total Members</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold" style={{ color: '#22C55E' }}>{available.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Available</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold" style={{ color: '#DC2626' }}>{onLeave.length}</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>On Leave</p>
        </div>
      </div>

      {/* On leave alert */}
      {onLeave.length > 0 && (
        <div className="card border-l-4 flex items-center gap-3" style={{ borderLeftColor: '#F59E0B', background: '#FFF7ED' }}>
          <AlertTriangle size={20} style={{ color: '#F59E0B' }} />
          <p className="text-sm font-medium" style={{ color: '#92400E' }}>
            {onLeave.map(m => `${m.first_name} ${m.last_name}`).join(', ')} {onLeave.length === 1 ? 'is' : 'are'} currently on leave
          </p>
        </div>
      )}

      {/* Member grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {members.map(member => (
          <MemberCard
            key={member.id}
            member={member}
            onMessage={(id) => navigate(`/messages?contact=${id}`)}
          />
        ))}
      </div>
    </div>
  );
}
