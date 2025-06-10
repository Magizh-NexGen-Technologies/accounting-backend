const nodemailer = require('nodemailer');
const pool = require('../config/connectDB');

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
 * Create email transporter with SMTP settings
 * @param {object} smtpSettings - SMTP configuration
 * @returns {object} Nodemailer transporter
 */
const createTransporter = (smtpSettings) => {
  return nodemailer.createTransport({
    host: smtpSettings.host,
    port: smtpSettings.port,
    secure: smtpSettings.port === 465, // true for 465, false for other ports
    auth: {
      user: smtpSettings.username,
      pass: smtpSettings.password
    },
    tls: {
      rejectUnauthorized: false // Do not fail on invalid certs
    }
  });
};

/**
 * Send email using SMTP settings
 * @param {object|string} options - Email options object or recipient email
 * @param {string} [subject] - Email subject (if options is string)
 * @param {string} [html] - Email content in HTML format (if options is string)
 * @returns {object} Email sending result
 */
const sendEmail = async (options, subject, html) => {
  let transporter = null;
  
  try {
    // Get SMTP settings
    const smtpSettings = await getSmtpSettings();
    
    // Create transporter
    transporter = createTransporter(smtpSettings);
    
    // Verify SMTP connection
    await transporter.verify();
    console.log('SMTP connection verified successfully');
    
    // Handle both object and individual parameters
    const mailOptions = typeof options === 'object' ? {
      from: `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    } : {
      from: `"${smtpSettings.fromName}" <${smtpSettings.fromEmail}>`,
      to: options,
      subject,
      html
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    
    return {
      success: true,
      messageId: info.messageId,
      response: info.response
    };
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  } finally {
    // Close transporter if it exists
    if (transporter) {
      try {
        await transporter.close();
      } catch (error) {
        console.error('Error closing transporter:', error);
      }
    }
  }
};

/**
 * Send welcome email to new organization admin
 * @param {object} adminData - Admin user data
 * @param {string} password - Generated password
 * @returns {object} Email sending result
 */
const sendWelcomeEmail = async (adminData, password) => {
  const { name, email } = adminData;
  
  const subject = 'Welcome to Your Organization Admin Account';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">Welcome to Your Organization Admin Account</h2>
      <p>Hello ${name},</p>
      <p>Your admin account has been created successfully. Here are your login credentials:</p>
      <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Password:</strong> ${password}</p>
      </div>
      <p style="color: #666;">Please change your password after your first login for security reasons.</p>
      <p>Best regards,<br>Your Organization Team</p>
    </div>
  `;
  
  return await sendEmail(email, subject, html);
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  getSmtpSettings
}; 