import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import {
  Users, TrendingUp, TrendingDown, AlertTriangle,
  CheckCircle, Clock, Calendar, BarChart2, Activity,
} from 'lucide-react';

// ── Mini bar chart (pure CSS) ─────────────────────────────────────────────────
function BarChart({ data, color = 'var(--orange)', height = 80 }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)', fontSize: 10 }}>{d.value}</span>
          <div
            className="w-full rounded-t transition-all duration-700"
            style={{ height: `${(d.value / max) * (height - 32)}px`, background: d.color || color, minHeight: d.value > 0 ? 4 : 0 }}
            title={`${d.label}: ${d.value}`}
          />
          <span className="text-xs text-center truncate w-full" style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Donut chart (CSS conic-gradient) ─────────────────────────────────────────
function DonutChart({ segments, size = 100 }) {
  let cumulative = 0;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const gradient = segments.map(seg => {
    const pct = (seg.value / total) * 100;
    const start = cumulative;
    cumulative += pct;
    return `${seg.color} ${start}% ${cumulative}%`;
  }).join(', ');

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div
        className="w-full h-full rounded-full"
        style={{ background: `conic-gradient(${gradient})` }}
      />
      <div
        className="absolute rounded-full bg-white flex items-center justify-center"
        style={{ inset: size * 0.2, flexDirection: 'column' }}
      >
        <span className="font-bold" style={{ fontSize: size * 0.18, color: 'var(--text-primary)' }}>{total}</span>
        <span style={{ fontSize: size * 0.1, color: 'var(--text-secondary)' }}>total</span>
      </div>
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon: Icon, trend, onClick, selected }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="card text-left transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2"
      style={{ width: '100%', borderColor: selected ? 'var(--orange)' : 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
    >
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        {Icon && <Icon size={18} style={{ color }} />}
      </div>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{sub}</p>}
      {trend !== undefined && (
        <div className="flex items-center gap-1 mt-1">
          {trend >= 0
            ? <TrendingUp size={13} style={{ color: '#22C55E' }} />
            : <TrendingDown size={13} style={{ color: '#DC2626' }} />}
          <span className="text-xs font-semibold" style={{ color: trend >= 0 ? '#22C55E' : '#DC2626' }}>
            {Math.abs(trend)}% vs last month
          </span>
        </div>
      )}
    </button>
  );
}

