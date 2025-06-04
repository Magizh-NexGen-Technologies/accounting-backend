const express = require('express');
const router = express.Router();
const { getFreeTrial, postFreeTrial, putFreeTrial } = require('../../../controllers/superadmin/freetrial/FreeTrialRoutes');

// GET /api/superadmin/payment-gateway
router.get('/', getFreeTrial);

// POST /api/superadmin/payment-gateway
router.post('/', postFreeTrial);

// PUT /api/superadmin/payment-gateway/:id
router.put('/:id', putFreeTrial);

module.exports = router;
