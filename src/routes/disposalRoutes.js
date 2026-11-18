
const express = require('express');
const router = express.Router();

const c = require('../controllers/disposalController');

const {
    verifyToken,
    verifyRole
} = require('../middleware/authMiddleware');

const {
    validateDisposalDelivery,
    validateDisposalDeliveryVerification
} = require('../middleware/validateDisposalDelivery');

// =========================================================
// DISPOSAL DELIVERY ROUTES
// Keep these BEFORE /:id routes.
// =========================================================

// Worker/Admin records a disposal delivery.
router.post(
    '/deliveries',
    verifyToken,
    verifyRole(['Worker', 'Admin']),
    validateDisposalDelivery,
    c.createDelivery
);

// Worker sees own records; Supervisor/Admin see all.
router.get(
    '/deliveries',
    verifyToken,
    verifyRole(['Worker', 'Supervisor', 'Admin']),
    c.listDeliveries
);

router.get(
    '/deliveries/:id',
    verifyToken,
    verifyRole(['Worker', 'Supervisor', 'Admin']),
    c.getDelivery
);

// Only Supervisor/Admin can verify deliveries.
router.patch(
    '/deliveries/:id/verify',
    verifyToken,
    verifyRole(['Supervisor', 'Admin']),
    validateDisposalDeliveryVerification,
    c.verifyDelivery
);

// =========================================================
// EXISTING DISPOSAL SITE ROUTES
// =========================================================

router.get(
    '/',
    verifyToken,
    c.listSites
);

router.get(
    '/:id',
    verifyToken,
    c.getSite
);

router.post(
    '/',
    verifyToken,
    verifyRole(['Admin']),
    c.createSite
);

router.put(
    '/:id',
    verifyToken,
    verifyRole(['Admin']),
    c.updateSite
);

router.delete(
    '/:id',
    verifyToken,
    verifyRole(['Admin']),
    c.deleteSite
);

// Existing manual load adjustment.
router.post(
    '/:id/load',
    verifyToken,
    verifyRole(['Admin', 'Supervisor']),
    c.updateLoad
);

module.exports = router;
