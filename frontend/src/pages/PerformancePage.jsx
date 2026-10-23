import { useEffect, useState, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { toast } from 'sonner';
import { Plus, X, Target, TrendingUp, TrendingDown, Minus, MessageCircle, ChevronDown, ChevronUp, Download } from 'lucide-react';

const STATUS_CONFIG = {
  on_track:  { label: 'On Track',  color: '#22C55E', bg: '#F0FDF4' },
  at_risk:   { label: 'At Risk',   color: '#F59E0B', bg: '#FFF7ED' },
  off_track: { label: 'Off Track', color: '#DC2626', bg: '#FEF2F2' },
  completed: { label: 'Completed', color: '#6B7280', bg: '#F9FAFB' },
};
const MOOD_CONFIG = {
  great:      { emoji: '😄', label: 'Great',      color: '#22C55E' },
  good:       { emoji: '🙂', label: 'Good',       color: '#3B82F6' },
  okay:       { emoji: '😐', label: 'Okay',       color: '#F59E0B' },
  struggling: { emoji: '😔', label: 'Struggling', color: '#DC2626' },
};

const escapeReportText = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function OKRCard({ okr, onUpdate }) {
  const user = useAuthStore(s => s.user);
  const myId = user?._id || user?.id;
  const [expanded, setExpanded] = useState(false);
  const [checkIn, setCheckIn] = useState('');
  const [mood, setMood] = useState('good');
  const [saving, setSaving] = useState(false);
  const sc = STATUS_CONFIG[okr.status] || STATUS_CONFIG.on_track;

  const avgPct = okr.key_results?.length
    ? Math.round(okr.key_results.reduce((s, kr) => s + (kr.target ? Math.min(100, (kr.current / kr.target) * 100) : 0), 0) / okr.key_results.length)
    : 0;

  const updateKR = async (krId, current) => {
    try {
      const res = await api.patch(`/okrs/${okr._id || okr.id}/key-results/${krId}`, { current: parseFloat(current) });
      onUpdate(res.data);
    } catch { toast.error('Failed to update'); }
  };

  const submitCheckIn = async () => {
    if (!checkIn.trim()) return;
    setSaving(true);
    try {
      const res = await api.post(`/okrs/${okr._id || okr.id}/check-ins`, { note: checkIn, mood });
      onUpdate(res.data);
      setCheckIn('');
      toast.success('Check-in added!');
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const isOwner = (okr.owner_id?._id || okr.owner_id)?.toString() === myId?.toString();

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-lg">{okr.title}</h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'var(--orange-pale)', color: 'var(--orange)' }}>{okr.quarter}</span>
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Owner: {okr.owner_id?.first_name} {okr.owner_id?.last_name}
            {okr.manager_id && ` · Manager: ${okr.manager_id?.first_name} ${okr.manager_id?.last_name}`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: sc.color }}>{avgPct}%</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>overall</p>
          </div>
          <button onClick={() => setExpanded(v => !v)} className="p-1 rounded hover:bg-gray-100">
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Overall progress bar */}
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${avgPct}%`, background: sc.color }} />
      </div>

      {expanded && (
        <div className="space-y-4 pt-2">
          {/* Key Results */}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Key Results</p>
            <div className="space-y-3">
              {okr.key_results?.map((kr, i) => {
                const pct = kr.target ? Math.min(100, Math.round((kr.current / kr.target) * 100)) : 0;
                return (
                  <div key={kr._id || i} className="p-3 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold flex-1 mr-3">{kr.title}</p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isOwner ? (
                          <input
                            type="number"
                            defaultValue={kr.current}
                            onBlur={e => updateKR(kr._id, e.target.value)}
                            className="w-16 px-2 py-1 rounded border text-sm text-center"
                            style={{ borderColor: 'var(--border)' }}
                          />
                        ) : (
                          <span className="font-bold text-sm">{kr.current}</span>
                        )}
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>/ {kr.target} {kr.unit}</span>
                        <span className="text-sm font-bold" style={{ color: pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#DC2626' }}>{pct}%</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#DC2626' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Check-ins */}
          {okr.check_ins?.length > 0 && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>Check-ins</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...okr.check_ins].reverse().map((ci, i) => {
                  const mc = MOOD_CONFIG[ci.mood] || MOOD_CONFIG.good;
                  return (
                    <div key={i} className="flex gap-3 p-3 rounded-xl" style={{ background: 'var(--page-bg)' }}>
                      <span className="text-xl flex-shrink-0">{mc.emoji}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold">{ci.author_id?.first_name} {ci.author_id?.last_name}</span>
                          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{new Date(ci.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{ci.note}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add check-in */}
          <div className="p-4 rounded-xl border-2" style={{ borderColor: 'var(--orange)', background: 'var(--orange-pale)' }}>
            <p className="text-sm font-bold mb-3">Add Weekly Check-in</p>
            <div className="flex gap-2 mb-3">
              {Object.entries(MOOD_CONFIG).map(([key, mc]) => (
                <button key={key} onClick={() => setMood(key)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all" style={{ background: mood === key ? mc.color : 'white', color: mood === key ? 'white' : 'var(--text-primary)', border: `2px solid ${mood === key ? mc.color : 'var(--border)'}` }}>
                  {mc.emoji} {mc.label}
                </button>
              ))}
            </div>
            <textarea value={checkIn} onChange={e => setCheckIn(e.target.value)} rows={3} placeholder="How's progress this week? Any blockers?" className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none" style={{ borderColor: 'var(--border)' }} />
            <button onClick={submitCheckIn} disabled={!checkIn.trim() || saving} className="mt-2 px-4 py-2 rounded-lg font-semibold text-white text-sm disabled:opacity-50" style={{ background: 'var(--orange)' }}>
              {saving ? 'Saving…' : 'Add Check-in'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PerformancePage() {
  const user = useAuthStore(s => s.user);
  const myId = user?._id || user?.id;
  const [okrs, setOkrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', quarter: 'Q2 2026', key_results: [{ title: '', target: 100, unit: '%' }] });
  const [managers, setManagers] = useState([]);
  const [selectedManager, setSelectedManager] = useState('');
  const [saving, setSaving] = useState(false);

  const fetch = useCallback(async () => {
    try {
      const [okrRes, userRes] = await Promise.all([api.get('/okrs'), api.get('/messages/contacts')]);
      setOkrs(okrRes.data);
      setManagers(userRes.data.filter(u => ['manager','team_lead'].includes(u.role)));
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const addKR = () => setForm(f => ({ ...f, key_results: [...f.key_results, { title: '', target: 100, unit: '%' }] }));
  const removeKR = (i) => setForm(f => ({ ...f, key_results: f.key_results.filter((_, idx) => idx !== i) }));
  const updateKR = (i, field, val) => setForm(f => ({ ...f, key_results: f.key_results.map((kr, idx) => idx === i ? { ...kr, [field]: val } : kr) }));

  const create = async () => {
    if (!form.title.trim()) { toast.error('Title required'); return; }
    setSaving(true);
    try {
      const res = await api.post('/okrs', { ...form, manager_id: selectedManager || undefined });
      setOkrs(p => [res.data, ...p]);
      setShowForm(false);
      setForm({ title: '', quarter: 'Q2 2026', key_results: [{ title: '', target: 100, unit: '%' }] });
      toast.success('OKR created!');
    } catch { toast.error('Failed'); }
    finally { setSaving(false); }
  };

  const updateOKR = (updated) => setOkrs(p => p.map(o => (o._id || o.id) === (updated._id || updated.id) ? updated : o));

  const myOKRs = okrs.filter(o => (o.owner_id?._id || o.owner_id)?.toString() === myId?.toString());
  const reportsOKRs = okrs.filter(o => (o.manager_id?._id || o.manager_id)?.toString() === myId?.toString() && (o.owner_id?._id || o.owner_id)?.toString() !== myId?.toString());

  const downloadMonthlyPerformance = () => {
    const reportDate = new Date();
    const monthLabel = reportDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const fileMonth = `${reportDate.getFullYear()}-${String(reportDate.getMonth() + 1).padStart(2, '0')}`;
    const employeeName = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'Employee';
    const reportOKRs = [...myOKRs, ...reportsOKRs];
    const okrRows = reportOKRs.length
      ? reportOKRs.map((okr) => {
        const progress = okr.key_results?.length
          ? Math.round(okr.key_results.reduce((sum, result) => sum + (result.target ? Math.min(100, (result.current / result.target) * 100) : 0), 0) / okr.key_results.length)
          : 0;
        return `<tr><td>${escapeReportText(okr.title)}</td><td>${escapeReportText(okr.quarter)}</td><td>${escapeReportText(STATUS_CONFIG[okr.status]?.label || 'On Track')}</td><td>${progress}%</td></tr>`;
      }).join('')
      : '<tr><td colspan="4">No OKRs recorded.</td></tr>';
    const checkIns = reportOKRs.flatMap((okr) => (okr.check_ins || []).map((checkIn) => ({ ...checkIn, objective: okr.title })));
    const checkInRows = checkIns.length
      ? checkIns.map((checkIn) => `<tr><td>${escapeReportText(new Date(checkIn.createdAt).toLocaleDateString('en-US'))}</td><td>${escapeReportText(checkIn.objective)}</td><td>${escapeReportText(MOOD_CONFIG[checkIn.mood]?.label || checkIn.mood)}</td><td>${escapeReportText(checkIn.note)}</td></tr>`).join('')
      : '<tr><td colspan="4">No check-ins recorded.</td></tr>';
    const report = `<!doctype html><html><head><meta charset="utf-8"><title>Monthly Performance Report</title><style>body{font-family:Arial,sans-serif;color:#1f2937;padding:32px}h1{color:#f4631e}h2{margin-top:28px;color:#374151}.meta{color:#6b7280}.stats{display:flex;gap:16px;margin:20px 0}.stat{border:1px solid #d1d5db;padding:14px;min-width:130px}.value{font-size:24px;font-weight:700}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #d1d5db;padding:10px;text-align:left}th{background:#f3f4f6}</style></head><body><h1>Monthly Performance Report</h1><p class="meta"><strong>Reporting month:</strong> ${escapeReportText(monthLabel)}<br><strong>Employee:</strong> ${escapeReportText(employeeName)}<br><strong>Role:</strong> ${escapeReportText(user?.role?.replace('_', ' ') || 'Employee')}</p><h2>Summary</h2><div class="stats"><div class="stat"><div>Objectives</div><div class="value">${reportOKRs.length}</div></div><div class="stat"><div>Check-ins</div><div class="value">${checkIns.length}</div></div><div class="stat"><div>Average progress</div><div class="value">${reportOKRs.length ? Math.round(reportOKRs.reduce((sum, okr) => sum + (okr.key_results?.length ? okr.key_results.reduce((total, result) => total + (result.target ? Math.min(100, (result.current / result.target) * 100) : 0), 0) / okr.key_results.length : 0), 0) / reportOKRs.length) : 0}%</div></div></div><h2>Objectives and key results</h2><table><thead><tr><th>Objective</th><th>Quarter</th><th>Status</th><th>Progress</th></tr></thead><tbody>${okrRows}</tbody></table><h2>Feedback check-ins</h2><table><thead><tr><th>Date</th><th>Objective</th><th>Mood</th><th>Notes</th></tr></thead><tbody>${checkInRows}</tbody></table><p class="meta">Generated on ${escapeReportText(reportDate.toLocaleString('en-US'))} from Happen.</p></body></html>`;
    const url = URL.createObjectURL(new Blob([report], { type: 'application/msword' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `monthly-performance-${employeeName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${fileMonth}.doc`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Monthly performance document downloaded');
  };

  if (loading) return <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }} /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Performance & 1-on-1s</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>OKRs, key results, and weekly check-ins</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadMonthlyPerformance} className="flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
            <Download size={17} /> Download monthly report
          </button>
          <button onClick={() => setShowForm(v => !v)} className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white" style={{ background: 'var(--orange)' }}>
            <Plus size={18} /> New OKR
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card border-2 space-y-4" style={{ borderColor: 'var(--orange)' }}>
          <div className="flex items-center justify-between"><h3 className="font-bold text-lg">New OKR</h3><button onClick={() => setShowForm(false)}><X size={20} /></button></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Objective *</label>
              <input type="text" placeholder="What do you want to achieve?" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none" style={{ borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Quarter</label>
              <select value={form.quarter} onChange={e => setForm(f => ({ ...f, quarter: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
                {['Q1 2026','Q2 2026','Q3 2026','Q4 2026'].map(q => <option key={q}>{q}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>Share with Manager (optional)</label>
            <select value={selectedManager} onChange={e => setSelectedManager(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }}>
              <option value="">— None —</option>
              {managers.map(m => <option key={m._id || m.id} value={m._id || m.id}>{m.first_name} {m.last_name} ({m.role?.replace('_',' ')})</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Key Results</label>
              <button onClick={addKR} className="text-xs font-semibold" style={{ color: 'var(--orange)' }}>+ Add KR</button>
            </div>
            {form.key_results.map((kr, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input type="text" placeholder={`KR ${i+1}: measurable outcome`} value={kr.title} onChange={e => updateKR(i, 'title', e.target.value)} className="flex-1 px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--border)' }} />
                <input type="number" placeholder="Target" value={kr.target} onChange={e => updateKR(i, 'target', e.target.value)} className="w-20 px-2 py-2 rounded-lg border text-sm text-center" style={{ borderColor: 'var(--border)' }} />
                <input type="text" placeholder="Unit" value={kr.unit} onChange={e => updateKR(i, 'unit', e.target.value)} className="w-16 px-2 py-2 rounded-lg border text-sm text-center" style={{ borderColor: 'var(--border)' }} />
                {form.key_results.length > 1 && <button onClick={() => removeKR(i)} className="p-2 text-red-400 hover:text-red-600"><X size={16} /></button>}
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border-2 font-semibold" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            <button onClick={create} disabled={saving} className="flex-1 py-2.5 rounded-lg font-bold text-white disabled:opacity-50" style={{ background: 'var(--orange)' }}>{saving ? 'Creating…' : 'Create OKR'}</button>
          </div>
        </div>
      )}

      {myOKRs.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>My OKRs ({myOKRs.length})</p>
          <div className="space-y-4">{myOKRs.map(o => <OKRCard key={o._id || o.id} okr={o} onUpdate={updateOKR} />)}</div>
        </div>
      )}

      {reportsOKRs.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: 'var(--text-secondary)' }}>My Reports' OKRs ({reportsOKRs.length})</p>
          <div className="space-y-4">{reportsOKRs.map(o => <OKRCard key={o._id || o.id} okr={o} onUpdate={updateOKR} />)}</div>
        </div>
      )}

      {okrs.length === 0 && (
        <div className="card text-center py-16">
          <Target size={48} className="mx-auto mb-4" style={{ color: 'var(--border)' }} />
          <p className="font-semibold text-lg" style={{ color: 'var(--text-secondary)' }}>No OKRs yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Create your first objective above</p>
        </div>
      )}
    </div>
  );
}
