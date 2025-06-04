const express = require('express');
const router = express.Router();
const { resetPassword, validateResetToken } = require('../../controllers/auth/ResetPasswordControllers');

router.post('/', resetPassword);
router.post('/validate-token', validateResetToken);

module.exports = router;
