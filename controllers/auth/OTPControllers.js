const crypto = require('crypto');
const pool = require('../../utils/config/connectDB');
const { sendEmail } = require('../../utils/email/emailService');
const { getOrganizationData } = require('../../utils/config/connectOrganization');
// const { sendSMS } = require('../../utils/sms/smsService');
const jwt = require('jsonwebtoken');

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (req, res) => {
    const client = await pool.connect();
    try { 
        const { identifier } = req.body; // identifier is now only email
        
        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Validate email format
        if (!isValidEmail(identifier)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        // Check if user exists in either superadmins or organization_admins
        const superadminResult = await client.query(
            'SELECT * FROM superadmins WHERE email = $1',
            [identifier]
        );

        const orgAdminResult = await client.query(
            'SELECT * FROM organization_admins WHERE admin_email = $1',
            [identifier]
        );

        if (superadminResult.rows.length === 0 && orgAdminResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry

        // Store OTP in database
        await client.query(
            'INSERT INTO otps (identifier, otp, expiry_time) VALUES ($1, $2, $3)',
            [identifier, otp, expiryTime]
        );

        // Send OTP via email
        try {
            await sendEmail({
                to: identifier,
                subject: 'Your Login Verification Code',
                text: `Your verification code is: ${otp}. This code will expire in 10 minutes.`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #333;">Your Verification Code</h2>
                        <p>Your verification code is:</p>
                        <div style="background-color: #f4f4f4; padding: 10px; text-align: center; font-size: 24px; letter-spacing: 5px; margin: 20px 0;">
                            <strong>${otp}</strong>
                        </div>
                        <p>This code will expire in 10 minutes.</p>
                        <p>If you didn't request this code, please ignore this email.</p>
                    </div>
                `
            });

            res.json({
                success: true,
                message: 'OTP sent successfully to your email'
            });
        } catch (emailError) {
            console.error('Error sending email:', emailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send OTP email. Please try again.'
            });
        }

    } catch (error) {
        console.error('Error in sendOTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process OTP request'
        });
    } finally {
        client.release();
    }
};

const createSession = async (userId, token, role, organizationId) => {
  const client = await pool.connect();
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours expiry

    await client.query(
      `INSERT INTO login_sessions (
        user_id, 
        organization_id, 
        token, 
        role, 
        login_method,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, organizationId, token, role, 'otp', expiresAt]
    );
  } finally {
    client.release();
  }
};

const verifyOTP = async (req, res) => {
    const client = await pool.connect();
    try {
        const { identifier, otp } = req.body;

        if (!identifier || !otp) {
            return res.status(400).json({
                success: false,
                message: 'Identifier and OTP are required'
            });
        }

        // Get the most recent OTP for the identifier
        const otpResult = await client.query(
            `SELECT * FROM otps 
             WHERE identifier = $1 
             AND is_used = false 
             AND expiry_time > NOW() 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [identifier]
        );

        if (otpResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid OTP found. Please request a new OTP.'
            });
        }

        const storedOTP = otpResult.rows[0];

        if (storedOTP.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: 'Invalid OTP. Please try again.'
            });
        }

        // Mark OTP as used
        await client.query(
            'UPDATE otps SET is_used = true WHERE id = $1',
            [storedOTP.id]
        );

        // Check both superadmins and organization_admins tables
        const superadminResult = await client.query(
            'SELECT * FROM superadmins WHERE email = $1',
            [identifier]
        );

        const orgAdminResult = await client.query(
            'SELECT * FROM organization_admins WHERE admin_email = $1',
            [identifier]
        );

        let user, organization;

        if (superadminResult.rows.length > 0) {
            user = superadminResult.rows[0];
            user.role = 'superadmin';
            organization = null;
        } else if (orgAdminResult.rows.length > 0) {
            user = orgAdminResult.rows[0];
            user.role = 'admin';
            organization = await getOrganizationData(user.organization_id);
        } else {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate JWT token
        const token = crypto.randomBytes(32).toString('hex');

        // Create login session
        await createSession(
            user.id,
            token,
            user.role,
            user.organization_id || 'system'
        );

        // Update last login
        if (user.role === 'superadmin') {
            await client.query(
                'UPDATE superadmins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );
        } else {
            await client.query(
                'UPDATE organization_admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
                [user.id]
            );
        }

        res.json({
            success: true,
            message: 'OTP verified successfully',
            data: {
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email || user.admin_email,
                    role: user.role,
                    organization: user.organization_id
                },
                organization,
                token
            }
        });

    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to verify OTP. Please try again.'
        });
    } finally {
        client.release();
    }
};

module.exports = {
    sendOTP,
    verifyOTP
};
