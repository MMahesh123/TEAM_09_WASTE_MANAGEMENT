const express = require('express');
const router = express.Router();
const wardController = require('../controllers/wardController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, wardController.getAllWards);
router.post('/', verifyToken, verifyRole(['Admin', 'Supervisor']), wardController.createWard);

module.exports = router;