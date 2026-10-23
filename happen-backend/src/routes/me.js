import express from 'express'
import bcrypt from 'bcryptjs'
import User from '../db/models/User.js'
import LeaveRequest from '../db/models/LeaveRequest.js'
import AuditLog from '../db/models/AuditLog.js'
import Notification from '../db/models/Notification.js'
import NameChangeRequest from '../db/models/NameChangeRequest.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'

const router = express.Router()

const defaultSettings = {
  notifications: {
    email: true,
    push: true,
    weeklyDigest: false,
    leaveUpdates: true,
  },
  workspace: {
    timezone: 'UTC-05:00 (Eastern Time)',
    locale: 'English (US)',
    dashboard: 'dashboard',
  },
  security: {
    twoFactor: false,
    sessionAlerts: true,
    deviceTracking: true,
  },
  preferences: {
    darkMode: false,
    compactMode: false,
    autoSave: true,
    quietHours: true,
  },
  organization: {
    company_name: 'Happen',
    company_domain: 'company.com',
    work_week: 'Mon-Fri',
    approval_flow: 'Manager approval',
    default_timezone: 'UTC-05:00 (Eastern Time)',
    leave_policy: 'Standard annual leave policy',
  },
  theme: 'Light',
}

router.get('/settings', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).lean()
    if (!user) return res.status(404).json({ error: 'User not found' })

    const settings = {
      ...defaultSettings,
      ...(user.settings || {}),
      notifications: { ...defaultSettings.notifications, ...(user.settings?.notifications || {}) },
      workspace: { ...defaultSettings.workspace, ...(user.settings?.workspace || {}) },
      security: { ...defaultSettings.security, ...(user.settings?.security || {}) },
      preferences: { ...defaultSettings.preferences, ...(user.settings?.preferences || {}) },
      organization: { ...defaultSettings.organization, ...(user.settings?.organization || {}) },
    }

    res.json({
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      settings,
    })
  } catch (e) {
    console.error('GET /settings error:', e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/settings/name-change-requests', verifyToken, async (req, res) => {
  try {
    const [myRequest, pendingRequests] = await Promise.all([
      NameChangeRequest.findOne({ user_id: req.user.id }).sort({ createdAt: -1 }).lean(),
      ['manager', 'hr'].includes(req.user.role)
        ? NameChangeRequest.find({ status: 'pending', user_id: { $ne: req.user.id } })
          .populate('user_id', 'first_name last_name email role')
          .sort({ createdAt: 1 })
          .lean()
        : [],
    ])

    res.json({
      my_request: myRequest,
      pending_requests: pendingRequests.map(request => ({
        ...request,
        id: request._id,
        requester: request.user_id,
        user_id: request.user_id?._id,
      })),
    })
  } catch (e) {
    console.error('GET name change requests error:', e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/settings/name-change-requests', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const requestedFirstName = String(req.body?.first_name || '').trim()
    const requestedLastName = String(req.body?.last_name || '').trim()
    if (!requestedFirstName || !requestedLastName) {
      return res.status(400).json({ error: 'First and last name are required' })
    }
    if (requestedFirstName === user.first_name && requestedLastName === user.last_name) {
      return res.status(400).json({ error: 'Enter a name that is different from your current name' })
    }

    const existingRequest = await NameChangeRequest.findOne({ user_id: user._id, status: 'pending' })
    if (existingRequest) return res.status(409).json({ error: 'You already have a pending name change request' })

    const request = await NameChangeRequest.create({
      user_id: user._id,
      current_first_name: user.first_name,
      current_last_name: user.last_name,
      requested_first_name: requestedFirstName,
      requested_last_name: requestedLastName,
    })

    const reviewers = await User.find({ role: { $in: ['manager', 'hr'] }, _id: { $ne: user._id }, is_active: true }, '_id').lean()
    if (reviewers.length) {
      await Notification.insertMany(reviewers.map(reviewer => ({
        user_id: reviewer._id,
        title: 'Name change approval needed',
        message: `${user.first_name} ${user.last_name} requested a name change.`,
        type: 'info',
        link: '/settings',
        ref_user_id: user._id,
      })))
    }

    res.status(201).json({ request, message: 'Name change request sent for manager or HR approval.' })
  } catch (e) {
    console.error('POST name change request error:', e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/settings/name-change-requests/:id/review', verifyToken, requireRole('manager', 'hr'), async (req, res) => {
  try {
    const { decision } = req.body || {}
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' })
    }

    const request = await NameChangeRequest.findById(req.params.id)
    if (!request) return res.status(404).json({ error: 'Name change request not found' })
    if (String(request.user_id) === String(req.user.id)) {
      return res.status(403).json({ error: 'You cannot review your own name change request' })
    }
    if (request.status !== 'pending') return res.status(409).json({ error: 'This request has already been reviewed' })

    if (decision === 'approved') {
      await User.findByIdAndUpdate(request.user_id, {
        first_name: request.requested_first_name,
        last_name: request.requested_last_name,
      })
    }

    request.status = decision
    request.reviewed_by = req.user.id
    request.reviewed_at = new Date()
    await request.save()

    await Notification.create({
      user_id: request.user_id,
      title: `Name change ${decision}`,
      message: decision === 'approved'
        ? `Your name is now ${request.requested_first_name} ${request.requested_last_name}.`
        : 'Your name change request was not approved.',
      type: decision === 'approved' ? 'success' : 'warning',
      link: '/settings',
    })

    await AuditLog.create({
      user_id: req.user.id,
      action: `profile.name_change.${decision}`,
      details: `${decision} name change request ${request._id} for user ${request.user_id}`,
      ip_address: req.ip,
    })

    res.json({ message: `Name change request ${decision}.`, request })
  } catch (e) {
    console.error('PATCH name change request error:', e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/settings', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ error: 'User not found' })

    const { first_name, last_name, email, settings, password } = req.body || {}

    if (
      (first_name !== undefined && String(first_name).trim() !== user.first_name) ||
      (last_name !== undefined && String(last_name).trim() !== user.last_name)
    ) {
      return res.status(400).json({ error: 'Name changes must be submitted for manager or HR approval' })
    }
    if (email !== undefined) user.email = String(email).trim().toLowerCase() || user.email

    if (settings) {
      user.settings = {
        ...defaultSettings,
        ...(user.settings || {}),
        ...settings,
        notifications: { ...defaultSettings.notifications, ...(user.settings?.notifications || {}), ...(settings.notifications || {}) },
        workspace: { ...defaultSettings.workspace, ...(user.settings?.workspace || {}), ...(settings.workspace || {}) },
        security: { ...defaultSettings.security, ...(user.settings?.security || {}), ...(settings.security || {}) },
        preferences: { ...defaultSettings.preferences, ...(user.settings?.preferences || {}), ...(settings.preferences || {}) },
        organization: { ...defaultSettings.organization, ...(user.settings?.organization || {}), ...(settings.organization || {}) },
        theme: settings.theme || user.settings?.theme || 'Light',
      }
    }

    if (password?.newPassword) {
      const currentValue = String(password.currentPassword || '')
      const newValue = String(password.newPassword || '')

      if (!currentValue || !newValue) return res.status(400).json({ error: 'Current and new passwords are required' })
      if (!bcrypt.compareSync(currentValue, user.password_hash)) return res.status(400).json({ error: 'Current password is incorrect' })
      if (newValue.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' })

      user.password_hash = bcrypt.hashSync(newValue, 10)
      user.password_plain = newValue
    }

    await user.save()

    const response = {
      id: user._id,
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      role: user.role,
      settings: user.settings || defaultSettings,
    }

    res.json(response)
  } catch (e) {
    console.error('PATCH /settings error:', e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.get('/leave-balance', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean()
    if (!u) return res.status(404).json({ error: 'Not found' })
    res.json({
      annual:        u.leave_balance_annual,
      sick:          u.leave_balance_sick,
      wellness_used: u.wellness_days_used,
      emergency_used:u.emergency_leaves_used,
    })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/leave-requests', verifyToken, async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ user_id: req.user.id }).sort({ createdAt: -1 }).lean()
    res.json(requests.map(r => ({ ...r, id: r._id })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/queue-position', verifyToken, async (req, res) => {
  try {
    const req_ = await LeaveRequest.findOne({ user_id: req.user.id, status: 'queued' }).sort({ createdAt: 1 }).lean()
    if (!req_) return res.json({ position: null, request_id: null, estimated_date: null })
    const estimated_date = new Date(Date.now() + req_.queue_position * 7 * 24 * 60 * 60 * 1000).toISOString()
    res.json({ position: req_.queue_position, request_id: req_._id, estimated_date })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/activity', verifyToken, async (req, res) => {
  try {
    const logs = await AuditLog.find({ user_id: req.user.id }).sort({ createdAt: -1 }).limit(10).lean()
    res.json(logs.map(l => ({ ...l, id: l._id, created_at: l.createdAt })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/wellness-balance', verifyToken, async (req, res) => {
  try {
    const u = await User.findById(req.user.id).lean()
    res.json({ used: u?.wellness_days_used ?? 0, total: 2 })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
