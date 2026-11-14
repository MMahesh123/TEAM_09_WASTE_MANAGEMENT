const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

// Authenticated staff can view vehicles; Admin & Supervisor can manage them
router.get('/', verifyToken, vehicleController.getAllVehicles);
router.post('/', verifyRole(['Admin', 'Supervisor']), vehicleController.createVehicle);
router.put('/:id/status', verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicleStatus);

module.exports = router;