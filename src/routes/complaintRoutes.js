const express = require('express');
const router = express.Router();
const c = require('../controllers/complaintController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.post('/', verifyToken, c.createComplaint);
router.get('/', verifyToken, c.listComplaints);
router.get('/:id', verifyToken, c.getComplaint);
router.put('/:id', verifyToken, c.updateComplaint);
router.patch('/:id/status', verifyRole(['Admin', 'Supervisor']), c.updateStatus);
router.delete('/:id', verifyToken, c.deleteComplaint);

module.exports = router;
