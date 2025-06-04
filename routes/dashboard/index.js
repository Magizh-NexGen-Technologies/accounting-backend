const express = require('express');
const {getOrganizationAdmin,putOrganizationAdmin} = require('../../controllers/dashboard/OrganizationAdminControllers');
const smtp = require('./smtp/smtp');

const router = express.Router();

// Organization routes middleware to extract organizationId
const organizationContext = (req, res, next) => {
  req.organizationId = req.params.organizationId;
  next();
};

// Mount organization admin routes
router.get('/:organizationId/organizationadmin', organizationContext, getOrganizationAdmin);
router.put('/:organizationId/organizationadmin', organizationContext, putOrganizationAdmin);

// Mount SMTP routes with organization context
router.use('/:organizationId/smtp', organizationContext, smtp);

module.exports = router;    