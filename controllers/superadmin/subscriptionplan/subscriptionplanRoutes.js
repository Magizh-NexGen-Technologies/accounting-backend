const pool = require('../../../utils/config/connectDB');
const Razorpay = require('razorpay');
const subscriptionSchema = require('../../../utils/models/superadmin/subscriptionplan/SubscriptionSchema');
const PaymentgatewaySchema = require('../../../utils/models/superadmin/paymentgateway/PaymentGatewaySchema');
const financeSchema = require('../../../utils/models/superadmin/finance/financeSchema');
// Schema initialization is now handled by initDB.js
const initializeSchema = async () => {
  // Skip local initialization as it's handled by initDB.js
  return Promise.resolve();
};

// Payment gateway schema initialization is now handled by initDB.js 
const initializePaymentGatewaySchema = async () => {
  // Skip local initialization as it's handled by initDB.js
  return Promise.resolve();
};

// Get Razorpay instance with credentials
const getRazorpayInstance = async () => {
  const client = await pool.connect();
  try {
    // Ensure payment gateway schema is initialized
    await initializePaymentGatewaySchema();
    
    // Query the payment_gateways table for Razorpay configuration
    const result = await client.query(
      'SELECT * FROM payment_gateways WHERE gateway = $1 AND is_active = true',
      ['razorpay']
    );
    
    if (result.rows.length === 0) {
      throw new Error('No active Razorpay configuration found');
    }

    const config = result.rows[0];
    
    // Validate required credentials
    if (!config.api_key || !config.api_secret) {
      throw new Error('Razorpay API credentials are missing');
    }

    // Validate API key format
    if (config.is_test_mode && !config.api_key.startsWith('rzp_test_')) {
      throw new Error('Invalid test mode API key format');
    }
    if (!config.is_test_mode && !config.api_key.startsWith('rzp_live_')) {
      throw new Error('Invalid live mode API key format');
    }

    // Create Razorpay instance with credentials
    const razorpay = new Razorpay({
      key_id: config.api_key,
      key_secret: config.api_secret
    });

    // Test the connection
    try {
      await razorpay.plans.all();
      console.log('Successfully connected to Razorpay');
    } catch (error) {
      console.error('Error testing Razorpay connection:', error);
      throw new Error('Failed to connect to Razorpay. Please check your credentials.');
    }

    return razorpay;
  } catch (error) {
    console.error('Error getting Razorpay instance:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Map our intervals to Razorpay periods
const mapIntervalToRazorpayPeriod = (interval) => {
  const mapping = {
    'monthly': 'monthly',
    'yearly': 'yearly'
  };
  return mapping[interval];
};

// Get interval multiplier for Razorpay
const getIntervalMultiplier = (interval) => {
  const mapping = {
    'monthly': 1,
    'yearly': 1
  };
  return mapping[interval];
};

// Add validation middleware
const validateSubscriptionPlan = (data) => {
  const errors = [];
  
  if (!data.name || typeof data.name !== 'string' || data.name.length < 3) {
    errors.push('Name must be at least 3 characters long');
  }
  
  if (!data.price || typeof data.price !== 'number' || data.price <= 0) {
    errors.push('Price must be a positive number');
  }
  
  if (!data.currency || !['INR', 'USD', 'EUR', 'GBP'].includes(data.currency)) {
    errors.push('Invalid currency code');
  }
  
  if (!data.interval || !['monthly', 'yearly'].includes(data.interval)) {
    errors.push('Invalid interval');
  }
  
  if (!Array.isArray(data.features)) {
    errors.push('Features must be an array');
  }
  
  if (typeof data.userLimit !== 'number' || data.userLimit < 0) {
    errors.push('User limit must be a non-negative number');
  }
  
  if (!Array.isArray(data.modules)) {
    errors.push('Modules must be an array');
  }

  if (typeof data.isPublished !== 'boolean') {
    errors.push('Published status must be a boolean');
  }

  if (typeof data.isPopular !== 'boolean') {
    errors.push('Popular status must be a boolean');
  }
  
  return errors;
};

exports.getSubscriptionPlans = async (req, res) => {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT * FROM subscription_plans ORDER BY created_at DESC'
    );
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching subscription plans',
      error: error.message
    });
  } finally {
    client.release();
  }
};

