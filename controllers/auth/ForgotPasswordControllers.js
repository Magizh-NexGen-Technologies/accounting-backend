const pool = require('../../utils/config/connectDB');
const crypto = require('crypto');
const { sendEmail } = require('../../utils/email/emailService');

const forgotPassword = async (req, res) => {
    const client = await pool.connect();
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check superadmins table first
        const superadminResult = await client.query(
            'SELECT * FROM superadmins WHERE email = $1',
            [email]
        );

        // Check organization_admins if not found in superadmins
        const orgAdminResult = await client.query(
            'SELECT * FROM organization_admins WHERE admin_email = $1',
            [email]
        );

        let user;
        let userType;

        if (superadminResult.rows.length > 0) {
            user = superadminResult.rows[0];
            userType = 'superadmin';
        } else if (orgAdminResult.rows.length > 0) {
            user = orgAdminResult.rows[0];
            userType = 'organization_admin';
        } else {
            return res.status(404).json({
                success: false,
                message: 'No account found with this email'
            });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

        // Store reset token based on user type
        if (userType === 'superadmin') {
            await client.query(
                'UPDATE superadmins SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
                [resetToken, resetTokenExpiry, user.id]
            );
        } else {
            await client.query(
                'UPDATE organization_admins SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
                [resetToken, resetTokenExpiry, user.id]
            );
        }

        // Send reset email
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        await sendEmail({
            to: email,
            subject: 'Password Reset Request',
            html: `
                <h1>Password Reset Request</h1>
                <p>You requested a password reset. Click the link below to reset your password:</p>
                <a href="${resetUrl}">Reset Password</a>
                <p>If you didn't request this, please ignore this email.</p>
                <p>This link will expire in 1 hour.</p>
            `
        });

        res.json({
            success: true,
            message: 'Password reset email sent successfully'
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process password reset request',
            error: error.message
        });
    } finally {
        client.release();
    }
};

module.exports = {
    forgotPassword
};
