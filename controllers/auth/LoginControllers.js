const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../../utils/config/connectDB');
const LoginSchema = require('../../utils/models/auth/LoginSchema');
const SuperAdminSchema = require('../../utils/models/superadmin/superadminSchema');
const { connectToOrganizationDB } = require('../../utils/config/connectOrganization');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const TOKEN_EXPIRY = '24h';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
 
/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} Whether email is valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number format
 * @param {string} phone - Phone number to validate
 * @returns {boolean} Whether phone number is valid
 */
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s-]{10,}$/;
  return phoneRegex.test(phone);
};

/**
 * Login user and create session
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const login = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { identifier, password } = req.body;
    
    // Input validation
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/Phone number and password are required'
      });
    }

    // Check login attempts
    const loginAttempts = await checkLoginAttempts(identifier);
    if (loginAttempts >= 5) {
      return res.status(429).json({
        success: false,
        message: 'Too many login attempts. Please try again later.'
      });
    }

    // Find user (superadmin or organization admin)
    const user = await findUser(identifier);
    if (!user) {
      await incrementLoginAttempts(identifier);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await incrementLoginAttempts(identifier);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check account status
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive'
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store session
    await createSession(user.id, accessToken, refreshToken);

    // Update last login
    await updateLastLogin(user.id);

    // Clear login attempts
    await clearLoginAttempts(identifier);

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          organization: user.organization
        },
        tokens: {
          access: accessToken,
          refresh: refreshToken
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  } finally {
    client.release();
  }
};

/**
 * Logout user and invalidate session
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const logout = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Initialize schema
    await client.query(LoginSchema);

    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }
    
    // Delete the session
    await client.query(
      'DELETE FROM login_sessions WHERE token = $1',
      [token]
    );
    
    return res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Handle Google OAuth login
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const googleLogin = async (req, res) => {
  const { token } = req.body;
  const dbClient = await pool.connect();
  
  try {
    // Initialize required schemas
    await dbClient.query(LoginSchema);
    await dbClient.query(SuperAdminSchema);

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, name, picture } = payload;
    
    // First check if user exists in superadmins
    let superadminResult = await dbClient.query(
      'SELECT * FROM superadmins WHERE email = $1',
      [email]
    );
    
    if (superadminResult.rows.length > 0) {
      const superadmin = superadminResult.rows[0];
      
      // Check if superadmin is active
      if (!superadmin.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Your account is inactive. Please contact the administrator.'
        });
      }
      
      // Generate JWT token for superadmin
      const jwtToken = jwt.sign(
        {
          userId: superadmin.id,
          email: superadmin.email,
          role: 'superadmin',
          organizationId: 'system',
          organizationDb: 'system'
        },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );
      
      // Create login session
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);
      
      await dbClient.query(
        `INSERT INTO login_sessions (
          user_id, 
          organization_id, 
          token, 
          role, 
          login_method,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [superadmin.id, 'system', jwtToken, 'superadmin', 'google', expiresAt]
      );
      
      // Update last login timestamp
      await dbClient.query(
        'UPDATE superadmins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [superadmin.id]
      );
      
      // Remove sensitive data
      const { password: _, ...safeSuperadmin } = superadmin;
      
      return res.status(200).json({
        success: true,
        message: 'Google login successful',
        data: {
          user: {
            ...safeSuperadmin,
            role: 'superadmin'
          },
          organization: {
            id: 'system',
            name: 'System Administration',
            db: 'system',
            subscription_plan: 'unlimited',
            enabled_modules: ['all']
          },
          token: jwtToken
        }
      });
    }
    
    // If not superadmin, check organization_admins
    let userResult = await dbClient.query(
      'SELECT * FROM organization_admins WHERE admin_email = $1',
      [email]
    );
    
    let user = userResult.rows[0];
    let isNewUser = false;
    
    // If user doesn't exist, create new user
    if (!user) {
      isNewUser = true;
      const newUserResult = await dbClient.query(
        `INSERT INTO organization_admins (
          admin_email, 
          name, 
          profile_picture, 
          auth_provider,
          role,
          is_active
        )
        VALUES ($1, $2, $3, 'google', 'admin', true)
        RETURNING *`,
        [email, name, picture]
      );
      user = newUserResult.rows[0];
    }
    
    // For new users, create a default organization
    if (isNewUser) {
      const orgName = `${name}'s Organization`;
      const orgResult = await dbClient.query(
        `INSERT INTO organizations (
          name,
          created_by,
          subscription_plan,
          enabled_modules
        )
        VALUES ($1, $2, 'free', ARRAY['basic'])
        RETURNING *`,
        [orgName, user.id]
      );
      
      // Update user with organization_id
      await dbClient.query(
        'UPDATE organization_admins SET organization_id = $1 WHERE id = $2',
        [orgResult.rows[0].organization_id, user.id]
      );
      
      user.organization_id = orgResult.rows[0].organization_id;
    }
    
    // Get organization details
    const orgResult = await dbClient.query(
      'SELECT * FROM organizations WHERE organization_id = $1',
      [user.organization_id]
    );
    
    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }
    
    const organization = orgResult.rows[0];
    
    // Generate JWT token
    const jwtToken = jwt.sign(
      {
        userId: user.id,
        email: user.admin_email,
        role: user.role,
        organizationId: user.organization_id,
        organizationDb: organization.organization_db
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );
    
    // Create login session
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    await dbClient.query(
      `INSERT INTO login_sessions (
        user_id, 
        organization_id, 
        token, 
        role, 
        login_method,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.organization_id, jwtToken, user.role, 'google', expiresAt]
    );
    
    // Update last login timestamp
    await dbClient.query(
      'UPDATE organization_admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Remove sensitive data
    const { password: _, ...safeUser } = user;
    
    return res.status(200).json({
      success: true,
      message: 'Google login successful',
      data: {
        user: safeUser,
        organization: {
          id: organization.organization_id,
          name: organization.name,
          db: organization.organization_db,
          subscription_plan: organization.subscription_plan,
          enabled_modules: organization.enabled_modules
        },
        token: jwtToken
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Google login failed',
      error: error.message
    });
  } finally {
    dbClient.release();
  }
};

module.exports = {
  login,
  logout,
  googleLogin
};
