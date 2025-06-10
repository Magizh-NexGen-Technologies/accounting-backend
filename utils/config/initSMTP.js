const pool = require('./connectDB');
const smtpSchema = require('../models/superadmin/smtp/smtpSchema');

const DEFAULT_SMTP = {
  host: 'smtp.gmail.com',
  port: 587,
  username: 'manoj@mntfuture.com',
  password: 'natw dewa qmwp jgpw',
  from_email: 'noreply@gmail.com',
  from_name: 'manoj',
  secure: true
};

/**
 * Initialize default SMTP settings
 */
async function initDefaultSmtp() {
  const client = await pool.connect();
  
  try {
    // Ensure smtp_settings table exists
    await client.query(smtpSchema);
    
    console.log('Initializing default SMTP settings...');
    
    // Check if SMTP settings already exist
    const { rows } = await client.query('SELECT id FROM smtp_settings LIMIT 1');
    
    if (rows.length === 0) {
      // Insert default SMTP settings
      await client.query(`
        INSERT INTO smtp_settings (host, port, username, password, from_email, from_name, secure)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        DEFAULT_SMTP.host,
        DEFAULT_SMTP.port,
        DEFAULT_SMTP.username,
        DEFAULT_SMTP.password,
        DEFAULT_SMTP.from_email,
        DEFAULT_SMTP.from_name,
        DEFAULT_SMTP.secure
      ]);
      
      console.log('✅ Default SMTP settings inserted');
    } else {
      console.log('ℹ️ SMTP settings already exist, skipping default insert');
    }
    
    console.log('Default SMTP initialization completed');
  } catch (err) {
    console.error('❌ Error initializing SMTP settings:', err);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = initDefaultSmtp;
