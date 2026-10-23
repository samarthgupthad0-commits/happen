import express from 'express'
import LeaveRequest from '../db/models/LeaveRequest.js'
import User from '../db/models/User.js'
import Team from '../db/models/Team.js'
import Notification from '../db/models/Notification.js'
import AuditLog from '../db/models/AuditLog.js'
import Override from '../db/models/Override.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'
import { getEmployeeTaskStats } from './projects.js'

const router = express.Router()

const fmt          = (d) => new Date(d).toISOString().split('T')[0]
const todayStr     = ()  => fmt(new Date())
const tomorrowStr  = ()  => fmt(new Date(Date.now() + 86400000))
const oneWeekAhead = ()  => fmt(new Date(Date.now() + 7 * 86400000))
const isDateString = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

// Only HR + manager receive leave notifications
async function notifyHRManager(title, message, type = 'info', refUserId = null) {
  const [hrUsers, manager] = await Promise.all([
    User.find({ role: 'hr' }, '_id').lean(),
    User.findOne({ role: 'manager' }, '_id').lean(),
  ])
  const ids = [...hrUsers.map(h => h._id), manager?._id].filter(Boolean)
  const link = refUserId ? `/current-leaves?employee=${refUserId}` : '/current-leaves'
  if (ids.length) await Notification.insertMany(ids.map(uid => ({ user_id: uid, title, message, type, link, ref_user_id: refUserId })))
}

async function canManageLeaveRequest(req, leaveRequest) {
  const actor = await User.findById(req.user.id, 'role team_id').lean()
  if (['manager', 'hr', 'admin'].includes(actor?.role)) return true
  if (actor?.role !== 'team_lead' || !actor.team_id) return false
  const owner = await User.findById(leaveRequest.user_id, 'team_id').lean()
  return owner?.team_id?.toString() === actor.team_id.toString()
}

