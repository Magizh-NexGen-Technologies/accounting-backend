const express = require('express');
const router = express.Router();
const { sendOTP, verifyOTP } = require('../../controllers/auth/OTPControllers');

// Route to send OTP
router.post('/send', sendOTP);

// Route to verify OTP
router.post('/verify', verifyOTP);

module.exports = router;