exports.postSubscriptionPlans = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const {
      name,
      description,
      price,
      currency,
      interval,
      features,
      userLimit,
      modules,
      isPopular,
      isPublished
    } = req.body;

    // Validate input data
    const validationErrors = validateSubscriptionPlan(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // If this plan is marked as popular, unmark any existing popular plan for this interval
    if (isPopular) {
      await client.query(
        'UPDATE subscription_plans SET is_popular = false WHERE interval = $1 AND is_popular = true',
        [interval]
      );
    }

    // Get active finance settings to retrieve GST percentage
    const financeSettingsResult = await client.query(
      'SELECT gst_percentage FROM finance_settings WHERE active = TRUE ORDER BY id DESC LIMIT 1'
    );
    
    // Set default GST percentage if no finance settings exist
    const gstPercentage = financeSettingsResult.rows.length > 0 
      ? parseFloat(financeSettingsResult.rows[0].gst_percentage) 
      : 18.00;
    
    // Calculate GST amount and total amount
    const basePrice = parseFloat(price);
    const gstAmount = (basePrice * gstPercentage) / 100;
    const totalAmount = basePrice + gstAmount;

    // Get Razorpay instance
    const razorpay = await getRazorpayInstance();

    // Create plan in Razorpay using the total amount (including GST)
    const razorpayPlan = await razorpay.plans.create({
      period: mapIntervalToRazorpayPeriod(interval),
      interval: getIntervalMultiplier(interval),
      item: {
        name: name,
        description: description,
        amount: Math.round(totalAmount * 100), // Use total amount including GST
        currency: currency || 'INR'
      }
    });

    // Check if plan with same name and interval exists
    const existingPlan = await client.query(
      'SELECT id FROM subscription_plans WHERE name = $1 AND interval = $2',
      [name, interval]
    );

    if (existingPlan.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: `A ${name} plan already exists for ${interval} interval`
      });
    }

    // Insert into database with Razorpay plan ID and GST details
    const result = await client.query(
      `INSERT INTO subscription_plans 
       (name, description, price, currency, interval, features, user_limit, modules, 
        is_popular, is_published, razorpay_plan_id, gst_percentage, gst_amount, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        name,
        description,
        basePrice,
        currency || 'INR',
        interval,
        JSON.stringify(features || []),
        userLimit || 0,
        JSON.stringify(modules || []),
        isPopular || false,
        isPublished || false,
        razorpayPlan.id,
        gstPercentage,
        gstAmount,
        totalAmount
      ]
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      data: result.rows[0],
      razorpayPlanId: razorpayPlan.id
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating subscription plan:', error);
    
    if (error.message.includes('unique_popular_per_interval')) {
      return res.status(400).json({
        success: false,
        message: 'Only one plan can be marked as popular per interval'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating subscription plan',
      error: error.message
    });
  } finally {
    client.release();
  }
};

exports.putSubscriptionPlan = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { isPublished, isPopular } = req.body;

    // Validate input
    if (typeof isPublished !== 'boolean' && typeof isPopular !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'At least one of isPublished or isPopular must be provided as a boolean value'
      });
    }

    // Check if plan exists
    const checkResult = await client.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    const plan = checkResult.rows[0];

    // Start transaction
    await client.query('BEGIN');

    // If marking as popular, unmark any existing popular plan for this interval
    if (isPopular) {
      await client.query(
        'UPDATE subscription_plans SET is_popular = false WHERE interval = $1 AND id != $2 AND is_popular = true',
        [plan.interval, id]
      );
    }

    // Update the plan status
    const result = await client.query(
      `UPDATE subscription_plans 
       SET is_published = COALESCE($1, is_published),
           is_popular = COALESCE($2, is_popular),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [isPublished, isPopular, id]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Failed to update subscription plan'
      });
    }

    await client.query('COMMIT');

    const updatedPlan = result.rows[0];
    const messages = [];
    if (typeof isPublished === 'boolean') {
      messages.push(`Plan ${isPublished ? 'published' : 'unpublished'}`);
    }
    if (typeof isPopular === 'boolean') {
      messages.push(`Plan ${isPopular ? 'marked as popular' : 'unmarked as popular'}`);
    }

    res.json({
      success: true,
      data: updatedPlan,
      message: messages.join(' and ') + ' successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating subscription plan:', error);
    
    if (error.message.includes('unique_popular_per_interval')) {
      return res.status(400).json({
        success: false,
        message: 'Only one plan can be marked as popular per interval'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating subscription plan',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Add a new endpoint to update subscription plan with GST
exports.updateSubscriptionPlan = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const {
      name,
      description,
      price,
      currency,
      interval,
      features,
      userLimit,
      modules,
      isPopular,
      isPublished
    } = req.body;

    // Validate input data
    const validationErrors = validateSubscriptionPlan(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Check if plan exists
    const checkResult = await client.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    // Start transaction
    await client.query('BEGIN');

    // If marking as popular, unmark any existing popular plan for this interval
    if (isPopular) {
      await client.query(
        'UPDATE subscription_plans SET is_popular = false WHERE interval = $1 AND id != $2 AND is_popular = true',
        [interval, id]
      );
    }

    // Get active finance settings to retrieve GST percentage
    const financeSettingsResult = await client.query(
      'SELECT gst_percentage FROM finance_settings WHERE active = TRUE ORDER BY id DESC LIMIT 1'
    );
    
    // Set default GST percentage if no finance settings exist
    const gstPercentage = financeSettingsResult.rows.length > 0 
      ? parseFloat(financeSettingsResult.rows[0].gst_percentage) 
      : 18.00;
    
    // Calculate GST amount and total amount
    const basePrice = parseFloat(price);
    const gstAmount = (basePrice * gstPercentage) / 100;
    const totalAmount = basePrice + gstAmount;

    // Update in Razorpay if razorpay_plan_id exists
    const currentPlan = checkResult.rows[0];
    if (currentPlan.razorpay_plan_id) {
      try {
        const razorpay = await getRazorpayInstance();
        // Since Razorpay doesn't allow updating plans, we need to create a new one
        // and update our reference
        const razorpayPlan = await razorpay.plans.create({
          period: mapIntervalToRazorpayPeriod(interval),
          interval: getIntervalMultiplier(interval),
          item: {
            name: name,
            description: description,
            amount: Math.round(totalAmount * 100), // Use total amount including GST
            currency: currency || 'INR'
          }
        });

        // Update the plan in our database
        const result = await client.query(
          `UPDATE subscription_plans 
           SET name = $1,
               description = $2,
               price = $3,
               currency = $4,
               interval = $5,
               features = $6,
               user_limit = $7,
               modules = $8,
               is_popular = $9,
               is_published = $10,
               razorpay_plan_id = $11,
               gst_percentage = $12,
               gst_amount = $13,
               total_amount = $14,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $15
           RETURNING *`,
          [
            name,
            description,
            basePrice,
            currency || 'INR',
            interval,
            JSON.stringify(features || []),
            userLimit || 0,
            JSON.stringify(modules || []),
            isPopular || false,
            isPublished || false,
            razorpayPlan.id,
            gstPercentage,
            gstAmount,
            totalAmount,
            id
          ]
        );

        await client.query('COMMIT');

        res.status(200).json({
          success: true,
          data: result.rows[0],
          razorpayPlanId: razorpayPlan.id,
          message: 'Subscription plan updated successfully'
        });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error updating plan in Razorpay:', error);
        throw error;
      }
    } else {
      // If no Razorpay plan exists, just update our database
      const result = await client.query(
        `UPDATE subscription_plans 
         SET name = $1,
             description = $2,
             price = $3,
             currency = $4,
             interval = $5,
             features = $6,
             user_limit = $7,
             modules = $8,
             is_popular = $9,
             is_published = $10,
             gst_percentage = $11,
             gst_amount = $12,
             total_amount = $13,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $14
         RETURNING *`,
        [
          name,
          description,
          basePrice,
          currency || 'INR',
          interval,
          JSON.stringify(features || []),
          userLimit || 0,
          JSON.stringify(modules || []),
          isPopular || false,
          isPublished || false,
          gstPercentage,
          gstAmount,
          totalAmount,
          id
        ]
      );

      await client.query('COMMIT');

      res.status(200).json({
        success: true,
        data: result.rows[0],
        message: 'Subscription plan updated successfully'
      });
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error updating subscription plan:', error);
    
    if (error.message.includes('unique_popular_per_interval')) {
      return res.status(400).json({
        success: false,
        message: 'Only one plan can be marked as popular per interval'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating subscription plan',
      error: error.message
    });
  } finally {
    client.release();
  }
};

exports.deleteSubscriptionPlan = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // Check if plan exists and get Razorpay plan ID
    const checkResult = await client.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Subscription plan not found'
      });
    }

    const plan = checkResult.rows[0];

    // Delete from Razorpay if plan ID exists
    if (plan.razorpay_plan_id) {
      try {
        const razorpay = await getRazorpayInstance();
        await razorpay.plans.delete(plan.razorpay_plan_id);
      } catch (error) {
        console.error('Error deleting Razorpay plan:', error);
        // Continue with database deletion even if Razorpay deletion fails
      }
    }

    // Delete from database
    await client.query( 
      'DELETE FROM subscription_plans WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'Subscription plan deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting subscription plan:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting subscription plan',
      error: error.message
    });
  } finally {
    client.release();
  }
};

// Initialize schema when the module is loaded
initializeSchema().catch(console.error);






 
