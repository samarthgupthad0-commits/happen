import express from 'express'
import Notification from '../db/models/Notification.js'
import { verifyToken } from '../middleware/auth.js'
import { notificationOwnerFilter } from '../utils/privacyPolicies.js'

const router = express.Router()

router.get('/', verifyToken, async (req, res) => {
  try {
    const notifs = await Notification.find({ user_id: req.user.id }).sort({ is_read: 1, createdAt: -1 }).limit(20).lean()
    res.json(notifs.map(n => ({ ...n, id: n._id, created_at: n.createdAt })))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      notificationOwnerFilter(req.params.id, req.user.id),
      { is_read: true },
      { new: true },
    )
    if (!notification) return res.status(404).json({ error: 'Notification not found' })
    res.json({ message: 'Marked as read' })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

router.patch('/read-all', verifyToken, async (req, res) => {
  try {
    await Notification.updateMany({ user_id: req.user.id }, { is_read: true })
    res.json({ message: 'All marked as read' })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
