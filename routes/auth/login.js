const express = require('express');
const router = express.Router();
const { login, logout, verifyCredentials } = require('../../controllers/auth/LoginControllers');

// Verify credentials route
router.post('/verify', verifyCredentials);

// Login route
router.post('/', login);

// Logout route
router.post('/logout', logout);

module.exports = router;
   