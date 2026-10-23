const express = require('express');
const router = express.Router();
const c = require('../controllers/paymentController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.post('/calculate', verifyRole(['Admin', 'Supervisor']), c.calculate);
router.post('/simulate', verifyRole(['Admin', 'Supervisor']), c.simulate);
router.get('/', verifyToken, c.listPayments);
router.get('/:id', verifyToken, c.getPayment);

module.exports = router;
