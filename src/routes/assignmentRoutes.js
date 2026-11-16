
const express = require('express');
const router = express.Router();

const {
    getAssignments,
    getAssignmentById,
    createAssignment,
    updateAssignmentStatus
} = require('../controllers/assignmentController');

const {
    validateCreateAssignment,
    validateAssignmentStatus
} = require('../middleware/validateAssignment');

const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Supervisors, Workers and Admins can view assignments.
router.get(
    '/',
    verifyToken,
    verifyRole(['Supervisor', 'Worker', 'Admin']),
    getAssignments
);

router.get(
    '/:id',
    verifyToken,
    verifyRole(['Supervisor', 'Worker', 'Admin']),
    getAssignmentById
);

// Only Supervisors and Admins can create assignments.
router.post(
    '/',
    verifyToken,
    verifyRole(['Supervisor', 'Admin']),
    validateCreateAssignment,
    createAssignment
);

// Supervisors, Workers and Admins can update assignment status.
// Workers can only update their own assignments (enforced by controller).
router.patch(
    '/:id/status',
    verifyToken,
    verifyRole(['Supervisor', 'Worker', 'Admin']),
    validateAssignmentStatus,
    updateAssignmentStatus
);

module.exports = router;
