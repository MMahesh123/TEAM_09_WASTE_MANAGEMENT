const express = require('express');
const router = express.Router();

const {
    createCollection,
    getCollections,
    getCollectionById
} = require('../controllers/collectionController');
const { validateCollection } = require('../middleware/validateCollection');
const { verifyRole } = require('../middleware/authMiddleware');

// verifyRole checks the JWT itself, and Admin passes every role check.

// Supervisors see all collection records; Workers see only their own.
router.get('/', verifyRole(['Supervisor', 'Worker']), getCollections);
router.get('/:id', verifyRole(['Supervisor', 'Worker']), getCollectionById);

// Collection staff record waste against their own assignment.
router.post('/', verifyRole(['Worker']), validateCollection, createCollection);

module.exports = router;
