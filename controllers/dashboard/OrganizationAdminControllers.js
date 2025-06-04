const { connectToOrganizationDB } = require('../../utils/config/connectOrganization');
const pool = require('../../utils/config/connectDB');
const bcrypt = require('bcrypt');

/**
 * Validate admin update fields
 */
const validateAdminUpdates = (data) => {
  const errors = [];
  
  if (data.phone_number && !/^\d{10}$/.test(data.phone_number)) {
    errors.push('Phone number must be 10 digits');
  }
  
  if (data.zip_code && !/^\d{6}$/.test(data.zip_code)) {
    errors.push('ZIP code must be 6 digits');
  }

  return errors;
};

/**
 * Get organization admin data
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 */
const getOrganizationAdmin = async (req, res) => {
  const { organizationId } = req.params;
  
  if (!organizationId) {
    return res.status(400).json({
      success: false,
      message: 'Organization ID is required'
    });
  }

  let client;
  try {
    client = await pool.connect();
    
    // First get organization details from main database
    const orgResult = await client.query(
      'SELECT * FROM organizations WHERE organization_id = $1',
      [organizationId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    const organization = orgResult.rows[0];
    
    // Connect to organization's database using organization_db
    const orgPool = await connectToOrganizationDB(organization.organization_db);
    
    // Get admin data from tenant database
    const adminResult = await orgPool.query( 
      'SELECT * FROM organization_admins WHERE organization_id = $1',
      [organizationId]
    );

    if (adminResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Organization admin not found'
      });
    }

    // Remove sensitive data
    const admin = adminResult.rows[0];
    const { password, ...safeAdmin } = admin;

    return res.status(200).json({
      success: true,
      data: {
        ...safeAdmin,
        organization: {
          id: organization.organization_id,
          name: organization.name,
          db: organization.organization_db,
          subscription_plan: organization.subscription_plan,
          enabled_modules: organization.enabled_modules
        }
      }
    });
  } catch (error) {
    console.error('Error fetching organization admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch organization admin data',
      error: error.message
    });
  } finally {
    client.release();
  }
};

/**
 * Update organization admin data in both databases with transaction support
 */
const putOrganizationAdmin = async (req, res) => {
  const { organizationId } = req.params;
  let client = null;
  let orgPool = null;

  if (!organizationId) {
    return res.status(400).json({
      success: false,
      message: 'Organization ID is required'
    });
  }

  const {
    name,
    phone_number,
    tax_id,
    address,
    city,
    state,
    zip_code,
    country,
    current_password,
    new_password
  } = req.body;

  // Validate updates
  const validationErrors = validateAdminUpdates({
    phone_number,
    zip_code
  });

  if (validationErrors.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: validationErrors
    });
  }

  try {
    // Connect to main database
    client = await pool.connect();

    // Get organization details
    const orgResult = await client.query(
      'SELECT * FROM organizations WHERE organization_id = $1',
      [organizationId]
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
    const values = [organizationId]; // First parameter is always organization_id
    let paramCount = 1;

    // Build dynamic update fields with validation
    if (name) { updateFields.push(`name = $${++paramCount}`); values.push(name); }
    if (phone_number) { updateFields.push(`phone_number = $${++paramCount}`); values.push(phone_number); }
    if (tax_id) { updateFields.push(`tax_id = $${++paramCount}`); values.push(tax_id); }
    if (address) { updateFields.push(`address = $${++paramCount}`); values.push(address); }
    if (city) { updateFields.push(`city = $${++paramCount}`); values.push(city); }
    if (state) { updateFields.push(`state = $${++paramCount}`); values.push(state); }
    if (zip_code) { updateFields.push(`zip_code = $${++paramCount}`); values.push(zip_code); }
    if (country) { updateFields.push(`country = $${++paramCount}`); values.push(country); }

    // Handle password update if provided
    if (current_password && new_password) {
      // Get current admin data for password verification
      const adminResult = await orgPool.query(
        'SELECT password FROM organization_admins WHERE organization_id = $1',
        [organizationId]
      );

      if (adminResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Admin not found'
        });
      }

      const isValidPassword = await bcrypt.compare(
        current_password,
        adminResult.rows[0].password
      );

      if (!isValidPassword) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      const hashedPassword = await bcrypt.hash(new_password, 10);
      updateFields.push(`password = $${++paramCount}`);
      values.push(hashedPassword);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    // Build update query
    const updateQuery = `
      UPDATE organization_admins 
      SET ${updateFields.join(', ')},
          updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = $1
      RETURNING *
    `;

    // Begin transactions in both databases
    await client.query('BEGIN');
    await orgPool.query('BEGIN');

    try {
      // Update tenant database first
      const tenantResult = await orgPool.query(updateQuery, values);
      console.log('✅ Updated admin in tenant database');

      // If tenant update succeeds, update main database
      const mainResult = await client.query(updateQuery, values);
      console.log('✅ Updated admin in main database');

      // Commit both transactions
      await orgPool.query('COMMIT');
      await client.query('COMMIT');

      // Remove sensitive data
      const { password: _, ...safeAdmin } = mainResult.rows[0];

      return res.status(200).json({
        success: true,
        message: 'Organization admin updated successfully in both databases',
        data: {
          ...safeAdmin,
          organization: {
            id: organization.organization_id,
            name: organization.name,
            db: organization.organization_db,
            subscription_plan: organization.subscription_plan,
            enabled_modules: organization.enabled_modules
          }
        }
      });
    } catch (updateError) {
      // Rollback both transactions on error
      await orgPool.query('ROLLBACK');
      await client.query('ROLLBACK');
      throw updateError;
    }
  } catch (error) {
    console.error('Error updating organization admin:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update organization admin data',
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getOrganizationAdmin,
  putOrganizationAdmin
};

