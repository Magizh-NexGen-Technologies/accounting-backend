const express = require('express');
const router = express.Router();
const { getSuperadmin, postSuperadmin, putSuperadmin } = require('../../../controllers/superadmin/AdminControllers');

// GET /api/superadmin/finance - Get current finance settings
router.get('/', getSuperadmin);

// POST /api/superadmin/finance - Create new finance settings
router.post('/', postSuperadmin);

// PUT /api/superadmin/finance/:id - Update existing finance settings by ID
router.put('/:id', putSuperadmin);


module.exports = router;
  