const express = require('express');
const router = express.Router();
const { 
  registerUser, 
  registerOrganizationAdmin, 
  registerSuperAdmin,
  checkEmailEligibility,
  ROLES 
} = require('../../controllers/auth/RegisterControllers');
const { authenticateToken, isAdmin, isSuperAdmin } = require('../../middleware/auth/auth');

// Route to check if email is eligible for registration
router.post('/check-email', async (req, res) => {
  try {
    await checkEmailEligibility(req, res);
  } catch (error) {
    console.error('Error in email eligibility check route:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server err or during email eligibility check',
      error: error.message
    });
  }
});

// Public route for user registration (handles superadmin and organization admin)
router.post('/user', async (req, res) => {
  try {
    await registerUser(req, res);
  } catch (error) {
    console.error('Error in user registration route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during user registration',
      error: error.message
    });
  }
});

// Protected route for organization admin registration (requires superadmin authentication)
router.post('/admin', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    await registerOrganizationAdmin(req, res);
  } catch (error) {
    console.error('Error in admin registration route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin registration',
      error: error.message
    });
  }
});

// Protected route for superadmin registration (requires superadmin authentication)
router.post('/superadmin', authenticateToken, isSuperAdmin, async (req, res) => {
  try {
    await registerSuperAdmin(req, res);
  } catch (error) {
    console.error('Error in superadmin registration route:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during superadmin registration',
      error: error.message
    });
  }
});

module.exports = router;
