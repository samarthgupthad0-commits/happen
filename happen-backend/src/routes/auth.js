import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../db/models/User.js'
import AuditLog from '../db/models/AuditLog.js'
import { verifyToken } from '../middleware/auth.js'

const router = express.Router()

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const user = await User.findOne({ email: email.toLowerCase(), is_active: true }).populate('team_id', 'name workload_current')
    if (!user) return res.status(401).json({ error: 'Invalid credentials' })

    const valid = bcrypt.compareSync(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

    user.last_login = new Date()
    await user.save()

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, team_id: user.team_id?._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    )

    await AuditLog.create({ user_id: user._id, action: 'login', details: 'User logged in', ip_address: req.ip })

    const { password_hash, password_plain, __v, ...userData } = user.toObject()
    // Normalize team_id to plain string so frontend template literals work correctly
    const teamId = userData.team_id?._id?.toString() || userData.team_id?.toString() || null
    res.json({ token, user: { ...userData, id: userData._id, team_id: teamId } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.post('/logout', verifyToken, async (req, res) => {
  try {
    const isImpersonating = Boolean(req.user.impersonated_by)
    await AuditLog.create({
      user_id: isImpersonating ? req.user.impersonated_by : req.user.id,
      action: isImpersonating ? 'admin.impersonation_ended' : 'logout',
      details: isImpersonating
        ? `Ended impersonation of ${req.user.email} by logout`
        : 'User logged out',
      ip_address: req.ip,
    })
  } catch (e) {
    console.error('Logout audit logging failed:', e)
  }
  res.json({ message: 'Logged out' })
})

router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('team_id', 'name workload_current').lean()
    if (!user) return res.status(404).json({ error: 'User not found' })
    const { password_hash, password_plain, __v, ...safe } = user
    res.json({ ...safe, id: safe._id })
  } catch (e) {
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
