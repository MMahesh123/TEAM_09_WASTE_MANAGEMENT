
const express = require('express')
const router = express.Router()

const workerController = require('../controllers/workerController')
const { verifyToken, verifyRole } = require('../middleware/authMiddleware')

router.get(
  '/',
  verifyToken,
  verifyRole(['Admin', 'Supervisor']),
  workerController.getAllWorkers
)

module.exports = router
