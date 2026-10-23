import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/axios';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowRight, BarChart3, CalendarDays, CheckCircle2, Clock3,
  ClipboardCheck, Download, FileText, GraduationCap, Landmark, Megaphone,
  Save, Search, Settings2, ShieldCheck, UserPlus, Users, WalletCards,
} from 'lucide-react';

const salaryFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const workflowGroups = [
  {
    title: 'People operations',
    items: [
      { label: 'Onboarding & offboarding', description: 'Joining checklist, documents, equipment and exit tasks.', icon: UserPlus, tone: '#0EA5E9', action: 'checklist' },
      { label: 'Documents', description: 'Offer letters, contracts, policies and employee uploads.', icon: FileText, tone: '#8B5CF6', action: 'documents' },
      { label: 'Recruitment', description: 'Open roles, applicants, interviews and hiring decisions.', icon: GraduationCap, tone: '#EC4899', action: 'recruitment' },
      { label: 'HR announcements', description: 'Publish company updates and track acknowledgements.', icon: Megaphone, tone: '#F59E0B', action: 'announcements' },
    ],
  },
  {
    title: 'Operations & compliance',
    items: [
      { label: 'Reports & compliance', description: 'Headcount, turnover, leave usage and audit exports.', icon: BarChart3, tone: '#22C55E', action: 'reports' },
      { label: 'Employee requests', description: 'Reimbursements, address changes, document requests and helpdesk.', icon: ClipboardCheck, tone: '#14B8A6', action: 'requests' },
      { label: 'Settings & permissions', description: 'Departments, job titles, policies and HR access.', icon: Settings2, tone: '#64748B', action: 'settings' },
      { label: 'Payroll inputs', description: 'Salary changes, allowances, deductions and tax details.', icon: WalletCards, tone: '#F4631E', action: 'payroll' },
    ],
  },
];

function Metric({ label, value, detail, icon: Icon, color }) {
  return (
    <div className="card flex items-start justify-between gap-3">
      <div>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <p className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>{value}</p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{detail}</p>
      </div>
      <div className="p-3 rounded-xl" style={{ background: `${color}18`, color }}><Icon size={21} /></div>
    </div>
  );
}

function HRPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [compliance, setCompliance] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState(null);
  const [salaryDrafts, setSalaryDrafts] = useState({});
  const [savingSalaryFor, setSavingSalaryFor] = useState(null);

  const loadHRData = useCallback(async () => {
    setLoading(true);
    const results = await Promise.allSettled([
      api.get('/hr/employees'),
      api.get('/leave-requests/all'),
      api.get('/hr/compliance'),
    ]);
    if (results[0].status === 'fulfilled') {
      const employeeData = results[0].value.data;
      setEmployees(Array.isArray(employeeData) ? employeeData : employeeData?.employees || employeeData?.data || []);
    }
    if (results[1].status === 'fulfilled') {
      const leaveData = results[1].value.data;
      setLeaves(Array.isArray(leaveData) ? leaveData : leaveData?.leaves || leaveData?.data || []);
    }
    if (results[2].status === 'fulfilled') setCompliance(results[2].value.data);
    if (results.every((result) => result.status === 'rejected')) toast.error('Unable to load HR data');
    setLoading(false);
  }, []);

  useEffect(() => { loadHRData(); }, [loadHRData]);

  const filteredEmployees = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter((employee) => `${employee.first_name} ${employee.last_name} ${employee.email} ${employee.role}`.toLowerCase().includes(query));
  }, [employees, search]);

  const activeEmployees = employees.filter((employee) => employee.is_active !== false);
  const pendingLeaves = leaves.filter((leave) => ['pending', 'queued', 'emergency'].includes(leave.status));
  const approvedLeaves = leaves.filter((leave) => leave.status === 'approved');

  const openAction = (action) => {
    const routes = {
      payroll: '/payroll', settings: '/settings', reports: '/analytics', announcements: '/wiki',
      documents: '/wiki', recruitment: '/team', requests: '/messages', checklist: '/team',
    };
    if (routes[action]) navigate(routes[action]);
    else setActivePanel(action);
  };

  const saveEmployeeSalary = async (employee) => {
    const employeeId = employee._id || employee.id;
    const draft = salaryDrafts[employeeId] ?? (employee.salary_annual_usd == null ? '' : String(employee.salary_annual_usd));
    const salary = draft.trim() === '' ? null : Number(draft);
    if (salary !== null && (!Number.isFinite(salary) || salary < 0)) {
      toast.error('Annual salary must be a non-negative amount');
      return;
    }

    setSavingSalaryFor(employeeId);
    try {
      const response = await api.patch(`/hr/employees/${employeeId}/salary`, { salary_annual_usd: salary });
      setEmployees((current) => current.map((item) => (item._id || item.id) === employeeId
        ? { ...item, salary_annual_usd: response.data.salary_annual_usd }
        : item));
      setSalaryDrafts((current) => ({ ...current, [employeeId]: salary == null ? '' : String(salary) }));
      toast.success('Annual salary updated');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Unable to update annual salary');
    } finally {
      setSavingSalaryFor(null);
    }
  };

  const downloadEmployeeReport = () => {
    const rows = filteredEmployees.map((employee) => [employee.first_name, employee.last_name, employee.email, employee.role?.replace('_', ' '), employee.salary_annual_usd ?? '', employee.is_active === false ? 'Inactive' : 'Active']);
    const csv = [['First name', 'Last name', 'Email', 'Role', 'Annual salary (USD)', 'Status'], ...rows].map((row) => row.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hr-employee-directory.csv';
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Employee directory exported');
  };

  return (
    <div className="space-y-6" data-testid="hr-page">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--orange)' }}>People operations</p>
          <h2 className="text-3xl font-bold mt-1" style={{ color: 'var(--text-primary)' }}>HR Portal</h2>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>A single workspace for employee records, lifecycle workflows and compliance.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={loadHRData} className="px-4 py-2 rounded-lg border font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>Refresh</button>
          <button type="button" onClick={() => navigate('/analytics')} className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-semibold" style={{ background: 'var(--orange)' }}><BarChart3 size={16} /> Open reports</button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Metric label="Employees" value={loading ? '—' : activeEmployees.length} detail={`${employees.length - activeEmployees.length} inactive records`} icon={Users} color="#0EA5E9" />
        <Metric label="Pending leave work" value={loading ? '—' : pendingLeaves.length} detail="Requests needing review" icon={CalendarDays} color="#F59E0B" />
        <Metric label="Approved leave" value={loading ? '—' : approvedLeaves.length} detail="Across employee records" icon={CheckCircle2} color="#22C55E" />
        <Metric label="Compliance" value={compliance?.overall_status === 'compliant' ? 'Good' : 'Review'} detail={`${compliance?.sick_leave_eligible ?? 0} eligible employees`} icon={ShieldCheck} color="#8B5CF6" />
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div><h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Employee directory</h3><p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Profile, department assignment, role, contact and employment status.</p></div>
          <button type="button" onClick={downloadEmployeeReport} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}><Download size={15} /> Export directory</button>
        </div>
        <div className="relative mb-4"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, email or role" className="w-full pl-10 pr-4 py-2.5 rounded-lg border focus:outline-none" style={{ borderColor: 'var(--border)' }} /></div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr style={{ color: 'var(--text-secondary)' }}>
                <th className="py-2 pr-4">Employee</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Department</th>
                <th className="py-2 pr-4">Annual salary (USD)</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => {
                const employeeId = employee._id || employee.id;
                const salaryValue = salaryDrafts[employeeId] ?? (employee.salary_annual_usd == null ? '' : String(employee.salary_annual_usd));
                return (
                  <tr key={employeeId} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-3 pr-4"><p className="font-semibold">{employee.first_name} {employee.last_name}</p><p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{employee.email}</p></td>
                    <td className="py-3 pr-4 capitalize">{employee.role?.replace('_', ' ') || '—'}</td>
                    <td className="py-3 pr-4">{employee.team_name || employee.department || '—'}</td>
                    <td className="py-3 pr-4">
                      <div className="flex min-w-56 items-center gap-2">
                        <span aria-hidden="true">$</span>
                        <input
                          aria-label={`Annual salary for ${employee.first_name} ${employee.last_name} in USD`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={salaryValue}
                          onChange={(event) => setSalaryDrafts((current) => ({ ...current, [employeeId]: event.target.value }))}
                          placeholder="Not set"
                          className="w-32 rounded-md border px-2 py-1.5 focus:outline-none"
                          style={{ borderColor: 'var(--border)' }}
                        />
                        <button
                          type="button"
                          onClick={() => saveEmployeeSalary(employee)}
                          disabled={savingSalaryFor !== null}
                          aria-label={`Save annual salary for ${employee.first_name} ${employee.last_name}`}
                          title="Save annual salary"
                          className="rounded-md border p-1.5 disabled:opacity-50"
                          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                        ><Save size={15} /></button>
                        {employee.salary_annual_usd != null && <span className="whitespace-nowrap text-xs" style={{ color: 'var(--text-secondary)' }}>Saved: {salaryFormatter.format(employee.salary_annual_usd)}</span>}
                      </div>
                    </td>
                    <td className="py-3"><span className="px-2 py-1 rounded-full text-xs font-semibold" style={{ background: employee.is_active === false ? '#F3F4F6' : '#F0FDF4', color: employee.is_active === false ? '#6B7280' : '#15803D' }}>{employee.is_active === false ? 'Inactive' : 'Active'}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && filteredEmployees.length === 0 && <p className="text-center py-6 text-sm" style={{ color: 'var(--text-secondary)' }}>No employees match this search.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">{workflowGroups.map((group) => <div key={group.title} className="card"><h3 className="text-lg font-bold mb-4" style={{ color: 'var(--text-primary)' }}>{group.title}</h3><div className="space-y-2">{group.items.map(({ label, description, icon: Icon, tone, action }) => <button key={label} type="button" onClick={() => openAction(action)} className="w-full flex items-center gap-3 p-3 rounded-xl border text-left hover:shadow-sm transition-shadow" style={{ borderColor: 'var(--border)' }}><span className="p-2 rounded-lg flex-shrink-0" style={{ background: `${tone}18`, color: tone }}><Icon size={18} /></span><span className="flex-1 min-w-0"><span className="block font-semibold" style={{ color: 'var(--text-primary)' }}>{label}</span><span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{description}</span></span><ArrowRight size={16} style={{ color: 'var(--text-secondary)' }} /></button>)}</div></div>)}</div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[{ label: 'Leave management', detail: 'Review, approve/reject, balances and calendar', icon: CalendarDays, route: '/leave/all' }, { label: 'Attendance & timesheets', detail: 'Hours, missing entries and approvals', icon: Clock3, route: '/timesheets' }, { label: 'Performance & probation', detail: 'Goals, reviews and feedback cycles', icon: Landmark, route: '/performance' }].map(({ label, detail, icon: Icon, route }) => <button key={label} type="button" onClick={() => navigate(route)} className="card text-left hover:-translate-y-0.5 transition-transform"><Icon size={20} style={{ color: 'var(--orange)' }} /><p className="font-bold mt-3" style={{ color: 'var(--text-primary)' }}>{label}</p><p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{detail}</p><span className="inline-flex items-center gap-1 text-xs font-semibold mt-3" style={{ color: 'var(--orange)' }}>Open workflow <ArrowRight size={13} /></span></button>)}</div>

      {activePanel && <div className="card border-l-4" style={{ borderLeftColor: 'var(--orange)', background: 'var(--orange-pale)' }}><div className="flex items-center gap-3"><AlertTriangle size={20} style={{ color: 'var(--orange)' }} /><p className="text-sm" style={{ color: 'var(--text-primary)' }}>The {activePanel} workspace is ready to be connected to its dedicated HR records and approval workflow.</p></div></div>}
    </div>
  );
}

export default HRPage;
