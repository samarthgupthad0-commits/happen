import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { toast } from 'sonner';
import { formatApiErrorDetail } from '../utils/formatError';

function CalendarPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [calendarData, setCalendarData] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    fetchCalendar();
  }, [currentMonth, currentYear]);

  const fetchCalendar = async () => {
    try {
      setLoading(true);
      // Use company calendar endpoint for managers/HR/admin, team calendar for others
      const isManager = ['manager', 'hr', 'admin'].includes(user?.role);
      
      if (isManager) {
        const res = await api.get(`/company/calendar?month=${currentMonth}&year=${currentYear}`);
        setCalendarData(res.data);
      } else if (user?.team_id) {
        const res = await api.get(`/teams/${user.team_id?._id || user.team_id}/calendar`);
        setCalendarData(res.data);
      }
    } catch (error) {
      toast.error(formatApiErrorDetail(error.response?.data?.detail) || 'Failed to fetch calendar');
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (month, year) => {
    return new Date(year, month, 0).getDate();
  };

  const daysInMonth = getDaysInMonth(currentMonth, currentYear);
  const firstDayOfMonth = new Date(currentYear, currentMonth - 1, 1).getDay();

  // Group leaves by date
  const leavesByDate = {};
  calendarData?.forEach((leave) => {
    const start = new Date(leave.start_date);
    const end = new Date(leave.end_date);
    
    // Expand multi-day leaves to all dates in the range
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      if (!leavesByDate[dateStr]) {
        leavesByDate[dateStr] = [];
      }
      leavesByDate[dateStr].push(leave);
    }
  });

  const getLeaveColor = (status) => {
    switch (status) {
      case 'approved':
        return 'var(--success)';
      case 'emergency':
        return '#DC2626';
      case 'pending':
        return 'var(--warning)';
      default:
        return 'var(--orange)';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: 'var(--orange)' }}></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="calendar-page">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {['manager', 'hr', 'admin'].includes(user?.role) ? 'Company Calendar' : 'Team Calendar'}
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Showing pending, approved, and emergency leaves
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (currentMonth === 1) {
                setCurrentMonth(12);
                setCurrentYear(currentYear - 1);
              } else {
                setCurrentMonth(currentMonth - 1);
              }
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-150"
            data-testid="prev-month"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-semibold min-w-[150px] text-center">
            {new Date(currentYear, currentMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => {
              if (currentMonth === 12) {
                setCurrentMonth(1);
                setCurrentYear(currentYear + 1);
              } else {
                setCurrentMonth(currentMonth + 1);
              }
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors duration-150"
            data-testid="next-month"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      <div className="card">
        <div className="grid grid-cols-7 gap-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-center font-semibold py-2" style={{ color: 'var(--text-secondary)' }}>
              {day}
            </div>
          ))}
          {Array.from({ length: firstDayOfMonth }).map((_, idx) => (
            <div key={`empty-${idx}`} className="aspect-square"></div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayLeaves = leavesByDate[dateStr] || [];
            const isToday = 
              day === new Date().getDate() && 
              currentMonth === new Date().getMonth() + 1 && 
              currentYear === new Date().getFullYear();

            return (
              <div
                key={day}
                className="p-2 rounded-lg border transition-all duration-150 min-h-28 relative"
                style={{
                  borderColor: dayLeaves.length > 0 ? 'var(--orange)' : 'var(--border)',
                  background: dayLeaves.length > 0 ? 'var(--orange-pale)' : isToday ? '#FFF7ED' : 'white',
                  borderWidth: isToday ? '2px' : '1px',
                }}
                data-testid={`calendar-day-${day}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span 
                    className={`text-sm font-medium ${isToday ? 'font-bold' : ''}`}
                    style={{ color: isToday ? 'var(--orange)' : 'var(--text-primary)' }}
                  >
                    {day}
                  </span>
                  {dayLeaves.length > 0 && (
                    <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
                      <Users size={12} />
                      <span>{dayLeaves.length}</span>
                    </div>
                  )}
                </div>
                {dayLeaves.length > 0 && (
                  <div className="space-y-1 overflow-hidden">
                    {dayLeaves.slice(0, 3).map((leave, idx) => (
                      <div
                        key={idx}
                        className="text-xs px-2 py-1 rounded truncate text-white font-medium"
                        style={{
                          background: getLeaveColor(leave.status),
                        }}
                        title={`${leave.first_name} ${leave.last_name} - ${leave.type} (${leave.status})`}
                      >
                        {leave.first_name} {leave.last_name.charAt(0)}.
                      </div>
                    ))}
                    {dayLeaves.length > 3 && (
                      <div 
                        className="text-xs px-2 py-1 text-center font-medium rounded"
                        style={{ 
                          color: 'var(--orange)',
                          background: 'rgba(244, 99, 30, 0.1)'
                        }}
                      >
                        +{dayLeaves.length - 3} more
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: 'var(--success)' }}></div>
            <span className="text-sm">Approved Leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: '#DC2626' }}></div>
            <span className="text-sm">Emergency Leave</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: 'var(--warning)' }}></div>
            <span className="text-sm">Pending</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ background: 'var(--orange)' }}></div>
            <span className="text-sm">Today</span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Total People on Leave This Month
          </p>
          <p className="text-3xl font-bold" style={{ color: 'var(--orange)' }}>
            {new Set(calendarData.map(l => l.first_name + l.last_name)).size}
          </p>
        </div>
        <div className="card">
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Total Leave Days This Month
          </p>
          <p className="text-3xl font-bold" style={{ color: 'var(--success)' }}>
            {Object.keys(leavesByDate).length}
          </p>
        </div>
        <div className="card">
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
            Emergency Leaves
          </p>
          <p className="text-3xl font-bold" style={{ color: '#DC2626' }}>
            {calendarData.filter(l => l.status === 'emergency').length}
          </p>
        </div>
      </div>
    </div>
  );
}

export default CalendarPage;
