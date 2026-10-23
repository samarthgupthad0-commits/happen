import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import User from '../db/models/User.js'
import Team from '../db/models/Team.js'
import AuditLog from '../db/models/AuditLog.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'

const router = express.Router()
const VALID_ROLES = ['admin', 'manager', 'hr', 'team_lead', 'accounting', 'employee']

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase()
  return VALID_ROLES.includes(role) ? role : null
}

function namePart(value) {
  const letters = String(value || '').replace(/[^A-Za-z]/g, '')
  if (!letters) return ''
  return letters.charAt(0).toUpperCase() + letters.slice(1).toLowerCase()
}

function generateTemporaryPassword(firstName, lastName) {
  const first = namePart(firstName) || 'User'
  const last = namePart(lastName)
  return `${first}${last}123`
}
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

router.get('/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const users = await User.find({}, 'first_name last_name email role team_id is_active')
      .populate('team_id', 'name')
      .sort({ first_name: 1, last_name: 1 })
      .lean()
    res.json(users)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/teams', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const teams = await Team.find({}, 'name').sort({ name: 1 }).lean()
    res.json(teams)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.get('/audit-logs', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 25, 100)
    if (page < 1 || limit < 1) return res.status(400).json({ error: 'Invalid pagination values' })

    const filter = {}
    if (req.query.user) {
      if (!mongoose.isValidObjectId(req.query.user)) {
        return res.status(400).json({ error: 'Invalid user filter' })
      }
      filter.user_id = req.query.user
    }
    if (req.query.action) filter.action = req.query.action

    const createdAt = {}
    if (req.query.from) {
      const from = new Date(`${req.query.from}T00:00:00.000Z`)
      if (Number.isNaN(from.getTime())) return res.status(400).json({ error: 'Invalid start date' })
      createdAt.$gte = from
    }
    if (req.query.to) {
      const to = new Date(`${req.query.to}T00:00:00.000Z`)
      if (Number.isNaN(to.getTime())) return res.status(400).json({ error: 'Invalid end date' })
      to.setUTCDate(to.getUTCDate() + 1)
      createdAt.$lt = to
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt

    const search = req.query.search?.trim()
    if (search) {
      const pattern = new RegExp(escapeRegExp(search), 'i')
      const matchingUserIds = await User.find({
        $or: [{ first_name: pattern }, { last_name: pattern }, { email: pattern }],
      }).distinct('_id')
      filter.$or = [
        { action: pattern },
        { details: pattern },
        { ip_address: pattern },
        { user_id: { $in: matchingUserIds } },
      ]
    }

    const skip = (page - 1) * limit
    const [logs, total, actions] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'first_name last_name email role')
        .lean(),
      AuditLog.countDocuments(filter),
      AuditLog.distinct('action'),
    ])

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      actions: actions.sort(),
    })
  } catch (e) {
    console.error('Audit log query failed:', e)
    res.status(500).json({ error: 'Unable to load audit logs' })
  }
})

