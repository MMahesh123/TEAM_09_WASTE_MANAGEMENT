
const express = require('express');
const router = express.Router();

const {
  getComplaints,
  getComplaintById,
  createComplaint,
  updateComplaintStatus,
} = require('../controllers/complaintController');

const { validateComplaint } = require('../middleware/validateComplaint');
const {
  verifyToken,
  verifyRole,
} = require('../middleware/authMiddleware');

// Authenticated users can view complaints.
// The controller should enforce ownership for Citizen users.
router.get('/', verifyToken, getComplaints);
router.get('/:id', verifyToken, getComplaintById);

// Authenticated users can submit complaints.
router.post('/', verifyToken, validateComplaint, createComplaint);

// Only Admin, Supervisor, and Worker can update complaint status.
router.patch(
  '/:id/status',
  verifyToken,
  verifyRole(['Admin', 'Supervisor', 'Worker']),
  updateComplaintStatus
);

module.exports = { complaintRoutes: router };
