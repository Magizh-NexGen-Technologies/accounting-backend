const express = require('express');
const paymentgatewayRoutes = require('./superadmin/payment-gateway/paymentgateway');
const subscriptionRoutes = require('./superadmin/subscriptionplan/subscription');
const smtpSettingsRoutes = require('./superadmin/smtp-settings/smtpsettings');
const brandSettingsRoutes = require('./superadmin/brand/branding'); 
const freetrialRoutes = require('./superadmin/freetrial/freetrial');
const financeRoutes = require('./superadmin/finance/finance');
const organizationRoutes = require('./superadmin/organization/organization');
const registerRoutes = require('./auth/register');
const loginRoutes = require('./auth/login');
const googleAuthRoutes = require('./auth/google');
const otpRoutes = require('./auth/otp');
const superadminRoutes = require('./superadmin/admindata/superadmin');
const OrganizationAdmin = require('./superadmin/organizationadmin/organizationadmin')
const resetPasswordRoutes = require('./auth/reset-password');
const forgotPasswordRoutes = require('./auth/forgot-password');

const router = express.Router();

// Superadmin routes
router.use('/superadmin/payment-gateways', paymentgatewayRoutes); 
router.use('/superadmin/subscription-plans', subscriptionRoutes);
router.use('/superadmin/smtp-settings', smtpSettingsRoutes);
router.use('/superadmin/branding', brandSettingsRoutes);  
router.use('/superadmin/freetrial', freetrialRoutes);
router.use('/superadmin/finance', financeRoutes);
router.use('/superadmin/organization', organizationRoutes);
router.use('/superadmin/admindata/superadmin', superadminRoutes);
router.use('/superadmin/organizationadmin', OrganizationAdmin)

// Auth routes 
router.use('/auth/register', registerRoutes);
router.use('/auth/login', loginRoutes);
router.use('/auth/google', googleAuthRoutes);
router.use('/auth/otp', otpRoutes);
router.use('/auth/reset-password', resetPasswordRoutes);
router.use('/auth/forgot-password', forgotPasswordRoutes);

module.exports = router;