router.post('/impersonate', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { target_user_id } = req.body
    if (!mongoose.isValidObjectId(target_user_id)) {
      return res.status(400).json({ error: 'Invalid target_user_id' })
    }

    const targetUser = await User.findOne({ _id: target_user_id, is_active: true, role: { $ne: 'admin' } })
      .select('first_name last_name email role team_id avatar')
      .populate('team_id', 'name workload_current')
      .lean()
    if (!targetUser) return res.status(404).json({ error: 'Active non-admin user not found' })

    const token = jwt.sign({
      id: targetUser._id,
      email: targetUser.email,
      role: targetUser.role,
      team_id: targetUser.team_id?._id || targetUser.team_id,
      impersonated_by: req.user.id,
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })

    await AuditLog.create({
      user_id: req.user.id,
      action: 'admin.impersonate',
      details: `Started impersonating ${targetUser.email}`,
      ip_address: req.ip,
    })

    const teamId = targetUser.team_id?._id?.toString() || targetUser.team_id?.toString() || null
    res.json({
      token,
      user: { ...targetUser, id: targetUser._id, team_id: teamId, impersonated_by: req.user.id },
      impersonated: true,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/impersonate/stop', verifyToken, async (req, res) => {
  try {
    if (!req.user.impersonated_by) return res.status(403).json({ error: 'Not impersonating a user' })

    const admin = await User.findOne({ _id: req.user.impersonated_by, role: 'admin', is_active: true })
      .select('first_name last_name email role team_id avatar')
      .populate('team_id', 'name workload_current')
      .lean()
    if (!admin) return res.status(403).json({ error: 'Original admin account is unavailable' })

    await AuditLog.create({
      user_id: admin._id,
      action: 'admin.impersonation_ended',
      details: `Stopped impersonating user ${req.user.id}`,
      ip_address: req.ip,
    })

    const token = jwt.sign({
      id: admin._id,
      email: admin.email,
      role: admin.role,
      team_id: admin.team_id?._id || admin.team_id,
    }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' })
    const teamId = admin.team_id?._id?.toString() || admin.team_id?.toString() || null
    res.json({ token, user: { ...admin, id: admin._id, team_id: teamId } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/users', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const first_name = req.body.first_name?.trim()
    const last_name = req.body.last_name?.trim()
    const email = req.body.email?.trim().toLowerCase()
    const team_id = req.body.team_id
    const role = normalizeRole(req.body.role)

    if (!first_name || !last_name || !email || !team_id) {
      return res.status(400).json({ error: 'Name, email, and team are required' })
    }
    if (!mongoose.isValidObjectId(team_id)) {
      return res.status(400).json({ error: 'Invalid team_id' })
    }
    if (!role) {
      return res.status(400).json({ error: 'Invalid role' })
    }
    if (!await Team.exists({ _id: team_id })) {
      return res.status(404).json({ error: 'Team not found' })
    }

    const temporary_password = generateTemporaryPassword(first_name, last_name)
    const user = await User.create({
      first_name,
      last_name,
      email,
      role,
      team_id,
      password_hash: bcrypt.hashSync(temporary_password, 12),
    })
    res.status(201).json({
      user: {
        _id: user._id,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        role: user.role,
        team_id: user.team_id,
        is_active: user.is_active,
      },
      temporary_password,
    })
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Email already exists' })
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/users/:id/reset-password', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const existing = await User.findById(req.params.id, 'first_name last_name email').lean()
    if (!existing) return res.status(404).json({ error: 'User not found' })

    const temporary_password = generateTemporaryPassword(existing.first_name, existing.last_name)
    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        $set: { password_hash: bcrypt.hashSync(temporary_password, 12) },
        $unset: { password_plain: 1 },
      },
      { new: true, select: 'first_name last_name email' }
    ).lean()
    if (!user) return res.status(404).json({ error: 'User not found' })

    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'admin.password_reset',
        details: `Reset password for ${user.email}`,
        ip_address: req.ip,
      })
    } catch (auditError) {
      console.error('Password reset audit logging failed:', auditError)
    }

    res.json({
      user: { id: user._id, first_name: user.first_name, last_name: user.last_name, email: user.email },
      temporary_password,
    })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.patch('/users/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const team_id = req.body.team_id
    const role = normalizeRole(req.body.role)

    if (team_id !== undefined && team_id !== null && (typeof team_id !== 'string' || !mongoose.isValidObjectId(team_id))) {
      return res.status(400).json({ error: 'Invalid team_id' })
    }
    if (team_id && !await Team.exists({ _id: team_id })) {
      return res.status(404).json({ error: 'Team not found' })
    }
    if (req.body.role !== undefined && !role) {
      return res.status(400).json({ error: 'Invalid role' })
    }

    const update = {}
    if (team_id !== undefined) update.team_id = team_id
    if (role) update.role = role

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No update provided' })
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true, select: 'first_name last_name email role team_id is_active' }
    ).populate('team_id', 'name').lean()
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.patch('/users/:id/team', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const { team_id } = req.body
    if (team_id !== null && (typeof team_id !== 'string' || !mongoose.isValidObjectId(team_id))) {
      return res.status(400).json({ error: 'Invalid team_id' })
    }
    if (team_id && !await Team.exists({ _id: team_id })) {
      return res.status(404).json({ error: 'Team not found' })
    }
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' })
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { team_id },
      { new: true, runValidators: true, select: 'first_name last_name email role team_id is_active' }
    ).populate('team_id', 'name').lean()
    if (!user) return res.status(404).json({ error: 'User not found' })
    res.json(user)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router