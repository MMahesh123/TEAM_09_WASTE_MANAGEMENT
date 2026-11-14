const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, vehicleController.getAllVehicles);
router.post('/', verifyToken, verifyRole(['Admin', 'Supervisor']), vehicleController.createVehicle);
router.put('/:id/status', verifyToken, verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicleStatus);

module.exports = router;