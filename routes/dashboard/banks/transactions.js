const express = require('express');
const router = express.Router({ mergeParams: true });
const { getTransactions, postTransaction } = require('../../../controllers/dashboard/Accounting/Banks/AddTransactionControllers');

// Get all transactions
router.get('/', getTransactions);

// Create new transaction
router.post('/', postTransaction);

module.exports = router;    