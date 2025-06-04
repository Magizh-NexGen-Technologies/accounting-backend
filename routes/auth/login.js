const express = require('express');
const router = express.Router();
const { login, logout } = require('../../controllers/auth/LoginControllers');

// Login route
router.post('/', login);

// Logout route
router.post('/logout', logout);

module.exports = router;
  