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
    // Initialize required schemas
    await client.query(LoginSchema);
    await client.query(SuperAdminSchema);

    const { identifier, password } = req.body;
    
    console.log('Login attempt for identifier:', identifier);
    
    // Validate required fields
    if (!identifier || !password) {
      console.log('Missing identifier or password');
      return res.status(400).json({
        success: false,
        message: 'Email/Phone number and password are required'
      });
    }

    // Validate identifier format and determine login method
    const loginMethod = isValidEmail(identifier) ? 'email' : 'phone';
    if (!isValidEmail(identifier) && !isValidPhone(identifier)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address or phone number'
      });
    }
    
    // First, check if user exists in superadmins table
    console.log('Checking superadmins table for:', identifier);
    const superadminResult = await client.query(
      'SELECT * FROM superadmins WHERE email = $1 OR phone_number = $1',
      [identifier]
    );
    
    console.log('Superadmin query result:', superadminResult.rows.length);
    
    if (superadminResult.rows.length > 0) {
      const superadmin = superadminResult.rows[0];
      console.log('Found superadmin:', { id: superadmin.id, email: superadmin.email, hasPassword: !!superadmin.password });
      
      // Check if superadmin has a password set
      if (!superadmin.password) {
        console.log('Superadmin has no password set');
        return res.status(401).json({
          success: false,
          message: 'Account not configured. Please complete registration first.'
        });
      }
      
      // Verify password
      console.log('Verifying password for superadmin');
      const isValidPassword = await bcrypt.compare(password, superadmin.password);
      console.log('Password verification result:', isValidPassword);
      
      if (!isValidPassword) {
        console.log('Invalid password for superadmin');
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }
      
      // Check if superadmin is active
      if (!superadmin.is_active) {
        console.log('Superadmin account is inactive');
        return res.status(403).json({
          success: false,
          message: 'Your account is inactive. Please contact the administrator.'
        });
      }
      
      console.log('Generating JWT token for superadmin');
      // Generate JWT token for superadmin
      const token = jwt.sign(
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
      expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now
      
      console.log('Creating login session for superadmin');
      await client.query(
        `INSERT INTO login_sessions (user_id, organization_id, token, role, login_method, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [superadmin.id, 'system', token, 'superadmin', loginMethod, expiresAt]
      );
      
      // Update last login timestamp in superadmins table
      console.log('Updating last login timestamp for superadmin');
      await client.query(
        'UPDATE superadmins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [superadmin.id]
      );
      
      // Remove sensitive data
      const { password: _, ...safeSuperadmin } = superadmin;
      
      console.log('Superadmin login successful');
      return res.status(200).json({
        success: true,
        message: 'Login successful',
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
          token
        }
      });
    }
    
    // If not found in superadmins, check organization_admins table
    console.log('Checking organization_admins table for:', identifier);
    const userResult = await client.query(
      'SELECT * FROM organization_admins WHERE admin_email = $1 OR phone_number = $1',
      [identifier]
    );
    
    if (userResult.rows.length === 0) {
      console.log('User not found in either table');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    const user = userResult.rows[0];
    console.log('Found organization admin:', { id: user.id, admin_email: user.admin_email });
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('Invalid password for organization admin');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if user is active
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact the administrator.'
      });
    }
    
    // Get organization details
    const orgResult = await client.query(
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
    const token = jwt.sign(
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
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now
    
    await client.query(
      `INSERT INTO login_sessions (user_id, organization_id, token, role, login_method, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [user.id, user.organization_id, token, user.role, loginMethod, expiresAt]
    );
    
    // Update last login timestamp
    await client.query(
      'UPDATE organization_admins SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Remove sensitive data
    const { password: _, ...safeUser } = user;
    
    console.log('Organization admin login successful');
    return res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: safeUser,
        organization: {
          id: organization.organization_id,
          name: organization.name,
          db: organization.organization_db,
          subscription_plan: organization.subscription_plan,
          enabled_modules: organization.enabled_modules
        },
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
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
