const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const pool = require('../../utils/config/connectDB');
const RegisterSchema = require('../../utils/models/auth/RegisterSchema');
const SuperAdminSchema = require('../../utils/models/superadmin/superadminSchema');
const { sendWelcomeEmail } = require('../../utils/email/emailService');
const { v4: uuidv4 } = require('uuid');

// Role hierarchy and permissions
const ROLES = {
  SUPERADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user'
};

// Special superadmin email that cannot create organizations
const RESTRICTED_SUPERADMIN_EMAIL = 'manoj@mntfuture.com';

/**
 * Generate a random password
 * @returns {string} Random password
 */
const generatePassword = () => {
  const length = 12;
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  
  return password;
};

/**
 * Get SMTP settings from the database
 * @returns {object} SMTP settings
 */
const getSmtpSettings = async () => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM smtp_settings ORDER BY id DESC LIMIT 1');
    if (!result.rows[0]) {
      throw new Error('SMTP settings not configured');
    }
    return result.rows[0];
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Send email using SMTP settings
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - Email content in HTML format
 * @returns {boolean} Success status
 */
const sendEmail = async (to, subject, html) => {
  try {
    const smtpSettings = await getSmtpSettings();
    
    // Configure transporter with Gmail-specific settings
    const transporter = nodemailer.createTransport({
      host: smtpSettings.host,
      port: smtpSettings.port,
      secure: false, // Use TLS
      auth: {
        user: smtpSettings.username,
        pass: smtpSettings.password
      },
      tls: {
        // Do not fail on invalid certs
        rejectUnauthorized: false
      }
    });
    
    const mailOptions = {
      from: `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>`,
      to,
      subject,
      html
    };
    
    // Verify SMTP connection configuration
    await transporter.verify();
    console.log('SMTP connection verified successfully');
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);
    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
};

/**
 * Check if email is a superadmin
 * @param {string} email - Email to check
 * @returns {object} Superadmin data or null
 */
