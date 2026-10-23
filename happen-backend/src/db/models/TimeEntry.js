import mongoose from 'mongoose'

const timeEntrySchema = new mongoose.Schema({
  user_id:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  project_id:  { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
  project_name:{ type: String, default: 'General' },
  description: { type: String, required: true },
  date:        { type: String, required: true },  // YYYY-MM-DD
  hours:       { type: Number, required: true, min: 0.25, max: 24 },
  activity_type: { type: String, enum: ['Work', 'Other'], default: 'Work' },
  billable:    { type: Boolean, default: true },
  approved:    { type: Boolean, default: false },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true })

export default mongoose.model('TimeEntry', timeEntrySchema)
