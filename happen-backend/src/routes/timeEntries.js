import express from 'express'
import TimeEntry from '../db/models/TimeEntry.js'
import User from '../db/models/User.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'
import { isValidActivityType } from '../utils/privacyPolicies.js'

const router = express.Router()

function getIsoWeekRange(week) {
  const match = /^(\d{4})-W(\d{2})$/.exec(week || '')
  if (!match) return null
  const year = Number(match[1])
  const weekNumber = Number(match[2])
  if (weekNumber < 1 || weekNumber > 53) return null

  const jan4 = new Date(Date.UTC(year, 0, 4))
  const mondayOffset = (jan4.getUTCDay() + 6) % 7
  const start = new Date(jan4)
  start.setUTCDate(jan4.getUTCDate() - mondayOffset + (weekNumber - 1) * 7)
  const thursday = new Date(start)
  thursday.setUTCDate(start.getUTCDate() + 3)
  if (thursday.getUTCFullYear() !== year) return null
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
}

function currentIsoWeek() {
  const today = new Date()
  const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const year = date.getUTCFullYear()
  const yearStart = new Date(Date.UTC(year, 0, 1))
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7)
  return `${year}-W${String(week).padStart(2, '0')}`
}

// GET /api/time-entries  — my entries (or team if manager/lead)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { week, user_id } = req.query
    const me = await User.findById(req.user.id).lean()
    if (!me) return res.status(404).json({ error: 'User not found' })
    const isPriv = ['manager','hr','admin','team_lead'].includes(me.role)

    let filter = {}
    if (user_id && isPriv) filter.user_id = user_id
    else filter.user_id = req.user.id

    if (user_id && isPriv && me.role === 'team_lead') {
      const requestedUser = await User.findById(user_id, 'team_id').lean()
      if (!requestedUser?.team_id || !me.team_id || requestedUser.team_id.toString() !== me.team_id.toString()) {
        return res.status(403).json({ error: 'Forbidden' })
      }
    }

    if (me.role === 'team_lead' && user_id && !filter.user_id) filter.user_id = req.user.id

    if (week) {
      const range = getIsoWeekRange(week)
      if (!range) return res.status(400).json({ error: 'week must be a valid ISO week (YYYY-Www)' })
      filter.date = { $gte: range[0], $lte: range[1] }
    }

    const entries = await TimeEntry.find(filter).populate('user_id','first_name last_name avatar').sort({ date: -1, createdAt: -1 }).lean()
    const totalHours = entries.reduce((s, e) => s + e.hours, 0)
    const billableHours = entries.filter(e => e.billable).reduce((s, e) => s + e.hours, 0)
    res.json({ entries: entries.map(e => ({ ...e, id: e._id })), totalHours, billableHours })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// POST /api/time-entries
