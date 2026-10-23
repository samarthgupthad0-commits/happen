const idString = (value) => {
  if (value == null) return null
  const id = value._id ?? value.id ?? value
  return id == null ? null : String(id)
}

const COMPANY_ACTIVITY_ROLES = new Set(['manager', 'hr', 'admin'])
export const ACTIVITY_RETENTION_DAYS = 30

export function activityRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

export function canAccessTeam(actor, requestedTeamId) {
  if (!actor) return false
  return COMPANY_ACTIVITY_ROLES.has(actor.role)
    || (idString(actor.team_id) !== null && idString(actor.team_id) === idString(requestedTeamId))
}

export function canReadActivityRecord(actor, owner) {
  if (!actor || !owner) return false
  if (COMPANY_ACTIVITY_ROLES.has(actor.role)) return true
  if (idString(actor.id ?? actor._id) === idString(owner.id ?? owner._id)) return true
  return actor.role === 'team_lead'
    && idString(actor.team_id) !== null
    && idString(actor.team_id) === idString(owner.team_id)
}

export function activitySessionFilter(actor, teamMemberIds = [], requestedUserId = null) {
  if (!actor) return null
  if (COMPANY_ACTIVITY_ROLES.has(actor.role)) {
    return requestedUserId ? { user_id: requestedUserId } : {}
  }
  if (actor.role === 'team_lead') {
    const teamIds = teamMemberIds.map(idString).filter(Boolean)
    if (requestedUserId && !teamIds.includes(idString(requestedUserId))) return null
    return { user_id: requestedUserId || { $in: teamIds } }
  }
  return { user_id: actor.id ?? actor._id }
}

export function isValidActivityType(value) {
  return value === 'Work' || value === 'Other'
}

export function notificationOwnerFilter(notificationId, userId) {
  return { _id: notificationId, user_id: userId }
}

export function ownsNotification(notification, userId) {
  return idString(notification?.user_id) !== null
    && idString(notification.user_id) === idString(userId)
}