export default function AnalyticsPage() {
  const user = useAuthStore(s => s.user);
  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState([]);
  const [burnout, setBurnout] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [allLeaves, setAllLeaves] = useState([]);
  const [queue, setQueue] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState('workload');

  useEffect(() => {
    Promise.allSettled([
      api.get('/company/workload'),
      api.get('/company/burnout-risk'),
      api.get('/company/overrides'),
      api.get('/leave-requests/all'),
      api.get('/queue'),
    ]).then(([t, b, o, l, q]) => {
      if (t.status === 'fulfilled') setTeams(t.value.data);
      if (b.status === 'fulfilled') setBurnout(b.value.data);
      if (o.status === 'fulfilled') setOverrides(o.value.data);
      if (l.status === 'fulfilled') setAllLeaves(l.value.data);
      if (q.status === 'fulfilled') setQueue(q.value.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} />
    </div>
  );

  // ── Derived metrics ──────────────────────────────────────────────────────
  const totalEmployees = teams.reduce((s, t) => s + (t.member_count || 0), 0);
  const avgWorkload = teams.length
    ? Math.round(teams.reduce((s, t) => s + (t.workload_current || 0), 0) / teams.length)
    : 0;
  const highWorkloadTeams = teams.filter(t => t.workload_current >= 80);

  const approved  = allLeaves.filter(l => l.status === 'approved').length;
  const denied    = allLeaves.filter(l => l.status === 'denied').length;
  const queued    = allLeaves.filter(l => l.status === 'queued').length;
  const emergency = allLeaves.filter(l => l.status === 'emergency').length;
  const pending = allLeaves.filter(l => l.status === 'pending').length;
  const totalLeaves = allLeaves.length;

  const approvalRate = totalLeaves > 0 ? Math.round((approved / totalLeaves) * 100) : 0;

  // Leave type breakdown
  const byType = ['annual','sick','wellness','emergency'].map(type => ({
    label: type.charAt(0).toUpperCase() + type.slice(1),
    value: allLeaves.filter(l => l.type === type).length,
    color: type === 'annual' ? 'var(--orange)' : type === 'sick' ? '#22C55E' : type === 'wellness' ? '#8B5CF6' : '#DC2626',
  }));

  // Leave status breakdown for donut
  const statusColors = { approved: '#22C55E', pending: '#0EA5E9', queued: '#F59E0B', emergency: '#DC2626', denied: '#6B7280', rejected: '#6B7280' };
  const statusSegments = [...new Set(allLeaves.map(leave => leave.status).filter(Boolean))]
    .map(status => ({
      label: status.charAt(0).toUpperCase() + status.slice(1),
      value: allLeaves.filter(leave => leave.status === status).length,
      color: statusColors[status] || '#8B5CF6',
    }));

  // Monthly leave trend (last 6 months)
  const now = new Date();
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const count = allLeaves.filter(l => (l.start_date || l.createdAt || '').startsWith(monthStr)).length;
    return { label: d.toLocaleString('default', { month: 'short' }), value: count };
  });

  // Team workload bars
  const workloadBars = teams
    .filter(t => t.name !== 'System')
    .map(t => ({ label: t.name, value: t.workload_current || 0 }));

  const getWorkloadColor = (w) => w >= 80 ? '#DC2626' : w >= 50 ? '#F59E0B' : '#22C55E';
  const burnoutBars = burnout.map(emp => ({
    label: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Employee',
    value: emp.last_leave_end ? Math.floor((Date.now() - new Date(emp.last_leave_end).getTime()) / 86400000) : 45,
    color: '#F59E0B',
  }));
  const overrideBars = ['approved', 'denied'].map((decision, index) => ({
    label: decision.charAt(0).toUpperCase() + decision.slice(1),
    value: overrides.filter(item => item.decision === decision).length,
    color: index === 0 ? '#22C55E' : '#DC2626',
  }));
  const queueTypes = ['annual', 'sick', 'wellness', 'emergency'].map((type, index) => ({
    label: type.charAt(0).toUpperCase() + type.slice(1),
    value: queue.filter(request => request.type === type).length,
    color: ['var(--orange)', '#22C55E', '#8B5CF6', '#DC2626'][index],
  }));

  const analysisCharts = {
    workload: { title: 'Average Team Workload', detail: `${avgWorkload}% average across ${workloadBars.length} teams`, data: workloadBars, color: 'var(--orange)' },
    leaves: { title: 'Leave Requests', detail: `${totalLeaves} total requests, grouped by month`, data: monthlyTrend, color: 'var(--orange)' },
    approvals: { title: 'Approval Rate', detail: `${approvalRate}% approved (${approved} of ${totalLeaves} requests)`, data: statusSegments.map(segment => ({ label: segment.label, value: segment.value, color: segment.color })) },
    burnout: { title: 'Burnout Risk', detail: `${burnout.length} employees at risk, shown by days since last leave`, data: burnoutBars, color: '#F59E0B' },
    status: { title: 'Leave Request Status', detail: 'Requests grouped by their current status', data: statusSegments.map(segment => ({ label: segment.label, value: segment.value, color: segment.color })) },
    monthly: { title: 'Leave Requests by Month', detail: 'Request counts for the last six months', data: monthlyTrend, color: 'var(--orange)' },
    types: { title: 'Leave Requests by Type', detail: 'All requests grouped by leave type', data: byType, color: 'var(--orange)' },
    teams: { title: 'Team Workload', detail: 'Current workload percentage for each team', data: workloadBars, color: 'var(--orange)' },
    burnoutList: { title: 'Burnout Risk by Employee', detail: 'Days since each employee’s last leave', data: burnoutBars, color: '#F59E0B' },
    overrides: { title: 'Override Decisions', detail: 'Override counts grouped by approval decision', data: overrideBars },
    queue: { title: 'Queued Leave Requests', detail: `${queue.length} requests grouped by leave type`, data: queueTypes },
  };
  const selectedChart = analysisCharts[selectedMetric];
  const selectSection = (metric) => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': selectedMetric === metric,
    onClick: () => setSelectedMetric(metric),
    onKeyDown: event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setSelectedMetric(metric);
      }
    },
    className: `card cursor-pointer transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2 ${selectedMetric === metric ? 'ring-2 ring-orange-400' : ''}`,
  });

  return (
    <div className="space-y-6" data-testid="analytics-page">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Company-wide leave, workload, and team health overview
        </p>
      </div>

      {/* Top stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Avg Team Workload" value={`${avgWorkload}%`} color={getWorkloadColor(avgWorkload)} icon={Activity} sub={`${highWorkloadTeams.length} team(s) critical`} onClick={() => setSelectedMetric('workload')} selected={selectedMetric === 'workload'} />
        <StatCard label="Total Leave Requests" value={totalLeaves} color="var(--orange)" icon={Calendar} sub="All time" onClick={() => setSelectedMetric('leaves')} selected={selectedMetric === 'leaves'} />
        <StatCard label="Approval Rate" value={`${approvalRate}%`} color="#22C55E" icon={CheckCircle} sub={`${approved} approved`} onClick={() => setSelectedMetric('approvals')} selected={selectedMetric === 'approvals'} />
        <StatCard label="Burnout Risk" value={burnout.length} color={burnout.length > 0 ? '#F59E0B' : '#22C55E'} icon={AlertTriangle} sub="Employees >45 days no leave" onClick={() => setSelectedMetric('burnout')} selected={selectedMetric === 'burnout'} />
      </div>

      <section className="card border-l-4" style={{ borderLeftColor: 'var(--orange)' }} aria-live="polite">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-5">
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{selectedChart.title}</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{selectedChart.detail}</p>
          </div>
          <span className="text-xs font-semibold uppercase" style={{ color: 'var(--orange)' }}>Selected analysis</span>
        </div>
        {selectedChart.data.length ? (
          <BarChart data={selectedChart.data} color={selectedChart.color} height={180} />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>No data available for this graph yet.</p>
        )}
      </section>

      {/* Row 2: Leave breakdown + Monthly trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave status donut */}
        <div {...selectSection('status')}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Leave Request Status</h3>
          <div className="flex items-center gap-6">
            <DonutChart segments={statusSegments} size={120} />
            <div className="flex-1 space-y-2">
              {statusSegments.map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                    <span className="text-sm">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{s.value}</span>
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      ({totalLeaves > 0 ? Math.round((s.value / totalLeaves) * 100) : 0}%)
                    </span>
                  </div>
                </div>
              ))}
              {queue.length > 0 && (
                <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {queue.length} request{queue.length !== 1 ? 's' : ''} currently in queue
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Monthly trend */}
        <div {...selectSection('monthly')}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Leave Requests — Last 6 Months</h3>
          <BarChart data={monthlyTrend} color="var(--orange)" height={100} />
        </div>
      </div>

      {/* Row 3: Leave type breakdown + Team workload */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave by type */}
        <div {...selectSection('types')}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Leave by Type</h3>
          <div className="space-y-3">
            {byType.map(t => (
              <div key={t.label}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="font-bold text-sm" style={{ color: t.color }}>{t.value}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-700"
                    style={{ width: `${totalLeaves > 0 ? (t.value / totalLeaves) * 100 : 0}%`, background: t.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team workload */}
        <div {...selectSection('teams')}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--text-primary)' }}>Team Workload</h3>
          <div className="space-y-3">
            {teams.filter(t => t.name !== 'System').map(t => (
              <div key={t.id || t._id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">{t.name}</span>
                  <div className="flex items-center gap-2">
                    {t.workload_current >= 80 && <AlertTriangle size={14} style={{ color: '#DC2626' }} />}
                    <span className="font-bold text-sm" style={{ color: getWorkloadColor(t.workload_current) }}>
                      {t.workload_current}%
                    </span>
                  </div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="h-2.5 rounded-full transition-all duration-700"
                    style={{ width: `${t.workload_current}%`, background: getWorkloadColor(t.workload_current) }}
                  />
                </div>
                {t.team_lead && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>Lead: {t.team_lead}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Burnout risk + Override patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Burnout risk */}
        <div {...selectSection('burnoutList')}>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={20} style={{ color: '#F59E0B' }} />
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
              Burnout Risk ({burnout.length})
            </h3>
          </div>
          {burnout.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={36} className="mx-auto mb-2" style={{ color: '#22C55E' }} />
              <p className="text-sm font-semibold" style={{ color: '#22C55E' }}>No burnout risk detected</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>All employees took leave within 45 days</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {burnout.map((emp, i) => {
                const daysSince = emp.last_leave_end
                  ? Math.floor((new Date() - new Date(emp.last_leave_end)) / 86400000)
                  : 45;
                return (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: '#FFF7ED' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: '#F59E0B' }}>
                        {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.team_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg" style={{ color: '#F59E0B' }}>{daysSince}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>days</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Override patterns */}
        <div {...selectSection('overrides')}>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={20} style={{ color: 'var(--orange)' }} />
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
              Override Patterns — Last 30 Days ({overrides.length})
            </h3>
          </div>
          {overrides.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle size={36} className="mx-auto mb-2" style={{ color: '#22C55E' }} />
              <p className="text-sm font-semibold" style={{ color: '#22C55E' }}>No overrides this month</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {overrides.slice(0, 8).map((o, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {o.employee_first} {o.employee_last}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      by {o.manager_first} {o.manager_last}
                    </p>
                  </div>
                  <span
                    className="ml-2 px-2 py-1 rounded-full text-xs font-bold text-white flex-shrink-0"
                    style={{ background: o.decision === 'approved' ? '#22C55E' : '#DC2626' }}
                  >
                    {o.decision}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Leave queue summary */}
      {queue.length > 0 && (
        <div {...selectSection('queue')}>
          <div className="flex items-center gap-2 mb-4">
            <Clock size={20} style={{ color: 'var(--orange)' }} />
            <h3 className="font-bold" style={{ color: 'var(--text-primary)' }}>
              Leave Queue ({queue.length} pending)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {queue.slice(0, 6).map((req, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--orange-pale)' }}>
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'var(--orange)' }}>
                  {req.queue_position || i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{req.first_name} {req.last_name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {req.start_date} → {req.end_date}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
