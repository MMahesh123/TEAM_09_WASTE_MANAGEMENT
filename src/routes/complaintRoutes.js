const express = require('express');
const router = express.Router();
const { getComplaints, createComplaint } = require('../controllers/complaintController');
const { validateComplaint } = require('../middleware/validateComplaint');

router.get('/', getComplaints);
router.post('/', validateComplaint, createComplaint);

exports.complaintRoutes = router;