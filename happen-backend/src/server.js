import express from 'express'
import { readFileSync } from 'node:fs'
import { createServer as createHttpServer } from 'http'
import { createServer as createHttpsServer } from 'https'
import { Server as SocketIO } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import { connectDB } from './db/mongoose.js'
import Message from './db/models/Message.js'

import authRoutes from './routes/auth.js'
import meRoutes from './routes/me.js'
import leaveRoutes from './routes/leaveRequests.js'
import teamRoutes from './routes/teams.js'
import companyRoutes from './routes/calendar.js'
import notificationRoutes from './routes/notifications.js'
import managerLeaveRoutes from './routes/managerLeave.js'
import queueRoutes from './routes/queue.js'
import currentLeavesRoutes from './routes/currentLeaves.js'
import messagesRoutes from './routes/messages.js'
import projectsRoutes from './routes/projects.js'
import myTasksRoutes from './routes/myTasks.js'
import okrRoutes from './routes/okrs.js'
import wikiRoutes from './routes/wiki.js'
import resourceRoutes from './routes/resources.js'
import kudosRoutes from './routes/kudos.js'
import timeEntryRoutes from './routes/timeEntries.js'
import wellnessRoutes  from './routes/wellness.js'
import donationRoutes  from './routes/donations.js'
import activityRoutes  from './routes/activity.js'
import hrRoutes from './routes/hrDirectory.js'
import adminTeamManagementRoutes from './routes/adminTeamManagement.js'
import { ensureUploadRoot } from './utils/storage.js'
import { purgeExpiredActivitySessions } from './utils/activityRetention.js'



// Stub routes not yet migrated
import express2 from 'express'
const stub = (r) => { r.get('/', (_, res) => res.json([])); r.get('/:id', (_, res) => res.json({})); return r }
const accountingRoutes = stub(express2.Router())
const adminRoutes      = stub(express2.Router())
const employeeRoutes   = stub(express2.Router())

dotenv.config()

const app = express()
const sslCrtFile = process.env.SSL_CRT_FILE
const sslKeyFile = process.env.SSL_KEY_FILE
const httpsOptions = sslCrtFile && sslKeyFile ? {
  key: readFileSync(sslKeyFile),
  cert: readFileSync(sslCrtFile),
} : null
const httpServer = httpsOptions ? createHttpsServer(httpsOptions, app) : createHttpServer(app)

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',')
  : ['https://localhost:3000', 'https://localhost:3001', 'https://localhost:3002', 'https://localhost:5173', 'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:5173']

// Socket.io
const io = new SocketIO(httpServer, {
  cors: { origin: corsOrigins, credentials: true },
})

// Socket auth middleware
io.use((socket, next) => {
  const token = socket.handshake.auth?.token
  if (!token) return next(new Error('No token'))
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET)
    next()
  } catch {
    next(new Error('Invalid token'))
  }
})

// Canonical conversation ID
const convId = (a, b) => [a.toString(), b.toString()].sort().join('_')

// Track online users: userId -> socketId
const onlineUsers = new Map()

io.on('connection', (socket) => {
  const userId = socket.user.id.toString()
  onlineUsers.set(userId, socket.id)
  io.emit('online_users', Array.from(onlineUsers.keys()))

  // Join personal room
  socket.join(userId)

  // Send message
  socket.on('send_message', async ({ to, text }) => {
    if (!to || !text?.trim()) return
    try {
      const cid = convId(userId, to)
      const msg = await Message.create({
        conversation_id: cid,
        sender_id: userId,
        receiver_id: to,
        text: text.trim(),
      })
      const payload = { ...msg.toObject(), id: msg._id }
      // Deliver to both sender and receiver rooms
      io.to(userId).to(to).emit('new_message', payload)
    } catch (e) { console.error('send_message error:', e) }
  })

  // Typing indicator
  socket.on('typing', ({ to, isTyping }) => {
    socket.to(to).emit('typing', { from: userId, isTyping })
  })

  socket.on('disconnect', () => {
    onlineUsers.delete(userId)
    io.emit('online_users', Array.from(onlineUsers.keys()))
  })
})

app.use(cors({ origin: corsOrigins, credentials: true }))
app.use(helmet())
app.use(morgan('dev'))
app.use(express.json({ limit: '20mb' }))

async function start() {
  await connectDB()
  ensureUploadRoot()
  await purgeExpiredActivitySessions().catch(error => console.error('Activity retention cleanup failed:', error))
  const activityRetentionTimer = setInterval(() => {
    purgeExpiredActivitySessions().catch(error => console.error('Activity retention cleanup failed:', error))
  }, 60 * 60 * 1000)
  activityRetentionTimer.unref()

  app.use('/api/auth', authRoutes)
  app.use('/api/me',             meRoutes)
  app.use('/api/leave-requests', leaveRoutes)
  app.use('/api/teams',          teamRoutes)
  app.use('/api/company',        companyRoutes)
  app.use('/api/notifications',  notificationRoutes)
  app.use('/api/manager-leave',  managerLeaveRoutes)
  app.use('/api/queue',          queueRoutes)
  app.use('/api/current-leaves', currentLeavesRoutes)
  app.use('/api/messages',       messagesRoutes)
  app.use('/api/projects',       projectsRoutes)
  app.use('/api/my-tasks',       myTasksRoutes)
  app.use('/api/okrs',           okrRoutes)
  app.use('/api/wiki',           wikiRoutes)
  app.use('/api/resources',      resourceRoutes)
  app.use('/api/kudos',          kudosRoutes)
  app.use('/api/time-entries',   timeEntryRoutes)
  app.use('/api/wellness',       wellnessRoutes)
  app.use('/api/donations',      donationRoutes)
  app.use('/api/activity',       activityRoutes)
  app.use('/api/hr',             hrRoutes)
  app.use('/api/accounting',     accountingRoutes)
  app.use('/api/admin',          adminTeamManagementRoutes)
  app.use('/api/admin',          adminRoutes)
  app.use('/api/employees',      employeeRoutes)

  app.use((err, req, res, next) => {
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })

  const PORT = process.env.PORT || 5000
  const protocol = httpsOptions ? 'https' : 'http'
  httpServer.listen(PORT, () => console.log(`✅ Happen API + Socket.io running on ${protocol}://localhost:${PORT}`))
}

start().catch(e => { console.error(e); process.exit(1) })

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
