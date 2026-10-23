import express from 'express'
import LeaveRequest from '../db/models/LeaveRequest.js'
import User from '../db/models/User.js'
import Team from '../db/models/Team.js'
import Override from '../db/models/Override.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'

const router = express.Router()

router.get('/workload', verifyToken, requireRole('manager','hr','admin'), async (req, res) => {
  try {
    const teams = await Team.find().populate('team_lead_id','first_name last_name').lean()
    res.json(teams.map(t => ({
      id: t._id, name: t.name,
      workload_current: t.workload_current,
      threshold: t.workload_threshold_high,
      team_lead: t.team_lead_id ? `${t.team_lead_id.first_name} ${t.team_lead_id.last_name}` : null,
    })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/burnout-risk', verifyToken, requireRole('manager','hr','admin'), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const users = await User.find({ role: { $in: ['employee','team_lead'] }, is_active: true }).populate('team_id','name').lean()
    const atRisk = []
    for (const u of users) {
      const last = await LeaveRequest.findOne({ user_id: u._id, status: 'approved' }).sort({ end_date: -1 }).lean()
      if (!last || last.end_date < cutoff) {
        atRisk.push({ ...u, id: u._id, team_name: u.team_id?.name, last_leave_end: last?.end_date || null })
      }
    }
    res.json(atRisk)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/overrides', verifyToken, requireRole('manager','hr','admin'), async (req, res) => {
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const overrides = await Override.find({ createdAt: { $gte: cutoff } })
      .populate('manager_id','first_name last_name email')
      .populate({ path: 'request_id', populate: { path: 'user_id', select: 'first_name last_name email' } })
      .sort({ createdAt: -1 }).lean()
    res.json(overrides.map(o => ({
      ...o, id: o._id,
      manager_first: o.manager_id?.first_name, manager_last: o.manager_id?.last_name, manager_email: o.manager_id?.email,
      employee_first: o.request_id?.user_id?.first_name, employee_last: o.request_id?.user_id?.last_name,
      created_at: o.createdAt,
    })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/calendar', verifyToken, requireRole('manager','hr','admin'), async (req, res) => {
  try {
    const { month, year } = req.query
    if (!month || !year) return res.status(400).json({ error: 'month and year required' })
    const m = parseInt(month), y = parseInt(year)
    const firstDay = `${y}-${String(m).padStart(2,'0')}-01`
    const lastDay  = new Date(y, m, 0).toISOString().split('T')[0]

    const leaves = await LeaveRequest.find({
      status: { $in: ['pending','approved','emergency'] },
      start_date: { $lte: lastDay },
      end_date:   { $gte: firstDay },
    }).populate('user_id','first_name last_name team_id').lean()

    const teamIds = [...new Set(leaves.map(l => l.user_id?.team_id?.toString()).filter(Boolean))]
    const teams = await Team.find({ _id: { $in: teamIds } }, 'name').lean()
    const teamMap = Object.fromEntries(teams.map(t => [t._id.toString(), t.name]))

    res.json(leaves.map(l => ({
      ...l, id: l._id,
      first_name: l.user_id?.first_name, last_name: l.user_id?.last_name,
      team_name: teamMap[l.user_id?.team_id?.toString()] || '',
    })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
