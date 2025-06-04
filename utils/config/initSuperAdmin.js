const pool = require('./connectDB');
const superadminSchema = require('../models/superadmin/superadminSchema');
const bcrypt = require('bcrypt');

const DEFAULT_SUPERADMIN = {
  email: 'manoj@mntfuture.com',
  name: 'Super Admin',
  phone_number: null,
  tax_id: null,
  address: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
  role: 'admin',
  is_active: true
};
 
/**
 * Initialize default superadmin user
 */
const initSuperAdmins = async () => {
  const client = await pool.connect();
  
  try {
    // Ensure superadmins table exists
    await client.query(superadminSchema);
    
    console.log('Initializing default superadmin user...');
    
    // Check if superadmin already exists
    const existingAdmin = await client.query(
      'SELECT * FROM superadmins WHERE email = $1',
      [DEFAULT_SUPERADMIN.email]
    );
    
    if (existingAdmin.rows.length === 0) {
      // Insert the superadmin with default values
      await client.query(
        `INSERT INTO superadmins (
          email, name, phone_number, tax_id, address,
          city, state, postal_code, country, role, is_active
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          DEFAULT_SUPERADMIN.email,
          DEFAULT_SUPERADMIN.name,
          DEFAULT_SUPERADMIN.phone_number,
          DEFAULT_SUPERADMIN.tax_id,
          DEFAULT_SUPERADMIN.address,
          DEFAULT_SUPERADMIN.city,
          DEFAULT_SUPERADMIN.state,
          DEFAULT_SUPERADMIN.postal_code,
          DEFAULT_SUPERADMIN.country,
          DEFAULT_SUPERADMIN.role,
          DEFAULT_SUPERADMIN.is_active
        ]
      );
      
      console.log(`Created superadmin with email: ${DEFAULT_SUPERADMIN.email}`);
    } else {
      console.log(`Superadmin with email: ${DEFAULT_SUPERADMIN.email} already exists`);
    }
    
    console.log('Default superadmin initialization completed');
  } catch (error) {
    console.error('Error initializing superadmins:', error);
    throw error;
  } finally {
    client.release();
  }
}; 

module.exports = initSuperAdmins; 