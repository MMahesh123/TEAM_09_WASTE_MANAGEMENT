const express = require('express');
const router = express.Router();
const wardController = require('../controllers/wardController');
const verifyRole = require('../middleware/roleMiddleware');

router.get('/', wardController.getAllWards);
router.post('/', verifyRole(['Admin']), wardController.createWard);

module.exports = router;