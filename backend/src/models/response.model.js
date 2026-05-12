const mongoose = require('mongoose');

/**
 * Response Schema — MongoDB (Atlas)
 * One document per customer feedback submission.
 * Stored in the "responses" collection.
 */
const responseSchema = new mongoose.Schema(
  {
    response_id: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    form_id: {
      type: String,
      required: true,
      index: true,
    },

    business_id: {
      type: String,
      required: true,
      index: true,
    },

    submitted_at: {
      type: Date,
      default: Date.now,
    },

    // Dynamic keys — each key is a question UUID
    answers: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    ai_analysis: {
      status: {
        type: String,
        default: 'pending',
        enum: ['pending', 'processing', 'done', 'failed'],
      },
      processed_at: {
        type: Date,
        default: null,
      },
      retry_count: {
        type: Number,
        default: 0,
      },
      // ── Fields populated by Shubhranshu's AI service ──
      overall_sentiment: {
        type: String,
        default: null, // positive | neutral | negative
      },
      urgency: {
        type: String,
        default: null, // low | medium | high
      },
      is_complaint: {
        type: Boolean,
        default: false,
      },
      dominant_topic: {
        type: String,
        default: null,
      },
      summary: {
        type: String,
        default: null,
      },
      sentiment_score: {
        type: Number,
        default: null,
      },
      key_phrases: {
        type: [String],
        default: [],
      },
      per_text_analysis: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
        // Structure written by FastAPI:
        // {
        //   "question-uuid": {
        //     label: "What could we do better?",
        //     raw_answer: "The food was cold.",
        //     sentiment: "negative",
        //     sentiment_score: 0.88,
        //     topics: ["food temperature"],
        //     key_phrases: ["food was cold"],
        //     intent: "complaint",
        //     emotions: ["frustration"]
        //   }
        // }
      },
    },
  },
  {
    // Use the existing "responses" collection in MongoDB Atlas
    collection: 'responses',
    timestamps: false, // We manage submitted_at ourselves
    versionKey: false, // No __v field
  }
);

// ── Compound indexes for dashboard/analytics query performance ──
responseSchema.index({ form_id: 1, submitted_at: -1 });
responseSchema.index({ business_id: 1, submitted_at: -1 });
responseSchema.index({ form_id: 1, 'ai_analysis.overall_sentiment': 1 });
responseSchema.index({ form_id: 1, 'ai_analysis.urgency': 1 });
responseSchema.index({ business_id: 1, 'ai_analysis.status': 1 });

const Response = mongoose.model('Response', responseSchema);

module.exports = Response;
