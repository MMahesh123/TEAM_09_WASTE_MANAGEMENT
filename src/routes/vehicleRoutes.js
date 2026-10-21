const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');

router.get('/', vehicleController.getAllVehicles);
router.post('/', vehicleController.createVehicle);
router.put('/:id/status', vehicleController.updateVehicleStatus);

module.exports = router;
