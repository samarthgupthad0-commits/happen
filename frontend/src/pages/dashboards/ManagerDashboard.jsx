import { Fragment, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/axios';
import { downloadAuthenticatedFile } from '../../utils/downloadAuthenticatedFile';
import { TrendingUp, Users, AlertTriangle, TrendingDown, Activity, Search, ChevronDown, ChevronRight, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import ScheduleLeavePanel from '../../components/ScheduleLeavePanel';

function ManagerDashboard() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState([]);
  const [burnoutRisk, setBurnoutRisk] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [insignificant, setInsignificant] = useState([]);
  const [loading, setLoading] = useState(true);

  // Employee activity tracking
  const [activityEmployees, setActivityEmployees] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState(null);      // employee id expanded
  const [sessionDetail, setSessionDetail] = useState(null); // employee id with sessions loaded

  useEffect(() => { fetchData(); }, []);

  useEffect(() => { loadActivityEmployees(); }, []);

  const loadActivityEmployees = async () => {
    try {
      setActivityLoading(true);
      const res = await api.get('/activity/employees');
      setActivityEmployees(res.data.employees || []);
    } catch (e) {
      toast.error('Failed to load employee activity');
    } finally {
      setActivityLoading(false);
    }
  };

  const loadEmployeeSessions = async (emp) => {
    try {
      const res = await api.get(`/activity?user_id=${emp.id}`);
      setSessionDetail(s => ({ ...s, [emp.id]: res.data.sessions || [] }));
    } catch (e) {
      toast.error('Failed to load sessions');
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [workloadRes, burnoutRes, overridesRes, insignificantRes] = await Promise.all([
        api.get('/company/workload'),
        api.get('/company/burnout-risk'),
        api.get('/company/overrides'),
        api.get('/projects/insignificant-employees'),
      ]);

      setTeams(workloadRes.data);
      setBurnoutRisk(burnoutRes.data);
      setOverrides(overridesRes.data);
      setInsignificant(insignificantRes.data);
    } catch (error) {
      console.error('Error fetching manager data:', error);
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const getWorkloadColor = (workload) => {
    if (workload >= 80) return '#EF4444';
    if (workload >= 50) return '#F59E0B';
    return '#22C55E';
  };

  const WorkloadGauge = ({ percentage, teamName }) => {
    const conicGradient = `conic-gradient(
      ${getWorkloadColor(percentage)} ${percentage * 3.6}deg,
      #E5E7EB ${percentage * 3.6}deg
    )`;

    return (
      <div className="card hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => navigate('/analytics')}>
        <div className="flex items-center justify-between mb-4">
          <h4 className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            {teamName}
          </h4>
          <Users size={18} style={{ color: 'var(--text-secondary)' }} />
        </div>
        <div className="relative w-32 h-32 mx-auto">
          <div
            className="w-full h-full rounded-full"
            style={{ background: conicGradient }}
          >
            <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center flex-col">
              <span className="text-2xl font-bold" style={{ color: getWorkloadColor(percentage) }}>
                {percentage}%
              </span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                workload
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="manager-dashboard">
      {/* Schedule Leave + Company Workload side by side at top */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ScheduleLeavePanel />

        {/* Company Workload Overview */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          {teams.map((team) => (
            <WorkloadGauge
              key={team.id}
              percentage={team.workload_current}
              teamName={team.name}
            />
          ))}
        </div>
      </div>

      {/* Burnout Risk Alerts */}
      {burnoutRisk.length > 0 && (
        <div
          className="card border-l-4"
          style={{ borderLeftColor: '#F59E0B', background: '#FFF7ED' }}
        >
          <div className="flex items-start gap-4">
            <AlertTriangle size={32} style={{ color: '#F59E0B' }} />
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-2" style={{ color: '#F59E0B' }}>
                Burnout Risk Alerts
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {burnoutRisk.length} employee(s) haven't taken leave in over 45 days
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {burnoutRisk.map((employee, idx) => (
                  <div
                    key={idx}
                    className="bg-white p-4 rounded-lg border-l-4"
                    style={{ borderLeftColor: '#F59E0B' }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{employee.first_name} {employee.last_name}</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {employee.team_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" style={{ color: '#F59E0B' }}>
                          {employee.last_leave_end ? Math.floor((new Date() - new Date(employee.last_leave_end)) / (1000 * 60 * 60 * 24)) : '45+'}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                          days
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Low Task Completion — Insignificant Employees */}
      {insignificant.length > 0 && (
        <div className="card border-l-4" style={{ borderLeftColor: '#DC2626', background: '#FEF2F2' }}>
          <div className="flex items-start gap-4">
            <TrendingDown size={32} style={{ color: '#DC2626', flexShrink: 0 }} />
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1" style={{ color: '#DC2626' }}>
                ⚠️ Low Task Completion Alert
              </h3>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                {insignificant.length} employee{insignificant.length !== 1 ? 's have' : ' has'} completed less than 30% of assigned tasks. Review their workload and performance.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insignificant.map((emp) => (
                  <div key={emp.id} className="bg-white p-4 rounded-xl border-l-4" style={{ borderLeftColor: '#DC2626' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ background: '#DC2626' }}>
                          {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                        </div>
                        <div>
                          <p className="font-semibold">{emp.first_name} {emp.last_name}</p>
                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.team_name}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold" style={{ color: '#DC2626' }}>{emp.completionRate}%</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>completion</p>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                      <div className="h-2 rounded-full" style={{ width: `${emp.completionRate}%`, background: '#DC2626' }} />
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      {emp.completedByUser}/{emp.totalAssigned} tasks done
                      {emp.overdueHighPriority > 0 && ` · ${emp.overdueHighPriority} overdue high-priority`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Activity Tracking */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity size={22} style={{ color: 'var(--orange)' }} />
            <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              Employee Activity Tracking
            </h3>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search employees…"
              className="pl-9 pr-3 py-2 rounded-lg border text-sm w-64"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
        </div>

        {activityLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--orange)' }} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Employee</th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Sessions</th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Active Time</th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Avg Productivity</th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>Status</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                {activityEmployees
                  .filter(emp => `${emp.first_name} ${emp.last_name} ${emp.email}`.toLowerCase().includes(search.toLowerCase()))
                  .sort((a, b) => (b.session_count - a.session_count) || `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
                  .map(emp => {
                    const isExpanded = expanded === emp.id;
                    const sessions = sessionDetail?.[emp.id];
                    const live = !!emp.latest_session && emp.latest_session.status === 'checked_in';
                    return (
                      <Fragment key={emp.id}>
                        <tr
                          onClick={() => {
                            const next = isExpanded ? null : emp.id;
                            setExpanded(next);
                            if (next && !sessions) loadEmployeeSessions(emp);
                          }}
                          className="border-b hover:bg-orange-50 cursor-pointer transition-colors"
                          style={{ borderColor: 'var(--border)' }}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: 'var(--orange)' }}>
                                {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                              </div>
                              <div>
                                <p className="font-medium">{emp.first_name} {emp.last_name}</p>
                                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-semibold">{emp.session_count || 0}</span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium">
                              {emp.total_active_time > 0 ? `${(emp.total_active_time / 60).toFixed(1)} h` : '—'}
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{emp.completed_count || 0} completed</p>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-gray-200 rounded-full h-1.5">
                                <div className="h-1.5 rounded-full" style={{ width: `${emp.avg_productivity || 0}%`, background: 'var(--orange)' }} />
                              </div>
                              <span className="text-sm font-bold" style={{ color: 'var(--orange)' }}>{emp.avg_productivity || 0}/100</span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            {live ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#F0FDF4', color: '#22C55E' }}>● Live</span>
                            ) : emp.session_count > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#F3F4F6', color: '#6B7280' }}>Tracked</span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: '#FEF2F2', color: '#DC2626' }}>No data</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isExpanded ? <ChevronDown size={18} style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={18} style={{ color: 'var(--text-secondary)' }} />}
                          </td>
                        </tr>
                        {isExpanded && sessions && (
                          <tr className="bg-gray-50">
                            <td colSpan={6} className="py-4 px-4">
                              {sessions.length === 0 ? (
                                <p className="text-center text-sm py-4" style={{ color: 'var(--text-secondary)' }}>
                                  No tracking sessions recorded yet.
                                </p>
                              ) : (
                                <div className="space-y-2">
                                  {sessions.map(s => {
                                    const report = s.files?.find(f => f.kind === 'report');
                                    return (
                                      <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-white border" style={{ borderColor: 'var(--border)' }}>
                                        <FileText size={18} style={{ color: 'var(--orange)', flexShrink: 0 }} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-semibold">
                                            {new Date(s.check_in_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            {s.check_out_at ? ` · ${new Date(s.check_in_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} → ${new Date(s.check_out_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                          </p>
                                          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                            {((s.summary?.total_active_time || 0) / 60).toFixed(1)} min active · {s.raw_activities?.length || 0} activities
                                            {s.summary?.productivity_score != null ? ` · Productivity ${s.summary.productivity_score}/100` : ''}
                                          </p>
                                        </div>
                                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: s.status === 'checked_in' ? '#F0FDF4' : '#F3F4F6', color: s.status === 'checked_in' ? '#22C55E' : '#6B7280' }}>
                                          {s.status === 'checked_in' ? 'In progress' : 'Completed'}
                                        </span>
                                        {report && (
                                          <button type="button" onClick={(event) => { event.stopPropagation(); downloadAuthenticatedFile(report.url, report.filename).catch(() => toast.error('Unable to download activity report')); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'var(--orange)' }}>
                                            <Download size={14} /> Report
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
              </tbody>
            </table>
            {activityEmployees.length === 0 && (
              <p className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                No employees found.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Override Patterns Summary */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Override Patterns (Last 30 Days)
          </h3>
          <button
            onClick={() => navigate('/admin/audit')}
            className="text-sm font-medium"
            style={{ color: 'var(--orange)' }}
          >
            View All →
          </button>
        </div>

        {overrides.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Manager
                  </th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Employee
                  </th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Decision
                  </th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Reason
                  </th>
                  <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Date
                  </th>
                </tr>
              </thead>
              <tbody>
                {overrides.slice(0, 5).map((override, idx) => (
                  <tr
                    key={idx}
                    className="border-b hover:bg-orange-50 transition-colors"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <td className="py-3 px-4">
                      <p className="font-medium">{override.manager_first} {override.manager_last}</p>
                      <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {override.manager_email}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-medium">{override.employee_first} {override.employee_last}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className="px-3 py-1 rounded-full text-xs font-semibold text-white capitalize"
                        style={{
                          background: override.decision === 'approved' ? 'var(--success)' : 'var(--danger)',
                        }}
                      >
                        {override.decision}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm truncate max-w-xs">{override.reason}</p>
                    </td>
                    <td className="py-3 px-4">
                      <p className="text-sm">
                        {new Date(override.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            No overrides in the last 30 days
          </p>
        )}
      </div>

      {/* All-Teams Deadline Timeline */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Upcoming Leave Timeline
          </h3>
          <button
            onClick={() => navigate('/calendar')}
            className="text-sm font-medium"
            style={{ color: 'var(--orange)' }}
          >
            View Calendar →
          </button>
        </div>

        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5" style={{ background: 'var(--border)' }}></div>
          <div className="space-y-4 pl-12">
            {teams.flatMap(team => 
              (team.upcoming_leaves || []).map((leave, idx) => (
                <div key={`${team.id}-${idx}`} className="relative">
                  <div
                    className="absolute -left-[34px] w-3 h-3 rounded-full"
                    style={{ background: 'var(--orange)' }}
                  ></div>
                  <div className="p-4 rounded-lg border hover:shadow-md transition-all duration-200" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{leave.employee_name}</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {team.name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{leave.dates}</p>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                          {leave.days} days
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            {teams.every(team => !team.upcoming_leaves || team.upcoming_leaves.length === 0) && (
              <p className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                No upcoming leaves scheduled
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ManagerDashboard;
