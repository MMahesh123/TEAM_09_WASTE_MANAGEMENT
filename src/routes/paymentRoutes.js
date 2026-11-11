const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { verifyRole } = require('../middleware/authMiddleware');

router.post('/calculate', verifyRole(['Admin', 'Supervisor']), c.calculate);
router.post('/simulate', verifyRole(['Admin', 'Supervisor']), c.simulate);
router.get('/', verifyRole(['Supervisor', 'Worker']), c.listPayments);
router.get('/:id', verifyRole(['Supervisor', 'Worker']), c.getPayment);

module.exports = router;
