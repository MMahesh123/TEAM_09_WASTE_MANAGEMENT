const express = require('express');
const router = express.Router();
const c = require('../controllers/disposalController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

router.get('/', verifyToken, c.listSites);
router.get('/summary', verifyToken, verifyRole(['Admin', 'Supervisor']), c.summary); // before '/:id'
router.get('/:id', verifyToken, c.getSite);

router.post('/', verifyToken, verifyRole(['Admin']), c.createSite);
router.put('/:id', verifyToken, verifyRole(['Admin']), c.updateSite);
router.delete('/:id', verifyToken, verifyRole(['Admin']), c.deleteSite);
router.get('/:id/history', verifyToken, verifyRole(['Admin', 'Supervisor']), c.getHistory);
router.post('/:id/load', verifyToken, verifyRole(['Admin', 'Supervisor']), c.updateLoad);

module.exports = router;