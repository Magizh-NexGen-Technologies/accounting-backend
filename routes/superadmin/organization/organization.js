const express = require('express');
const router = express.Router();
const { 
  getOrganization, 
  postOrganization, 
  putOrganization, 
  getOrganizationById 
} = require('../../../controllers/superadmin/organization/OrganizationRoutes');

// GET /api/superadmin/organization
router.get('/', getOrganization);

// GET /api/superadmin/organization/:id
router.get('/:id', getOrganizationById);
 
// POST /api/superadmin/organization
router.post('/', postOrganization);

// PUT /api/superadmin/organization/:id
router.put('/:id', putOrganization);

module.exports = router;
    