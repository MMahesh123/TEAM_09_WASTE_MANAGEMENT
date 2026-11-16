const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, vehicleController.getAllVehicles);
router.get('/:id', verifyToken, vehicleController.getVehicleById);
router.post('/', verifyRole(['Admin', 'Supervisor']), vehicleController.createVehicle);
router.put('/:id', verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicle);
router.put('/:id/status', verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicleStatus);
router.delete('/:id', verifyRole(['Admin']), vehicleController.deleteVehicle);

module.exports = router;