const express = require('express');
const router = express.Router({ mergeParams: true });

const {
  postVendors,
  getVendors,
  putVendors,
  getVendorById
} = require('../../../../controllers/dashboard/Purchases/vendor/vendorControllers');

// Purchase settings routes
router.post('/', postVendors);
router.get('/', getVendors);
router.get('/:vendorId', getVendorById);
router.put('/:id', putVendors);

module.exports = router;       