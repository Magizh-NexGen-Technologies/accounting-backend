const express = require('express');
const router = express.Router({ mergeParams: true });

const {
  postVendors,
  getVendors,
  putVendors
} = require('../../../../controllers/dashboard/Purchases/vendor/vendorControllers');

// Purchase settings routes
router.post('/', postVendors);
router.get('/', getVendors);
router.put('/:id', putVendors);




module.exports = router;     