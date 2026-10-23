import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { toast } from 'sonner';
import { Plus, X, Clock, DollarSign, CheckCircle, Trash2, Users } from 'lucide-react';

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const getWeekStr = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const year = d.getFullYear();
  const yearStart = new Date(year, 0, 1);
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
};

export default function TimesheetsPage() {
  const user = useAuthStore(s => s.user);
  const isManager = ['manager','team_lead','hr','admin'].includes(user?.role);
  const [data, setData] = useState({ entries: [], totalHours: 0, billableHours: 0 });
  const [summary, setSummary] = useState([]);
  const [week, setWeek] = useState(getWeekStr());
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ description: '', date: today(), hours: 1, activity_type: 'Work', billable: true, project_name: 'General' });
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('my');

  const fetch = useCallback(async () => {
    try {
      setLoading(true);
      const [entriesRes, summaryRes] = await Promise.all([
        api.get(`/time-entries?week=${week}`),
        isManager ? api.get(`/time-entries/summary?week=${week}`) : Promise.resolve({ data: [] }),
      ]);
      setData(entriesRes.data);
      setSummary(summaryRes.data);
    } catch { toast.error('Failed to load timesheets'); }
    finally { setLoading(false); }
  }, [week, isManager]);

  useEffect(() => { fetch(); }, [fetch]);

  const log = async () => {
    if (!form.description.trim() || !form.date || !form.hours) { toast.error('All fields required'); return; }
    setSaving(true);
    try {
      await api.post('/time-entries', form);
      setShowForm(false); setForm({ description: '', date: today(), hours: 1, activity_type: 'Work', billable: true, project_name: 'General' });
      toast.success('Time logged!');
      await fetch();
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const del = async (id) => {
    try {
      await api.delete(`/time-entries/${id}`);
      setData(d => {
        const removed = d.entries.find(entry => (entry._id || entry.id) === id);
        return {
          ...d,
          entries: d.entries.filter(entry => (entry._id || entry.id) !== id),
          totalHours: Math.max(0, d.totalHours - (removed?.hours || 0)),
          billableHours: Math.max(0, d.billableHours - (removed?.billable ? removed.hours : 0)),
        };
      });
      toast.success('Entry deleted');
    } catch (e) { toast.error(e.response?.data?.error || 'Failed'); }
  };

  const approve = async (id) => {
    try {
      const res = await api.patch(`/time-entries/${id}/approve`);
      setData(d => ({ ...d, entries: d.entries.map(e => (e._id || e.id) === id ? { ...res.data, id: res.data._id } : e) }));
      setSummary(current => current.map(member => ({
        ...member,
        time_entries: member.time_entries?.map(entry => (entry._id || entry.id) === id ? { ...entry, approved: true, approved_by: user.id } : entry),
      })));
      toast.success('Approved');
    } catch { toast.error('Failed'); }
  };

  // Group entries by date
  const grouped = data.entries.reduce((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e);
    return acc;
  }, {});

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Timesheets</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Track billable and non-billable hours</p>
        </div>
        <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white" style={{ background: 'var(--orange)' }}>
          <Plus size={18} /> Log Time
        </button>
      </div>

      {showForm && (
        <div className="card border-2 space-y-4" style={{ borderColor: 'var(--orange)' }}>
          <div className="flex items-center justify-between"><h3 className="font-bold">Log Time</h3><button onClick={() => setShowForm(false)}><X size={20} /></button></div>
          <div className="grid grid-cols-2 gap-3">
            <input type="text" placeholder="What did you work on? *" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="col-span-2 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }} />
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Hours</label>
              <input type="number" step="0.25" min="0.25" max="24" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: parseFloat(e.target.value) }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Activity</label>
              <select value={form.activity_type} onChange={e => setForm(f => ({ ...f, activity_type: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
                <option value="Work">Work</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <input type="text" placeholder="Project name" value={form.project_name} onChange={e => setForm(f => ({ ...f, project_name: e.target.value }))} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }} />
            <label className="flex items-center gap-2 text-sm cursor-pointer px-3 py-2 rounded-lg border" style={{ borderColor: 'var(--border)' }}>
              <input type="checkbox" checked={form.billable} onChange={e => setForm(f => ({ ...f, billable: e.target.checked }))} style={{ accentColor: 'var(--orange)' }} />
              Billable
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border-2 font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={log} disabled={saving} className="flex-1 py-2.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: 'var(--orange)' }}>{saving ? 'Logging…' : 'Log Time'}</button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card text-center">
          <Clock size={24} className="mx-auto mb-2" style={{ color: 'var(--orange)' }} />
          <p className="text-3xl font-bold" style={{ color: 'var(--orange)' }}>{data.totalHours.toFixed(1)}h</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total this week</p>
        </div>
        <div className="card text-center">
          <DollarSign size={24} className="mx-auto mb-2" style={{ color: 'var(--success)' }} />
          <p className="text-3xl font-bold" style={{ color: 'var(--success)' }}>{data.billableHours.toFixed(1)}h</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Billable</p>
        </div>
        <div className="card text-center">
          <p className="text-3xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
            {data.totalHours > 0 ? Math.round((data.billableHours / data.totalHours) * 100) : 0}%
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>Billable rate</p>
        </div>
      </div>

      {/* Tabs */}
      {isManager && (
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {[{ k: 'my', l: 'My Timesheet' }, { k: 'team', l: 'Team Summary' }].map(t => (
            <button key={t.k} onClick={() => setActiveTab(t.k)} className="px-4 py-3 font-semibold text-sm transition-colors" style={{ color: activeTab === t.k ? 'var(--orange)' : 'var(--text-secondary)', borderBottom: activeTab === t.k ? '2px solid var(--orange)' : '2px solid transparent' }}>
              {t.l}
            </button>
          ))}
        </div>
      )}

      {/* Week picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Week:</label>
        <input type="week" value={week} onChange={e => setWeek(e.target.value)} className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }} />
      </div>

      {activeTab === 'my' && (
        <div className="space-y-4">
          {Object.keys(grouped).length === 0 ? (
            <div className="card text-center py-12"><Clock size={40} className="mx-auto mb-3" style={{ color: 'var(--border)' }} /><p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>No entries this week</p></div>
          ) : Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([date, entries]) => (
            <div key={date} className="card">
              <div className="flex items-center justify-between mb-3">
                <p className="font-bold">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                <p className="text-sm font-semibold" style={{ color: 'var(--orange)' }}>{entries.reduce((s, e) => s + e.hours, 0).toFixed(1)}h</p>
              </div>
              <div className="space-y-2">
                {entries.map(entry => {
                  const eid = entry._id || entry.id;
                  return (
                    <div key={eid} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{entry.description}</p>
                        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.activity_type || 'Work'} · {entry.project_name}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: entry.billable ? '#F0FDF4' : '#F3F4F6', color: entry.billable ? '#22C55E' : '#6B7280' }}>
                          {entry.billable ? '💰 Billable' : 'Non-billable'}
                        </span>
                        <span className="font-bold text-sm" style={{ color: 'var(--orange)' }}>{entry.hours}h</span>
                        {entry.approved && <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
                        {!entry.approved && <button onClick={() => del(eid)} className="p-1 rounded hover:bg-red-50" style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'team' && isManager && (
        <div className="card">
          <h3 className="font-bold mb-4">Team Hours This Week</h3>
          <div className="space-y-3">
            {summary.map((s, i) => (
              <div key={i} className="flex flex-wrap items-center gap-4 p-3 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0" style={{ background: 'var(--orange)' }}>
                  {s.user?.first_name?.charAt(0)}{s.user?.last_name?.charAt(0)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{s.user?.first_name} {s.user?.last_name}</p>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, (s.total_hours / 40) * 100)}%`, background: 'var(--orange)' }} />
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold" style={{ color: 'var(--orange)' }}>{s.total_hours.toFixed(1)}h</p>
                  <p className="text-xs" style={{ color: 'var(--success)' }}>{s.billable_hours.toFixed(1)}h billable</p>
                </div>
                <div className="w-full basis-full space-y-2 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
                  {s.time_entries?.map(entry => (
                    <div key={entry._id || entry.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{entry.date} · {entry.description} <span style={{ color: 'var(--text-secondary)' }}>({entry.project_name})</span></span>
                      <span className="flex flex-shrink-0 items-center gap-2">
                        <span className="font-semibold">{entry.hours}h</span>
                        {entry.approved ? <CheckCircle size={15} style={{ color: 'var(--success)' }} /> : String(s.user?._id || s.user?.id) !== String(user?.id) && <button type="button" onClick={() => approve(entry._id || entry.id)} className="p-1 rounded hover:bg-green-50" title="Approve time entry" aria-label="Approve time entry"><CheckCircle size={16} style={{ color: 'var(--success)' }} /></button>}
                      </span>
                    </div>
                  ))}
                  {!s.time_entries?.length && <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>No entries this week</p>}
                </div>
              </div>
            ))}
            {summary.length === 0 && <p className="text-center py-8 text-sm" style={{ color: 'var(--text-secondary)' }}>No team data available</p>}
          </div>
        </div>
      )}
    </div>
  );
}
