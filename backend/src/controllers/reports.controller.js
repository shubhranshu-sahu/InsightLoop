const { getPool } = require('../config/db');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

/**
 * POST /api/reports/generate
 * Generate a PDF report for a form within a date range.
 */
const generateReport = async (req, res, next) => {
  try {
    const { form_id, report_type = 'custom', date_from, date_to } = req.body;
    const businessId = req.business.business_id;
    const pool = getPool();

    if (!form_id) {
      return res.status(400).json({ error: 'form_id is required.' });
    }

    // Call FastAPI AI service for a summary
    let summary = null;
    try {
      const aiResponse = await axios.post(`${process.env.AI_SERVICE_URL}/summary`, {
        business_id: businessId,
        form_id,
        date_from: date_from || null,
        date_to: date_to || null,
      });
      summary = aiResponse.data.summary;
    } catch (aiErr) {
      console.error('AI summary generation failed:', aiErr.message);
    }

    // Create report record
    const reportId = require('crypto').randomUUID();
    const title = `${report_type.charAt(0).toUpperCase() + report_type.slice(1)} Report - ${new Date().toISOString().split('T')[0]}`;
    const filePath = `/uploads/reports/${reportId}.pdf`;

    // Ensure reports directory exists
    const reportsDir = path.join(__dirname, '..', '..', 'uploads', 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    // TODO: Implement actual PDF generation here
    // For now, save a placeholder
    fs.writeFileSync(path.join(reportsDir, `${reportId}.pdf`), 'Report placeholder');

    await pool.query(
      `INSERT INTO reports (report_id, business_id, form_id, title, report_type, file_path)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reportId, businessId, form_id, title, report_type, filePath]
    );

    res.status(201).json({
      message: 'Report generated successfully.',
      report: {
        report_id: reportId,
        title,
        report_type,
        file_path: filePath,
        summary,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports
 * List all generated reports for this business.
 */
const getAllReports = async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM reports WHERE business_id = ? ORDER BY generated_at DESC`,
      [req.business.business_id]
    );

    res.json({ reports: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/reports/:report_id/download
 * Download a report PDF.
 */
const downloadReport = async (req, res, next) => {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM reports WHERE report_id = ? AND business_id = ?`,
      [req.params.report_id, req.business.business_id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    const filePath = path.join(__dirname, '..', '..', rows[0].file_path);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Report file not found on server.' });
    }

    res.download(filePath, `${rows[0].title}.pdf`);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateReport,
  getAllReports,
  downloadReport,
};
