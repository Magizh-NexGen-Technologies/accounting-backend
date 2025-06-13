const express = require('express');
const router = express.Router({ mergeParams: true });

const {
  postPurchaseSettings,
  getPurchaseSettings,
  putLatestPurchaseSettings,
  generatePONumber,
  generateBillNumber,
  deletePurchaseSettings
} = require('../../../../controllers/dashboard/settings/purchaseOrder/PurchaseSettingsControllers');

// Purchase settings routes
router.post('/', postPurchaseSettings);
router.get('/', getPurchaseSettings);
router.put('/', putLatestPurchaseSettings);
router.delete('/:id', deletePurchaseSettings);

// Number generation routes 
router.post('/generate-po', generatePONumber);
router.post('/generate-bill', generateBillNumber);

module.exports = router;     