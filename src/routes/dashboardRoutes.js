
const express = require('express');
const router = express.Router();

const { getDashboardSummary } = require('../controllers/dashboardController');
const { verifyRole } = require('../middleware/authMiddleware');

// Only Admins and Supervisors can access dashboard statistics
router.get(
    '/summary',
    verifyRole(['Admin', 'Supervisor']),
    getDashboardSummary
);

exports.dashboardRoutes = router;
