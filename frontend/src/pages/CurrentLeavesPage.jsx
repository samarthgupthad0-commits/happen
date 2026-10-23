import { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../lib/axios';
import { toast } from 'sonner';
import {
  X, Mail, Users, AlertTriangle,
  CheckCircle, Clock, Heart, Stethoscope, MessageSquare, Calendar, Download,
} from 'lucide-react';

const TYPE_CONFIG = {
  annual:    { label: 'Annual',    color: 'var(--orange)',  bg: 'var(--orange-pale)', icon: Calendar },
  sick:      { label: 'Sick',      color: 'var(--success)', bg: '#F0FDF4',            icon: Stethoscope },
  wellness:  { label: 'Wellness',  color: '#8B5CF6',        bg: '#F5F3FF',            icon: Heart },
  emergency: { label: 'Emergency', color: '#DC2626',        bg: '#FEF2F2',            icon: AlertTriangle },
};

const STATUS_CONFIG = {
  approved:  { label: 'Approved',  color: 'var(--success)' },
  emergency: { label: 'Emergency', color: '#DC2626' },
  queued:    { label: 'Queued',    color: 'var(--orange)' },
  denied:    { label: 'Denied',    color: 'var(--danger)' },
  pending:   { label: 'Pending',   color: 'var(--warning)' },
};

function PerformanceBar({ score }) {
  const color = score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : '#DC2626';
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-semibold">Work Performance</span>
        <span className="font-bold text-lg" style={{ color }}>{score}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className="h-3 rounded-full transition-all duration-700"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
        {score >= 80 ? 'Excellent attendance' : score >= 50 ? 'Moderate — monitor closely' : 'High leave usage — needs attention'}
      </p>
    </div>
  );
}

