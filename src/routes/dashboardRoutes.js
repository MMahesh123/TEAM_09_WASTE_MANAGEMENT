
const express = require('express');
const router = express.Router();

const {
    getDashboardSummary,
    getDashboardCharts
} = require('../controllers/dashboardController');

const { verifyRole } = require('../middleware/authMiddleware');

// Admin and Supervisor dashboard endpoints
router.get(
    '/summary',
    verifyRole(['Admin', 'Supervisor']),
    getDashboardSummary
);

router.get(
    '/charts',
    verifyRole(['Admin', 'Supervisor']),
    getDashboardCharts
);

exports.dashboardRoutes = router;
