const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const verifyRole = require('../middleware/roleMiddleware');

router.get('/', vehicleController.getAllVehicles);
router.post('/', verifyRole(['Admin', 'Supervisor']), vehicleController.createVehicle);
router.put('/:id/status', verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicleStatus);

module.exports = router;