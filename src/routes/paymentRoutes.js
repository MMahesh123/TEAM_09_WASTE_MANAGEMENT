const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { verifyRole } = require('../middleware/authMiddleware');

// verifyRole verifies the JWT itself; Admin is always allowed.
router.post('/calculate', verifyRole(['Admin', 'Supervisor']), c.calculate);
router.post('/simulate', verifyRole(['Admin', 'Supervisor']), c.simulate);
router.get('/', verifyRole(['Supervisor', 'Worker']), c.listPayments);
router.get('/:id', verifyRole(['Supervisor', 'Worker']), c.getPayment);
router.patch('/:id/status', verifyRole(['Admin']), c.markPaid);

module.exports = router;
