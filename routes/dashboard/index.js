const express = require('express');
const {getOrganizationAdmin,putOrganizationAdmin} = require('../../controllers/dashboard/OrganizationAdminControllers');
const smtp = require('./smtp/smtp');
const banks = require('./banks/banks');
const transactions = require('./banks/transactions');
const purchaseSettings = require('./settings/purchase/purchase-settings');
const vendors = require('./purchases/vendor/vendors');
const taxSettings = require('./settings/tax/tax-rates');
const router = express.Router({ mergeParams: true });

// Organization routes middleware to extract organizationId
const organizationContext = (req, res, next) => {
  req.organizationId = req.params.organizationId;
  next(); 
};

// Mount organization admin routes
router.get('/:organizationId/organizationadmin', organizationContext, getOrganizationAdmin);
router.put('/:organizationId/organizationadmin', organizationContext, putOrganizationAdmin);

// Mount routes with organization context
router.use('/:organizationId/accounting/transactions', organizationContext, transactions);
router.use('/:organizationId/accounting/banks', organizationContext, banks);
router.use('/:organizationId/smtp', organizationContext, smtp);
router.use('/:organizationId/settings/purchase-settings', organizationContext, purchaseSettings);
router.use('/:organizationId/purchases/vendors', organizationContext, vendors);
router.use('/:organizationId/settings/tax', organizationContext, taxSettings);

module.exports = router;    