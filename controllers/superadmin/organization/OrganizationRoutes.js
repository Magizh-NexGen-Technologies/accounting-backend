const pool = require('../../../utils/config/connectDB');
const { createOrganizationDB, connectToOrganizationDB } = require('../../../utils/config/connectOrganization');
const OrganizationSchema = require('../../../utils/models/superadmin/organization/organizationSchema');
const OrganizationAdminSchema = require('../../../utils/models/superadmin/organization/organizationAdminSchema');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const { sendWelcomeEmail, getSmtpSettings } = require('../../../utils/email/emailService');


// Special superadmin email that cannot create organizations
const RESTRICTED_SUPERADMIN_EMAIL = 'manoj@mntfuture.com';

/**
 * Generate organization ID in format MNT-25-26-1
 * @returns {string} Organization ID
 */
const generateOrganizationId = async () => {
  const client = await pool.connect(); 
   
  try {
    // Get current year
    const currentYear = new Date().getFullYear();
    // Financial year format (e.g., 25-26 for 2025-2026)
    const financialYear = `${(currentYear % 100)}-${(currentYear % 100) + 1}`;
     
    // Get the count of organizations to determine the sequence number
    const result = await client.query('SELECT COUNT(*) FROM organizations');
    const count = parseInt(result.rows[0].count) + 1;
    
    // Format: MNT-25-26-1
    return `MNT-${financialYear}-${count}`;
  } catch (error) {
    console.error('Error generating organization ID:', error);
    throw error;
  } finally {
    client.release();
  } 
};

/**
 * Verify SMTP settings are configured
 * @returns {boolean} True if SMTP settings are configured
 */
const verifySmtpSettings = async () => {
  try {
    const smtpSettings = await getSmtpSettings();
    return !!smtpSettings;
  } catch (error) {
    console.error('SMTP settings not configured:', error);
    return false;
  }
};

/**
 * Create organization admin in both main and tenant databases
 */
const createOrganizationAdmin = async (orgPool, adminData) => {
  try {
    // Generate a temporary password if not provided
    const tempPassword = adminData.password || Math.random().toString(36).slice(-8);
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(tempPassword, salt);

    // Default values for optional fields
    const defaultValues = {
      tax_id: 'N/A',
      address: 'N/A',
      city: 'N/A',
      state: 'N/A',
      zip_code: 'N/A',
      country: 'N/A'
    };

    // Insert admin into organization_admins table in main database
    const mainResult = await pool.query(
      `INSERT INTO organization_admins 
        (name, organization_db, admin_email, admin_name, phone_number, password, role, organization_id,
         tax_id, address, city, state, zip_code, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        adminData.name,
        adminData.organization_db,
        adminData.email,
        adminData.name,
        adminData.phone_number || null,
        hashedPassword,
        'admin',
        adminData.organization_id,
        defaultValues.tax_id,
        defaultValues.address,
        defaultValues.city,
        defaultValues.state,
        defaultValues.zip_code,
        defaultValues.country
      ]
    );

    // Insert admin into organization_admins table in tenant database
    await orgPool.query(
      `INSERT INTO organization_admins 
        (name, organization_db, admin_email, admin_name, phone_number, password, role, organization_id,
         tax_id, address, city, state, zip_code, country)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        adminData.name,
        adminData.organization_db,
        adminData.email,
        adminData.name,
        adminData.phone_number || null,
        hashedPassword,
        'admin',
        adminData.organization_id,
        defaultValues.tax_id,
        defaultValues.address,
        defaultValues.city,
        defaultValues.state,
        defaultValues.zip_code,
        defaultValues.country
      ]
    );

    // Send welcome email
    try {
      // Verify SMTP settings before sending
      const smtpConfigured = await verifySmtpSettings();
      if (!smtpConfigured) {
        console.warn('SMTP settings not configured. Skipping welcome email.');
        return {
          ...mainResult.rows[0],
          tempPassword: tempPassword,
          emailSent: false
        };
      }

      await sendWelcomeEmail({
        name: adminData.name,
        email: adminData.email
      }, tempPassword);
      console.log('Welcome email sent successfully to:', adminData.email);
      
      return {
        ...mainResult.rows[0],
        tempPassword: tempPassword,
        emailSent: true
      };
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Continue with registration even if email fails
      return {
        ...mainResult.rows[0],
        tempPassword: tempPassword,
        emailSent: false,
        emailError: emailError.message
      };
    }
  } catch (error) {
    console.error('Error creating organization admin:', error);
    throw error;
  }
};

