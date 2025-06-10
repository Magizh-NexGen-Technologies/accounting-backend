const pool = require('./connectDB');

async function initDefaultSmtp() {
  const client = await pool.connect();
  try {
    // Check if any SMTP settings exist
    const { rows } = await client.query('SELECT id FROM smtp_settings LIMIT 1');
    if (rows.length === 0) {
      // Insert default SMTP settings
      await client.query(`
        INSERT INTO smtp_settings (host, port, username, password, from_email, from_name, secure)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        'smtp.gmail.com',
        587,
        'manoj@mntfuture.com',
        'natw dewa qmwp jgpw',
        'noreply@gmail.com',
        'manoj',
        true
      ]);
      console.log('✅ Default SMTP settings inserted');
    } else {
      console.log('ℹ️ SMTP settings already exist, skipping default insert');
    }
  } catch (err) {
    console.error('❌ Error inserting default SMTP settings:', err);
  } finally {
    client.release();
  }
}

module.exports = initDefaultSmtp;
