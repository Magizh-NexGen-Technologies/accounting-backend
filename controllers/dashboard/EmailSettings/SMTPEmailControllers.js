const { connectToOrganizationDB, getOrganizationData } = require('../../../utils/config/connectOrganization');
const SmtpSettings = require('../../../utils/models/dashboard/smtpSettings/EmailSMTPSchema');
const nodemailer = require('nodemailer');

const getSMTP = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool;
  let client;

  try {
    // Get organization data
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Connect to organization's database
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();

    // Create SMTP settings table if it doesn't exist
    await client.query(SmtpSettings);

    // Update SELECT query to filter by organization_id
    const result = await client.query(`
      SELECT id, host, port, username, password, from_email, from_name, secure 
      FROM smtp_settings 
      WHERE organization_id = $1
      ORDER BY created_at DESC 
      LIMIT 1
    `, [organizationId]);

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
    if (client) client.release();
  }
};

const postSMTP = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool;
  let client;

  try {
    // Validate request body
    const { host, port, username, password, fromEmail, fromName, secure } = req.body;
    
    if (!host || !port || !username || !password || !fromEmail || !fromName) {
      return res.status(400).json({
        success: false,
        message: 'All required SMTP fields must be provided'
      });
    }

    // Get organization data
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Connect to organization's database
    pool = await connectToOrganizationDB(orgData.organization_db);
    if (!pool) {
      throw new Error('Failed to connect to organization database');
    }
    client = await pool.connect();

    // Begin transaction
    await client.query('BEGIN');

    // Create SMTP settings table if it doesn't exist
    await client.query(SmtpSettings);

    // First delete any existing settings as we maintain only one active setting
    await client.query('DELETE FROM smtp_settings');

    // Insert new settings
    const query = `
      INSERT INTO smtp_settings (
        organization_id, host, port, username, password, 
        from_email, from_name, secure
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const result = await client.query(query, [
      organizationId,
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
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error rolling back transaction:', rollbackError);
      }
    }
    console.error('Error saving SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save SMTP settings',
      error: error.message
    });
  } finally {
    if (client) {
      try {
        await client.release();
      } catch (releaseError) {
        console.error('Error releasing client:', releaseError);
      }
    }
  }
};

const putSMTP = async (req, res) => {
  const { id } = req.params;
  const organizationId = req.params.organizationId;
  let pool;
  let client;

  try {
    // Get organization data
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Connect to organization's database
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();

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
      WHERE id = $8 AND organization_id = $9
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
      id,
      organizationId
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
    if (client) await client.query('ROLLBACK');
    console.error('Error updating SMTP settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SMTP settings',
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
};

const testSMTP = async (req, res) => {
  const organizationId = req.params.organizationId;
  let pool;
  let client;

  try {
    // Get organization data
    const orgData = await getOrganizationData(organizationId);
    if (!orgData) {
      return res.status(404).json({
        success: false,
        message: 'Organization not found'
      });
    }

    // Connect to organization's database
    pool = await connectToOrganizationDB(orgData.organization_db);
    client = await pool.connect();

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
  } catch (error) {
    console.error('Test Email Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send test email',
      error: error.message
    });
  } finally {
    if (client) client.release();
  }
};

module.exports = {
  getSMTP,
  postSMTP,
  putSMTP,
  testSMTP
};




