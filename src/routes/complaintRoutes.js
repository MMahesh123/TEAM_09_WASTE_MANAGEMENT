
const express = require('express');
const router = express.Router();

const {
    getComplaints,
    getComplaintById,
    createComplaint,
    updateComplaintStatus
} = require('../controllers/complaintController');

const { validateComplaint } = require('../middleware/validateComplaint');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// All authenticated users can view complaints.
router.get('/', verifyToken, getComplaints);
router.get('/:id', verifyToken, getComplaintById);

// Authenticated users can submit complaints.
router.post('/', verifyToken, validateComplaint, createComplaint);

// Only Admins, Supervisors, and Workers can update complaint status.
router.patch(
    '/:id/status',
    verifyRole(['Admin', 'Supervisor', 'Worker']),
    updateComplaintStatus
);

module.exports = { complaintRoutes: router };
