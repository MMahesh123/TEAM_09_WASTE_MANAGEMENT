const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.post('/calculate', verifyToken, verifyRole(['Admin', 'Supervisor']), c.calculate);
router.post('/simulate', verifyToken, verifyRole(['Admin', 'Supervisor']), c.simulate);

router.get('/', verifyToken, verifyRole(['Admin', 'Supervisor', 'Worker']), c.listPayments);
router.get('/:id', verifyToken, verifyRole(['Admin', 'Supervisor', 'Worker']), c.getPayment);

router.patch('/:id/status', verifyToken, verifyRole(['Admin']), c.markPaid);

module.exports = router;
