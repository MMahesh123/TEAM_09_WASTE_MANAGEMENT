
const express = require('express');
const router = express.Router();

const {
  getDashboardSummary,
  getDashboardCharts,
} = require('../controllers/dashboardController');

const {
  verifyToken,
  verifyRole,
} = require('../middleware/authMiddleware');

// Only Admin and Supervisor can access dashboard summaries.
router.get(
  '/summary',
  verifyToken,
  verifyRole(['Admin', 'Supervisor']),
  getDashboardSummary
);

// Only Admin and Supervisor can access dashboard charts.
router.get(
  '/charts',
  verifyToken,
  verifyRole(['Admin', 'Supervisor']),
  getDashboardCharts
);

module.exports = { dashboardRoutes: router };
