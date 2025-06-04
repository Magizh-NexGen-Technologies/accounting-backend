const express = require('express');
const router = express.Router();
const { forgotPassword } = require('../../controllers/auth/ForgotPasswordControllers');

router.post('/', forgotPassword);

module.exports = router;
