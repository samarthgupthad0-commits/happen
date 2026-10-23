import fs from 'fs/promises'
import ActivitySession from '../db/models/ActivitySession.js'
import { sessionDir } from './storage.js'
import { activityRetentionCutoff } from './privacyPolicies.js'

export async function purgeExpiredActivitySessions(now = new Date()) {
  const cutoff = activityRetentionCutoff(now)
  const expired = await ActivitySession.find({ createdAt: { $lt: cutoff } }).select('_id').lean()
  const removableIds = []

  for (const session of expired) {
    try {
      await fs.rm(sessionDir(session._id), { recursive: true, force: true })
      removableIds.push(session._id)
    } catch (error) {
      console.error(`Could not remove expired activity session ${session._id}:`, error)
    }
  }

  if (removableIds.length) await ActivitySession.deleteMany({ _id: { $in: removableIds } })
  return removableIds.length
}