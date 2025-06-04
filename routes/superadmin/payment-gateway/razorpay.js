const express = require('express');
const router = express.Router();
const {
  createOrder,
  verifyPayment,
  handlePaymentFailure,
  getPaymentFailures
} = require('../../../controllers/superadmin/paymentgateway/RazorpayController');

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
 
// Create order endpoint
router.post('/create-order', asyncHandler(createOrder));

// Verify payment endpoint 
router.post('/verify-payment', asyncHandler(verifyPayment));

// Handle payment failure endpoint
router.post('/payment-failure', asyncHandler(handlePaymentFailure));

// Get payment failures endpoint
router.get('/payment-failures', asyncHandler(getPaymentFailures));

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Payment Gateway Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

module.exports = router;
