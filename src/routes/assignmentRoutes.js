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
const { verifyRole } = require('../middleware/authMiddleware');

// verifyRole checks the JWT itself, and Admin passes every role check.

// Supervisors see every assignment; Workers see only their own shifts.
router.get('/', verifyRole(['Supervisor', 'Worker']), getAssignments);
router.get('/:id', verifyRole(['Supervisor', 'Worker']), getAssignmentById);

// Only Supervisors (and Admins) can schedule a vehicle and worker.
router.post('/', verifyRole(['Supervisor']), validateCreateAssignment, createAssignment);

// Supervisors manage any assignment; Workers can start or complete their own.
router.patch(
    '/:id/status',
    verifyRole(['Supervisor', 'Worker']),
    validateAssignmentStatus,
    updateAssignmentStatus
);

module.exports = router;