// ── GET /api/leave-requests/queue  (all queued, global, sorted by position)
// NOTE: must be before /:id to avoid Express matching 'queue' as an id param
router.get('/queue', verifyToken, async (req, res) => {
  try {
    const queue = await LeaveRequest.find({ status: 'queued' })
      .populate('user_id', 'first_name last_name avatar team_id')
      .sort({ queue_position: 1, createdAt: 1 })
      .lean()
    res.json(queue.map(r => ({
      ...r, id: r._id,
      first_name: r.user_id?.first_name,
      last_name:  r.user_id?.last_name,
      avatar:     r.user_id?.avatar,
      team_id:    r.user_id?.team_id,
      user_id:    r.user_id?._id,
    })))
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

router.get('/all', verifyToken, requireRole('team_lead','manager','hr','admin'), async (req, res) => {
  try {
    const me = await User.findById(req.user.id).lean()
    if (!me) return res.status(404).json({ error: 'User not found' })

    const filter = {}
    if (me.role === 'team_lead') {
      if (!me.team_id) return res.json([])
      const teamMembers = await User.find({ team_id: me.team_id }, '_id').lean()
      filter.user_id = { $in: teamMembers.map(member => member._id) }
    }

    const requests = await LeaveRequest.find(filter)
      .populate('user_id', 'first_name last_name email team_id')
      .sort({ createdAt: -1 })
      .lean()
    res.json(requests.map(request => ({
      ...request,
      id: request._id,
      first_name: request.user_id?.first_name,
      last_name: request.user_id?.last_name,
      email: request.user_id?.email,
      team_id: request.user_id?.team_id,
      user_id: request.user_id?._id,
      created_at: request.createdAt,
    })))
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

// ── POST /api/leave-requests
router.post('/', verifyToken, async (req, res) => {
  try {
    const { type, start_date, reason, am_pm } = req.body

    if (!['annual','sick','wellness','emergency'].includes(type)) {
      return res.status(400).json({ error: 'Invalid leave type' })
    }

    const me   = await User.findById(req.user.id).lean()
    if (!me) return res.status(404).json({ error: 'User not found' })
    const team = me.team_id ? await Team.findById(me.team_id).lean() : null
    const workload = team?.workload_current ?? 0

    // ── EMERGENCY
    if (type === 'emergency') {
      const lr = await LeaveRequest.create({
        user_id: me._id, type: 'emergency',
        start_date: null, end_date: null, days_count: 1,
        status: 'emergency',
        proof_deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        decision_date: new Date(),
      })
      await notifyHRManager(
        '🚨 Emergency Leave',
        `${me.first_name} ${me.last_name} has taken emergency leave. Proof required within 24 hours.`,
        'error',
        me._id
      )
      await AuditLog.create({ user_id: me._id, action: 'leave_request.emergency', details: 'Emergency leave taken', ip_address: req.ip })
      return res.json({ request: { ...lr.toObject(), id: lr._id }, status: 'emergency', message: 'Emergency leave granted. HR and your manager have been notified.' })
    }

    // ── WELLNESS (half-day) — auto-approved only if all today's tasks are done
    if (type === 'wellness') {
      if (!reason || !['sick','wellness'].includes(reason)) {
        return res.status(400).json({ error: 'Reason required: sick or wellness' })
      }

      // Check task completion for today
      let allTodayDone = true
      let todayTasksDue = 0
      if (me.team_id) {
        const stats = await getEmployeeTaskStats(me._id, me.team_id)
        allTodayDone  = stats.allTodayDone
        todayTasksDue = stats.todayTasksDue
      }

      if (!allTodayDone) {
        return res.status(403).json({
          error: 'Half-day leave denied',
          detail: `You have ${todayTasksDue} task(s) due today that are not yet completed. Complete all today's tasks first to be eligible for a half-day.`,
          tasks_pending: todayTasksDue,
        })
      }

      const lr = await LeaveRequest.create({
        user_id: me._id, type: 'wellness',
        start_date: todayStr(), end_date: todayStr(), days_count: 0.5,
        half_day: true, am_pm: am_pm || 'AM', reason,
        status: 'approved', decision_date: new Date(),
      })
      await notifyHRManager('Wellness Half-Day ✅', `${me.first_name} ${me.last_name} is taking a wellness half-day (${am_pm || 'AM'}). All today's tasks were completed.`, 'info', me._id)
      return res.json({
        request: { ...lr.toObject(), id: lr._id },
        status: 'approved',
        message: 'Half-day approved! All your tasks for today were completed.',
      })
    }

    // ── SICK
    if (type === 'sick') {
      const allowed = [todayStr(), tomorrowStr()]
      const date = start_date || todayStr()
      if (!allowed.includes(date)) {
        return res.status(400).json({ error: 'Sick leave can only be taken for today or tomorrow.' })
      }
      const lr = await LeaveRequest.create({
        user_id: me._id, type: 'sick',
        start_date: date, end_date: date, days_count: 1,
        reason: reason || null, status: 'approved', decision_date: new Date(),
      })
      await notifyHRManager('Sick Leave', `${me.first_name} ${me.last_name} is on sick leave ${date === todayStr() ? 'today' : 'tomorrow'}.`, 'warning', me._id)
      return res.json({ request: { ...lr.toObject(), id: lr._id }, status: 'approved', message: `Sick leave approved for ${date}.` })
    }

    // ── ANNUAL — smart grant based on workload + task status
    if (type === 'annual') {
      if (!isDateString(start_date)) return res.status(400).json({ error: 'A valid start_date is required for annual leave' })
      const end_date = req.body.end_date || start_date
      if (!isDateString(end_date) || end_date < start_date) return res.status(400).json({ error: 'end_date must be a valid date on or after start_date' })
      if (start_date < oneWeekAhead()) {
        return res.status(400).json({ error: 'Annual leave must be requested at least 1 week in advance.' })
      }

      // Get task stats for this employee
      let taskStats = { completionRate: 100, overdueHighPriority: 0, isInsignificant: false }
      if (me.team_id) {
        taskStats = await getEmployeeTaskStats(me._id, me.team_id)
      }

      // ── DENIAL conditions
      // 1. Team workload is critical (≥ 80%)
      if (workload >= 80) {
        await notifyHRManager(
          'Leave Request Denied (High Workload)',
          `${me.first_name} ${me.last_name}'s annual leave request was auto-denied. Team workload is ${workload}%.`,
          'warning', me._id
        )
        return res.status(403).json({
          error: 'Leave denied',
          detail: `Your team's workload is currently ${workload}% (critical). Annual leave cannot be approved until workload drops below 80%.`,
          workload,
          status: 'denied',
        })
      }

      // 2. Employee has overdue high-priority tasks
      if (taskStats.overdueHighPriority > 0) {
        await notifyHRManager(
          'Leave Request Denied (Overdue Tasks)',
          `${me.first_name} ${me.last_name}'s leave was denied — ${taskStats.overdueHighPriority} overdue high-priority task(s).`,
          'warning', me._id
        )
        return res.status(403).json({
          error: 'Leave denied',
          detail: `You have ${taskStats.overdueHighPriority} overdue high-priority task(s). Complete them before requesting leave.`,
          overdue_tasks: taskStats.overdueHighPriority,
          status: 'denied',
        })
      }

      // ── QUEUE condition: workload 50-79%
      const days = Math.floor((Date.parse(`${end_date}T00:00:00.000Z`) - Date.parse(`${start_date}T00:00:00.000Z`)) / 86400000) + 1
      let status = workload < 50 ? 'approved' : 'queued'
      let queue_position = null

      if (status === 'queued') {
        const count = await LeaveRequest.countDocuments({ status: 'queued' })
        queue_position = count + 1
      }

      const lr = await LeaveRequest.create({
        user_id: me._id, type: 'annual', start_date, end_date, days_count: days,
        reason: reason || null, status, queue_position,
        decision_date: status === 'approved' ? new Date() : null,
      })

      // Flag insignificant employee to manager
      if (taskStats.isInsignificant) {
        await notifyHRManager(
          '⚠️ Low-Performer Leave Request',
          `${me.first_name} ${me.last_name} requested leave but has only ${taskStats.completionRate}% task completion rate (${taskStats.completedByUser}/${taskStats.totalAssigned} tasks done).`,
          'warning', me._id
        )
      } else {
        await notifyHRManager(
          'New Annual Leave Request',
          `${me.first_name} ${me.last_name} requested annual leave ${start_date} → ${end_date}. Status: ${status}. Task completion: ${taskStats.completionRate}%.`,
          'info', me._id
        )
      }

      await AuditLog.create({ user_id: me._id, action: 'leave_request.created', details: `Annual leave ${start_date}→${end_date} | workload:${workload}% | tasks:${taskStats.completionRate}%`, ip_address: req.ip })

      return res.json({
        request: { ...lr.toObject(), id: lr._id }, status, queue_position,
        task_stats: taskStats,
        message: status === 'approved'
          ? `Annual leave approved! Team workload is ${workload}% and your task completion is ${taskStats.completionRate}%.`
          : `Added to queue at position #${queue_position}. Team workload is ${workload}% (medium). You'll be approved when it drops.`,
      })
    }
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

// ── GET /api/leave-requests/:id
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const lr = await LeaveRequest.findById(req.params.id).populate('user_id','first_name last_name email team_id').lean()
    if (!lr) return res.status(404).json({ error: 'Not found' })
    const me = await User.findById(req.user.id).lean()
    const isOwner = lr.user_id?._id?.toString() === req.user.id
    const isPriv  = ['team_lead','manager','hr','admin'].includes(me.role)
    if (!isOwner && !isPriv) return res.status(403).json({ error: 'Forbidden' })
    res.json({ ...lr, id: lr._id })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// ── PATCH approve / deny / override (kept for admin use)
router.patch('/:id/approve', verifyToken, async (req, res) => {
  try {
    const current = await LeaveRequest.findById(req.params.id)
    if (!current) return res.status(404).json({ error: 'Not found' })
    if (!await canManageLeaveRequest(req, current)) return res.status(403).json({ error: 'Forbidden' })
    if (!['pending', 'queued'].includes(current.status)) return res.status(409).json({ error: 'This request has already been decided' })
    const lr = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, status: { $in: ['pending', 'queued'] } }, { status: 'approved', decision_date: new Date() }, { new: true })
    if (!lr) return res.status(409).json({ error: 'This request was already decided' })
    await Notification.create({ user_id: lr.user_id, title: 'Leave Approved', message: `Your ${lr.type} leave has been approved.`, type: 'success', link: '/leave' })
    res.json({ message: 'Approved', request: { ...lr.toObject(), id: lr._id } })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.patch('/:id/deny', verifyToken, async (req, res) => {
  try {
    const { reason } = req.body
    const current = await LeaveRequest.findById(req.params.id)
    if (!current) return res.status(404).json({ error: 'Not found' })
    if (!await canManageLeaveRequest(req, current)) return res.status(403).json({ error: 'Forbidden' })
    if (!['pending', 'queued'].includes(current.status)) return res.status(409).json({ error: 'This request has already been decided' })
    const lr = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, status: { $in: ['pending', 'queued'] } }, { status: 'denied', decision_date: new Date(), override_reason: reason || null }, { new: true })
    if (!lr) return res.status(409).json({ error: 'This request was already decided' })
    await Notification.create({ user_id: lr.user_id, title: 'Leave Denied', message: `Your ${lr.type} leave was denied.${reason ? ` Reason: ${reason}` : ''}`, type: 'error', link: '/leave' })
    res.json({ message: 'Denied', request: { ...lr.toObject(), id: lr._id } })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.patch('/:id/override', verifyToken, async (req, res) => {
  try {
    const { decision, reason } = req.body
    if (!['approved','denied'].includes(decision)) return res.status(400).json({ error: 'Invalid decision' })
    if (!reason?.trim()) return res.status(400).json({ error: 'Reason required for override' })
    const current = await LeaveRequest.findById(req.params.id)
    if (!current) return res.status(404).json({ error: 'Not found' })
    if (!await canManageLeaveRequest(req, current)) return res.status(403).json({ error: 'Forbidden' })
    if (!['pending', 'queued'].includes(current.status)) return res.status(409).json({ error: 'This request has already been decided' })
    const lr = await LeaveRequest.findOneAndUpdate({ _id: req.params.id, status: { $in: ['pending', 'queued'] } }, {
      status: decision, decision_date: new Date(), override_reason: reason, manager_override: true, override_by: req.user.id,
    }, { new: true })
    if (!lr) return res.status(409).json({ error: 'This request was already decided' })
    await Override.create({ manager_id: req.user.id, request_id: lr._id, decision, reason })
    await AuditLog.create({ user_id: req.user.id, action: 'leave_request.override', details: `Override ${lr._id} → ${decision}`, ip_address: req.ip })
    await Notification.create({ user_id: lr.user_id, title: 'Leave Override', message: `Your leave was overridden: ${decision}. Reason: ${reason}`, type: 'warning', link: '/leave' })
    res.json({ message: 'Override applied', request: { ...lr.toObject(), id: lr._id } })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
