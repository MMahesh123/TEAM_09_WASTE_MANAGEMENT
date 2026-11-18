
const express = require('express');
const router = express.Router();

const {
    getDashboardSummary,
    getDashboardCharts,
    getDashboardOperations
} = require('../controllers/dashboardController');

const {
    verifyToken,
    verifyRole
} = require('../middleware/authMiddleware');

router.get(
    '/summary',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    getDashboardSummary
);

router.get(
    '/charts',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    getDashboardCharts
);

router.get(
    '/operations',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    getDashboardOperations
);

module.exports = { dashboardRoutes: router };
