import mongoose from 'mongoose'

const activitySessionSchema = new mongoose.Schema({
  user_id:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:        { type: String, enum: ['checked_in', 'checked_out', 'error'], default: 'checked_in' },
  check_in_at:   { type: Date, default: Date.now },
  check_out_at:  { type: Date, default: null },
  tracking_dir:  { type: String, default: null },
  // Structured summary parsed from the tracker's *_data.json
  summary: {
    total_activities:  { type: Number, default: 0 },
    total_active_time: { type: Number, default: 0 },
    total_idle_time:   { type: Number, default: 0 },
    productivity_score:{ type: Number, default: 0 },
  },
  // Embedded copy of the tracker's raw activities for later analytics
  raw_activities: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Metadata for stored report files (docx + screenshots)
  files: [{
    kind:    { type: String, enum: ['report', 'screenshot', 'json'], required: true },
    filename:{ type: String, required: true },
    path:    { type: String, required: true },
    url:     { type: String, required: true },
    size:    { type: Number, default: 0 },
  }],
  screenshot_classifications: [{
    filename:       { type: String, required: true },
    label:           { type: String, enum: ['work_related', 'other'], required: true },
    confidence:      { type: Number, min: 0, max: 1, required: true },
    evidence:        { type: [String], default: [] },
    source:          { type: String, default: 'app_context_rules' },
    corrected_label: { type: String, enum: ['work_related', 'other'], default: null },
    corrected_by:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    corrected_at:    { type: Date, default: null },
  }],
  error_message: { type: String, default: null },
  report_file:   { type: String, default: null },
}, { timestamps: true })

activitySessionSchema.index({ user_id: 1, createdAt: -1 })

export default mongoose.model('ActivitySession', activitySessionSchema)
