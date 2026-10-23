import mongoose from 'mongoose'

const settingsSchema = new mongoose.Schema({
  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    weeklyDigest: { type: Boolean, default: false },
    leaveUpdates: { type: Boolean, default: true },
  },
  workspace: {
    timezone: { type: String, default: 'UTC-05:00 (Eastern Time)' },
    locale: { type: String, default: 'English (US)' },
    dashboard: { type: String, default: 'dashboard' },
  },
  security: {
    twoFactor: { type: Boolean, default: false },
    sessionAlerts: { type: Boolean, default: true },
    deviceTracking: { type: Boolean, default: true },
  },
  preferences: {
    darkMode: { type: Boolean, default: false },
    compactMode: { type: Boolean, default: false },
    autoSave: { type: Boolean, default: true },
    quietHours: { type: Boolean, default: true },
  },
  organization: {
    company_name: { type: String, default: 'Happen' },
    company_domain: { type: String, default: 'company.com' },
    work_week: { type: String, default: 'Mon-Fri' },
    approval_flow: { type: String, default: 'Manager approval' },
    default_timezone: { type: String, default: 'UTC-05:00 (Eastern Time)' },
    leave_policy: { type: String, default: 'Standard annual leave policy' },
  },
  theme: { type: String, default: 'Light' },
}, { _id: false })

const userSchema = new mongoose.Schema({
  email:                { type: String, required: true, unique: true, lowercase: true },
  password_hash:        { type: String, required: true },
  password_plain:       { type: String },
  first_name:           { type: String, required: true },
  last_name:            { type: String, required: true },
  role:                 { type: String, enum: ['admin','manager','hr','team_lead','accounting','employee'], required: true },
  team_id:              { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null },
  avatar:               { type: String, default: '' },
  hire_date:            { type: Date, default: Date.now },
  leave_balance_annual: { type: Number, default: 20 },
  leave_balance_sick:   { type: Number, default: 10 },
  wellness_days_used:   { type: Number, default: 0 },
  emergency_leaves_used:{ type: Number, default: 0 },
  settings:             { type: settingsSchema, default: () => ({}) },
  last_login:           { type: Date, default: null },
  salary_annual_usd:    { type: Number, default: null, min: 0 },
  is_active:            { type: Boolean, default: true },
}, { timestamps: true })

export default mongoose.model('User', userSchema)
