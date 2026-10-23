import express from 'express'
import Team from '../db/models/Team.js'
import User from '../db/models/User.js'
import LeaveRequest from '../db/models/LeaveRequest.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'
import { canAccessTeam } from '../utils/privacyPolicies.js'

const router = express.Router()

const todayStr = () => new Date().toISOString().split('T')[0]

router.use('/:teamId', verifyToken, async (req, res, next) => {
  try {
    const actor = await User.findById(req.user.id, 'role team_id').lean()
    if (!actor) return res.status(404).json({ error: 'User not found' })
    if (canAccessTeam(actor, req.params.teamId)) return next()
    return res.status(403).json({ error: 'Forbidden' })
  } catch (e) { return res.status(500).json({ error: 'Server error' }) }
})

router.get('/:teamId/workload', verifyToken, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId).lean()
    if (!team) return res.status(404).json({ error: 'Team not found' })

    const today = todayStr()
    const upcoming = await LeaveRequest.find({
      status: { $in: ['approved','emergency'] },
      start_date: { $lte: today },
      end_date:   { $gte: today },
    }).populate('user_id','first_name last_name team_id').lean()

    const teamUpcoming = upcoming.filter(l => l.user_id?.team_id?.toString() === req.params.teamId)

    res.json({
      workload_current:   team.workload_current,
      threshold:          team.workload_threshold_high,
      trend:              'stable',
      upcoming_deadlines: teamUpcoming.map(l => ({
        first_name: l.user_id?.first_name,
        last_name:  l.user_id?.last_name,
        start_date: l.start_date,
        end_date:   l.end_date,
      })),
    })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/:teamId/requests', verifyToken, requireRole('team_lead','manager','hr','admin'), async (req, res) => {
  try {
    const members = await User.find({ team_id: req.params.teamId }, '_id').lean()
    const ids = members.map(m => m._id)
    const requests = await LeaveRequest.find({ user_id: { $in: ids }, status: { $in: ['pending','queued'] } })
      .populate('user_id','first_name last_name email avatar').sort({ createdAt: -1 }).lean()
    res.json(requests.map(r => ({ ...r, id: r._id, first_name: r.user_id?.first_name, last_name: r.user_id?.last_name, email: r.user_id?.email })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/:teamId/queue', verifyToken, async (req, res) => {
  try {
    const members = await User.find({ team_id: req.params.teamId }, '_id').lean()
    const ids = members.map(m => m._id)
    const queue = await LeaveRequest.find({ user_id: { $in: ids }, status: 'queued' })
      .populate('user_id','first_name last_name avatar').sort({ queue_position: 1 }).lean()
    res.json(queue.map(r => ({ ...r, id: r._id, first_name: r.user_id?.first_name, last_name: r.user_id?.last_name })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/:teamId/calendar', verifyToken, async (req, res) => {
  try {
    const today = todayStr()
    const members = await User.find({ team_id: req.params.teamId }, '_id first_name last_name').lean()
    const ids = members.map(m => m._id)
    const leaves = await LeaveRequest.find({
      user_id: { $in: ids },
      status:  { $in: ['pending','approved','emergency'] },
    }).populate('user_id','first_name last_name').sort({ start_date: 1 }).lean()
    res.json(leaves.map(l => ({ ...l, id: l._id, first_name: l.user_id?.first_name, last_name: l.user_id?.last_name })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/teams/:teamId/members — full member list with current leave status
router.get('/:teamId/members', verifyToken, async (req, res) => {
  try {
    const today = todayStr()
    const team = await Team.findById(req.params.teamId).lean()
    if (!team) return res.status(404).json({ error: 'Team not found' })

    const members = await User.find(
      { team_id: req.params.teamId, is_active: true },
      'first_name last_name email avatar role hire_date leave_balance_annual leave_balance_sick'
    ).lean()

    // For each member, get their current leave status
    const enriched = await Promise.all(members.map(async (m) => {
      const currentLeave = await LeaveRequest.findOne({
        user_id: m._id,
        status: { $in: ['approved', 'emergency'] },
        $or: [
          { start_date: { $lte: today }, end_date: { $gte: today } },
          { type: 'emergency', start_date: null },
        ],
      }).lean()

      const pendingLeave = await LeaveRequest.findOne({
        user_id: m._id,
        status: { $in: ['queued', 'pending'] },
      }).sort({ createdAt: -1 }).lean()

      return {
        id: m._id,
        first_name: m.first_name,
        last_name: m.last_name,
        email: m.email,
        avatar: m.avatar,
        role: m.role,
        hire_date: m.hire_date,
        leave_balance_annual: m.leave_balance_annual,
        leave_balance_sick: m.leave_balance_sick,
        is_team_lead: team.team_lead_id?.toString() === m._id.toString(),
        current_leave: currentLeave ? {
          type: currentLeave.type,
          status: currentLeave.status,
          start_date: currentLeave.start_date,
          end_date: currentLeave.end_date,
        } : null,
        pending_leave: pendingLeave ? {
          type: pendingLeave.type,
          status: pendingLeave.status,
          queue_position: pendingLeave.queue_position,
        } : null,
      }
    }))

    // Sort: team lead first, then alphabetically
    enriched.sort((a, b) => {
      if (a.is_team_lead) return -1
      if (b.is_team_lead) return 1
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    })

    res.json({
      team: { id: team._id, name: team.name, workload_current: team.workload_current },
      members: enriched,
    })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

router.get('/:teamId/analytics', verifyToken, requireRole('team_lead','manager','hr','admin'), async (req, res) => {
  try {
    const members = await User.find({ team_id: req.params.teamId }, '_id').lean()
    const ids = members.map(m => m._id)
    const all = await LeaveRequest.find({ user_id: { $in: ids } }).lean()
    res.json({
      team_size: members.length,
      leaves: {
        total:     all.length,
        approved:  all.filter(l => l.status === 'approved').length,
        denied:    all.filter(l => l.status === 'denied').length,
        queued:    all.filter(l => l.status === 'queued').length,
        emergency: all.filter(l => l.status === 'emergency').length,
      },
    })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
