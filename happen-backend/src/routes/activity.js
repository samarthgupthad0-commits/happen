import express from 'express'
import fs from 'fs'
import path from 'path'
import multer from 'multer'
import ActivitySession from '../db/models/ActivitySession.js'
import User from '../db/models/User.js'
import AuditLog from '../db/models/AuditLog.js'
import { verifyToken } from '../middleware/auth.js'
import { requireRole } from '../middleware/roleGuard.js'
import { ensureSessionDir, fileUrl, sanitizeName } from '../utils/storage.js'
import { classifyScreenshot } from '../utils/screenshotClassification.js'
import { activitySessionFilter, canReadActivityRecord } from '../utils/privacyPolicies.js'

const router = express.Router()

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 500 } })

function toPublic(session) {
  return {
    ...session,
    id: session._id,
  }
}

function addScreenshotClassifications(session) {
  const existing = new Map((session.screenshot_classifications || []).map(item => [item.filename, item]))
  const screenshots = (session.files || []).filter(file => file.kind === 'screenshot')
  return {
    ...session,
    screenshot_classifications: screenshots.map(file => existing.get(file.filename) || classifyScreenshot(file.filename, session.raw_activities || [])),
  }
}

// POST /api/activity/check-in — create (or return) an open session for the user
router.post('/check-in', verifyToken, async (req, res) => {
  try {
    let session = await ActivitySession.findOne({ user_id: req.user.id, status: 'checked_in' }).sort({ createdAt: -1 })
    if (!session) {
      session = await ActivitySession.create({ user_id: req.user.id, status: 'checked_in', check_in_at: new Date() })
    }
    await AuditLog.create({ user_id: req.user.id, action: 'activity.check_in', details: 'Checked in for activity tracking' })
    res.json(toPublic(session.toObject()))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/activity/me — current status + history for the calling user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [current, history] = await Promise.all([
      ActivitySession.findOne({ user_id: req.user.id, status: 'checked_in' }).sort({ createdAt: -1 }).lean(),
      ActivitySession.find({ user_id: req.user.id, status: 'checked_out' }).sort({ createdAt: -1 }).limit(10).lean(),
    ])
    res.json({ current: current ? toPublic(current) : null, history: history.map(session => addScreenshotClassifications(toPublic(session))) })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// POST /api/activity/check-out — finalize a session, receive summary + report files
// multipart/form-data:
//   sessionId (field)  — the open session id
//   summary  (field)   — JSON string of { total_activities, total_active_time, total_idle_time, productivity_score }
//   raw      (field)   — JSON string of the raw activities array
//   tracking_dir (field) — the local tracking folder name (informational)
//   files[]  (files)   — the .docx report and screenshots (.png)
router.post('/check-out', verifyToken, upload.array('files', 500), async (req, res) => {
  try {
    const { sessionId, summary, raw, tracking_dir } = req.body || {}
    if (!sessionId) return res.status(400).json({ error: 'sessionId required' })

    const session = await ActivitySession.findOne({ _id: sessionId, user_id: req.user.id })
    if (!session) return res.status(404).json({ error: 'Session not found' })
    if (session.status === 'checked_out') return res.json(toPublic(session.toObject()))

    const dir = ensureSessionDir(session._id)
    const savedFiles = []
    let reportPath = null

    for (const file of req.files || []) {
      const name = sanitizeName(file.originalname || `file_${Date.now()}`)
      const target = path.join(dir, name)
      fs.writeFileSync(target, file.buffer)
      const kind = name.toLowerCase().endsWith('.docx') ? 'report' : (name.toLowerCase().endsWith('.png') || name.toLowerCase().endsWith('.jpg') ? 'screenshot' : 'json')
      if (kind === 'report') reportPath = name
      savedFiles.push({ spec: { kind, filename: name, path: target, url: fileUrl(session._id, name), size: file.size }, isReport: kind === 'report' })
    }

    // Parse optional summary / raw activity JSON
    let parsedSummary = {}
    let rawActivities = []
    if (summary) { try { parsedSummary = JSON.parse(summary) } catch (_) {} }
    if (raw) { try { rawActivities = JSON.parse(raw) } catch (_) {} }

    session.status = 'checked_out'
    session.check_out_at = new Date()
    session.summary = {
      total_activities:  parsedSummary.total_activities ?? rawActivities.length ?? session.summary.total_activities,
      total_active_time: parsedSummary.total_active_time ?? session.summary.total_active_time,
      total_idle_time:   parsedSummary.total_idle_time ?? session.summary.total_idle_time,
      productivity_score:parsedSummary.productivity_score ?? session.summary.productivity_score,
    }
    session.raw_activities = rawActivities.length > 0 ? rawActivities : session.raw_activities
    session.screenshot_classifications = savedFiles
      .filter(({ spec }) => spec.kind === 'screenshot')
      .map(({ spec }) => classifyScreenshot(spec.filename, rawActivities))
    if (tracking_dir) session.tracking_dir = tracking_dir
    if (reportPath) session.report_file = reportPath
    const existingUrls = new Set(session.files.map(f => f.url))
    for (const { spec } of savedFiles) {
      if (!existingUrls.has(spec.url)) session.files.push(spec)
    }

    await session.save()
    await AuditLog.create({ user_id: req.user.id, action: 'activity.check_out', details: `Checked out; ${rawActivities.length} activities` })
    res.json(toPublic(session.toObject()))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Server error' })
  }
})

router.patch('/:id/screenshots/:filename/classification', verifyToken, async (req, res) => {
  try {
    const { label } = req.body || {}
    if (!['work_related', 'other'].includes(label)) {
      return res.status(400).json({ error: 'label must be work_related or other' })
    }

    const session = await ActivitySession.findOne({ _id: req.params.id, user_id: req.user.id })
    if (!session) return res.status(404).json({ error: 'Session not found' })
    const filename = sanitizeName(req.params.filename)
    if (!session.files.some(file => file.kind === 'screenshot' && file.filename === filename)) {
      return res.status(404).json({ error: 'Screenshot not found' })
    }

    let classification = session.screenshot_classifications.find(item => item.filename === filename)
    if (!classification) {
      classification = classifyScreenshot(filename, session.raw_activities)
      session.screenshot_classifications.push(classification)
      classification = session.screenshot_classifications.find(item => item.filename === filename)
    }
    classification.corrected_label = label
    classification.corrected_by = req.user.id
    classification.corrected_at = new Date()
    await session.save()
    res.json({
      filename: classification.filename,
      label: classification.label,
      confidence: classification.confidence,
      evidence: classification.evidence,
      corrected_label: classification.corrected_label,
      corrected_at: classification.corrected_at,
    })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

// GET /api/activity — all sessions (manager/hr/admin); supports ?user_id=
router.get('/', verifyToken, requireRole('manager', 'hr', 'admin', 'team_lead'), async (req, res) => {
  try {
    const { user_id, status } = req.query
    const actor = await User.findById(req.user.id, 'role team_id').lean()
    if (!actor) return res.status(404).json({ error: 'User not found' })
    let teamMemberIds = []
    if (actor.role === 'team_lead' && actor.team_id) {
      teamMemberIds = (await User.find({ team_id: actor.team_id }, '_id').lean()).map(member => member._id)
    }
    const filter = activitySessionFilter({ ...actor, id: actor._id }, teamMemberIds, user_id || null)
    if (!filter) return res.status(403).json({ error: 'You can only view activity from your own team' })
    if (status) filter.status = status
    const sessions = await ActivitySession.find(filter).sort({ createdAt: -1 }).limit(100).populate('user_id', 'first_name last_name email').lean()
    res.json({ sessions: sessions.map(toPublic) })
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/activity/employees — employee list with their tracking summaries (privileged roles)
router.get('/employees', verifyToken, requireRole('manager', 'hr', 'admin', 'team_lead'), async (req, res) => {
  try {
    const actor = await User.findById(req.user.id, 'role team_id').lean()
    if (!actor) return res.status(404).json({ error: 'User not found' })
    if (actor.role === 'team_lead' && !actor.team_id) return res.json({ employees: [] })
    const employeeFilter = {
      is_active: true,
      role: { $in: ['employee', 'team_lead'] },
      ...(actor.role === 'team_lead' ? { team_id: actor.team_id } : {}),
    }
    const employees = await User.find(
      employeeFilter,
      'first_name last_name email avatar role team_id'
    ).lean()

    const report = await Promise.all(employees.map(async (emp) => {
      const sessions = await ActivitySession.find({ user_id: emp._id })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean()
      const completed = sessions.filter(s => s.status === 'checked_out')
      const latest = sessions[0] || null
      return {
        id: emp._id,
        first_name: emp.first_name,
        last_name: emp.last_name,
        email: emp.email,
        avatar: emp.avatar,
        role: emp.role,
        team_id: emp.team_id,
        session_count: sessions.length,
        completed_count: completed.length,
        total_active_time: completed.reduce((s, x) => s + (x.summary?.total_active_time || 0), 0),
        avg_productivity: completed.length
          ? Math.round(completed.reduce((s, x) => s + (x.summary?.productivity_score || 0), 0) / completed.length)
          : 0,
        latest_session: latest ? toPublic(latest) : null,
      }
    }))

    // Only include employees with at least one session in the default list,
    // but expose full list too so the manager can find people without activity.
    res.json({ employees: report })
  } catch (e) { console.error(e); res.status(500).json({ error: 'Server error' }) }
})

// GET /api/activity/:id — one session (owner or privileged role)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).lean()
    if (!me) return res.status(404).json({ error: 'User not found' })
    const session = await ActivitySession.findById(req.params.id)
      .populate('user_id', 'first_name last_name email team_id')
      .lean()
    if (!session) return res.status(404).json({ error: 'Not found' })
    if (!canReadActivityRecord(me, { id: session.user_id?._id, team_id: session.user_id?.team_id })) return res.status(403).json({ error: 'Forbidden' })
    res.json(toPublic(session))
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

// GET /api/activity/files/:sessionId/:filename — serve a stored report file
router.get('/files/:sessionId/:filename', verifyToken, async (req, res) => {
  try {
    const session = await ActivitySession.findById(req.params.sessionId).populate('user_id', 'team_id').lean()
    if (!session) return res.status(404).json({ error: 'Not found' })
    const me = await User.findById(req.user.id).lean()
    if (!me) return res.status(404).json({ error: 'User not found' })
    if (!canReadActivityRecord(me, { id: session.user_id?._id, team_id: session.user_id?.team_id })) return res.status(403).json({ error: 'Forbidden' })

    const name = sanitizeName(req.params.filename)
    const meta = (session.files || []).find(f => f.filename === name)
    if (!meta) return res.status(404).json({ error: 'File not found' })

    const target = path.resolve(meta.path)
    if (!fs.existsSync(target)) return res.status(404).json({ error: 'File missing' })
    res.sendFile(target)
  } catch (e) { res.status(500).json({ error: 'Server error' }) }
})

export default router
