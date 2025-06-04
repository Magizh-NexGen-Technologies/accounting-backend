const express = require('express');
const router = express.Router();
const { getPaymentgateway, postPaymentgateway, putPaymentgateway } = require('../../../controllers/superadmin/paymentgateway/PaymentgatewayRoutes');
const razorpayRoutes = require('./razorpay');

// GET /api/superadmin/payment-gateways
router.get('/', getPaymentgateway);

// POST /api/superadmin/payment-gateways
router.post('/', postPaymentgateway);

// PUT /api/superadmin/payment-gateways/:id
router.put('/:id', putPaymentgateway);

// Include Razorpay specific routes
router.use('/', razorpayRoutes);

module.exports = router;
 