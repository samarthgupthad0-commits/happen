import mongoose from 'mongoose'

const nameChangeRequestSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  current_first_name: { type: String, required: true },
  current_last_name: { type: String, required: true },
  requested_first_name: { type: String, required: true },
  requested_last_name: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewed_at: { type: Date, default: null },
}, { timestamps: true })

export default mongoose.model('NameChangeRequest', nameChangeRequestSchema)