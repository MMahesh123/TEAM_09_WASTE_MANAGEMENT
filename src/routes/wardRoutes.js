const express = require('express');
const router = express.Router();
const wardController = require('../controllers/wardController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Authenticated users can view wards; Admin & Supervisor (authorized scope) can create
router.get('/', verifyToken, wardController.getAllWards);
router.post('/', verifyRole(['Admin', 'Supervisor']), wardController.createWard);

module.exports = router;