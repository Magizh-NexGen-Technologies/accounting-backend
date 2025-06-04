const pool = require('../../utils/config/connectDB');
const SuperadminSchema = require("../../utils/models/superadmin/superadminSchema");
const bcrypt = require('bcrypt');

exports.getSuperadmin = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM superadmins WHERE id = 1');
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Superadmin not found'
      });
    }

    // Remove sensitive data before sending response
    const superadminData = { ...result.rows[0] };
    delete superadminData.password;

    res.json({
      success: true,
      data: superadminData
    });
  } catch (error) {
    console.error('Error fetching superadmin:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  } finally {
    client.release();
  }
};

exports.postSuperadmin = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      name,
      email,
      phone_number,
      tax_id,
      address,
      city,
      state,
      postal_code,
      country,
      password
    } = req.body;

    // Check if superadmin already exists
    const existingAdmin = await client.query(
      'SELECT * FROM superadmins WHERE email = $1',
      [email]
    );

    if (existingAdmin.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Superadmin with this email already exists'
      });
    }

    // Hash password if provided
    let hashedPassword = null;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const result = await client.query(
      `INSERT INTO superadmins (
        name, email, phone_number, tax_id, address, 
        city, state, postal_code, country, password,
        role, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'admin', true) 
      RETURNING *`,
      [name, email, phone_number, tax_id, address, city, state, postal_code, country, hashedPassword]
    );

    // Remove password from response
    const newSuperadmin = { ...result.rows[0] };
    delete newSuperadmin.password;

    res.status(201).json({
      success: true,
      data: newSuperadmin,
      message: 'Superadmin created successfully'
    });
  } catch (error) {
    console.error('Error creating superadmin:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  } finally {
    client.release();
  }
};

exports.putSuperadmin = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      name,
      email,
      phone_number,
      tax_id,
      address,
      city,
      state,
      postal_code,
      country,
      password
    } = req.body;

    // Check if superadmin exists
    const existingAdmin = await client.query(
      'SELECT * FROM superadmins WHERE id = $1',
      [id]
    );

    if (existingAdmin.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Superadmin not found'
      });
    }

    // Hash password if provided
    let hashedPassword = existingAdmin.rows[0].password;
    if (password) {
      const salt = await bcrypt.genSalt(10);
      hashedPassword = await bcrypt.hash(password, salt);
    }

    const result = await client.query(
      `UPDATE superadmins 
       SET name = $1, 
           email = $2, 
           phone_number = $3, 
           tax_id = $4, 
           address = $5, 
           city = $6, 
           state = $7, 
           postal_code = $8, 
           country = $9,
           password = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 
       RETURNING *`,
      [name, email, phone_number, tax_id, address, city, state, postal_code, country, hashedPassword, id]
    );

    // Remove password from response
    const updatedSuperadmin = { ...result.rows[0] };
    delete updatedSuperadmin.password;

    res.json({
      success: true,
      data: updatedSuperadmin,
      message: 'Superadmin updated successfully'
    });
  } catch (error) {
    console.error('Error updating superadmin:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  } finally {
    client.release();
  }
};


 