function escapeDocumentText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function EmployeeDrawer({ employeeId, onClose }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    api.get(`/current-leaves/employee/${employeeId}`)
      .then(r => setData(r.data))
      .catch(() => toast.error('Failed to load employee profile'))
      .finally(() => setLoading(false));
  }, [employeeId]);

  const downloadMonthlyPerformance = () => {
    if (!data) return;

    const reportDate = new Date();
    const monthLabel = reportDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const fileMonth = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
    const employeeName = `${data.employee.first_name || ''} ${data.employee.last_name || ''}`.trim();
    const monthlyLeave = (data.leave_history || []).filter((leave) => {
      const leaveDate = leave.start_date ? new Date(leave.start_date) : null;
      return leaveDate && leaveDate.getFullYear() === reportDate.getFullYear() && leaveDate.getMonth() === reportDate.getMonth();
    });
    const leaveRows = monthlyLeave.length
      ? monthlyLeave.map((leave) => `
          <tr>
            <td>${escapeDocumentText(leave.type)}</td>
            <td>${escapeDocumentText(leave.status)}</td>
            <td>${leave.start_date ? new Date(leave.start_date).toLocaleDateString('en-US') : '—'}</td>
            <td>${escapeDocumentText(leave.days_count || 0)}</td>
          </tr>`).join('')
      : '<tr><td colspan="4">No leave activity recorded this month.</td></tr>';
    const document = `<!doctype html><html><head><meta charset="utf-8"><title>Monthly Performance Report</title>
      <style>body{font-family:Arial,sans-serif;color:#1f2937;padding:32px}h1{color:#f4631e}h2{margin-top:28px;color:#374151}.meta{color:#6b7280}.stats{display:flex;gap:16px;margin:20px 0}.stat{border:1px solid #d1d5db;padding:14px;min-width:130px}.value{font-size:24px;font-weight:700}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #d1d5db;padding:10px;text-align:left}th{background:#f3f4f6}</style>
      </head><body><h1>Monthly Performance Report</h1>
      <p class="meta"><strong>Reporting month:</strong> ${escapeDocumentText(monthLabel)}</p>
      <p class="meta"><strong>Employee:</strong> ${escapeDocumentText(employeeName)}<br><strong>Role:</strong> ${escapeDocumentText(data.employee.role?.replace('_', ' '))}<br><strong>Email:</strong> ${escapeDocumentText(data.employee.email)}</p>
      <h2>Performance Overview</h2><div class="stats"><div class="stat"><div>Work performance</div><div class="value">${escapeDocumentText(data.stats.performance_score)}%</div></div><div class="stat"><div>Annual days used</div><div class="value">${escapeDocumentText(data.stats.annual_days_used)}</div></div><div class="stat"><div>Sick days used</div><div class="value">${escapeDocumentText(data.stats.sick_days_used)}</div></div><div class="stat"><div>Emergency leaves</div><div class="value">${escapeDocumentText(data.stats.emergency_count)}</div></div></div>
      <h2>Leave Activity for ${escapeDocumentText(monthLabel)}</h2><table><thead><tr><th>Type</th><th>Status</th><th>Start date</th><th>Days</th></tr></thead><tbody>${leaveRows}</tbody></table>
      <p class="meta">Generated on ${escapeDocumentText(reportDate.toLocaleString('en-US'))} from Happen.</p></body></html>`;
    const blob = new Blob([document], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `monthly-performance-${employeeName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'employee'}-${fileMonth}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Monthly performance document downloaded');
  };

  if (!employeeId) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-stretch justify-end"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto animate-slideIn shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} />
          </div>
        ) : data ? (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>Employee Profile</h2>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X size={22} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Identity */}
              <div className="flex items-center gap-4">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold flex-shrink-0"
                  style={{ background: 'var(--orange)' }}
                >
                  {data.employee.first_name?.charAt(0)}{data.employee.last_name?.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {data.employee.first_name} {data.employee.last_name}
                  </h3>
                  <p className="text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>
                    {data.employee.role?.replace('_', ' ')}
                  </p>
                  <a
                    href={`mailto:${data.employee.email}`}
                    className="flex items-center gap-1 text-sm mt-1"
                    style={{ color: 'var(--orange)' }}
                  >
                    <Mail size={14} />
                    {data.employee.email}
                  </a>
                </div>
              </div>

              {/* Team + Team Lead */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Users size={16} style={{ color: 'var(--orange)' }} />
                    <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Team</span>
                  </div>
                  <p className="font-bold">{data.employee.team?.name || '—'}</p>
                  <div className="mt-2">
                    <div className="flex justify-between text-xs mb-1">
                      <span style={{ color: 'var(--text-secondary)' }}>Workload</span>
                      <span className="font-semibold">{data.employee.team?.workload_current ?? 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className="h-1.5 rounded-full"
                        style={{
                          width: `${data.employee.team?.workload_current ?? 0}%`,
                          background: (data.employee.team?.workload_current ?? 0) >= 80 ? '#DC2626' : 'var(--orange)',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {data.employee.team_lead ? (
                  <div className="p-4 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare size={16} style={{ color: '#0EA5E9' }} />
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>Team Lead</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: '#0EA5E9' }}
                      >
                        {data.employee.team_lead.first_name?.charAt(0)}{data.employee.team_lead.last_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-bold text-sm">{data.employee.team_lead.first_name} {data.employee.team_lead.last_name}</p>
                        <button
                          onClick={() => { onClose(); navigate(`/messages?contact=${data.employee.team_lead.id}`); }}
                          className="text-xs font-semibold flex items-center gap-1"
                          style={{ color: '#0EA5E9' }}
                        >
                          <MessageSquare size={12} /> Message →
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl flex items-center justify-center" style={{ background: 'var(--page-bg)' }}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>No team lead assigned</p>
                  </div>
                )}
              </div>

              {/* Performance */}
              <div className="p-4 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                    Monthly performance
                  </p>
                  <button
                    type="button"
                    onClick={downloadMonthlyPerformance}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                    style={{ background: 'var(--orange)' }}
                    title="Download monthly performance document"
                  >
                    <Download size={14} /> Download document
                  </button>
                </div>
                <PerformanceBar score={data.stats.performance_score} />
              </div>

              {/* Leave Stats */}
              <div>
                <h4 className="font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Leave Summary</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Annual Days Used',  value: data.stats.annual_days_used,  color: 'var(--orange)' },
                    { label: 'Sick Days Used',    value: data.stats.sick_days_used,    color: 'var(--success)' },
                    { label: 'Emergency Leaves',  value: data.stats.emergency_count,   color: '#DC2626' },
                    { label: 'Denied Requests',   value: data.stats.denied_count,      color: 'var(--warning)' },
                  ].map(s => (
                    <div key={s.label} className="p-3 rounded-lg border text-center" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Leave History */}
              <div>
                <h4 className="font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
                  Leave History ({data.leave_history.length})
                </h4>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {data.leave_history.length === 0 ? (
                    <p className="text-sm text-center py-6" style={{ color: 'var(--text-secondary)' }}>No leave history</p>
                  ) : data.leave_history.map((lr, i) => {
                    const tc = TYPE_CONFIG[lr.type] || TYPE_CONFIG.annual;
                    const sc = STATUS_CONFIG[lr.status] || STATUS_CONFIG.pending;
                    const Icon = tc.icon;
                    return (
                      <div
                        key={lr.id || i}
                        className="flex items-center gap-3 p-3 rounded-lg border"
                        style={{ borderColor: 'var(--border)', borderLeft: `3px solid ${tc.color}` }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: tc.bg }}>
                          <Icon size={16} style={{ color: tc.color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold capitalize">{lr.type}</span>
                            {lr.half_day && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: tc.bg, color: tc.color }}>½ day {lr.am_pm}</span>}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                            {lr.start_date
                              ? `${new Date(lr.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${lr.end_date && lr.end_date !== lr.start_date ? ` → ${new Date(lr.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`
                              : 'Emergency — no date'}
                            {lr.days_count ? ` · ${lr.days_count} day${lr.days_count !== 1 ? 's' : ''}` : ''}
                          </p>
                        </div>
                        <span
                          className="text-xs font-bold px-2 py-1 rounded-full text-white flex-shrink-0"
                          style={{ background: sc.color }}
                        >
                          {sc.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p style={{ color: 'var(--text-secondary)' }}>Employee not found</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CurrentLeavesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(searchParams.get('employee'));

  // If ?employee= param is in URL, open drawer immediately
  useEffect(() => {
    const emp = searchParams.get('employee');
    if (emp) setSelectedEmployeeId(emp);
  }, [searchParams]);

  const fetchLeaves = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/current-leaves');
      setLeaves(res.data);
    } catch (e) {
      toast.error('Failed to load current leaves');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLeaves(); }, [fetchLeaves]);

  const openEmployee = (id) => {
    setSelectedEmployeeId(id.toString());
    setSearchParams({ employee: id.toString() });
  };

  const closeDrawer = () => {
    setSelectedEmployeeId(null);
    setSearchParams({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Current Leaves</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Everyone on leave right now — click any card to view full profile
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(TYPE_CONFIG).map(([type, cfg]) => {
          const count = leaves.filter(l => l.type === type).length;
          const Icon = cfg.icon;
          return (
            <div key={type} className="card flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.bg }}>
                <Icon size={22} style={{ color: cfg.color }} />
              </div>
              <div>
                <p className="text-2xl font-bold" style={{ color: cfg.color }}>{count}</p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{cfg.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Leave cards */}
      {leaves.length === 0 ? (
        <div className="card text-center py-16">
          <CheckCircle size={48} className="mx-auto mb-4 opacity-20" />
          <p className="font-semibold text-lg" style={{ color: 'var(--text-secondary)' }}>Everyone is in today</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>No active leaves right now</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {leaves.map((lr, i) => {
            const tc = TYPE_CONFIG[lr.type] || TYPE_CONFIG.annual;
            const Icon = tc.icon;
            const emp = lr.employee;
            const endsToday = lr.end_date === new Date().toISOString().split('T')[0];

            return (
              <div
                key={lr.id || i}
                className="card cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border-l-4"
                style={{ borderLeftColor: tc.color }}
                onClick={() => openEmployee(emp.id)}
              >
                {/* Employee identity */}
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: tc.color }}
                  >
                    {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{emp.first_name} {emp.last_name}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--text-secondary)' }}>
                      {emp.role?.replace('_', ' ')} · {emp.team?.name || 'No team'}
                    </p>
                  </div>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: tc.bg }}
                  >
                    <Icon size={20} style={{ color: tc.color }} />
                  </div>
                </div>

                {/* Leave details */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span
                      className="px-3 py-1 rounded-full text-xs font-bold text-white capitalize"
                      style={{ background: tc.color }}
                    >
                      {tc.label} Leave
                    </span>
                    {lr.half_day && (
                      <span className="text-xs px-2 py-1 rounded font-semibold" style={{ background: tc.bg, color: tc.color }}>
                        ½ day {lr.am_pm}
                      </span>
                    )}
                  </div>

                  {lr.type !== 'emergency' ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                      <Clock size={14} />
                      <span>
                        {lr.start_date && new Date(lr.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {lr.end_date && lr.end_date !== lr.start_date
                          ? ` → ${new Date(lr.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                          : ''}
                        {lr.days_count ? ` (${lr.days_count} day${lr.days_count !== 1 ? 's' : ''})` : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm" style={{ color: '#DC2626' }}>
                      <AlertTriangle size={14} />
                      <span>Emergency — no scheduled end date</span>
                    </div>
                  )}

                  {lr.end_date && (
                    <div
                      className="text-xs px-2 py-1 rounded font-semibold inline-block"
                      style={{
                        background: endsToday ? '#FEF2F2' : 'var(--orange-pale)',
                        color: endsToday ? '#DC2626' : 'var(--orange)',
                      }}
                    >
                      {endsToday ? 'Returns tomorrow' : `Returns ${new Date(lr.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    </div>
                  )}
                </div>

                {/* Team lead */}
                {emp.team_lead && (
                  <div className="mt-3 pt-3 border-t flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                      style={{ background: '#0EA5E9' }}
                    >
                      {emp.team_lead.first_name?.charAt(0)}{emp.team_lead.last_name?.charAt(0)}
                    </div>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      Lead: {emp.team_lead.first_name} {emp.team_lead.last_name}
                    </span>
                    <button
                      className="ml-auto text-xs font-semibold flex items-center gap-1"
                      style={{ color: '#0EA5E9' }}
                      onClick={e => { e.stopPropagation(); navigate(`/messages?contact=${emp.team_lead.id}`); }}
                    >
                      <MessageSquare size={12} /> Message
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Employee drawer */}
      {selectedEmployeeId && (
        <EmployeeDrawer
          employeeId={selectedEmployeeId}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}
