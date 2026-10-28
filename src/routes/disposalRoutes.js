const express = require('express');
const router = express.Router();
const c = require('../controllers/disposalController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, c.listSites);
router.get('/:id', verifyToken, c.getSite);
router.post('/', verifyRole(['Admin']), c.createSite);
router.put('/:id', verifyRole(['Admin']), c.updateSite);
router.delete('/:id', verifyRole(['Admin']), c.deleteSite);
router.post('/:id/load', verifyRole(['Admin', 'Supervisor']), c.updateLoad);

module.exports = router;
