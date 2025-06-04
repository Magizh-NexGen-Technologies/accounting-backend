const pool = require('../../../utils/config/connectDB');
const SmtpSettings = require('../../../utils/models/superadmin/smtp/smtpSchema');
const nodemailer = require('nodemailer');

const getSmtpSettings = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query(SmtpSettings);
    
    const result = await client.query(`
      SELECT id, host, port, username, password, from_email, from_name, secure 
      FROM smtp_settings 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No SMTP settings found'
      });
    }

    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        host: result.rows[0].host,
        port: result.rows[0].port,
        username: result.rows[0].username,
        password: result.rows[0].password,
        fromEmail: result.rows[0].from_email,
        fromName: result.rows[0].from_name,
        secure: result.rows[0].secure
      }
    });
  } catch (error) {
    console.error('Error fetching SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch SMTP settings',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const postSmtpSettings = async (req, res) => {
  const client = await pool.connect();
  try {
    // Create table if not exists
    await client.query(SmtpSettings);

    const { host, port, username, password, fromEmail, fromName, secure } = req.body;

    // Begin transaction
    await client.query('BEGIN');

    // Delete existing settings first (we only keep one active setting)
    await client.query('DELETE FROM smtp_settings');

    // Insert new settings
    const query = `
      INSERT INTO smtp_settings (
        host, port, username, password, 
        from_email, from_name, secure
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const result = await client.query(query, [
      host,
      port,
      username,
      password,
      fromEmail,
      fromName,
      secure
    ]);

    // Commit transaction
    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'SMTP settings saved successfully',
      data: {
        host: result.rows[0].host,
        port: result.rows[0].port,
        username: result.rows[0].username,
        password: result.rows[0].password,
        fromEmail: result.rows[0].from_email,
        fromName: result.rows[0].from_name,
        secure: result.rows[0].secure
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error saving SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save SMTP settings',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const putSmtpSettings = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { host, port, username, password, fromEmail, fromName, secure } = req.body;

    // Begin transaction
    await client.query('BEGIN');

    // Update settings
    const query = `
      UPDATE smtp_settings 
      SET 
        host = $1,
        port = $2,
        username = $3,
        password = $4,
        from_email = $5,
        from_name = $6,
        secure = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8
      RETURNING *
    `;

    const result = await client.query(query, [
      host,
      port,
      username,
      password,
      fromEmail,
      fromName,
      secure,
      id
    ]);

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'SMTP settings not found'
      });
    }

    // Commit transaction
    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'SMTP settings updated successfully',
      data: {
        host: result.rows[0].host,
        port: result.rows[0].port,
        username: result.rows[0].username,
        password: result.rows[0].password,
        fromEmail: result.rows[0].from_email,
        fromName: result.rows[0].from_name,
        secure: result.rows[0].secure
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SMTP settings',
      error: error.message
    });
  } finally {
    client.release();
  }
};

const testSmtpSettings = async (req, res) => {
  const client = await pool.connect();
  try {
    const { to, subject, message } = req.body;
    
    if (!to || !subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Email, subject and message are required'
      });
    }

    const settingsResult = await client.query(`
      SELECT host, port, username, password, from_email, from_name, secure 
      FROM smtp_settings 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    
    if (settingsResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'SMTP settings not found'
      });
    }

    const settings = settingsResult.rows[0];
    
    try {
      // Create transporter with improved configuration
      const transporter = nodemailer.createTransport({
        host: settings.host,
        port: settings.port,
        secure: settings.port === 465, // Force secure true only for port 465
        auth: {
          user: settings.username,
          pass: settings.password
        },
        tls: {
          rejectUnauthorized: false,
          minVersion: 'TLSv1.2',
          ciphers: 'HIGH:MEDIUM:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA'
        }
      });

      // Test SMTP connection
      await new Promise((resolve, reject) => {
        transporter.verify((error) => {
          if (error) {
            console.error('SMTP Verification Error:', error);
            reject(error);
          } else {
            resolve(true);
          }
        });
      });

      // Send test email with subject
      const info = await transporter.sendMail({
        from: `"${settings.from_name}" <${settings.from_email}>`,
        to: to,
        subject: subject,
        text: message,
        html: `<p>${message}</p>`
      });

      console.log('Test email sent:', info);

      res.json({
        success: true,
        message: 'Test email sent successfully'
      });
    } catch (emailError) {
      console.error('SMTP Error:', emailError);
      res.status(500).json({
        success: false,
        message: `Failed to send test email: ${emailError.message}`,
        error: emailError.stack
      });
    }
  } catch (error) {
    console.error('Test Email Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  } finally {
    client.release();
  }
};

module.exports = {
  getSmtpSettings,
  postSmtpSettings,
  putSmtpSettings,
  testSmtpSettings
};




