import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// happen-backend/uploads
export const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads')

export function ensureUploadRoot() {
  if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true })
}

export function sessionDir(sessionId) {
  return path.join(UPLOAD_ROOT, sessionId.toString())
}

export function ensureSessionDir(sessionId) {
  const dir = sessionDir(sessionId)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

// Build a public URL for a stored file, e.g. /api/activity/files/<sessionId>/<filename>
export function fileUrl(sessionId, filename) {
  return `/api/activity/files/${sessionId}/${encodeURIComponent(filename)}`
}

// Safe file name (strip path separators) to avoid traversal
export function sanitizeName(name) {
  return path.basename(String(name || '').replace(/[/\\]/g, '_')).slice(0, 200)
}
