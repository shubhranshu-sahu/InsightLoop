const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ['user', 'assistant'], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  sources: [{
    response_id:  String,
    submitted_at: String,
    snippet:      String
    // chart field for Phase 3 — leave as flexible
  }]
}, { _id: false });

const chatThreadSchema = new mongoose.Schema({
  thread_id:       { type: String, required: true, unique: true },
  business_id:     { type: String, required: true },
  form_id:         { type: String, required: true },
  form_title:      { type: String },
  context_summary: { type: String, default: '' },
  message_count:   { type: Number, default: 0 },
  messages:        [messageSchema],
  created_at:      { type: Date, default: Date.now },
  updated_at:      { type: Date, default: Date.now }
}, {
  collection: 'chat_threads',
  versionKey: false
});

chatThreadSchema.index({ business_id: 1, form_id: 1 }, { unique: true });
chatThreadSchema.index({ business_id: 1, updated_at: -1 });

module.exports = mongoose.model('ChatThread', chatThreadSchema);
