
const express = require('express');
const router = express.Router();

const {
    createCollection,
    getCollections,
    getCollectionById,
    verifyCollection
} = require('../controllers/collectionController');

const {
    validateCollection,
    validateCollectionVerification
} = require('../middleware/validateCollection');

const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Supervisors, Workers and Admins can view collection records.
router.get(
    '/',
    verifyToken,
    verifyRole(['Supervisor', 'Worker', 'Admin']),
    getCollections
);

router.get(
    '/:id',
    verifyToken,
    verifyRole(['Supervisor', 'Worker', 'Admin']),
    getCollectionById
);

// Workers and Admins can record collections.
// Assignment ownership is validated by the controller.
router.post(
    '/',
    verifyToken,
    verifyRole(['Worker', 'Admin']),
    validateCollection,
    createCollection
);

// Only Supervisors and Admins can verify collection records.
router.patch(
    '/:id/verify',
    verifyToken,
    verifyRole(['Supervisor', 'Admin']),
    validateCollectionVerification,
    verifyCollection
);

module.exports = router;
