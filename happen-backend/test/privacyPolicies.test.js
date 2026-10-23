import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ACTIVITY_RETENTION_DAYS,
  activityRetentionCutoff,
  activitySessionFilter,
  canAccessTeam,
  canReadActivityRecord,
  isValidActivityType,
  notificationOwnerFilter,
  ownsNotification,
} from '../src/utils/privacyPolicies.js'

test('employees can read only their own activity records', () => {
  const employee = { id: 'employee-1', role: 'employee', team_id: 'team-a' }
  assert.equal(canReadActivityRecord(employee, { id: 'employee-1', team_id: 'team-a' }), true)
  assert.equal(canReadActivityRecord(employee, { id: 'employee-2', team_id: 'team-a' }), false)
})

test('team leads are limited to their team in detail and list queries', () => {
  const lead = { id: 'lead-a', role: 'team_lead', team_id: 'team-a' }
  assert.equal(canReadActivityRecord(lead, { id: 'member-a', team_id: 'team-a' }), true)
  assert.equal(canReadActivityRecord(lead, { id: 'member-b', team_id: 'team-b' }), false)
  assert.deepEqual(activitySessionFilter(lead, ['member-a', 'lead-a']), { user_id: { $in: ['member-a', 'lead-a'] } })
  assert.equal(activitySessionFilter(lead, ['member-a'], 'member-b'), null)
})

test('team route access keeps team leads within their own team', () => {
  const lead = { id: 'lead-a', role: 'team_lead', team_id: 'team-a' }
  assert.equal(canAccessTeam(lead, 'team-a'), true)
  assert.equal(canAccessTeam(lead, 'team-b'), false)
  assert.equal(canAccessTeam({ ...lead, team_id: null }, 'team-a'), false)
  assert.equal(canAccessTeam({ role: 'manager' }, 'team-b'), true)
})

test('company activity roles retain company-wide report access', () => {
  for (const role of ['manager', 'hr', 'admin']) {
    assert.equal(canReadActivityRecord({ id: `${role}-1`, role, team_id: 'team-a' }, { id: 'employee-2', team_id: 'team-b' }), true)
  }
  assert.deepEqual(activitySessionFilter({ id: 'manager-1', role: 'manager' }), {})
})

test('activity categories accept only the supported labels', () => {
  assert.equal(isValidActivityType('Work'), true)
  assert.equal(isValidActivityType('Other'), true)
  assert.equal(isValidActivityType('work'), false)
  assert.equal(isValidActivityType(''), false)
  assert.equal(isValidActivityType(null), false)
})

test('notification read filters and ownership checks stay user-scoped', () => {
  assert.deepEqual(notificationOwnerFilter('notification-1', 'user-a'), { _id: 'notification-1', user_id: 'user-a' })
  assert.equal(ownsNotification({ user_id: 'user-a' }, 'user-a'), true)
  assert.equal(ownsNotification({ user_id: 'user-b' }, 'user-a'), false)
})

test('activity records have an enforced 30-day retention cutoff', () => {
  const now = new Date('2026-09-26T12:00:00.000Z')
  assert.equal(ACTIVITY_RETENTION_DAYS, 30)
  assert.equal(activityRetentionCutoff(now).toISOString(), '2026-08-27T12:00:00.000Z')
})