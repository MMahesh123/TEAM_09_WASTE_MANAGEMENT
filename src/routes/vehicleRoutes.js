const express = require('express');
const router = express.Router();
const vehicleController = require('../controllers/vehicleController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, vehicleController.getAllVehicles);
router.get('/:id', verifyToken, vehicleController.getVehicleById);

router.post('/', verifyToken, verifyRole(['Admin', 'Supervisor']), vehicleController.createVehicle);
router.put('/:id', verifyToken, verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicle);
router.put('/:id/status', verifyToken, verifyRole(['Admin', 'Supervisor']), vehicleController.updateVehicleStatus);
router.delete('/:id', verifyToken, verifyRole(['Admin']), vehicleController.deleteVehicle);

module.exports = router;
