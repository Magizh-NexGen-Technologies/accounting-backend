const pool = require('../../../utils/config/connectDB');
const createRazorpayConnection = require("../../../utils/config/connectRazorpay");

exports.getPaymentgateway = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT * FROM payment_gateways ORDER BY created_at DESC');
    res.json({
      success: true,
      data: result.rows.map(row => ({
        id: row.id,
        gateway: row.gateway,
        apiKey: row.api_key,
        apiSecret: row.api_secret,
        isTestMode: row.is_test_mode,
        webhookSecret: row.webhook_secret,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    });
  } catch (error) {
    console.error('Error fetching payment gateways:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment gateways'
    });
  } finally {
    client.release();
  }
};

exports.postPaymentgateway = async (req, res) => {
  const client = await pool.connect();
  try {
    const { gateway, apiKey, apiSecret, isTestMode, webhookSecret, isActive } = req.body;

    // Validate required fields
    if (!gateway || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate activation attempt - prevent activation without proper credentials
    if (isActive && (!apiKey || !apiSecret)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot activate gateway without API credentials'
      });
    }

    // Validate API key format for Razorpay
    if (gateway === 'razorpay') {
      const keyPrefix = isTestMode ? 'rzp_test_' : 'rzp_live_';
      if (!apiKey.startsWith(keyPrefix)) {
        return res.status(400).json({
          success: false,
          message: `Invalid API key format. ${isTestMode ? 'Test' : 'Live'} mode key should start with '${keyPrefix}'`
        });
      }
    }

    // Verify Razorpay credentials
    const razorpay = createRazorpayConnection(apiKey, apiSecret, isTestMode);
    const verificationResult = await razorpay.verifyCredentials();

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: verificationResult.message || 'Invalid Razorpay credentials'
      });
    }

    await client.query('BEGIN');

    // Check for existing gateway
    const existingResult = await client.query(
      'SELECT * FROM payment_gateways WHERE gateway = $1',
      [gateway]
    );

    let result;
    if (existingResult.rows.length > 0) {
      // Update existing record
      result = await client.query(
        `UPDATE payment_gateways 
         SET api_key = $1, 
             api_secret = $2, 
             is_test_mode = $3, 
             webhook_secret = $4, 
             is_active = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE gateway = $6
         RETURNING *`,
        [apiKey, apiSecret, isTestMode, webhookSecret, isActive, gateway]
      );
    } else {
      // Insert new record
      result = await client.query(
        `INSERT INTO payment_gateways 
         (gateway, api_key, api_secret, is_test_mode, webhook_secret, is_active)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [gateway, apiKey, apiSecret, isTestMode, webhookSecret, isActive]
      );
    }

    await client.query('COMMIT');

    const savedGateway = result.rows[0];
    res.status(201).json({
      success: true,
      message: `Payment gateway settings saved successfully (${isTestMode ? 'Test' : 'Live'} mode)`,
      data: {
        id: savedGateway.id,
        gateway: savedGateway.gateway,
        apiKey: savedGateway.api_key,
        apiSecret: savedGateway.api_secret,
        isTestMode: savedGateway.is_test_mode,
        webhookSecret: savedGateway.webhook_secret,
        isActive: savedGateway.is_active,
        createdAt: savedGateway.created_at,
        updatedAt: savedGateway.updated_at
      },
      verification: verificationResult
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in postPaymentgateway:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to save payment gateway settings',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
  }
};

exports.putPaymentgateway = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { gateway, apiKey, apiSecret, isTestMode, webhookSecret, isActive } = req.body;

    // Validate required fields
    if (!gateway || !apiKey || !apiSecret) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Verify Razorpay credentials
    const razorpay = createRazorpayConnection(apiKey, apiSecret, isTestMode);
    const verificationResult = await razorpay.verifyCredentials();

    if (!verificationResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Razorpay credentials: ' + verificationResult.message
      });
    }
 
    await client.query('BEGIN');

    // Check if gateway exists
    const existingResult = await client.query(
      'SELECT * FROM payment_gateways WHERE id = $1',
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Payment gateway not found'
      });
    }

    // Update gateway
    const result = await client.query(
      `UPDATE payment_gateways 
       SET gateway = $1, 
           api_key = $2, 
           api_secret = $3, 
           is_test_mode = $4, 
           webhook_secret = $5, 
           is_active = $6,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7
       RETURNING *`,
      [gateway, apiKey, apiSecret, isTestMode, webhookSecret, isActive, id]
    );

    await client.query('COMMIT');

    const updatedGateway = result.rows[0];
    res.json({
      success: true,
      message: 'Payment gateway settings updated successfully',
      data: {
        id: updatedGateway.id,
        gateway: updatedGateway.gateway,
        apiKey: updatedGateway.api_key,
        apiSecret: updatedGateway.api_secret,
        isTestMode: updatedGateway.is_test_mode,
        webhookSecret: updatedGateway.webhook_secret,
        isActive: updatedGateway.is_active,
        createdAt: updatedGateway.created_at,
        updatedAt: updatedGateway.updated_at
      },
      verification: verificationResult
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error in putPaymentgateway:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update payment gateway settings',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
  }
};

exports.togglePaymentGatewayStatus = async (req, res) => {
  const client = await pool.connect();
  try {
    const { gateway, isActive } = req.body;

    if (!gateway) {
      return res.status(400).json({
        success: false,
        message: 'Gateway identifier is required'
      });
    }

    await client.query('BEGIN');

    // Check for existing gateway
    const existingResult = await client.query(
      'SELECT * FROM payment_gateways WHERE gateway = $1',
      [gateway]
    );

    if (existingResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Payment gateway not found'
      });
    }

    // Ensure we have credentials if trying to activate
    if (isActive) {
      const gatewayData = existingResult.rows[0];
      if (!gatewayData.api_key || !gatewayData.api_secret) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: 'Cannot activate gateway without API credentials'
        });
      }
    }

    // Update only the status
    const result = await client.query(
      `UPDATE payment_gateways 
       SET is_active = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE gateway = $2
       RETURNING *`,
      [isActive, gateway]
    );

    await client.query('COMMIT');

    const updatedGateway = result.rows[0];
    res.json({
      success: true,
      message: `Payment gateway ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: updatedGateway.id,
        gateway: updatedGateway.gateway,
        apiKey: updatedGateway.api_key,
        apiSecret: updatedGateway.api_secret,
        isTestMode: updatedGateway.is_test_mode,
        webhookSecret: updatedGateway.webhook_secret,
        isActive: updatedGateway.is_active,
        createdAt: updatedGateway.created_at,
        updatedAt: updatedGateway.updated_at
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error toggling payment gateway status:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle payment gateway status',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    client.release();
  }
};


 
