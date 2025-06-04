const express = require('express');
const router = express.Router();
const { 
  getSmtpSettings, 
  postSmtpSettings,
  putSmtpSettings,
  testSmtpSettings
} = require('../../../controllers/superadmin/smtpsettings/SMTPRoutes');

// Error handling middleware
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

router.get('/', asyncHandler(getSmtpSettings));
router.post('/', asyncHandler(postSmtpSettings));
router.put('/:id', asyncHandler(putSmtpSettings)); // Update SMTP settings route
router.post('/test', asyncHandler(testSmtpSettings)); // Fixed test endpoint

// Error handling middleware
router.use((err, req, res, next) => {
  console.error('SMTP Settings Error:', err); // Updated error message
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

module.exports = router;