router.post('/', verifyToken, async (req, res) => {
  try {
    const { description, date, hours, billable, project_name, project_id } = req.body
    const activityType = req.body.activity_type ?? 'Work'
    const parsedHours = Number(hours)
    if (!description?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(parsedHours)) return res.status(400).json({ error: 'description, valid date, and hours are required' })
    if (!isValidActivityType(activityType)) return res.status(400).json({ error: 'activity_type must be Work or Other' })
    const parsedDate = new Date(`${date}T00:00:00.000Z`)
    if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return res.status(400).json({ error: 'date must be a valid calendar date' })
    if (parsedHours < 0.25 || parsedHours > 24) return res.status(400).json({ error: 'hours must be between 0.25 and 24' })
    const entry = await TimeEntry.create({ user_id: req.user.id, description: description.trim(), date, hours: parsedHours, activity_type: activityType, billable: billable !== false, project_name: project_name || 'General', project_id: project_id || null })
    res.json({ ...entry.toObject(), id: entry._id })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// DELETE /api/time-entries/:id
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const entry = await TimeEntry.findOne({ _id: req.params.id, user_id: req.user.id })
    if (!entry) return res.status(404).json({ error: 'Not found' })
    if (entry.approved) return res.status(400).json({ error: 'Cannot delete an approved entry' })
    await entry.deleteOne()
    res.json({ message: 'Deleted' })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// PATCH /api/time-entries/:id/approve  — manager/team_lead
router.patch('/:id/approve', verifyToken, requireRole('manager','team_lead','hr','admin'), async (req, res) => {
  try {
    const current = await TimeEntry.findById(req.params.id).populate('user_id', 'team_id').lean()
    if (!current) return res.status(404).json({ error: 'Not found' })
    const approver = await User.findById(req.user.id, 'role team_id').lean()
    if (approver.role === 'team_lead' && current.user_id?.team_id?.toString() !== approver.team_id?.toString()) {
      return res.status(403).json({ error: 'Forbidden' })
    }
    if (current.user_id?._id?.toString() === req.user.id) return res.status(403).json({ error: 'You cannot approve your own time entry' })
    const entry = await TimeEntry.findByIdAndUpdate(req.params.id, { approved: true, approved_by: req.user.id }, { new: true })
    if (!entry) return res.status(404).json({ error: 'Not found' })
    res.json({ ...entry.toObject(), id: entry._id })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/time-entries/summary  — weekly summary for team (manager/lead)
router.get('/activity-report', verifyToken, requireRole('team_lead'), async (req, res) => {
  try {
    const lead = await User.findById(req.user.id, 'team_id').lean()
    if (!lead) return res.status(404).json({ error: 'User not found' })
    if (!lead.team_id) return res.json({ week: req.query.week || currentIsoWeek(), start_date: null, end_date: null, employees: [] })

    const week = req.query.week || currentIsoWeek()
    const range = getIsoWeekRange(week)
    if (!range) return res.status(400).json({ error: 'week must be a valid ISO week (YYYY-Www)' })
    const members = await User.find({ team_id: lead.team_id, is_active: true }, '_id first_name last_name role').sort({ first_name: 1, last_name: 1 }).lean()
    const memberIds = members.map(member => member._id)
    const totals = await TimeEntry.aggregate([
      { $match: { user_id: { $in: memberIds }, date: { $gte: range[0], $lte: range[1] } } },
      { $group: {
        _id: { user_id: '$user_id', activity_type: { $ifNull: ['$activity_type', 'Work'] } },
        hours: { $sum: '$hours' },
        entries: { $sum: 1 },
      } },
    ])
    const totalsByUser = new Map()
    for (const total of totals) {
      const userId = total._id.user_id.toString()
      const current = totalsByUser.get(userId) || { work_hours: 0, other_hours: 0, work_entries: 0, other_entries: 0 }
      if (total._id.activity_type === 'Other') {
        current.other_hours = total.hours
        current.other_entries = total.entries
      } else {
        current.work_hours = total.hours
        current.work_entries = total.entries
      }
      totalsByUser.set(userId, current)
    }

    res.json({
      week,
      start_date: range[0],
      end_date: range[1],
      employees: members.map(member => {
        const employeeTotals = totalsByUser.get(member._id.toString()) || { work_hours: 0, other_hours: 0, work_entries: 0, other_entries: 0 }
        return {
          id: member._id,
          first_name: member.first_name,
          last_name: member.last_name,
          role: member.role,
          ...employeeTotals,
          total_hours: employeeTotals.work_hours + employeeTotals.other_hours,
        }
      }),
    })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

router.get('/summary', verifyToken, requireRole('manager','team_lead','hr','admin'), async (req, res) => {
  try {
    const me = await User.findById(req.user.id).lean()
    if (!me) return res.status(404).json({ error: 'User not found' })
    if (me.role === 'team_lead' && !me.team_id) return res.json([])
    const teamFilter = me.team_id ? { team_id: me.team_id } : {}
    const teamUsers = await User.find({ ...teamFilter, role: { $in: ['employee','team_lead'] } }, '_id first_name last_name avatar').lean()
    const range = getIsoWeekRange(req.query.week || currentIsoWeek())
    if (!range) return res.status(400).json({ error: 'week must be a valid ISO week (YYYY-Www)' })
    const [startStr, endStr] = range

    const summary = await Promise.all(teamUsers.map(async u => {
      const entries = await TimeEntry.find({ user_id: u._id, date: { $gte: startStr, $lte: endStr } }).lean()
      return { user: u, total_hours: entries.reduce((s,e) => s+e.hours, 0), billable_hours: entries.filter(e=>e.billable).reduce((s,e)=>s+e.hours,0), entries: entries.length, time_entries: entries.map(e => ({ ...e, id: e._id })) }
    }))
    res.json(summary)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
