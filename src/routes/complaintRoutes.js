
const express = require('express');
const router = express.Router();

const {
    getComplaints,
    getComplaintById,
    createComplaint,
    updateComplaintStatus
} = require('../controllers/complaintController');

const { validateComplaint } = require('../middleware/validateComplaint');

const {
    verifyToken,
    verifyRole
} = require('../middleware/authMiddleware');

// Authenticated users can access the complaint listing.
// Citizen ownership is enforced inside the controller.
router.get(
    '/',
    verifyToken,
    getComplaints
);

// Authenticated users can access a complaint.
// Citizens can only access their own complaints.
router.get(
    '/:id',
    verifyToken,
    getComplaintById
);

// Citizens and other authenticated roles can submit complaints.
// The authenticated user ID is taken from the JWT.
router.post(
    '/',
    verifyToken,
    validateComplaint,
    createComplaint
);

// Final complaint status decisions belong only to Supervisors and Admins.
// Admin overrides require a reason, enforced inside the controller.
router.patch(
    '/:id/status',
    verifyToken,
    verifyRole(['Supervisor', 'Admin']),
    updateComplaintStatus
);

module.exports = {
    complaintRoutes: router
};
