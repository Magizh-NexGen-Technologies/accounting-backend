const crypto = require('crypto');
const pool = require('../../utils/config/connectDB');
const { sendEmail } = require('../../utils/email/emailService');
const { getOrganizationData } = require('../../utils/config/connectOrganization');
// const { sendSMS } = require('../../utils/sms/smsService');

const generateOTP = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (req, res) => {
    const client = await pool.connect();
    try {
        const { identifier } = req.body; // identifier can be email or phone
        
        if (!identifier) {
            return res.status(400).json({
                success: false,
                message: 'Email or phone number is required'
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

        console.log('Stored OTP:', { identifier, otp, expiryTime }); // Debug log

        // Check if identifier is email or phone
        const isEmail = identifier.includes('@');
        
        if (isEmail) {
            try {
                // Send OTP via email
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
        } else {
            // For now, just return success for phone numbers
            // TODO: Implement SMS service
            res.json({
                success: true,
                message: 'OTP generated successfully (SMS service not implemented)'
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

const verifyOTP = async (req, res) => {
    const client = await pool.connect();
    try {
        const { identifier, otp } = req.body;

        console.log('Verifying OTP:', { identifier, otp }); // Debug log

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
            console.log('No valid OTP found for identifier:', identifier); // Debug log
            return res.status(400).json({
                success: false,
                message: 'No valid OTP found. Please request a new OTP.'
            });
        }

        const storedOTP = otpResult.rows[0];

        if (storedOTP.otp !== otp) {
            console.log('Invalid OTP for identifier:', identifier); // Debug log
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
            organization = null; // Superadmins don't belong to an organization
        } else if (orgAdminResult.rows.length > 0) {
            user = orgAdminResult.rows[0];
            user.role = 'admin';
            
            // Get organization data using the new getOrganizationData function
            organization = await getOrganizationData(user.organization_id);

            if (!organization) {
                console.log('Organization not found for user:', user.id); // Debug log
                return res.status(404).json({
                    success: false,
                    message: 'Organization not found'
                });
            }
        } else {
            console.log('User not found for identifier:', identifier); // Debug log
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Generate JWT token
        const token = crypto.randomBytes(32).toString('hex');

        console.log('OTP verification successful for user:', user.id); // Debug log

        res.json({
            success: true,
            message: 'OTP verified successfully',
            data: {
                user,
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
