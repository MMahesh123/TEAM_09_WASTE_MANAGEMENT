
const express = require('express');
const router = express.Router();

const issueController = require('../controllers/issueController');
const { verifyToken, verifyRole } = require('../middleware/authMiddleware');

const supervisorsAndAdmins = ['Supervisor', 'Admin'];

router.get(
    '/',
    verifyToken,
    verifyRole(supervisorsAndAdmins),
    issueController.getIssues
);

router.get(
    '/:id',
    verifyToken,
    verifyRole(supervisorsAndAdmins),
    issueController.getIssueById
);

router.patch(
    '/complaints/:complaintId/group',
    verifyToken,
    verifyRole(supervisorsAndAdmins),
    issueController.reviewComplaintGrouping
);

module.exports = router;
