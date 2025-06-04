const express = require('express');
const router = express.Router();
const { googleLogin } = require('../../controllers/auth/LoginControllers');

// Google OAuth login route
router.post('/', googleLogin);

module.exports = router;  