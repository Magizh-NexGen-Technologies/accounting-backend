const express = require('express');
const {getOrganizationAdmin,putOrganizationAdmin} = require('../../../controllers/dashboard/OrganizationAdminControllers.js');

const router = express.Router();

// Mount organization admin routes directly
router.get('/:organizationId', getOrganizationAdmin);
router.put('/:organizationId', putOrganizationAdmin)

module.exports = router;    