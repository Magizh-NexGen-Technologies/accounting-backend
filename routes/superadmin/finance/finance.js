const express = require('express');
const router = express.Router();
const { getFinanceSettings, postFinanceSettings, putFinanceSettings, generateInvoiceNumber } = require('../../../controllers/superadmin/finance/FinanceRoutes');

// GET /api/superadmin/finance - Get current finance settings
router.get('/', getFinanceSettings);

// POST /api/superadmin/finance - Create new finance settings
router.post('/', postFinanceSettings);

// PUT /api/superadmin/finance/:id - Update existing finance settings by ID
router.put('/:id', putFinanceSettings);

// POST /api/superadmin/finance/generate-invoice - Generate a new invoice number
router.post('/generate-invoice', generateInvoiceNumber);

module.exports = router;
  