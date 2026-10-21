const express = require('express');
const router = express.Router();
const { getComplaints, createComplaint, updateComplaintStatus } = require('../controllers/complaintController');
const { validateComplaint } = require('../middleware/validateComplaint');

router.get('/', getComplaints);
router.post('/', validateComplaint, createComplaint);
router.patch('/:id/status', updateComplaintStatus);

exports.complaintRoutes = router;