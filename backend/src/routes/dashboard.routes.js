const express = require('express');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/dashboard - single shaped payload, mirrors DashboardController.Index -> DashboardStats.
router.get('/', requireAuth, async (req, res) => {
  const { hospitalId } = req.user;
  const result = await pool.query(`SELECT * FROM dashboard_stats WHERE hospital_id = $1`, [hospitalId]);
  const row = result.rows[0];

  if (!row) {
    return res.status(404).json({ message: 'No dashboard stats found for this hospital yet.' });
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  res.json({
    greeting: `${greeting}, ${req.user.name.split(' ')[0]}`,
    today: new Date().toISOString(),
    kpis: {
      patientsToday: row.patients_today,
      patientsTrend: Number(row.patients_trend),
      revenueToday: Number(row.revenue_today),
      revenueTrend: Number(row.revenue_trend),
      outstandingAmount: Number(row.outstanding_amount),
      outstandingInvoices: row.outstanding_invoices,
      reportsPending: row.reports_pending,
      pendingTrend: Number(row.pending_trend),
      averageTurnaroundHours: Number(row.average_turnaround_hours),
      reportsCompleted: row.reports_completed,
      reportsCompletedTrend: Number(row.reports_completed_trend),
      samplesInProcess: row.samples_in_process,
      homeCollectionsToday: row.home_collections_today,
      criticalReports: row.critical_reports,
    },
    charts: {
      revenueTrend: { labels: row.revenue_trend_labels, values: row.revenue_trend_values },
      bookingSource: { labels: row.booking_source_labels, values: row.booking_source_values },
      topTests: { labels: row.top_tests_labels, values: row.top_tests_values },
      departmentLoads: row.department_loads,
    },
    recentActivity: row.recent_activity,
  });
});

module.exports = router;
