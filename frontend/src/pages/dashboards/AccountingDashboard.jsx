import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/axios';
import { DollarSign, TrendingUp, CheckCircle, Clock, BarChart3 } from 'lucide-react';

function PayrollBarChart({ data }) {
  const maxValue = Math.max(...data.map(item => Math.abs(item.value)), 1);

  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ height: 220 }}>
      {data.map((item) => (
        <div key={item.label} className="flex h-full min-w-16 flex-1 flex-col items-center justify-end gap-2">
          <span className="text-xs font-semibold text-center" style={{ color: 'var(--text-primary)' }}>{item.displayValue}</span>
          <div
            className="w-full max-w-20 rounded-t transition-all duration-500"
            style={{ height: `${Math.max((Math.abs(item.value) / maxValue) * 145, item.value ? 6 : 0)}px`, background: item.color || 'var(--orange)' }}
            title={`${item.label}: ${item.displayValue}`}
          />
          <span className="w-full truncate text-center text-xs" style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function PayrollStatCard({ label, value, detail, icon: Icon, color, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className="card w-full text-left transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2"
      style={{ borderColor: selected ? 'var(--orange)' : 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</p>
        <Icon size={18} style={{ color }} />
      </div>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{detail}</p>
    </button>
  );
}

function AccountingDashboard() {
  const navigate = useNavigate();
  const [payrollData, setPayrollData] = useState(null);
  const [leaveImpact, setLeaveImpact] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedPayrollMetric, setSelectedPayrollMetric] = useState('total');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Mock data for demo
    setPayrollData({
      total: 245000,
      deductions: 12500,
      pending: 8,
      processed: 142,
    });

    setLeaveImpact([
      { department: 'Engineering', unpaid_days: 12, cost_impact: 8400 },
      { department: 'Sales', unpaid_days: 5, cost_impact: 3200 },
      { department: 'Marketing', unpaid_days: 8, cost_impact: 5100 },
      { department: 'Support', unpaid_days: 3, cost_impact: 1800 },
    ]);

    setTransactions([
      { id: 1, type: 'Leave Deduction', employee: 'James Wu', amount: -450, date: '2026-04-18', status: 'processed' },
      { id: 2, type: 'Donation Credit', employee: 'Sarah Chen', amount: 320, date: '2026-04-17', status: 'processed' },
      { id: 3, type: 'Emergency Leave', employee: 'Diana Martinez', amount: -680, date: '2026-04-15', status: 'pending' },
      { id: 4, type: 'Leave Deduction', employee: 'Michael Brown', amount: -520, date: '2026-04-14', status: 'processed' },
    ]);
  };

  const payrollCharts = {
    total: {
      title: 'Total Payroll',
      description: 'Reported payroll total for this month.',
      data: [{
        label: 'This month',
        value: payrollData?.total || 0,
        displayValue: `$${(payrollData?.total || 0).toLocaleString()}`,
        color: '#22C55E',
      }],
    },
    deductions: {
      title: 'Leave Deductions',
      description: 'Reported unpaid leave deduction total.',
      data: [{
        label: 'This month',
        value: payrollData?.deductions || 0,
        displayValue: `$${(payrollData?.deductions || 0).toLocaleString()}`,
        color: '#DC2626',
      }],
    },
    pending: {
      title: 'Payroll Items by Status',
      description: 'Pending items compared with processed transaction records.',
      data: [
        { label: 'Pending items', value: payrollData?.pending || 0, displayValue: String(payrollData?.pending || 0), color: '#F59E0B' },
        { label: 'Processed items', value: payrollData?.processed || 0, displayValue: String(payrollData?.processed || 0), color: '#22C55E' },
      ],
    },
    processed: {
      title: 'Processed Transaction Amounts',
      description: 'Recent payroll-related transaction values, grouped by employee and type.',
      data: transactions.map(transaction => ({
        label: transaction.employee.split(' ')[0],
        value: Math.abs(transaction.amount),
        displayValue: `${transaction.amount > 0 ? '+' : '-'}$${Math.abs(transaction.amount).toLocaleString()}`,
        color: transaction.status === 'processed' ? '#22C55E' : '#F59E0B',
      })),
    },
    departmentDays: {
      title: 'Unpaid Leave Days by Department',
      description: 'Unpaid leave days behind the department cost impact.',
      data: leaveImpact.map(department => ({
        label: department.department,
        value: department.unpaid_days,
        displayValue: `${department.unpaid_days} days`,
        color: '#F59E0B',
      })),
    },
    transactions: {
      title: 'Recent Transaction Amounts',
      description: 'Amounts shown by transaction, colored by processing status.',
      data: transactions.map(transaction => ({
        label: transaction.type.replace(' ', '\n'),
        value: Math.abs(transaction.amount),
        displayValue: `${transaction.amount > 0 ? '+' : '-'}$${Math.abs(transaction.amount).toLocaleString()}`,
        color: transaction.status === 'processed' ? '#22C55E' : '#F59E0B',
      })),
    },
  };
  const activePayrollChart = payrollCharts[selectedPayrollMetric];

  return (
    <div className="space-y-6" data-testid="accounting-dashboard">
      {/* Payroll Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <PayrollStatCard label="Total Payroll" value={`$${payrollData?.total.toLocaleString()}`} detail="This month" icon={DollarSign} color="var(--success)" selected={selectedPayrollMetric === 'total'} onClick={() => setSelectedPayrollMetric('total')} />
        <PayrollStatCard label="Leave Deductions" value={`$${payrollData?.deductions.toLocaleString()}`} detail="Unpaid leave impact" icon={TrendingUp} color="var(--danger)" selected={selectedPayrollMetric === 'deductions'} onClick={() => setSelectedPayrollMetric('deductions')} />
        <PayrollStatCard label="Pending Items" value={payrollData?.pending} detail="Awaiting approval" icon={Clock} color="var(--warning)" selected={selectedPayrollMetric === 'pending'} onClick={() => setSelectedPayrollMetric('pending')} />
        <PayrollStatCard label="Processed" value={payrollData?.processed} detail="This month" icon={CheckCircle} color="var(--success)" selected={selectedPayrollMetric === 'processed'} onClick={() => setSelectedPayrollMetric('processed')} />
      </div>

      <section className="card border-l-4" style={{ borderLeftColor: 'var(--orange)' }} aria-live="polite">
        <div className="flex items-center gap-3 mb-5">
          <BarChart3 size={20} style={{ color: 'var(--orange)' }} />
          <div>
            <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{activePayrollChart.title}</h3>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{activePayrollChart.description}</p>
          </div>
        </div>
        {activePayrollChart.data.length ? <PayrollBarChart data={activePayrollChart.data} /> : (
          <p className="py-10 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>No payroll data available for this graph yet.</p>
        )}
      </section>

      {/* Leave Impact by Department */}
      <div
        className="card cursor-pointer transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2"
        role="button"
        tabIndex={0}
        aria-pressed={selectedPayrollMetric === 'departmentDays'}
        onClick={() => setSelectedPayrollMetric('departmentDays')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedPayrollMetric('departmentDays');
          }
        }}
        style={{ borderColor: selectedPayrollMetric === 'departmentDays' ? 'var(--orange)' : 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
      >
        <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Leave Impact by Department
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Department
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Unpaid Days
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Cost Impact
                </th>
                <th className="text-left py-3 px-4 font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {leaveImpact.map((dept, idx) => (
                <tr
                  key={idx}
                  className="border-b hover:bg-orange-50 transition-colors"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <td className="py-3 px-4">
                    <span className="font-medium">{dept.department}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold">{dept.unpaid_days}</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold" style={{ color: 'var(--danger)' }}>
                      ${dept.cost_impact.toLocaleString()}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="h-2 rounded-full"
                        style={{
                          background: 'var(--danger)',
                          width: `${(dept.unpaid_days / 15) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Integration Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">Gusto Integration</h4>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold text-white"
              style={{ background: 'var(--success)' }}
            >
              Connected
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Last sync: 2 hours ago
          </p>
          <button
            className="w-full py-2 rounded-lg font-medium border-2 transition-all duration-200 hover:-translate-y-0.5"
            style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
          >
            Sync Now
          </button>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h4 className="font-semibold">ADP Integration</h4>
            <span
              className="px-3 py-1 rounded-full text-xs font-semibold text-white"
              style={{ background: 'var(--success)' }}
            >
              Connected
            </span>
          </div>
          <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
            Last sync: 1 hour ago
          </p>
          <button
            className="w-full py-2 rounded-lg font-medium border-2 transition-all duration-200 hover:-translate-y-0.5"
            style={{ borderColor: 'var(--orange)', color: 'var(--orange)' }}
          >
            Sync Now
          </button>
        </div>
      </div>

      {/* Recent Transactions */}
      <div
        className="card cursor-pointer transition-all hover:-translate-y-0.5 focus:outline-none focus:ring-2"
        role="button"
        tabIndex={0}
        aria-pressed={selectedPayrollMetric === 'transactions'}
        onClick={() => setSelectedPayrollMetric('transactions')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setSelectedPayrollMetric('transactions');
          }
        }}
        style={{ borderColor: selectedPayrollMetric === 'transactions' ? 'var(--orange)' : 'var(--border)', '--tw-ring-color': 'var(--orange)' }}
      >
        <h3 className="text-xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
          Recent Transactions
        </h3>
        <div className="space-y-3">
          {transactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between p-4 rounded-lg border hover:shadow-md transition-all duration-200"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    background: txn.amount > 0 ? '#F0FDF4' : '#FEF2F2',
                    color: txn.amount > 0 ? 'var(--success)' : 'var(--danger)',
                  }}
                >
                  <DollarSign size={24} />
                </div>
                <div>
                  <p className="font-semibold">{txn.type}</p>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {txn.employee}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className="text-lg font-bold"
                  style={{ color: txn.amount > 0 ? 'var(--success)' : 'var(--danger)' }}
                >
                  {txn.amount > 0 ? '+' : ''}${Math.abs(txn.amount)}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {new Date(txn.date).toLocaleDateString()}
                </p>
                <span
                  className="px-2 py-1 rounded text-xs font-semibold text-white mt-1 inline-block"
                  style={{
                    background: txn.status === 'processed' ? 'var(--success)' : 'var(--warning)',
                  }}
                >
                  {txn.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AccountingDashboard;
