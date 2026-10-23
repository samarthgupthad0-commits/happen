import express from 'express'
import LeaveRequest from '../db/models/LeaveRequest.js'
import User from '../db/models/User.js'
import Notification from '../db/models/Notification.js'
import AuditLog from '../db/models/AuditLog.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'

const router = express.Router()

// GET /api/queue  — all queued requests, globally sorted by position
router.get('/', verifyToken, async (req, res) => {
  try {
    const queue = await LeaveRequest.find({ status: 'queued' })
      .populate('user_id', 'first_name last_name avatar team_id')
      .sort({ queue_position: 1, createdAt: 1 })
      .lean()

    res.json(queue.map(r => ({
      ...r,
      id:         r._id,
      first_name: r.user_id?.first_name,
      last_name:  r.user_id?.last_name,
      avatar:     r.user_id?.avatar,
      team_id:    r.user_id?.team_id,
      user_id:    r.user_id?._id,
    })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

// POST /api/queue/:requestId/grant — manager/HR selects a specific queued request.
router.post('/:requestId/grant', verifyToken, requireRole('manager', 'hr'), async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim()
    if (!reason) return res.status(400).json({ error: 'A reason is required to grant leave' })

    const request = await LeaveRequest.findOne({ _id: req.params.requestId, status: 'queued' })
      .populate('user_id', 'first_name last_name')
    if (!request) return res.status(404).json({ error: 'Queued leave request not found' })

    request.status = 'approved'
    request.decision_date = new Date()
    request.manager_override = true
    request.override_reason = reason
    request.override_by = req.user.id
    await request.save()

    if (request.queue_position != null) {
      await LeaveRequest.updateMany(
        { status: 'queued', queue_position: { $gt: request.queue_position } },
        { $inc: { queue_position: -1 } }
      )
    }

    const employee = request.user_id
    await Notification.create({
      user_id: employee._id,
      title: 'Leave Approved ✅',
      message: `Your ${request.type} leave (${request.start_date || 'date not set'}${request.end_date && request.end_date !== request.start_date ? ` to ${request.end_date}` : ''}) has been granted. Reason: ${reason}`,
      type: 'success',
    })

    const granter = await User.findById(req.user.id).lean()
    await AuditLog.create({
      user_id: req.user.id,
      action: 'queue.grant_selected',
      details: `${granter.first_name} ${granter.last_name} granted queued leave ${request._id} to ${employee.first_name} ${employee.last_name}. Reason: ${reason}`,
      ip_address: req.ip,
    })

    res.json({
      message: `Leave granted to ${employee.first_name} ${employee.last_name}`,
      approved: { ...request.toObject(), id: request._id },
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
