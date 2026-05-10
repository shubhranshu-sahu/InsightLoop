const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Import database connections
const { connectMySQL } = require('./config/db');
const { connectMongo } = require('./config/mongo');

// Import middleware
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth.routes');
const formsRoutes = require('./routes/forms.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const aiRoutes = require('./routes/ai.routes');
const reportsRoutes = require('./routes/reports.routes');
const qrRoutes = require('./routes/qr.routes');
const adminRoutes = require('./routes/admin.routes');
const publicRoutes = require('./routes/public.routes');
const responsesRoutes = require('./routes/responses.routes');
const alertsRoutes = require('./routes/alerts.routes');

const app = express();

// --- Core Middleware ---
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (reports, etc.)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- API Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/forms', formsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/responses', responsesRoutes);
app.use('/api/alerts', alertsRoutes);

// --- Public Routes (no auth — served to customers via QR scan) ---
app.use('/form', publicRoutes);

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Global Error Handler ---
app.use(errorHandler);

// --- Start Server ---
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // Connect to databases
    await connectMySQL();
    await connectMongo();

    app.listen(PORT, () => {
      console.log(`🚀 InsightLoop Backend running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
