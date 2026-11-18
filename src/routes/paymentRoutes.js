
const express = require('express');
const router = express.Router();

const paymentController = require('../controllers/paymentController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Calculate payments — Admin and Supervisor
router.post(
    '/calculate',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    paymentController.calculate
);

// Simulate payments — Admin and Supervisor
router.post(
    '/simulate',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    paymentController.simulate
);

// Payment totals per status for reports — Admin and Supervisor (declared before '/:id' so it is not read as an id)
router.get(
    '/summary',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    paymentController.summary
);

// View all payments — Admin, Supervisor and Worker
router.get(
    '/',
    verifyToken,
    verifyRole(['Admin', 'Supervisor', 'Worker']),
    paymentController.listPayments
);

// View a specific payment — Admin, Supervisor and Worker
router.get(
    '/:id',
    verifyToken,
    verifyRole(['Admin', 'Supervisor', 'Worker']),
    paymentController.getPayment
);

// Mark payment as paid — Admin only
router.patch(
    '/:id/status',
    verifyToken,
    verifyRole(['Admin']),
    paymentController.markPaid
);

// Cancel a simulated payment and release its collection logs — Admin only
router.post(
    '/:id/cancel',
    verifyToken,
    verifyRole(['Admin']),
    paymentController.cancelPayment
);

module.exports = router;
