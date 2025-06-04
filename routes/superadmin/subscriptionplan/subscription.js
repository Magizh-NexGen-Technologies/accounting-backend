const express = require('express');
const router = express.Router();
const { 
  getSubscriptionPlans, 
  postSubscriptionPlans, 
  putSubscriptionPlan,
  deleteSubscriptionPlan 
} = require('../../../controllers/superadmin/subscriptionplan/subscriptionplanRoutes');

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// GET all subscription plans
router.get('/', asyncHandler(getSubscriptionPlans));
 
// POST new subscription plan
router.post('/', asyncHandler(postSubscriptionPlans));

// PUT update subscription plan (published/popular status)
router.put('/:id', asyncHandler(putSubscriptionPlan));

// DELETE subscription plan
router.delete('/:id', asyncHandler(deleteSubscriptionPlan));

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('Subscription Plan Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

module.exports = router;