const checkSuperAdmin = async (email) => {
  const client = await pool.connect();
  try {
    // Ensure superadmins table exists
    await client.query(SuperAdminSchema);
    
    const result = await client.query(
      'SELECT * FROM superadmins WHERE email = $1',
      [email]
    );
    
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error checking superadmin:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Register a new user - handles both superadmin and organization admin registration
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const registerUser = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, email, phone_number, password } = req.body;
    
    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
    }

    // First, check if this email is a superadmin
    const superadmin = await checkSuperAdmin(email);
    
    if (superadmin) {
      // This is a superadmin registration
      return await registerSuperAdminWithPassword(req, res, superadmin);
    } else {
      // This is a regular user registration - they need an organization
      return res.status(400).json({
        success: false,
        message: 'Regular user registration requires organization assignment. Please contact your administrator.'
      });
    }
  } catch (error) {
    console.error('Error in user registration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register user',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Register superadmin with password
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {object} superadmin - Superadmin data from database
 */
const registerSuperAdminWithPassword = async (req, res, superadmin) => {
  const client = await pool.connect();
  
  try {
    const { name, email, phone_number, password } = req.body;
    
    // Check if superadmin already has a password set
    if (superadmin.password) {
      return res.status(400).json({
        success: false,
        message: 'Superadmin account already exists and is configured'
      });
    }
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Update superadmin with password, name, phone_number and additional details
    await client.query(
      `UPDATE superadmins 
       SET name = $1, phone_number = $2, password = $3, updated_at = CURRENT_TIMESTAMP 
       WHERE email = $4`,
      [name, phone_number || null, hashedPassword, email]
    );
    
    return res.status(201).json({
      success: true,
      message: 'Superadmin registered successfully',
      data: {
        email: email,
        name: name,
        role: ROLES.SUPERADMIN,
        isRestricted: email === RESTRICTED_SUPERADMIN_EMAIL
      }
    });
  } catch (error) {
    console.error('Error registering superadmin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register superadmin',
      error: error.message
    });
  } finally {
    client.release(); 
  }
};

/**
 * Register an organization admin (called from organization creation)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const registerOrganizationAdmin = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Ensure organization_admins table exists
    await client.query(RegisterSchema);
    
    const { name, email, organization_id, organization_db, phone_number } = req.body;
    
    // Validate required fields
    if (!name || !email || !organization_id || !organization_db) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, organization ID, and organization database are required'
      });
    }
    
    // Check if user already exists
    const existingUser = await client.query(
      'SELECT * FROM organization_admins WHERE admin_email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Generate a random password
    const password = generatePassword();
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Insert the new admin user
    const result = await client.query(
      `INSERT INTO organization_admins (name, admin_email, phone_number, password, role, organization_id, organization_db) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name, admin_email, phone_number, role, organization_id, organization_db`,
      [name, email, phone_number || null, hashedPassword, ROLES.ADMIN, organization_id, organization_db]
    );
    
    const newAdmin = result.rows[0];
    
    // Send welcome email with credentials
    try {
      const emailResult = await sendWelcomeEmail(newAdmin, password);
      console.log('Welcome email sent successfully:', emailResult.messageId);
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue with registration even if email fails
    }
    
    return res.status(201).json({
      success: true,
      message: 'Organization admin registered successfully',
      data: {
        ...newAdmin,
        emailSent: true
      }
    });
  } catch (error) {
    console.error('Error registering organization admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register organization admin',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Register a superadmin (for system use only)
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const registerSuperAdmin = async (req, res) => {
  const client = await pool.connect();
  
  try {
    // Ensure organization_admins table exists
    await client.query(RegisterSchema);
    
    const { name, email } = req.body;
    
    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: 'Name and email are required'
      });
    }
    
    // Check if user already exists
    const existingUser = await client.query(
      'SELECT * FROM organization_admins WHERE admin_email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }
    
    // Generate a random password
    const password = generatePassword();
    
    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Insert the new superadmin user
    const result = await client.query(
      `INSERT INTO organization_admins (name, admin_email, password, role, organization_id) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, name, admin_email, role, organization_id`,
      [name, email, hashedPassword, ROLES.SUPERADMIN, 'system']
    );
    
    const newSuperAdmin = result.rows[0];
    
    // Send welcome email with credentials
    try {
      await sendEmail(
        email,
        'Welcome to Your SuperAdmin Account',
        `
        <h2>Welcome to Your SuperAdmin Account</h2>
        <p>Hello ${name},</p>
        <p>Your superadmin account has been created successfully. Here are your login credentials:</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Password:</strong> ${password}</p>
        <p>Please change your password after your first login for security reasons.</p>
        <p>Best regards,<br>System Administrator</p>
        `
      );
    } catch (emailError) {
      console.warn(`Failed to send welcome email to ${email}:`, emailError);
      // Continue with registration even if email fails
    }
    
    return res.status(201).json({
      success: true,
      message: 'SuperAdmin registered successfully',
      data: {
        ...newSuperAdmin,
        emailSent: true
      }
    });
  } catch (error) {
    console.error('Error registering superadmin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register superadmin',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Check if email is eligible for registration
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const checkEmailEligibility = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Ensure superadmins table exists before querying
    await client.query(SuperAdminSchema);

    // Check if email exists in superadmins table
    const superadmin = await checkSuperAdmin(email);
    
    if (superadmin) {
      return res.status(200).json({
        success: true,
        data: {
          type: 'superadmin',
          canRegister: !superadmin.password, // Can register if no password set
          isRestricted: email === RESTRICTED_SUPERADMIN_EMAIL,
          message: superadmin.password ? 
            'Superadmin account already configured' : 
            'Superadmin account found, can set password'
        }
      });
    }
    
    // Check if email exists in organization_admins
    const orgAdmin = await client.query(
      'SELECT * FROM organization_admins WHERE admin_email = $1',
      [email]
    );
    
    if (orgAdmin.rows.length > 0) {
      return res.status(200).json({
        success: true,
        data: {
          type: 'organization_admin',
          canRegister: false,
          message: 'User already exists in organization'
        }
      });
    }
    
    // Email not found in either table
    return res.status(200).json({
      success: true,
      data: {
        type: 'new_user',
        canRegister: false,
        message: 'Email not authorized for registration. Contact administrator.'
      }
    });
    
  } catch (error) {
    console.error('Error checking email eligibility:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check email eligibility',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  registerUser,
  registerOrganizationAdmin,
  registerSuperAdmin,
  checkEmailEligibility,
  checkSuperAdmin,
  ROLES
};