/**
 * Get all organizations
 */
const getOrganization = async (req, res) => {
  const client = await pool.connect();
  try {
    // Ensure organization table exists
    await client.query(OrganizationSchema);
    
    // Get all organizations
    const result = await client.query('SELECT * FROM organizations ORDER BY created_at DESC');
    
    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch organizations',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Create a new organization with its own database and admin user
 */
const postOrganization = async (req, res) => {
  let client = null;
  let orgPool = null;
  
  try {
    client = await pool.connect();
    
    // Create organization table if not exists
    await client.query(OrganizationSchema);
    
    const { 
      name, 
      adminEmail, 
      adminName, 
      phoneNumber, 
      planId
    } = req.body;
    
    // Validate required fields
    if (!name || !adminEmail || !planId) {
      return res.status(400).json({
        success: false,
        message: 'Name, admin email, and plan ID are required'
      });
    }

    // Check if the admin email is the restricted superadmin email
    if (adminEmail === RESTRICTED_SUPERADMIN_EMAIL) {
      return res.status(403).json({
        success: false,
        message: 'This superadmin email cannot be used to create organizations'
      });
    }
    
    // Generate unique identifier for the organization
    const organizationId = await generateOrganizationId();
    
    // Create a slug from the organization name
    const slug = name.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');
    
    // Generate a UUID for database name
    const uuid = uuidv4().split('-')[0];
    const organizationDb = `${slug}-${uuid}`;
    
    // Define modules based on plan
    let userLimit = 10;
    let enabledModules = []; 
    
    switch (planId) {
      case 'basic':
        userLimit = 10;
        enabledModules = ['inventory', 'pos', 'sales'];
        break;
      case 'standard':
        userLimit = 25;
        enabledModules = ['inventory', 'pos', 'sales', 'purchases', 'crm', 'reports'];
        break;
      case 'premium':
        userLimit = 0; // Unlimited
        enabledModules = ['inventory', 'pos', 'sales', 'purchases', 'accounting', 'crm', 'whatsapp', 'reports'];
        break;
      default:
        userLimit = 10;
        enabledModules = ['inventory', 'pos', 'sales'];
    }
    
    // Prepare organization data
    const orgData = {
      organization_id: organizationId,
      name,
      slug,
      organization_db: organizationDb,
      admin_email: adminEmail,
      admin_name: adminName,
      phone_number: phoneNumber || null,
      subscription_plan: planId,
      user_limit: userLimit,
      status: 'active',
      enabled_modules: enabledModules,
      role: 'admin'
    };
    
    // Create the organization database and store organization data
    await createOrganizationDB(organizationDb, orgData);
    
    // Insert organization record into main database
    const result = await client.query(
      `INSERT INTO organizations 
        (organization_id, name, slug, organization_db, admin_email, admin_name, phone_number,
         subscription_plan, user_limit, enabled_modules, role) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
       RETURNING *`,
      [organizationId, name, slug, organizationDb, adminEmail, adminName, phoneNumber || null,
       planId, userLimit, JSON.stringify(enabledModules), 'admin']
    );

    // Connect to the organization database
    orgPool = await connectToOrganizationDB(organizationDb);

    // Create admin user for the organization
    const adminData = {
      name: adminName,
      email: adminEmail,
      phone_number: phoneNumber || null,
      organization_db: organizationDb,
      organization_id: organizationId
    };

    // Create admin in both databases
    const admin = await createOrganizationAdmin(orgPool, adminData);

    return res.status(201).json({
      success: true,
      message: 'Organization and admin user created successfully',
      data: {
        organization: result.rows[0],
        admin: admin
      }
    });
  } catch (error) {
    console.error('Error creating organization:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create organization',
      error: error.message
    });
  } finally {
    if (client) {
      client.release();
    }
  }
};

/**
 * Update an organization in both main and tenant databases
 */
const putOrganization = async (req, res) => {
  let client = null;
  let orgPool = null;

  try {
    const { id } = req.params;
    const { 
      name, 
      adminEmail, 
      adminName, 
      phoneNumber, 
      planId, 
      status, 
      user_limit 
    } = req.body;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Organization ID is required'
      });
    }

    // Connect to main database
    client = await pool.connect();

    // Get current organization data
    const orgResult = await client.query(
      'SELECT * FROM organizations WHERE organization_id = $1',
      [id]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    const organization = orgResult.rows[0];

    // Connect to organization's database
    orgPool = await connectToOrganizationDB(organization.organization_db);

    // Prepare update data
    const updateFields = [];
    const values = [id]; // First parameter is always organization_id
    let paramCount = 1;

    // Build dynamic update fields
    if (name) { updateFields.push(`name = $${++paramCount}`); values.push(name); }
    if (adminEmail) { updateFields.push(`admin_email = $${++paramCount}`); values.push(adminEmail); }
    if (adminName) { updateFields.push(`admin_name = $${++paramCount}`); values.push(adminName); }
    if (phoneNumber !== undefined) { updateFields.push(`phone_number = $${++paramCount}`); values.push(phoneNumber); }
    if (status) { updateFields.push(`status = $${++paramCount}`); values.push(status); }
    if (user_limit !== undefined) { updateFields.push(`user_limit = $${++paramCount}`); values.push(user_limit); }

    // Handle plan update
    if (planId) {
      updateFields.push(`subscription_plan = $${++paramCount}`);
      values.push(planId);

      // Update enabled modules based on plan
      let enabledModules = [];
      switch (planId.toLowerCase()) {
        case 'basic':
          enabledModules = ['inventory', 'pos', 'sales'];
          break;
        case 'standard':
          enabledModules = ['inventory', 'pos', 'sales', 'purchases', 'crm', 'reports'];
          break;
        case 'premium':
          enabledModules = ['inventory', 'pos', 'sales', 'purchases', 'accounting', 'crm', 'whatsapp', 'reports'];
          break;
        default:
          enabledModules = organization.enabled_modules;
      }

      updateFields.push(`enabled_modules = $${++paramCount}`);
      // Convert array to proper JSON string
      values.push(JSON.stringify(enabledModules));
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Build update query
    const updateQuery = `
      UPDATE organizations 
      SET ${updateFields.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1 
      RETURNING *
    `;

    // Begin transaction
    await client.query('BEGIN');
    await orgPool.query('BEGIN');

    try {
      // Update tenant database first
      await orgPool.query(updateQuery, values);
      console.log(`✅ Updated organization in tenant database: ${organization.organization_db}`);

      // If tenant update succeeds, update main database
      const mainResult = await client.query(updateQuery, values);
      console.log('✅ Updated organization in main database');

      // Commit transactions
      await orgPool.query('COMMIT');
      await client.query('COMMIT');

      return res.status(200).json({
        success: true,
        message: 'Organization updated successfully in both databases',
        data: mainResult.rows[0]
      });
    } catch (updateError) {
      // Rollback both transactions on error
      await orgPool.query('ROLLBACK');
      await client.query('ROLLBACK');
      throw updateError;
    }
  } catch (error) {
    console.error('Error updating organization:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update organization',
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
};

/**
 * Get a single organization by ID or organization_db
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const getOrganizationById = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    
    console.log('Fetching organization with ID:', id);
    
    // First try to find by organization_id
    let result = await client.query(
      'SELECT * FROM organizations WHERE organization_id = $1',
      [id]
    );
    
    // If not found by organization_id, try organization_db
    if (result.rowCount === 0) {
      console.log('Organization not found by organization_id, trying organization_db');
      result = await client.query(
        'SELECT * FROM organizations WHERE organization_db = $1',
        [id]
      );
    }
    
    if (result.rowCount === 0) {
      console.log('Organization not found by either organization_id or organization_db');
      return res.status(404).json({
        success: false,
        message: 'Organization not found',
        details: `No organization found with ID: ${id}`
      });
    }
    
    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch organization',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getOrganization,
  postOrganization,
  putOrganization,
  getOrganizationById
};




