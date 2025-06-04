const pool = require('../../utils/config/connectDB');
const bcrypt = require('bcryptjs');

const validateResetToken = async (req, res) => {
    const client = await pool.connect();
    try {
        const { token } = req.body;

        // Check token in both tables
        const superadminResult = await client.query(
            'SELECT id FROM superadmins WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );

        const orgAdminResult = await client.query(
            'SELECT id FROM organization_admins WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );

        if (superadminResult.rows.length === 0 && orgAdminResult.rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        res.json({
            success: true,
            message: 'Valid reset token'
        });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate reset token',
            error: error.message
        });
    } finally {
        client.release();
    }
};

const resetPassword = async (req, res) => {
    const client = await pool.connect();
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({
                success: false,
                message: 'Token and new password are required'
            });
        }

        // Check token in superadmins table
        const superadminResult = await client.query(
            'SELECT id FROM superadmins WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );

        // Check token in organization_admins table
        const orgAdminResult = await client.query(
            'SELECT id FROM organization_admins WHERE reset_token = $1 AND reset_token_expires > NOW()',
            [token]
        );

        let userId;
        let userType;

        if (superadminResult.rows.length > 0) {
            userId = superadminResult.rows[0].id;
            userType = 'superadmin';
        } else if (orgAdminResult.rows.length > 0) {
            userId = orgAdminResult.rows[0].id;
            userType = 'organization_admin';
        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token'
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password based on user type
        if (userType === 'superadmin') {
            await client.query(
                'UPDATE superadmins SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
                [hashedPassword, userId]
            );
        } else {
            await client.query(
                'UPDATE organization_admins SET password = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
                [hashedPassword, userId]
            );
        }

        res.json({
            success: true,
            message: 'Password reset successful'
        });

    } catch (error) {
        console.error('Password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
            error: error.message
        });
    } finally {
        client.release();
    }
};

module.exports = {
    validateResetToken,
    resetPassword
};
